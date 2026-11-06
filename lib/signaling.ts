import type { DataConnection, MediaConnection } from 'peerjs';
import type {
  AuxRequest,
  ChatMessage,
  EmojiReaction,
  Participant,
  RoomMode,
  RoomState,
  SignalMessage,
  BitratePreset,
} from '@/lib/types';
import {
  buildAdminPeerId,
  buildPeerId,
  generateId,
} from '@/lib/utils';
import {
  captureSystemAudio,
  mungeSDPForHiFi,
} from '@/lib/webrtc-audio';

// ---------------------------------------------------------------------------
// Dynamic PeerJS import (browser-only)
// ---------------------------------------------------------------------------

type PeerConstructor = typeof import('peerjs').Peer;

let PeerClass: PeerConstructor | null = null;

async function getPeerClass(): Promise<PeerConstructor> {
  if (!PeerClass) {
    const mod = await import('peerjs');
    PeerClass =
      (mod as any).Peer ||
      (mod as any).default?.Peer ||
      (mod as any).default;
  }
  return PeerClass!;
}

// ---------------------------------------------------------------------------
// SignalingHub
// ---------------------------------------------------------------------------

export class SignalingHub {
  // ---- event callbacks (set by consumer) ----
  onRoomStateUpdate: ((state: RoomState) => void) | null = null;
  onChatMessage: ((msg: ChatMessage) => void) | null = null;
  onEmojiReaction: ((reaction: EmojiReaction) => void) | null = null;
  onAuxApproved: (() => void) | null = null;
  onAuxDenied: (() => void) | null = null;
  onAuxRevoked: (() => void) | null = null;
  onKicked: (() => void) | null = null;
  onIncomingStream: ((peerId: string, stream: MediaStream) => void) | null = null;
  onStreamRemoved: ((peerId: string) => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onConnectionStateChange: ((connected: boolean) => void) | null = null;

  // ---- private state ----
  private peer: InstanceType<PeerConstructor> | null = null;
  private myPeerId: string;
  private roomCode: string;
  private displayName: string;
  private isAdmin: boolean;
  private roomState: RoomState;
  private dataConnections: Map<string, DataConnection> = new Map();
  private mediaConnections: Map<string, MediaConnection> = new Map();
  private outgoingMediaConnections: Map<string, MediaConnection> = new Map();
  private broadcastStream: MediaStream | null = null;
  private currentBitrate: BitratePreset = 320000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;
  private lastSeen: Map<string, number> = new Map();
  private lastAdminSeen: number = Date.now();
  private rttMap: Map<string, { rtt: number; jitter: number }> = new Map();
  private adminDataConn: DataConnection | null = null;
  private isDestroyed = false;

  constructor(roomCode: string, displayName: string, isAdmin: boolean) {
    this.roomCode = roomCode;
    this.displayName = displayName;
    this.isAdmin = isAdmin;

    this.myPeerId = isAdmin
      ? buildAdminPeerId(roomCode)
      : buildPeerId(roomCode, generateId());

    this.roomState = {
      code: roomCode,
      adminPeerId: isAdmin ? this.myPeerId : buildAdminPeerId(roomCode),
      mode: 'single-dj',
      isLocked: false,
      participants: [],
      auxRequests: [],
      activeBroadcasters: [],
      maxBroadcasters: 1,
    };
  }

  // ------------------------------------------------------------------
  // Public — lifecycle
  // ------------------------------------------------------------------

  async connect(): Promise<void> {
    const Ctor = await getPeerClass();
    this.isDestroyed = false;

    return new Promise<void>((resolve, reject) => {
      if (this.isAdmin) {
        this.connectAsAdmin(Ctor, resolve, reject);
      } else {
        this.connectAsListener(Ctor, resolve, reject);
      }
    });
  }

  disconnect(): void {
    this.isDestroyed = true;
    this.stopBroadcasting();

    // Notify room of departure
    if (this.isAdmin) {
      this.broadcastToAll({ type: 'peer-left', peerId: this.myPeerId });
    } else {
      this.sendToAdmin({ type: 'leave', peerId: this.myPeerId });
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }

    this.dataConnections.forEach((c) => {
      try {
        c.close();
      } catch { /* ignore */ }
    });
    this.dataConnections.clear();

    this.mediaConnections.forEach((c) => {
      try {
        c.close();
      } catch { /* ignore */ }
    });
    this.mediaConnections.clear();

    this.outgoingMediaConnections.forEach((c) => {
      try {
        c.close();
      } catch { /* ignore */ }
    });
    this.outgoingMediaConnections.clear();

    if (this.adminDataConn) {
      try {
        this.adminDataConn.close();
      } catch { /* ignore */ }
      this.adminDataConn = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch { /* ignore */ }
      this.peer = null;
    }

    this.onConnectionStateChange?.(false);
  }

  // ------------------------------------------------------------------
  // Public — room actions (admin-only)
  // ------------------------------------------------------------------

  approveAux(peerId: string): void {
    if (!this.isAdmin) return;

    this.roomState.auxRequests = this.roomState.auxRequests.filter(
      (r) => r.peerId !== peerId,
    );

    if (this.roomState.mode === 'single-dj') {
      const current = this.roomState.activeBroadcasters[0];
      if (current && current !== peerId) {
        this.revokeAux(current);
      }
    }

    if (
      this.roomState.mode === 'jam-session' &&
      this.roomState.activeBroadcasters.length >= this.roomState.maxBroadcasters
    ) {
      this.sendToPeer(peerId, { type: 'aux-denied', targetPeerId: peerId });
      return;
    }

    const participant = this.roomState.participants.find(
      (p) => p.peerId === peerId,
    );
    if (participant) participant.role = 'BROADCASTER';

    if (!this.roomState.activeBroadcasters.includes(peerId)) {
      this.roomState.activeBroadcasters.push(peerId);
    }

    this.sendToPeer(peerId, { type: 'aux-approved', targetPeerId: peerId });
    this.broadcastRoomState();
  }

  denyAux(peerId: string): void {
    if (!this.isAdmin) return;
    this.roomState.auxRequests = this.roomState.auxRequests.filter(
      (r) => r.peerId !== peerId,
    );
    this.sendToPeer(peerId, { type: 'aux-denied', targetPeerId: peerId });
    this.broadcastRoomState();
  }

  revokeAux(peerId: string): void {
    if (!this.isAdmin) return;

    this.roomState.activeBroadcasters =
      this.roomState.activeBroadcasters.filter((id) => id !== peerId);

    const participant = this.roomState.participants.find(
      (p) => p.peerId === peerId,
    );
    if (participant) participant.role = 'LISTENER';

    this.sendToPeer(peerId, { type: 'aux-revoked', targetPeerId: peerId });
    this.broadcastToAll({ type: 'peer-left', peerId });
    this.broadcastRoomState();
  }

  kickPeer(peerId: string): void {
    if (!this.isAdmin) return;

    this.sendToPeer(peerId, { type: 'kick', targetPeerId: peerId });

    const conn = this.dataConnections.get(peerId);
    if (conn) {
      try {
        conn.close();
      } catch { /* ignore */ }
      this.dataConnections.delete(peerId);
    }

    this.removePeerFromState(peerId);
    this.broadcastRoomState();
  }

  lockRoom(locked: boolean): void {
    if (!this.isAdmin) return;
    this.roomState.isLocked = locked;
    this.broadcastRoomState();
  }

  changeMode(mode: RoomMode): void {
    if (!this.isAdmin) return;
    this.roomState.mode = mode;
    this.roomState.maxBroadcasters = mode === 'single-dj' ? 1 : 3;
    this.broadcastRoomState();
  }

  transferAdmin(targetPeerId: string): void {
    if (!this.isAdmin) return;

    const oldAdmin = this.roomState.participants.find(
      (p) => p.peerId === this.myPeerId,
    );
    if (oldAdmin) oldAdmin.role = 'LISTENER';

    const newAdmin = this.roomState.participants.find(
      (p) => p.peerId === targetPeerId,
    );
    if (newAdmin) newAdmin.role = 'ADMIN';

    this.roomState.adminPeerId = targetPeerId;

    this.broadcastToAll({
      type: 'transfer-admin',
      targetPeerId,
    });
    this.broadcastRoomState();
  }

  muteBroadcaster(peerId: string): void {
    if (!this.isAdmin) return;
    this.sendToPeer(peerId, {
      type: 'mute-broadcaster',
      targetPeerId: peerId,
    });
    this.revokeAux(peerId);
  }

  // ------------------------------------------------------------------
  // Public — participant actions
  // ------------------------------------------------------------------

  requestAux(): void {
    if (this.isAdmin) {
      // Admin self-approves aux
      this.onAuxApproved?.();
      return;
    }
    this.sendToAdmin({ type: 'aux-request' });
  }

  async startBroadcasting(bitrate: BitratePreset = 320000): Promise<MediaStream> {
    const stream = await captureSystemAudio();
    this.broadcastStream = stream;
    this.currentBitrate = bitrate;

    // Listen for stream track ending (user clicks "Stop Sharing" on Chrome prompt)
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        this.stopBroadcasting();
        this.onAuxRevoked?.();
      };
    });

    if (this.isAdmin) {
      // Add admin to activeBroadcasters if not already
      if (!this.roomState.activeBroadcasters.includes(this.myPeerId)) {
        this.roomState.activeBroadcasters.push(this.myPeerId);
      }
      const me = this.roomState.participants.find((p) => p.peerId === this.myPeerId);
      if (me) me.role = 'ADMIN';

      // Call each connected peer directly
      this.dataConnections.forEach((_conn, peerId) => {
        if (peerId !== this.myPeerId) {
          this.callPeerWithStream(peerId, stream, bitrate);
        }
      });

      this.broadcastRoomState();
    } else {
      // Non-admin broadcaster: tell admin we're ready
      this.sendToAdmin({
        type: 'broadcaster-ready',
        peerId: this.myPeerId,
      });
    }

    return stream;
  }

  stopBroadcasting(): void {
    if (this.broadcastStream) {
      this.broadcastStream.getTracks().forEach((t) => t.stop());
      this.broadcastStream = null;
    }
    this.outgoingMediaConnections.forEach((mc) => {
      try {
        mc.close();
      } catch { /* ignore */ }
    });
    this.outgoingMediaConnections.clear();

    if (this.isAdmin) {
      this.roomState.activeBroadcasters = this.roomState.activeBroadcasters.filter(
        (id) => id !== this.myPeerId,
      );
      this.broadcastRoomState();
    }
  }

  sendChat(message: string): void {
    const chatMsg: ChatMessage = {
      id: generateId(),
      from: this.myPeerId,
      displayName: this.displayName,
      message,
      timestamp: Date.now(),
    };

    if (this.isAdmin) {
      this.broadcastToAll({ type: 'chat', message: chatMsg });
      this.onChatMessage?.(chatMsg);
    } else {
      this.sendToAdmin({ type: 'chat', message: chatMsg });
    }
  }

  sendEmoji(emoji: string): void {
    const reaction: EmojiReaction = {
      id: generateId(),
      from: this.myPeerId,
      emoji,
      timestamp: Date.now(),
    };

    if (this.isAdmin) {
      this.broadcastToAll({ type: 'emoji', reaction });
      this.onEmojiReaction?.(reaction);
    } else {
      this.sendToAdmin({ type: 'emoji', reaction });
    }
  }

  // ------------------------------------------------------------------
  // Public — getters
  // ------------------------------------------------------------------

  getRoomState(): RoomState {
    return {
      ...this.roomState,
      participants: [...this.roomState.participants],
      activeBroadcasters: [...this.roomState.activeBroadcasters],
      auxRequests: [...this.roomState.auxRequests],
    };
  }

  getMyPeerId(): string {
    return this.myPeerId;
  }

  getBroadcastStream(): MediaStream | null {
    return this.broadcastStream;
  }

  getStats(): Map<string, { rtt: number; jitter: number }> {
    return new Map(this.rttMap);
  }

  // ------------------------------------------------------------------
  // Private — admin connect
  // ------------------------------------------------------------------

  private connectAsAdmin(
    Ctor: PeerConstructor,
    resolve: () => void,
    reject: (err: Error) => void,
  ): void {
    const peer = new Ctor(this.myPeerId, { debug: 0 });
    this.peer = peer;

    peer.on('open', (id: string) => {
      this.myPeerId = id;
      this.roomState.adminPeerId = id;

      const adminParticipant: Participant = {
        peerId: id,
        displayName: this.displayName,
        role: 'ADMIN',
        rtt: 0,
        jitter: 0,
        isMuted: false,
        audioLevel: 0,
        joinedAt: Date.now(),
      };
      this.roomState.participants = [adminParticipant];
      this.broadcastRoomState();
      this.onConnectionStateChange?.(true);

      // Start ping loop and stale peer sweeper
      this.startHeartbeatLoops();

      resolve();
    });

    peer.on('connection', (conn: DataConnection) => {
      this.handleAdminIncomingDataConn(conn);
    });

    peer.on('call', (mc: MediaConnection) => {
      this.handleIncomingMedia(mc);
    });

    peer.on('disconnected', () => {
      if (!this.isDestroyed) {
        this.onConnectionStateChange?.(false);
        try {
          peer.reconnect();
        } catch { /* ignore */ }
      }
    });

    peer.on('error', (err: Error) => {
      if ((err as any).type === 'unavailable-id') {
        const fallbackId = `${buildAdminPeerId(this.roomCode)}-${generateId().slice(0, 4)}`;
        this.myPeerId = fallbackId;
        peer.destroy();

        const fallback = new Ctor(fallbackId, { debug: 0 });
        this.peer = fallback;

        fallback.on('open', (id: string) => {
          this.myPeerId = id;
          this.roomState.adminPeerId = id;
          const adminParticipant: Participant = {
            peerId: id,
            displayName: this.displayName,
            role: 'ADMIN',
            rtt: 0,
            jitter: 0,
            isMuted: false,
            audioLevel: 0,
            joinedAt: Date.now(),
          };
          this.roomState.participants = [adminParticipant];
          this.broadcastRoomState();
          this.onConnectionStateChange?.(true);
          this.startHeartbeatLoops();
          resolve();
        });

        fallback.on('connection', (conn: DataConnection) => {
          this.handleAdminIncomingDataConn(conn);
        });

        fallback.on('call', (mc: MediaConnection) => {
          this.handleIncomingMedia(mc);
        });

        fallback.on('error', (e: Error) => {
          this.onError?.(e);
        });
      } else {
        this.onError?.(err);
        reject(err);
      }
    });
  }

  private handleAdminIncomingDataConn(conn: DataConnection): void {
    const remotePeerId = conn.peer;

    const setupConn = () => {
      this.dataConnections.set(remotePeerId, conn);
      this.lastSeen.set(remotePeerId, Date.now());
      // Immediately send current room state to joining peer
      conn.send({
        type: 'room-state',
        state: this.getRoomState(),
      } satisfies SignalMessage);
    };

    if (conn.open) {
      setupConn();
    } else {
      conn.on('open', setupConn);
    }

    conn.on('data', (raw: unknown) => {
      const msg = raw as SignalMessage;
      this.lastSeen.set(remotePeerId, Date.now());
      if (!this.dataConnections.has(remotePeerId)) {
        this.dataConnections.set(remotePeerId, conn);
      }
      this.handleAdminMessage(remotePeerId, msg, conn);
    });

    conn.on('close', () => {
      this.dataConnections.delete(remotePeerId);
      this.lastSeen.delete(remotePeerId);
      this.rttMap.delete(remotePeerId);
      this.removePeerFromState(remotePeerId);
      this.broadcastRoomState();
      this.broadcastToAll({ type: 'peer-left', peerId: remotePeerId });
    });

    conn.on('error', (err: Error) => {
      console.warn('Admin connection error with peer:', remotePeerId, err);
    });
  }

  private handleAdminMessage(
    fromPeerId: string,
    msg: SignalMessage,
    conn: DataConnection,
  ): void {
    switch (msg.type) {
      case 'join': {
        const cleanName = (msg.displayName || '').trim();
        if (!cleanName) {
          // Reject empty/ghost participant names
          return;
        }

        if (this.roomState.isLocked) {
          try {
            conn.close();
          } catch { /* ignore */ }
          this.dataConnections.delete(fromPeerId);
          return;
        }

        // Purge any accidental ghost participants with empty names
        this.roomState.participants = this.roomState.participants.filter(
          (p) => p.displayName && p.displayName.trim().length > 0,
        );

        // Reconnection / Duplicate handling
        const existingIdx = this.roomState.participants.findIndex(
          (p) => p.peerId === fromPeerId || p.displayName.trim().toLowerCase() === cleanName.toLowerCase(),
        );

        const participant: Participant = {
          peerId: fromPeerId,
          displayName: cleanName,
          role: existingIdx !== -1 ? this.roomState.participants[existingIdx].role : 'LISTENER',
          rtt: 0,
          jitter: 0,
          isMuted: false,
          audioLevel: 0,
          joinedAt: Date.now(),
        };

        if (existingIdx !== -1) {
          const oldPeerId = this.roomState.participants[existingIdx].peerId;
          if (oldPeerId !== fromPeerId) {
            this.dataConnections.delete(oldPeerId);
            this.lastSeen.delete(oldPeerId);
          }
          this.roomState.participants[existingIdx] = participant;
        } else {
          this.roomState.participants.push(participant);
        }

        this.lastSeen.set(fromPeerId, Date.now());

        // Send fresh state directly to the new joiner
        conn.send({
          type: 'room-state',
          state: this.getRoomState(),
        } satisfies SignalMessage);

        // Broadcast to everyone
        this.broadcastRoomState();
        this.broadcastToAll({
          type: 'peer-joined',
          participant,
        });

        // If Admin is currently broadcasting, call the new peer with the stream
        if (this.broadcastStream) {
          this.callPeerWithStream(fromPeerId, this.broadcastStream, this.currentBitrate);
        }
        break;
      }

      case 'leave': {
        this.dataConnections.delete(fromPeerId);
        this.lastSeen.delete(fromPeerId);
        this.removePeerFromState(fromPeerId);
        this.broadcastRoomState();
        this.broadcastToAll({ type: 'peer-left', peerId: fromPeerId });
        break;
      }

      case 'aux-request': {
        const req: AuxRequest = {
          peerId: fromPeerId,
          displayName:
            this.roomState.participants.find((p) => p.peerId === fromPeerId)
              ?.displayName ?? 'Unknown',
          requestedAt: Date.now(),
        };
        if (!this.roomState.auxRequests.find((r) => r.peerId === fromPeerId)) {
          this.roomState.auxRequests.push(req);
        }
        this.broadcastRoomState();
        break;
      }

      case 'chat': {
        this.broadcastToAll({ type: 'chat', message: msg.message });
        this.onChatMessage?.(msg.message);
        break;
      }

      case 'emoji': {
        this.broadcastToAll({ type: 'emoji', reaction: msg.reaction });
        this.onEmojiReaction?.(msg.reaction);
        break;
      }

      case 'ping': {
        this.sendToPeer(fromPeerId, {
          type: 'pong',
          timestamp: msg.timestamp,
        });
        break;
      }

      case 'pong': {
        const rtt = Math.max(0, Date.now() - msg.timestamp);
        const prev = this.rttMap.get(fromPeerId);
        const jitter = prev ? Math.abs(rtt - prev.rtt) : 0;
        this.rttMap.set(fromPeerId, { rtt, jitter });

        const p = this.roomState.participants.find((x) => x.peerId === fromPeerId);
        if (p) {
          p.rtt = rtt;
          p.jitter = jitter;
        }
        break;
      }

      case 'broadcaster-ready': {
        // Broadcaster is ready. Send peer list and notify all listeners to connect
        const peers = Array.from(this.dataConnections.keys()).filter(
          (id) => id !== fromPeerId,
        );
        if (this.myPeerId !== fromPeerId) {
          peers.push(this.myPeerId);
        }

        this.sendToPeer(fromPeerId, {
          type: 'peer-list',
          peers: [...new Set(peers)],
        });

        // Notify all peers to expect/call broadcaster
        this.broadcastToAll({
          type: 'connect-to-broadcaster',
          broadcasterPeerId: fromPeerId,
        });
        break;
      }

      case 'request-peer-list': {
        const peers = Array.from(this.dataConnections.keys());
        this.sendToPeer(fromPeerId, { type: 'peer-list', peers });
        break;
      }

      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Private — listener connect
  // ------------------------------------------------------------------

  private connectAsListener(
    Ctor: PeerConstructor,
    resolve: () => void,
    reject: (err: Error) => void,
  ): void {
    const peer = new Ctor(this.myPeerId, { debug: 0 });
    this.peer = peer;

    peer.on('open', (id: string) => {
      this.myPeerId = id;

      const adminId = buildAdminPeerId(this.roomCode);
      const conn = peer.connect(adminId, { reliable: true });

      const setupListenerConn = () => {
        this.adminDataConn = conn;
        this.dataConnections.set(adminId, conn);
        this.lastAdminSeen = Date.now();

        // Announce ourselves to Admin
        conn.send({
          type: 'join',
          displayName: this.displayName,
        } satisfies SignalMessage);

        this.onConnectionStateChange?.(true);
        this.startHeartbeatLoops();
        resolve();
      };

      if (conn.open) {
        setupListenerConn();
      } else {
        conn.on('open', setupListenerConn);
      }

      conn.on('data', (raw: unknown) => {
        const msg = raw as SignalMessage;
        this.lastAdminSeen = Date.now();
        this.handleListenerMessage(msg);
      });

      conn.on('close', () => {
        this.adminDataConn = null;
        this.dataConnections.delete(adminId);
        this.onConnectionStateChange?.(false);
      });

      conn.on('error', (err: Error) => {
        this.onError?.(err);
      });
    });

    peer.on('call', (mc: MediaConnection) => {
      this.handleIncomingMedia(mc);
    });

    peer.on('disconnected', () => {
      if (!this.isDestroyed) {
        this.onConnectionStateChange?.(false);
        try {
          peer.reconnect();
        } catch { /* ignore */ }
      }
    });

    peer.on('error', (err: Error) => {
      this.onError?.(err);
      reject(err);
    });
  }

  private handleListenerMessage(msg: SignalMessage): void {
    switch (msg.type) {
      case 'room-state': {
        this.roomState = {
          ...msg.state,
          participants: [...msg.state.participants],
          activeBroadcasters: [...msg.state.activeBroadcasters],
          auxRequests: [...msg.state.auxRequests],
        };
        this.onRoomStateUpdate?.(this.getRoomState());
        break;
      }

      case 'peer-joined': {
        const p = msg.participant;
        const exists = this.roomState.participants.some((x) => x.peerId === p.peerId);
        if (!exists) {
          this.roomState.participants.push(p);
          this.onRoomStateUpdate?.(this.getRoomState());
        }

        // If we are broadcasting, call this new joiner with our stream
        if (this.broadcastStream && p.peerId !== this.myPeerId) {
          this.callPeerWithStream(p.peerId, this.broadcastStream, this.currentBitrate);
        }
        break;
      }

      case 'peer-left': {
        this.onStreamRemoved?.(msg.peerId);
        const mc = this.mediaConnections.get(msg.peerId);
        if (mc) {
          try {
            mc.close();
          } catch { /* ignore */ }
          this.mediaConnections.delete(msg.peerId);
        }
        this.roomState.participants = this.roomState.participants.filter(
          (p) => p.peerId !== msg.peerId,
        );
        this.roomState.activeBroadcasters = this.roomState.activeBroadcasters.filter(
          (id) => id !== msg.peerId,
        );
        this.onRoomStateUpdate?.(this.getRoomState());
        break;
      }

      case 'aux-approved': {
        if (msg.targetPeerId === this.myPeerId) {
          this.onAuxApproved?.();
        }
        break;
      }

      case 'aux-denied': {
        if (msg.targetPeerId === this.myPeerId) {
          this.onAuxDenied?.();
        }
        break;
      }

      case 'aux-revoked': {
        if (msg.targetPeerId === this.myPeerId) {
          this.stopBroadcasting();
          this.onAuxRevoked?.();
        }
        break;
      }

      case 'kick': {
        if (msg.targetPeerId === this.myPeerId) {
          this.disconnect();
          this.onKicked?.();
        }
        break;
      }

      case 'connect-to-broadcaster': {
        // If someone else became broadcaster and we don't have a call yet:
        // We can request the broadcaster to call us
        if (msg.broadcasterPeerId !== this.myPeerId) {
          // If we are connected directly or through admin, the broadcaster will call us.
        }
        break;
      }

      case 'chat': {
        this.onChatMessage?.(msg.message);
        break;
      }

      case 'emoji': {
        this.onEmojiReaction?.(msg.reaction);
        break;
      }

      case 'ping': {
        this.sendToAdmin({ type: 'pong', timestamp: msg.timestamp });
        break;
      }

      case 'pong': {
        const rtt = Math.max(0, Date.now() - msg.timestamp);
        const prev = this.rttMap.get(this.roomState.adminPeerId);
        const jitter = prev ? Math.abs(rtt - prev.rtt) : 0;
        this.rttMap.set(this.roomState.adminPeerId, { rtt, jitter });
        break;
      }

      case 'mute-broadcaster': {
        if (msg.targetPeerId === this.myPeerId) {
          this.stopBroadcasting();
        }
        break;
      }

      case 'peer-list': {
        if (this.broadcastStream) {
          for (const targetPeerId of msg.peers) {
            if (targetPeerId !== this.myPeerId) {
              this.callPeerWithStream(
                targetPeerId,
                this.broadcastStream,
                this.currentBitrate,
              );
            }
          }
        }
        break;
      }

      case 'transfer-admin': {
        if (msg.targetPeerId === this.myPeerId) {
          this.isAdmin = true;
        }
        break;
      }

      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Private — media helpers
  // ------------------------------------------------------------------

  private handleIncomingMedia(mc: MediaConnection): void {
    mc.answer();

    mc.on('stream', (stream: MediaStream) => {
      this.mediaConnections.set(mc.peer, mc);
      this.onIncomingStream?.(mc.peer, stream);
    });

    mc.on('close', () => {
      this.mediaConnections.delete(mc.peer);
      this.onStreamRemoved?.(mc.peer);
    });

    mc.on('error', (err: Error) => {
      console.warn('Incoming media error with peer:', mc.peer, err);
    });
  }

  private callPeerWithStream(
    targetPeerId: string,
    stream: MediaStream,
    bitrate: BitratePreset,
  ): void {
    if (!this.peer || targetPeerId === this.myPeerId) return;

    try {
      const mc = this.peer.call(targetPeerId, stream, {
        sdpTransform: (sdp: string) => mungeSDPForHiFi(sdp, bitrate),
      });

      if (!mc) return;

      this.outgoingMediaConnections.set(targetPeerId, mc);

      mc.on('close', () => {
        this.outgoingMediaConnections.delete(targetPeerId);
      });

      mc.on('error', (err: Error) => {
        console.warn('Outgoing call error with peer:', targetPeerId, err);
      });
    } catch (err) {
      console.warn('Failed to call peer with stream:', targetPeerId, err);
    }
  }

  // ------------------------------------------------------------------
  // Private — heartbeat & presence
  // ------------------------------------------------------------------

  private startHeartbeatLoops(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.sweepInterval) clearInterval(this.sweepInterval);

    // 1. Send pings every 2500ms
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();
      if (this.isAdmin) {
        this.broadcastToAll({ type: 'ping', timestamp: now });
      } else {
        this.sendToAdmin({ type: 'ping', timestamp: now });
      }
    }, 2500);

    // 2. Admin sweeps for stale/dropped peers every 2500ms
    if (this.isAdmin) {
      this.sweepInterval = setInterval(() => {
        if (this.isDestroyed) return;
        const now = Date.now();
        let changed = false;

        const activeParticipants = this.roomState.participants.filter((p) => {
          if (p.peerId === this.myPeerId) return true; // keep admin

          const last = this.lastSeen.get(p.peerId) || p.joinedAt;
          // If no pong or activity for 7000ms -> peer dropped!
          if (now - last > 7000) {
            changed = true;
            this.dataConnections.delete(p.peerId);
            this.lastSeen.delete(p.peerId);
            this.rttMap.delete(p.peerId);
            this.broadcastToAll({ type: 'peer-left', peerId: p.peerId });
            return false;
          }
          return true;
        });

        if (changed) {
          this.roomState.participants = activeParticipants;
          this.roomState.activeBroadcasters = this.roomState.activeBroadcasters.filter(
            (id) => activeParticipants.some((p) => p.peerId === id),
          );
          this.roomState.auxRequests = this.roomState.auxRequests.filter(
            (r) => activeParticipants.some((p) => p.peerId === r.peerId),
          );
          this.broadcastRoomState();
        }
      }, 2500);
    }
  }

  // ------------------------------------------------------------------
  // Private — data-channel helpers
  // ------------------------------------------------------------------

  private sendToPeer(peerId: string, msg: SignalMessage): void {
    const conn = this.dataConnections.get(peerId);
    if (conn && conn.open) {
      try {
        conn.send(msg);
      } catch { /* ignore */ }
    }
  }

  private sendToAdmin(msg: SignalMessage): void {
    if (this.adminDataConn && this.adminDataConn.open) {
      try {
        this.adminDataConn.send(msg);
      } catch { /* ignore */ }
    }
  }

  private broadcastToAll(msg: SignalMessage): void {
    this.dataConnections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch { /* ignore */ }
      }
    });
  }

  private broadcastRoomState(): void {
    const state = this.getRoomState();
    const msg: SignalMessage = {
      type: 'room-state',
      state,
    };
    this.broadcastToAll(msg);
    this.onRoomStateUpdate?.(state);
  }

  // ------------------------------------------------------------------
  // Private — state helpers
  // ------------------------------------------------------------------

  private removePeerFromState(peerId: string): void {
    this.roomState.participants = this.roomState.participants.filter(
      (p) => p.peerId !== peerId,
    );
    this.roomState.activeBroadcasters =
      this.roomState.activeBroadcasters.filter((id) => id !== peerId);
    this.roomState.auxRequests = this.roomState.auxRequests.filter(
      (r) => r.peerId !== peerId,
    );
  }
}

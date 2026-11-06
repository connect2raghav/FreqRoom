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
  onIncomingStream: ((peerId: string, stream: MediaStream) => void) | null =
    null;
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
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private pingIntervals: Map<string, ReturnType<typeof setInterval>> =
    new Map();
  private rttMap: Map<string, { rtt: number; jitter: number }> = new Map();
  private pendingPongs: Map<string, number> = new Map(); // peerId → sent ts
  private adminDataConn: DataConnection | null = null; // listener → admin

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

    return new Promise<void>((resolve, reject) => {
      if (this.isAdmin) {
        this.connectAsAdmin(Ctor, resolve, reject);
      } else {
        this.connectAsListener(Ctor, resolve, reject);
      }
    });
  }

  disconnect(): void {
    this.stopBroadcasting();

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

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    this.pingIntervals.forEach((iv) => clearInterval(iv));
    this.pingIntervals.clear();

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

    // Remove from aux requests
    this.roomState.auxRequests = this.roomState.auxRequests.filter(
      (r) => r.peerId !== peerId,
    );

    // In single-dj mode, revoke current broadcaster first
    if (this.roomState.mode === 'single-dj') {
      const current = this.roomState.activeBroadcasters[0];
      if (current && current !== peerId) {
        this.revokeAux(current);
      }
    }

    // In jam-session mode, check cap
    if (
      this.roomState.mode === 'jam-session' &&
      this.roomState.activeBroadcasters.length >= this.roomState.maxBroadcasters
    ) {
      this.sendToPeer(peerId, { type: 'aux-denied', targetPeerId: peerId });
      return;
    }

    // Promote
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

    // Notify all peers so they can tear down the stream
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
      // Admin adds own request (auto-approve flow handled by consumer)
      return;
    }
    this.sendToAdmin({ type: 'aux-request' });
  }

  async startBroadcasting(bitrate: BitratePreset): Promise<MediaStream> {
    const stream = await captureSystemAudio();
    this.broadcastStream = stream;

    if (this.isAdmin) {
      // Admin knows all peers — call each one directly
      this.dataConnections.forEach((_conn, peerId) => {
        this.callPeerWithStream(peerId, stream, bitrate);
      });
    } else {
      // Ask admin for the peer list, then call everyone
      this.sendToAdmin({
        type: 'broadcaster-ready',
        peerId: this.myPeerId,
      });

      // The admin will respond with a peer-list message.
      // Actual calling is handled in the peer-list handler below.
      // Store bitrate for when the peer-list arrives.
      (this as any)._pendingBroadcastBitrate = bitrate;
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
    return this.roomState;
  }

  getMyPeerId(): string {
    return this.myPeerId;
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

      // Seed admin as the first participant
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
      this.onRoomStateUpdate?.(this.roomState);
      this.onConnectionStateChange?.(true);
      resolve();
    });

    // Incoming data connections from joiners
    peer.on('connection', (conn: DataConnection) => {
      this.handleAdminIncomingDataConn(conn);
    });

    // Incoming media connections (e.g. from a broadcaster)
    peer.on('call', (mc: MediaConnection) => {
      this.handleIncomingMedia(mc);
    });

    peer.on('disconnected', () => {
      this.onConnectionStateChange?.(false);
      try {
        peer.reconnect();
      } catch { /* ignore */ }
    });

    peer.on('error', (err: Error) => {
      // If the ID is taken, try with a random suffix
      if ((err as any).type === 'unavailable-id') {
        const fallbackId = `${this.myPeerId}-${generateId().slice(0, 6)}`;
        this.myPeerId = fallbackId;
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
          this.onRoomStateUpdate?.(this.roomState);
          this.onConnectionStateChange?.(true);
          resolve();
        });

        fallback.on('connection', (conn: DataConnection) => {
          this.handleAdminIncomingDataConn(conn);
        });

        fallback.on('call', (mc: MediaConnection) => {
          this.handleIncomingMedia(mc);
        });

        fallback.on('disconnected', () => {
          this.onConnectionStateChange?.(false);
          try {
            fallback.reconnect();
          } catch { /* ignore */ }
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

    conn.on('open', () => {
      this.dataConnections.set(remotePeerId, conn);

      // Start pinging this peer
      const iv = setInterval(() => {
        this.sendToPeer(remotePeerId, {
          type: 'ping',
          timestamp: Date.now(),
        });
        this.pendingPongs.set(remotePeerId, Date.now());
      }, 3000);
      this.pingIntervals.set(remotePeerId, iv);
    });

    conn.on('data', (raw: unknown) => {
      const msg = raw as SignalMessage;
      this.handleAdminMessage(remotePeerId, msg, conn);
    });

    conn.on('close', () => {
      this.dataConnections.delete(remotePeerId);
      const piv = this.pingIntervals.get(remotePeerId);
      if (piv) {
        clearInterval(piv);
        this.pingIntervals.delete(remotePeerId);
      }
      this.rttMap.delete(remotePeerId);
      this.removePeerFromState(remotePeerId);
      this.broadcastRoomState();
    });

    conn.on('error', (err: Error) => {
      this.onError?.(err);
    });
  }

  private handleAdminMessage(
    fromPeerId: string,
    msg: SignalMessage,
    _conn: DataConnection,
  ): void {
    switch (msg.type) {
      case 'join': {
        if (this.roomState.isLocked) {
          const dc = this.dataConnections.get(fromPeerId);
          if (dc) {
            try {
              dc.close();
            } catch { /* ignore */ }
            this.dataConnections.delete(fromPeerId);
          }
          return;
        }

        const participant: Participant = {
          peerId: fromPeerId,
          displayName: msg.displayName,
          role: 'LISTENER',
          rtt: 0,
          jitter: 0,
          isMuted: false,
          audioLevel: 0,
          joinedAt: Date.now(),
        };

        // Avoid duplicates
        if (
          !this.roomState.participants.find((p) => p.peerId === fromPeerId)
        ) {
          this.roomState.participants.push(participant);
        }

        this.broadcastRoomState();

        // Notify others of the new peer
        this.broadcastToAll({
          type: 'peer-joined',
          participant,
        });
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
        if (
          !this.roomState.auxRequests.find((r) => r.peerId === fromPeerId)
        ) {
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
        const sentAt = this.pendingPongs.get(fromPeerId);
        if (sentAt) {
          const rtt = Date.now() - sentAt;
          const prev = this.rttMap.get(fromPeerId);
          const jitter = prev ? Math.abs(rtt - prev.rtt) : 0;
          this.rttMap.set(fromPeerId, { rtt, jitter });

          const participant = this.roomState.participants.find(
            (p) => p.peerId === fromPeerId,
          );
          if (participant) {
            participant.rtt = rtt;
            participant.jitter = jitter;
          }
          this.pendingPongs.delete(fromPeerId);
        }
        break;
      }

      case 'broadcaster-ready': {
        // Send the peer list to the broadcaster so it can call everyone
        const peers = Array.from(this.dataConnections.keys()).filter(
          (id) => id !== fromPeerId,
        );
        // Also include admin's own peer id if admin is a listener
        if (this.myPeerId !== fromPeerId) {
          peers.push(this.myPeerId);
        }
        this.sendToPeer(fromPeerId, {
          type: 'peer-list',
          peers: [...new Set(peers)],
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

      // Connect data channel to admin
      const adminId = buildAdminPeerId(this.roomCode);
      const conn = peer.connect(adminId, { reliable: true });

      conn.on('open', () => {
        this.adminDataConn = conn;
        this.dataConnections.set(adminId, conn);

        // Announce ourselves
        conn.send({ type: 'join', displayName: this.displayName } as SignalMessage);

        this.onConnectionStateChange?.(true);
        resolve();
      });

      conn.on('data', (raw: unknown) => {
        const msg = raw as SignalMessage;
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

    // Incoming media from broadcasters
    peer.on('call', (mc: MediaConnection) => {
      this.handleIncomingMedia(mc);
    });

    peer.on('disconnected', () => {
      this.onConnectionStateChange?.(false);
      try {
        peer.reconnect();
      } catch { /* ignore */ }
    });

    peer.on('error', (err: Error) => {
      this.onError?.(err);
      reject(err);
    });
  }

  private handleListenerMessage(msg: SignalMessage): void {
    switch (msg.type) {
      case 'room-state': {
        this.roomState = msg.state;
        this.onRoomStateUpdate?.(this.roomState);
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
        if (this.peer && msg.broadcasterPeerId !== this.myPeerId) {
          const mc = this.peer.call(msg.broadcasterPeerId, new MediaStream());
          this.handleIncomingMedia(mc);
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
        const sentAt = this.pendingPongs.get(this.roomState.adminPeerId);
        if (sentAt) {
          const rtt = Date.now() - sentAt;
          const prev = this.rttMap.get(this.roomState.adminPeerId);
          const jitter = prev ? Math.abs(rtt - prev.rtt) : 0;
          this.rttMap.set(this.roomState.adminPeerId, { rtt, jitter });
          this.pendingPongs.delete(this.roomState.adminPeerId);
        }
        break;
      }

      case 'mute-broadcaster': {
        if (msg.targetPeerId === this.myPeerId) {
          this.stopBroadcasting();
        }
        break;
      }

      case 'peer-list': {
        // If we're broadcasting and waiting for the peer list, call each peer
        const bitrate: BitratePreset =
          (this as any)._pendingBroadcastBitrate ?? 160000;
        if (this.broadcastStream) {
          for (const targetPeerId of msg.peers) {
            if (targetPeerId !== this.myPeerId) {
              this.callPeerWithStream(
                targetPeerId,
                this.broadcastStream,
                bitrate,
              );
            }
          }
          delete (this as any)._pendingBroadcastBitrate;
        }
        break;
      }

      case 'peer-joined': {
        // If we're an active broadcaster, call the new peer with our stream
        if (this.broadcastStream) {
          const bitrate: BitratePreset =
            (this as any)._pendingBroadcastBitrate ?? 160000;
          this.callPeerWithStream(
            msg.participant.peerId,
            this.broadcastStream,
            bitrate,
          );
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
        break;
      }

      case 'transfer-admin': {
        if (msg.targetPeerId === this.myPeerId) {
          this.isAdmin = true;
          // Re-initialize as admin is complex; for now update local role
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
    // Answer with no outgoing stream (receive-only)
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
      this.onError?.(err);
    });
  }

  private callPeerWithStream(
    targetPeerId: string,
    stream: MediaStream,
    bitrate: BitratePreset,
  ): void {
    if (!this.peer) return;

    const mc = this.peer.call(targetPeerId, stream, {
      sdpTransform: (sdp: string) => mungeSDPForHiFi(sdp, bitrate),
    });

    if (!mc) return;

    this.outgoingMediaConnections.set(targetPeerId, mc);

    mc.on('close', () => {
      this.outgoingMediaConnections.delete(targetPeerId);
    });

    mc.on('error', (err: Error) => {
      this.onError?.(err);
    });
  }

  // ------------------------------------------------------------------
  // Private — data-channel helpers
  // ------------------------------------------------------------------

  private sendToPeer(peerId: string, msg: SignalMessage): void {
    const conn = this.dataConnections.get(peerId);
    if (conn && conn.open) {
      try {
        conn.send(msg);
      } catch {
        /* connection may have closed between check and send */
      }
    }
  }

  private sendToAdmin(msg: SignalMessage): void {
    if (this.adminDataConn && this.adminDataConn.open) {
      try {
        this.adminDataConn.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  private broadcastToAll(msg: SignalMessage): void {
    this.dataConnections.forEach((conn, _peerId) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch {
          /* ignore */
        }
      }
    });
  }

  private broadcastRoomState(): void {
    const msg: SignalMessage = {
      type: 'room-state',
      state: { ...this.roomState },
    };
    this.broadcastToAll(msg);
    this.onRoomStateUpdate?.({ ...this.roomState });
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

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SignalingHub } from '@/lib/signaling';
import {
  RoomState,
  UserRole,
  RoomMode,
  ChatMessage,
  EmojiReaction,
  DEFAULT_AUDIO_SETTINGS,
} from '@/lib/types';

const EMPTY_ROOM_STATE: RoomState = {
  code: '',
  adminPeerId: '',
  mode: 'single-dj',
  isLocked: false,
  participants: [],
  auxRequests: [],
  activeBroadcasters: [],
  maxBroadcasters: 1,
};

const MAX_CHAT_MESSAGES = 100;
const STATS_POLL_INTERVAL_MS = 3000;
const EMOJI_TTL_MS = 3000;

export function useJamRoom(roomCode: string, displayName: string, isAdmin: boolean) {
  const hubRef = useRef<SignalingHub | null>(null);
  const incomingStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const [roomState, setRoomState] = useState<RoomState>(EMPTY_ROOM_STATE);
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastStream, setBroadcastStream] = useState<MediaStream | null>(null);
  const [, setStreamsVersion] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const [stats, setStats] = useState<Map<string, { rtt: number; jitter: number }>>(new Map());

  const incomingStreams = useMemo(() => {
    return new Map(incomingStreamsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [/* triggered by setStreamsVersion */]);

  // We need the version counter to recalculate the memo — bind it:
  const [streamsVersion, setStreamsVersionState] = useState(0);
  const forceStreamsUpdate = useCallback(() => {
    setStreamsVersion((v) => v + 1);
    setStreamsVersionState((v) => v + 1);
  }, []);

  const stableIncomingStreams = useMemo(() => {
    void streamsVersion; // dependency
    return new Map(incomingStreamsRef.current);
  }, [streamsVersion]);

  useEffect(() => {
    const trimmedName = (displayName || '').trim();
    if (!trimmedName) {
      setIsConnecting(false);
      return;
    }

    const hub = new SignalingHub(roomCode, trimmedName, isAdmin);
    hubRef.current = hub;
    setIsConnecting(true);
    setError(null);

    hub.onRoomStateUpdate = (state: RoomState) => {
      setRoomState(state);
    };

    hub.onChatMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > MAX_CHAT_MESSAGES) {
          return next.slice(next.length - MAX_CHAT_MESSAGES);
        }
        return next;
      });
    };

    hub.onEmojiReaction = (reaction: EmojiReaction) => {
      setEmojiReactions((prev) => [...prev, reaction]);
      setTimeout(() => {
        setEmojiReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, EMOJI_TTL_MS);
    };

    hub.onAuxApproved = () => {
      // The room state update will reflect the change; no extra state needed.
    };

    hub.onAuxDenied = () => {
      setError('Your aux request was denied.');
    };

    hub.onAuxRevoked = () => {
      setIsBroadcasting(false);
      setBroadcastStream(null);
    };

    hub.onKicked = () => {
      setError('You have been kicked from the room.');
      setIsConnected(false);
      setIsBroadcasting(false);
      setBroadcastStream(null);
      hub.disconnect();
    };

    hub.onIncomingStream = (peerId: string, stream: MediaStream) => {
      incomingStreamsRef.current.set(peerId, stream);
      forceStreamsUpdate();
    };

    hub.onStreamRemoved = (peerId: string) => {
      incomingStreamsRef.current.delete(peerId);
      forceStreamsUpdate();
    };

    hub.onError = (err: Error) => {
      setError(err.message);
    };

    hub.onConnectionStateChange = (connected: boolean) => {
      setIsConnected(connected);
      if (connected) {
        setIsConnecting(false);
      }
    };

    hub
      .connect()
      .then(() => {
        setMyPeerId(hub.getMyPeerId());
        setIsConnecting(false);
        setIsConnected(true);
      })
      .catch((err: Error) => {
        setError(err.message);
        setIsConnecting(false);
      });

    const statsInterval = setInterval(() => {
      if (hubRef.current) {
        const currentStats = hubRef.current.getStats();
        setStats(new Map(currentStats));
      }
    }, STATS_POLL_INTERVAL_MS);

    const handleBeforeUnload = () => {
      hub.disconnect();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(statsInterval);
      hub.disconnect();
      hubRef.current = null;
      incomingStreamsRef.current.clear();
      setBroadcastStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, displayName, isAdmin]);

  const myRole: UserRole = useMemo(() => {
    if (!myPeerId) return 'LISTENER';
    const me = roomState.participants.find((p) => p.peerId === myPeerId);
    return me?.role ?? 'LISTENER';
  }, [roomState.participants, myPeerId]);

  const requestAux = useCallback(() => {
    hubRef.current?.requestAux();
  }, []);

  const approveAux = useCallback((peerId: string) => {
    hubRef.current?.approveAux(peerId);
  }, []);

  const denyAux = useCallback((peerId: string) => {
    hubRef.current?.denyAux(peerId);
  }, []);

  const revokeAux = useCallback((peerId: string) => {
    hubRef.current?.revokeAux(peerId);
  }, []);

  const startBroadcasting = useCallback(async () => {
    if (!hubRef.current) return;
    try {
      const stream = await hubRef.current.startBroadcasting(DEFAULT_AUDIO_SETTINGS.bitrate);
      setBroadcastStream(stream);
      setIsBroadcasting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start broadcasting');
    }
  }, []);

  const stopBroadcasting = useCallback(() => {
    hubRef.current?.stopBroadcasting();
    setBroadcastStream(null);
    setIsBroadcasting(false);
  }, []);

  const kickPeer = useCallback((peerId: string) => {
    hubRef.current?.kickPeer(peerId);
  }, []);

  const lockRoom = useCallback((locked: boolean) => {
    hubRef.current?.lockRoom(locked);
  }, []);

  const changeMode = useCallback((mode: RoomMode) => {
    hubRef.current?.changeMode(mode);
  }, []);

  const transferAdmin = useCallback((peerId: string) => {
    hubRef.current?.transferAdmin(peerId);
  }, []);

  const sendChat = useCallback((message: string) => {
    hubRef.current?.sendChat(message);
  }, []);

  const sendEmoji = useCallback((emoji: string) => {
    hubRef.current?.sendEmoji(emoji);
  }, []);

  const muteBroadcaster = useCallback((peerId: string) => {
    hubRef.current?.muteBroadcaster(peerId);
  }, []);

  const disconnect = useCallback(() => {
    hubRef.current?.disconnect();
    setIsConnected(false);
    setIsBroadcasting(false);
    setBroadcastStream(null);
  }, []);

  const resyncAudio = useCallback(async () => {
    if (!hubRef.current) return;
    if (isBroadcasting) {
      hubRef.current.stopBroadcasting();
      setIsBroadcasting(false);
      setBroadcastStream(null);
      try {
        const stream = await hubRef.current.startBroadcasting(DEFAULT_AUDIO_SETTINGS.bitrate);
        setBroadcastStream(stream);
        setIsBroadcasting(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resync broadcasting');
      }
    } else {
      // Reconnect to resync incoming media
      hubRef.current.disconnect();
      setIsConnected(false);
      setIsConnecting(true);
      try {
        await hubRef.current.connect();
        setMyPeerId(hubRef.current.getMyPeerId());
        setIsConnected(true);
        setIsConnecting(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resync audio');
        setIsConnecting(false);
      }
    }
  }, [isBroadcasting]);

  return {
    roomState,
    myPeerId,
    myRole,
    isConnected,
    isConnecting,
    error,
    isBroadcasting,
    broadcastStream,
    incomingStreams: stableIncomingStreams,
    chatMessages,
    emojiReactions,
    stats,

    requestAux,
    approveAux,
    denyAux,
    revokeAux,
    startBroadcasting,
    stopBroadcasting,
    kickPeer,
    lockRoom,
    changeMode,
    transferAdmin,
    sendChat,
    sendEmoji,
    muteBroadcaster,
    disconnect,
    resyncAudio,
  };
}

/* ── JamHub Shared Types ──────────────────────────────────── */

export type UserRole = 'ADMIN' | 'BROADCASTER' | 'LISTENER';

export type RoomMode = 'single-dj' | 'jam-session';

export type BitratePreset = 96000 | 160000 | 320000;

export type VisualizerMode = 'bars' | 'waveform';

/* ── Room & Participant ──────────────────────────────────── */

export interface Participant {
  peerId: string;
  displayName: string;
  role: UserRole;
  rtt: number;
  jitter: number;
  isMuted: boolean;
  audioLevel: number; // 0‑1 for activity ring
  joinedAt: number;
}

export interface AuxRequest {
  peerId: string;
  displayName: string;
  requestedAt: number;
}

export interface RoomState {
  code: string;
  adminPeerId: string;
  mode: RoomMode;
  isLocked: boolean;
  participants: Participant[];
  auxRequests: AuxRequest[];
  activeBroadcasters: string[];
  maxBroadcasters: number;
}

/* ── Chat & Reactions ────────────────────────────────────── */

export interface ChatMessage {
  id: string;
  from: string;
  displayName: string;
  message: string;
  timestamp: number;
}

export interface EmojiReaction {
  id: string;
  from: string;
  emoji: string;
  timestamp: number;
}

/* ── Signaling Messages (PeerJS data channel) ────────────── */

export type SignalMessage =
  | { type: 'join'; displayName: string }
  | { type: 'room-state'; state: RoomState }
  | { type: 'aux-request' }
  | { type: 'aux-approved'; targetPeerId: string }
  | { type: 'aux-denied'; targetPeerId: string }
  | { type: 'aux-revoked'; targetPeerId: string }
  | { type: 'kick'; targetPeerId: string }
  | { type: 'lock-room'; locked: boolean }
  | { type: 'change-mode'; mode: RoomMode }
  | { type: 'transfer-admin'; targetPeerId: string }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'emoji'; reaction: EmojiReaction }
  | { type: 'broadcaster-ready'; peerId: string }
  | { type: 'connect-to-broadcaster'; broadcasterPeerId: string }
  | { type: 'peer-joined'; participant: Participant }
  | { type: 'peer-left'; peerId: string }
  | { type: 'mute-broadcaster'; targetPeerId: string }
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; timestamp: number }
  | { type: 'request-peer-list' }
  | { type: 'peer-list'; peers: string[] };

/* ── Audio Settings ──────────────────────────────────────── */

export interface AudioSettings {
  masterVolume: number; // 0‑1
  isMuted: boolean;
  bitrate: BitratePreset;
  latencyOffset: number; // −500 to 500 ms
  eq: {
    bass: number;   // −12 to 12 dB
    mid: number;    // −12 to 12 dB
    treble: number; // −12 to 12 dB
  };
  outputDeviceId: string;
  visualizerMode: VisualizerMode;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  isMuted: false,
  bitrate: 320000,
  latencyOffset: 0,
  eq: { bass: 0, mid: 0, treble: 0 },
  outputDeviceId: 'default',
  visualizerMode: 'bars',
};


/* ── JamHub Utility Functions ─────────────────────────────── */

/** Generate a 6-character alphanumeric room code (no ambiguous chars I,O,0,1) */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Format raw code as JAM‑XXX */
export function formatRoomCode(code: string): string {
  const upper = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper.length <= 3) return upper;
  return `${upper.slice(0, 3)}-${upper.slice(3)}`;
}

/** Strip dashes and normalize */
export function parseRoomCode(formatted: string): string {
  return formatted.replace(/-/g, '').toUpperCase();
}

/** Simple className merge */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Generate an 8-char random ID */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Convert dB to linear amplitude */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Convert linear amplitude to dB */
export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/** Build the PeerJS peer ID for a room participant */
export function buildPeerId(roomCode: string, userId: string): string {
  return `jamhub-${roomCode.toLowerCase()}-${userId}`;
}

/** Build the predictable admin peer ID */
export function buildAdminPeerId(roomCode: string): string {
  return `jamhub-${roomCode.toLowerCase()}-admin`;
}

/** Delay as a promise */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


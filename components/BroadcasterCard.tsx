'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Music, ShieldAlert, MicOff } from 'lucide-react';
import type { Participant, BitratePreset } from '@/lib/types';

interface BroadcasterCardProps {
  broadcaster: Participant | null;
  bitrate: BitratePreset;
  peakDb: number;
  isAdmin: boolean;
  onRevoke: () => void;
  onMute: () => void;
}

function dbToPercent(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db));
  return ((clamped + 60) / 60) * 100;
}

function getMeterColor(db: number): string {
  if (db > -3) return 'bg-red-500';
  if (db > -12) return 'bg-yellow-400';
  return 'bg-green-500';
}

export default function BroadcasterCard({
  broadcaster,
  bitrate,
  peakDb,
  isAdmin,
  onRevoke,
  onMute,
}: BroadcasterCardProps) {
  const isActive = broadcaster !== null && peakDb > -55;
  const bitrateLabel = `${bitrate / 1000} kbps`;
  const roleBadge = broadcaster?.role === 'ADMIN' ? 'DJ' : 'On The Aux';

  if (!broadcaster) {
    return (
      <div className="glass-card p-6 flex flex-col items-center justify-center gap-3 text-white/40">
        <Music className="w-10 h-10" />
        <span className="text-sm font-medium">No one has the Aux</span>
      </div>
    );
  }

  return (
    <motion.div
      className="glass-card p-5 relative overflow-hidden"
      animate={
        isActive
          ? {
              boxShadow: [
                '0 0 0 1px rgba(6,182,212,0.15)',
                '0 0 0 2px rgba(6,182,212,0.35)',
                '0 0 0 1px rgba(6,182,212,0.15)',
              ],
            }
          : { boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }
      }
      transition={isActive ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-jam-blue/20 border border-jam-blue/50 flex items-center justify-center text-jam-blue font-bold text-lg">
            {broadcaster.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-lg">{broadcaster.displayName}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-jam-cyan/20 text-jam-cyan border border-jam-cyan/30">
                {roleBadge}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-white/50 font-mono">{bitrateLabel}</span>
              <span className="flex items-center gap-1 text-xs text-jam-cyan">
                <span className="w-1.5 h-1.5 rounded-full bg-jam-cyan animate-pulse" />
                STEREO
              </span>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={onMute}
              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
              title="Mute"
            >
              <MicOff className="w-4 h-4" />
            </button>
            <button
              onClick={onRevoke}
              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
              title="Revoke Aux"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Peak dB meter */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-white/40 mb-1">
          <span>Level</span>
          <span className="font-mono">{peakDb > -60 ? `${peakDb.toFixed(1)} dB` : '-∞ dB'}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${getMeterColor(peakDb)}`}
            animate={{ width: `${dbToPercent(peakDb)}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>
      </div>
    </motion.div>
  );
}

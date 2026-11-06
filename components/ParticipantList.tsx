'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Users } from 'lucide-react';
import type { Participant } from '@/lib/types';

interface ParticipantListProps {
  participants: Participant[];
  myPeerId: string;
  isAdmin: boolean;
  stats: Map<string, { rtt: number; jitter: number }>;
  onKick: (peerId: string) => void;
  onTransferAdmin: (peerId: string) => void;
}

function getRoleColor(role: string): string {
  if (role === 'ADMIN') return 'ring-jam-blue';
  if (role === 'BROADCASTER') return 'ring-jam-cyan';
  return 'ring-white/10';
}

function getRoleBadge(role: string) {
  if (role === 'ADMIN')
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-jam-blue/20 text-jam-blue border border-jam-blue/30">
        ADMIN
      </span>
    );
  if (role === 'BROADCASTER')
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-jam-cyan/20 text-jam-cyan border border-jam-cyan/30">
        DJ
      </span>
    );
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-white/5 text-white/40 border border-white/10">
      Listener
    </span>
  );
}

function getRttColor(rtt: number): string {
  if (rtt < 50) return 'text-green-400';
  if (rtt <= 150) return 'text-yellow-400';
  return 'text-red-400';
}

export default function ParticipantList({
  participants,
  myPeerId,
  isAdmin,
  stats,
  onKick,
  onTransferAdmin,
}: ParticipantListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Users className="w-4 h-4 text-white/60" />
        <span className="text-sm font-semibold text-white/80">Participants</span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-jam-blue/20 text-jam-blue">
          {participants.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-white/10">
        <AnimatePresence mode="popLayout">
          {participants.map((p) => {
            const peerStats = stats.get(p.peerId);
            const rtt = peerStats?.rtt ?? p.rtt;
            const isMe = p.peerId === myPeerId;
            const showPulse = p.audioLevel > 0.1;

            return (
              <motion.div
                key={p.peerId}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
              >
                <div className="relative flex-shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full ring-2 ${getRoleColor(
                      p.role
                    )} flex items-center justify-center text-sm font-bold text-white/90 bg-white/5`}
                  >
                    {p.displayName.charAt(0).toUpperCase()}
                  </div>
                  {showPulse && (
                    <span className="absolute inset-0 rounded-full ring-2 ring-jam-cyan animate-ping opacity-30" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white truncate">
                      {p.displayName}
                      {isMe && <span className="text-white/40 ml-1">(You)</span>}
                    </span>
                    {getRoleBadge(p.role)}
                  </div>
                  <span className={`text-[10px] font-mono ${getRttColor(rtt)}`}>{rtt}ms</span>
                </div>

                {isAdmin && !isMe && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onTransferAdmin(p.peerId)}
                      className="p-1.5 rounded-lg hover:bg-jam-blue/20 text-white/30 hover:text-jam-blue transition-colors"
                      title="Transfer Admin"
                    >
                      <Crown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onKick(p.peerId)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                      title="Kick"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

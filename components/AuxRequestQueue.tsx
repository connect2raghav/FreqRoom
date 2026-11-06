'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Music2 } from 'lucide-react';
import type { AuxRequest } from '@/lib/types';

interface AuxRequestQueueProps {
  requests: AuxRequest[];
  onApprove: (peerId: string) => void;
  onDeny: (peerId: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export default function AuxRequestQueue({ requests, onApprove, onDeny }: AuxRequestQueueProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Music2 className="w-4 h-4 text-white/60" />
        <span className="text-sm font-semibold text-white/80">Aux Requests</span>
        {requests.length > 0 && (
          <motion.span
            className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-jam-cyan/20 text-jam-cyan"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {requests.length}
          </motion.span>
        )}
        {requests.length === 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-white/5 text-white/30">
            0
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
        <AnimatePresence mode="popLayout">
          {requests.map((req) => (
            <motion.div
              key={req.peerId}
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
            >
              <div className="w-8 h-8 rounded-full bg-jam-cyan/10 border border-jam-cyan/30 flex items-center justify-center text-sm font-bold text-jam-cyan">
                {req.displayName.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-white truncate block">{req.displayName}</span>
                <span className="text-[10px] text-white/30">{timeAgo(req.requestedAt)}</span>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onApprove(req.peerId)}
                  className="p-1.5 rounded-lg bg-jam-cyan/10 hover:bg-jam-cyan/25 text-jam-cyan transition-colors"
                  title="Approve"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeny(req.peerId)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 transition-colors"
                  title="Deny"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {requests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-white/20 gap-2">
            <Music2 className="w-8 h-8" />
            <span className="text-sm">No pending requests</span>
          </div>
        )}
      </div>
    </div>
  );
}

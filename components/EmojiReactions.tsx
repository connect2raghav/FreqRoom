'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EmojiReaction } from '@/lib/types';

interface EmojiReactionsProps {
  reactions: EmojiReaction[];
}

export const EmojiReactions: React.FC<EmojiReactionsProps> = ({ reactions }) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {reactions.map((r, idx) => {
          // Deterministic horizontal position based on timestamp & index
          const leftPercent = 15 + ((r.timestamp + idx * 37) % 70);

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 1, y: 0, scale: 0.8 }}
              animate={{
                opacity: 0,
                y: -180,
                scale: 1.6,
                transition: { duration: 2.2, ease: 'easeOut' },
              }}
              exit={{ opacity: 0 }}
              style={{ left: `${leftPercent}%`, bottom: '120px' }}
              className="absolute select-none text-4xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            >
              {r.emoji}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};


'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Headphones } from 'lucide-react';

interface AudioEnableOverlayProps {
  isVisible: boolean;
  onEnable: () => void;
}

export default function AudioEnableOverlay({ isVisible, onEnable }: AudioEnableOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0F1D]/90 backdrop-blur-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="flex flex-col items-center gap-6 text-center px-6"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <div className="w-20 h-20 rounded-full bg-jam-blue/10 border border-jam-blue/20 flex items-center justify-center">
              <Headphones className="w-10 h-10 text-jam-blue" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Click to Tune In</h2>
              <p className="text-white/40 text-sm max-w-xs">
                Enable audio playback to hear the stream
              </p>
            </div>

            <motion.button
              onClick={onEnable}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-jam-blue to-jam-cyan text-white font-semibold text-lg shadow-lg shadow-jam-blue/25 hover:shadow-jam-blue/40 transition-shadow"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              🎵 Enable Audio
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

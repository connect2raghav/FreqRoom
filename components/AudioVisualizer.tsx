'use client';

import React from 'react';
import { Music } from 'lucide-react';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import type { VisualizerMode } from '@/lib/types';

interface AudioVisualizerProps {
  analyserNode: AnalyserNode | null;
  mode: VisualizerMode;
  isActive: boolean;
}

export default function AudioVisualizer({ analyserNode, mode, isActive }: AudioVisualizerProps) {
  const { canvasRef } = useAudioVisualizer(analyserNode, mode, isActive);

  return (
    <div className="relative w-full h-48 glass-card overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-2xl"
        style={{ display: 'block' }}
      />
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Music className="w-8 h-8 text-white/20" />
          <span className="text-sm text-white/30 font-medium">No Audio</span>
        </div>
      )}
    </div>
  );
}

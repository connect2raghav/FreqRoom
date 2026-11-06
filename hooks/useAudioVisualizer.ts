'use client';

import { useRef, useEffect } from 'react';
import type { VisualizerMode } from '@/lib/types';

const BAR_COUNT = 72;
const BAR_GAP = 2;
const BAR_TOP_RADIUS = 3;
const WAVEFORM_LINE_WIDTH = 2.5;
const GLOW_ALPHA = 0.25;

export function useAudioVisualizer(
  analyserNode: AnalyserNode | null,
  mode: VisualizerMode,
  isActive: boolean
): {
  canvasRef: React.RefObject<HTMLCanvasElement>;
} {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafIdRef = useRef<number>(0);

  useEffect(() => {
    if (!analyserNode || !isActive || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
    const timeDomainData = new Uint8Array(analyserNode.frequencyBinCount);

    const draw = () => {
      rafIdRef.current = requestAnimationFrame(draw);

      if (!canvasRef.current) return;

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;
      const canvasWidth = displayWidth * dpr;
      const canvasHeight = displayHeight * dpr;

      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      if (mode === 'bars') {
        drawBars(ctx, analyserNode, frequencyData, displayWidth, displayHeight);
      } else {
        drawWaveform(ctx, analyserNode, timeDomainData, displayWidth, displayHeight);
      }

      ctx.restore();
    };

    rafIdRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [analyserNode, mode, isActive]);

  return { canvasRef };
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  dataArray: Uint8Array,
  width: number,
  height: number
): void {
  analyser.getByteFrequencyData(dataArray);

  const barWidth = (width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, '#3B82F6');
  gradient.addColorStop(1, '#06B6D4');

  const glowGradient = ctx.createLinearGradient(0, height, 0, 0);
  glowGradient.addColorStop(0, `rgba(59, 130, 246, ${GLOW_ALPHA})`);
  glowGradient.addColorStop(1, `rgba(6, 182, 212, ${GLOW_ALPHA})`);

  const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));

  for (let i = 0; i < BAR_COUNT; i++) {
    const dataValue = dataArray[i * step] ?? 0;
    const barHeight = (dataValue / 255) * height;
    const x = i * (barWidth + BAR_GAP);
    const y = height - barHeight;

    if (barHeight <= 0) continue;

    // Glow layer
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    if (barHeight > BAR_TOP_RADIUS * 2) {
      ctx.moveTo(x, height);
      ctx.lineTo(x, y + BAR_TOP_RADIUS);
      ctx.arcTo(x, y, x + BAR_TOP_RADIUS, y, BAR_TOP_RADIUS);
      ctx.arcTo(x + barWidth, y, x + barWidth, y + BAR_TOP_RADIUS, BAR_TOP_RADIUS);
      ctx.lineTo(x + barWidth, height);
    } else {
      ctx.rect(x, y, barWidth, barHeight);
    }
    ctx.closePath();
    ctx.fill();

    // Main bar
    ctx.fillStyle = gradient;
    ctx.beginPath();
    if (barHeight > BAR_TOP_RADIUS * 2) {
      ctx.moveTo(x, height);
      ctx.lineTo(x, y + BAR_TOP_RADIUS);
      ctx.arcTo(x, y, x + BAR_TOP_RADIUS, y, BAR_TOP_RADIUS);
      ctx.arcTo(x + barWidth, y, x + barWidth, y + BAR_TOP_RADIUS, BAR_TOP_RADIUS);
      ctx.lineTo(x + barWidth, height);
    } else {
      ctx.rect(x, y, barWidth, barHeight);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  dataArray: Uint8Array,
  width: number,
  height: number
): void {
  analyser.getByteTimeDomainData(dataArray);

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#3B82F6');
  gradient.addColorStop(1, '#06B6D4');

  // Shadow / glow
  ctx.save();
  ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.lineWidth = WAVEFORM_LINE_WIDTH;
  ctx.strokeStyle = gradient;
  ctx.beginPath();

  const sliceWidth = width / (dataArray.length - 1);
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    x += sliceWidth;
  }

  ctx.stroke();
  ctx.restore();
}

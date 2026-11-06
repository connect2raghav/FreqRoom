'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioPipeline } from '@/lib/webrtc-audio';
import { AudioSettings, DEFAULT_AUDIO_SETTINGS } from '@/lib/types';

const PEAK_POLL_INTERVAL_MS = 100;
const SAMPLE_RATE = 48000;

export function useAudioMixer(streams: Map<string, MediaStream>): {
  audioSettings: AudioSettings;
  updateSettings: (settings: Partial<AudioSettings>) => void;
  analyserNode: AnalyserNode | null;
  audioContext: AudioContext | null;
  isAudioEnabled: boolean;
  enableAudio: () => void;
  peakDb: number;
  perStreamVolumes: Map<string, number>;
  setStreamVolume: (peerId: string, volume: number) => void;
  outputDevices: MediaDeviceInfo[];
} {
  const audioContextRef = useRef<AudioContext | null>(null);
  const pipelinesRef = useRef<Map<string, AudioPipeline>>(new Map());
  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const peakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    ...DEFAULT_AUDIO_SETTINGS,
  });
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [peakDb, setPeakDb] = useState(-Infinity);
  const [perStreamVolumes, setPerStreamVolumes] = useState<Map<string, number>>(new Map());
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  // Enumerate output devices
  useEffect(() => {
    const enumerate = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
      } catch {
        // Devices enumeration not supported or denied
      }
    };

    enumerate();

    const handleDeviceChange = () => {
      enumerate();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  const ensureMasterNodes = useCallback((ctx: AudioContext) => {
    if (!masterGainRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      masterGainRef.current = gain;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      gain.connect(analyser);
      // Master analyser is not connected to destination — it's analysis-only.
      masterAnalyserRef.current = analyser;
      setAnalyserNode(analyser);
    }
  }, []);

  const enableAudio = useCallback(() => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      setIsAudioEnabled(true);
      return;
    }

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    audioContextRef.current = ctx;
    setAudioContext(ctx);
    ensureMasterNodes(ctx);
    setIsAudioEnabled(true);
  }, [ensureMasterNodes]);

  // Manage pipelines based on streams and audio enabled state
  useEffect(() => {
    if (!isAudioEnabled || !audioContextRef.current) return;

    const ctx = audioContextRef.current;
    ensureMasterNodes(ctx);

    const currentPeerIds = new Set(streams.keys());
    const existingPeerIds = new Set(pipelinesRef.current.keys());

    // Create pipelines for new streams
    for (const [peerId, stream] of streams.entries()) {
      if (!existingPeerIds.has(peerId)) {
        const pipeline = new AudioPipeline(stream, ctx);
        pipeline.updateSettings(audioSettings);

        // Connect pipeline gain to master gain for visualization
        if (masterGainRef.current) {
          pipeline.gainNode.connect(masterGainRef.current);
        }

        pipelinesRef.current.set(peerId, pipeline);

        // Initialize per-stream volume
        setPerStreamVolumes((prev) => {
          const next = new Map(prev);
          next.set(peerId, audioSettings.masterVolume);
          return next;
        });
      }
    }

    // Destroy pipelines for removed streams
    for (const peerId of existingPeerIds) {
      if (!currentPeerIds.has(peerId)) {
        const pipeline = pipelinesRef.current.get(peerId);
        if (pipeline) {
          pipeline.destroy();
          pipelinesRef.current.delete(peerId);
        }

        setPerStreamVolumes((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      }
    }
  }, [streams, isAudioEnabled, audioSettings, ensureMasterNodes]);

  // Peak dB polling
  useEffect(() => {
    if (!isAudioEnabled) return;

    peakIntervalRef.current = setInterval(() => {
      let maxPeak = -Infinity;
      for (const pipeline of pipelinesRef.current.values()) {
        const db = pipeline.getPeakDb();
        if (db > maxPeak) {
          maxPeak = db;
        }
      }
      setPeakDb(maxPeak);
    }, PEAK_POLL_INTERVAL_MS);

    return () => {
      if (peakIntervalRef.current) {
        clearInterval(peakIntervalRef.current);
        peakIntervalRef.current = null;
      }
    };
  }, [isAudioEnabled]);

  const updateSettings = useCallback((partial: Partial<AudioSettings>) => {
    setAudioSettings((prev) => {
      const next: AudioSettings = {
        ...prev,
        ...partial,
        eq: {
          ...prev.eq,
          ...(partial.eq ?? {}),
        },
      };

      // Apply to all active pipelines
      for (const pipeline of pipelinesRef.current.values()) {
        pipeline.updateSettings(next);
      }

      // Handle output device change
      if (partial.outputDeviceId && audioContextRef.current) {
        const ctx = audioContextRef.current as AudioContext & {
          setSinkId?: (sinkId: string) => Promise<void>;
        };
        if (typeof ctx.setSinkId === 'function') {
          ctx.setSinkId(partial.outputDeviceId).catch(() => {
            // setSinkId not supported or device unavailable
          });
        }
      }

      return next;
    });
  }, []);

  const setStreamVolume = useCallback((peerId: string, volume: number) => {
    const pipeline = pipelinesRef.current.get(peerId);
    if (pipeline) {
      pipeline.gainNode.gain.value = volume;
    }
    setPerStreamVolumes((prev) => {
      const next = new Map(prev);
      next.set(peerId, volume);
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const pipeline of pipelinesRef.current.values()) {
        pipeline.destroy();
      }
      pipelinesRef.current.clear();

      if (masterGainRef.current) {
        masterGainRef.current.disconnect();
        masterGainRef.current = null;
      }
      if (masterAnalyserRef.current) {
        masterAnalyserRef.current.disconnect();
        masterAnalyserRef.current = null;
      }

      if (peakIntervalRef.current) {
        clearInterval(peakIntervalRef.current);
        peakIntervalRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  return {
    audioSettings,
    updateSettings,
    analyserNode,
    audioContext,
    isAudioEnabled,
    enableAudio,
    peakDb,
    perStreamVolumes,
    setStreamVolume,
    outputDevices,
  };
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioPipeline } from '@/lib/webrtc-audio';
import { AudioSettings, DEFAULT_AUDIO_SETTINGS } from '@/lib/types';

const PEAK_POLL_INTERVAL_MS = 100;
const SAMPLE_RATE = 48000;

export function useAudioMixer(
  streams: Map<string, MediaStream>,
  localStream?: MediaStream | null,
): {
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
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
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

  // Manage pipelines for remote incoming streams
  useEffect(() => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;
    ensureMasterNodes(ctx);

    const currentPeerIds = new Set(streams.keys());
    const existingPeerIds = new Set(
      Array.from(pipelinesRef.current.keys()).filter((k) => k !== '__local__'),
    );

    // Create pipelines for new incoming streams
    for (const [peerId, stream] of streams.entries()) {
      if (!existingPeerIds.has(peerId)) {
        // Helper audio element ensures Chrome WebRTC audio decoder thread is active
        if (!audioElementsRef.current.has(peerId)) {
          const el = new Audio();
          el.srcObject = stream;
          el.volume = 0; // keeps decoder active without double-play
          el.play().catch(() => {});
          audioElementsRef.current.set(peerId, el);
        }

        // Web Audio graph with destination output
        const pipeline = new AudioPipeline(stream, ctx, true);
        pipeline.updateSettings(audioSettings);

        // Connect pipeline gain to master gain for visualization
        if (masterGainRef.current) {
          pipeline.gainNode.connect(masterGainRef.current);
        }

        pipelinesRef.current.set(peerId, pipeline);

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

        const el = audioElementsRef.current.get(peerId);
        if (el) {
          el.srcObject = null;
          audioElementsRef.current.delete(peerId);
        }

        setPerStreamVolumes((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      }
    }
  }, [streams, audioSettings, ensureMasterNodes]);

  // Manage pipeline for broadcaster's local system audio
  useEffect(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    ensureMasterNodes(ctx);

    if (localStream) {
      if (!pipelinesRef.current.has('__local__')) {
        // connectDestination: false prevents broadcaster from hearing their own audio loopback
        const pipeline = new AudioPipeline(localStream, ctx, false);
        pipeline.updateSettings(audioSettings);

        if (masterGainRef.current) {
          pipeline.gainNode.connect(masterGainRef.current);
        }

        pipelinesRef.current.set('__local__', pipeline);
      }
    } else {
      const pipeline = pipelinesRef.current.get('__local__');
      if (pipeline) {
        pipeline.destroy();
        pipelinesRef.current.delete('__local__');
      }
    }
  }, [localStream, audioSettings, ensureMasterNodes]);

  // Peak dB polling
  useEffect(() => {
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
  }, []);

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

      for (const el of audioElementsRef.current.values()) {
        el.srcObject = null;
      }
      audioElementsRef.current.clear();

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

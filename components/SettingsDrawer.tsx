'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Volume2,
  Volume1,
  VolumeX,
  Lock,
  Unlock,
  BarChart3,
  AudioWaveform,
  RotateCcw,
  Zap,
  Vibrate,
  Radio,
} from 'lucide-react';
import type { AudioSettings, RoomMode } from '@/lib/types';
import { DEFAULT_AUDIO_SETTINGS } from '@/lib/types';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  audioSettings: AudioSettings;
  onUpdateSettings: (settings: Partial<AudioSettings>) => void;
  outputDevices: MediaDeviceInfo[];
  isAdmin: boolean;
  roomMode: RoomMode;
  isLocked: boolean;
  onChangeMode: (mode: RoomMode) => void;
  onLockRoom: (locked: boolean) => void;
  perStreamVolumes: Map<string, number>;
  onSetStreamVolume: (peerId: string, volume: number) => void;
  onPlayTone?: (freq: number) => void;
  activeTestFreq?: number | null;
  currentRtt?: number;
}

function VolumeIcon({ level, muted }: { level: number; muted: boolean }) {
  if (muted || level === 0) return <VolumeX className="w-4 h-4 text-white/50" />;
  if (level < 0.5) return <Volume1 className="w-4 h-4 text-white/70" />;
  return <Volume2 className="w-4 h-4 text-white/70" />;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2 mt-5 first:mt-0">
      {children}
    </h3>
  );
}

export default function SettingsDrawer({
  isOpen,
  onClose,
  audioSettings,
  onUpdateSettings,
  outputDevices,
  isAdmin,
  roomMode,
  isLocked,
  onChangeMode,
  onLockRoom,
  perStreamVolumes,
  onSetStreamVolume,
  onPlayTone,
  activeTestFreq,
  currentRtt = 0,
}: SettingsDrawerProps) {
  const volPercent = Math.round(audioSettings.masterVolume * 100);

  const handleResetToDefault = () => {
    onUpdateSettings({
      masterVolume: 0.8,
      isMuted: false,
      bitrate: 320000,
      latencyOffset: 0,
      eq: { bass: 0, mid: 0, treble: 0 },
      outputDeviceId: 'default',
      visualizerMode: 'bars',
      hapticSync: false,
      hapticSensitivity: 'mid',
    });
  };

  const handleAutoSync = () => {
    // Dynamic latency auto-alignment: Compensate for estimated one-way transport delay
    const estimatedOneWay = Math.round(currentRtt / 2);
    // Negative delay compensates ahead of network drift, bounded to -300ms .. +300ms
    const autoOffset = Math.max(-300, Math.min(300, -estimatedOneWay));
    onUpdateSettings({ latencyOffset: autoOffset });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer Panel */}
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-50 w-[400px] max-w-full glass-card rounded-l-2xl border-l border-white/10 overflow-y-auto bg-[#0A0F1D]/95 backdrop-blur-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="p-5">
              {/* Header with Reset Button */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white">Audio Settings</h2>
                  <button
                    onClick={handleResetToDefault}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-jam-cyan/30 bg-jam-cyan/10 hover:bg-jam-cyan/20 text-[11px] font-semibold text-jam-cyan transition-all active:scale-95 shadow-sm"
                    title="Reset all sound settings to studio defaults"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Default
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Audio Quality / Bitrate */}
              <SectionHeader>Audio Quality</SectionHeader>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 96000 as const, label: '96k', sub: 'Data Saver' },
                  { value: 160000 as const, label: '160k', sub: 'Balanced' },
                  { value: 320000 as const, label: '320k', sub: 'Studio Hi-Fi' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onUpdateSettings({ bitrate: opt.value })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      audioSettings.bitrate === opt.value
                        ? 'border-jam-blue bg-jam-blue/20 text-jam-blue font-bold shadow-md shadow-jam-blue/20'
                        : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                    }`}
                  >
                    <div className="text-sm font-bold">{opt.label}</div>
                    <div className="text-[10px] mt-0.5 opacity-70">{opt.sub}</div>
                  </button>
                ))}
              </div>

              {/* Master Volume */}
              <SectionHeader>Master Volume</SectionHeader>
              <div className="flex items-center gap-3 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                <button
                  onClick={() => onUpdateSettings({ isMuted: !audioSettings.isMuted })}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  title={audioSettings.isMuted ? 'Unmute' : 'Mute'}
                >
                  <VolumeIcon level={audioSettings.masterVolume} muted={audioSettings.isMuted} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audioSettings.isMuted ? 0 : volPercent}
                  onChange={(e) =>
                    onUpdateSettings({
                      masterVolume: parseInt(e.target.value) / 100,
                      isMuted: false,
                    })
                  }
                  className="flex-1 accent-jam-blue h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
                <span className="text-xs font-mono text-white/60 w-10 text-right">
                  {audioSettings.isMuted ? '0%' : `${volPercent}%`}
                </span>
              </div>

              {/* Sync Offset & Dynamic Auto-Lock */}
              <div className="flex items-center justify-between mt-5 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">
                  Sync Offset &amp; Drift Lock
                </h3>
                <button
                  onClick={handleAutoSync}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-jam-cyan/30 bg-jam-cyan/10 hover:bg-jam-cyan/20 text-[11px] font-semibold text-jam-cyan transition-all active:scale-95"
                  title="Dynamically calculate network latency and lock speaker phase"
                >
                  <Zap className="w-3 h-3 text-jam-cyan" />
                  Auto-Sync Phase
                </button>
              </div>
              <div className="space-y-1 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={-500}
                    max={500}
                    value={audioSettings.latencyOffset}
                    onChange={(e) => onUpdateSettings({ latencyOffset: parseInt(e.target.value) })}
                    className="flex-1 accent-jam-cyan h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                  />
                  <span className="text-xs font-mono text-jam-cyan font-bold w-16 text-right">
                    {audioSettings.latencyOffset > 0
                      ? `+${audioSettings.latencyOffset}`
                      : audioSettings.latencyOffset}
                    ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-white/40 pt-1">
                  <span>-500ms (Lead)</span>
                  <span>0ms (Direct)</span>
                  <span>+500ms (Lag)</span>
                </div>
                <p className="text-[10px] text-white/30 pt-1">
                  Eliminates room echo and acoustic delay when multiple devices play together.
                </p>
              </div>

              {/* 3-Band Studio EQ */}
              <SectionHeader>3-Band EQ</SectionHeader>
              <div className="space-y-3 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                {([
                  { key: 'bass' as const, label: 'Bass', freq: '250 Hz' },
                  { key: 'mid' as const, label: 'Mid', freq: '1 kHz' },
                  { key: 'treble' as const, label: 'Treble', freq: '4 kHz' },
                ] as const).map((band) => (
                  <div key={band.key} className="flex items-center gap-3">
                    <div className="w-16">
                      <div className="text-xs font-semibold text-white/70">{band.label}</div>
                      <div className="text-[10px] text-white/30">{band.freq}</div>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      value={audioSettings.eq[band.key]}
                      onChange={(e) =>
                        onUpdateSettings({
                          eq: { ...audioSettings.eq, [band.key]: parseInt(e.target.value) },
                        })
                      }
                      className="flex-1 accent-jam-blue h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                    <span className="text-xs font-mono text-white/60 w-12 text-right">
                      {audioSettings.eq[band.key] > 0 ? '+' : ''}
                      {audioSettings.eq[band.key]} dB
                    </span>
                  </div>
                ))}
              </div>

              {/* Haptic Resonance / Device Vibration */}
              <SectionHeader>Haptic Resonance (Device Vibration)</SectionHeader>
              <div className="space-y-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Vibrate className="w-4 h-4 text-jam-cyan" />
                    <div>
                      <div className="text-sm font-semibold text-white">Vibrate to Beat</div>
                      <div className="text-[10px] text-white/40">
                        Synchronizes mobile haptic motors to sub-bass transients
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onUpdateSettings({ hapticSync: !audioSettings.hapticSync })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      audioSettings.hapticSync ? 'bg-jam-cyan' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-md ${
                        audioSettings.hapticSync ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {audioSettings.hapticSync && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="text-[10px] text-white/50 uppercase font-semibold">
                      Beat Sensitivity
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['low', 'mid', 'high'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => onUpdateSettings({ hapticSensitivity: s })}
                          className={`py-1.5 px-2 rounded-lg text-xs capitalize border transition-all ${
                            audioSettings.hapticSensitivity === s
                              ? 'border-jam-cyan bg-jam-cyan/20 text-jam-cyan font-bold shadow-sm'
                              : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                      navigator.vibrate([60, 40, 60]);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-white/70 transition-colors flex items-center justify-center gap-2"
                >
                  <Vibrate className="w-3.5 h-3.5 text-jam-cyan" />
                  Test Device Vibration Pulse
                </button>
              </div>

              {/* Resonant Frequency Calibration */}
              {onPlayTone && (
                <>
                  <SectionHeader>Frequency Calibration (Same Freq)</SectionHeader>
                  <div className="space-y-2 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { freq: 40, label: '40 Hz', desc: 'Sub Bass' },
                        { freq: 60, label: '60 Hz', desc: 'Punch' },
                        { freq: 432, label: '432 Hz', desc: 'Verdi' },
                        { freq: 440, label: '440 Hz', desc: 'Pitch A4' },
                        { freq: 528, label: '528 Hz', desc: 'Resonance' },
                      ].map((t) => (
                        <button
                          key={t.freq}
                          onClick={() => onPlayTone(t.freq)}
                          className={`p-2 rounded-xl border text-left transition-all ${
                            activeTestFreq === t.freq
                              ? 'border-jam-cyan bg-jam-cyan/20 text-jam-cyan font-bold ring-2 ring-jam-cyan/40 animate-pulse'
                              : 'border-white/10 bg-white/5 text-white/70 hover:border-jam-cyan/40 hover:bg-white/10'
                          }`}
                        >
                          <div className="text-xs font-bold text-white">{t.label}</div>
                          <div className="text-[9px] text-white/40">{t.desc}</div>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/30 pt-1">
                      Plays a pure sine tone to test acoustic alignment &amp; physical resonance across all devices.
                    </p>
                  </div>
                </>
              )}

              {/* Output Device */}
              <SectionHeader>Output Device</SectionHeader>
              <select
                value={audioSettings.outputDeviceId}
                onChange={(e) => onUpdateSettings({ outputDeviceId: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white/80 outline-none focus:border-jam-blue/50 appearance-none cursor-pointer"
              >
                {outputDevices.length === 0 && <option value="default">Default Audio Device</option>}
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-jam-card text-white">
                    {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>

              {/* Visualizer Mode */}
              <SectionHeader>Visualizer Mode</SectionHeader>
              <div className="flex gap-2">
                <button
                  onClick={() => onUpdateSettings({ visualizerMode: 'bars' })}
                  className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all ${
                    audioSettings.visualizerMode === 'bars'
                      ? 'border-jam-blue bg-jam-blue/20 text-jam-blue font-bold shadow-md shadow-jam-blue/20'
                      : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm">Spectrum Bars</span>
                </button>
                <button
                  onClick={() => onUpdateSettings({ visualizerMode: 'waveform' })}
                  className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all ${
                    audioSettings.visualizerMode === 'waveform'
                      ? 'border-jam-cyan bg-jam-cyan/20 text-jam-cyan font-bold shadow-md shadow-jam-cyan/20'
                      : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                  }`}
                >
                  <AudioWaveform className="w-4 h-4" />
                  <span className="text-sm">Oscilloscope</span>
                </button>
              </div>

              {/* Room Settings (Admin Only) */}
              {isAdmin && (
                <>
                  <SectionHeader>Room Administration</SectionHeader>

                  <div className="space-y-2 mb-3">
                    <span className="text-xs text-white/50">Room Mode</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onChangeMode('single-dj')}
                        className={`p-2.5 rounded-xl border text-center transition-all text-sm ${
                          roomMode === 'single-dj'
                            ? 'border-jam-blue bg-jam-blue/20 text-jam-blue font-bold shadow-md shadow-jam-blue/20'
                            : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                        }`}
                      >
                        Single DJ
                      </button>
                      <button
                        onClick={() => onChangeMode('jam-session')}
                        className={`p-2.5 rounded-xl border text-center transition-all text-sm ${
                          roomMode === 'jam-session'
                            ? 'border-jam-cyan bg-jam-cyan/20 text-jam-cyan font-bold shadow-md shadow-jam-cyan/20'
                            : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                        }`}
                      >
                        Jam Session (3)
                      </button>
                    </div>
                  </div>

                  {/* Lock Room Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2">
                      {isLocked ? (
                        <Lock className="w-4 h-4 text-red-400" />
                      ) : (
                        <Unlock className="w-4 h-4 text-emerald-400" />
                      )}
                      <div>
                        <div className="text-sm font-semibold text-white">Lock Room</div>
                        <div className="text-[10px] text-white/40">
                          {isLocked ? 'New participants cannot join' : 'Open for joins'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onLockRoom(!isLocked)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        isLocked ? 'bg-red-500' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-md ${
                          isLocked ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </>
              )}

              {/* Per-Stream Volumes */}
              {perStreamVolumes.size > 0 && (
                <>
                  <SectionHeader>Per-Stream Volumes</SectionHeader>
                  <div className="space-y-3 bg-white/[0.03] p-3 rounded-xl border border-white/5">
                    {Array.from(perStreamVolumes.entries()).map(([peerId, volume]) => (
                      <div key={peerId} className="flex items-center gap-3">
                        <span className="text-xs text-white/60 w-24 truncate font-mono">
                          {peerId.slice(0, 10)}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(volume * 100)}
                          onChange={(e) => onSetStreamVolume(peerId, parseInt(e.target.value) / 100)}
                          className="flex-1 accent-jam-cyan h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                        />
                        <span className="text-xs font-mono text-white/60 w-10 text-right">
                          {Math.round(volume * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="h-8" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

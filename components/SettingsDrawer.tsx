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
} from 'lucide-react';
import type { AudioSettings, RoomMode } from '@/lib/types';

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
}

function VolumeIcon({ level, muted }: { level: number; muted: boolean }) {
  if (muted || level === 0) return <VolumeX className="w-4 h-4 text-white/50" />;
  if (level < 0.5) return <Volume1 className="w-4 h-4 text-white/70" />;
  return <Volume2 className="w-4 h-4 text-white/70" />;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2 mt-5 first:mt-0">{children}</h3>;
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
}: SettingsDrawerProps) {
  const volPercent = Math.round(audioSettings.masterVolume * 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-50 w-[380px] max-w-full glass-card rounded-l-2xl border-l border-white/10 overflow-y-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Settings</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Audio Quality */}
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
                        ? 'border-jam-blue bg-jam-blue/15 text-jam-blue'
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onUpdateSettings({ isMuted: !audioSettings.isMuted })}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <VolumeIcon level={audioSettings.masterVolume} muted={audioSettings.isMuted} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volPercent}
                  onChange={(e) => onUpdateSettings({ masterVolume: parseInt(e.target.value) / 100 })}
                  className="flex-1 accent-jam-blue h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-jam-blue [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
                />
                <span className="text-xs font-mono text-white/50 w-10 text-right">{volPercent}%</span>
              </div>

              {/* Latency Offset */}
              <SectionHeader>Sync Offset</SectionHeader>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={-500}
                    max={500}
                    value={audioSettings.latencyOffset}
                    onChange={(e) => onUpdateSettings({ latencyOffset: parseInt(e.target.value) })}
                    className="flex-1 accent-jam-cyan h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-jam-cyan [&::-webkit-slider-thumb]:rounded-full"
                  />
                  <span className="text-xs font-mono text-white/50 w-14 text-right">
                    {audioSettings.latencyOffset}ms
                  </span>
                </div>
                <p className="text-[10px] text-white/25">Adjust if audio is out of sync across devices.</p>
              </div>

              {/* 3-Band EQ */}
              <SectionHeader>3-Band EQ</SectionHeader>
              <div className="space-y-3">
                {([
                  { key: 'bass' as const, label: 'Bass', freq: '250 Hz' },
                  { key: 'mid' as const, label: 'Mid', freq: '1 kHz' },
                  { key: 'treble' as const, label: 'Treble', freq: '4 kHz' },
                ] as const).map((band) => (
                  <div key={band.key} className="flex items-center gap-3">
                    <div className="w-16">
                      <div className="text-xs text-white/60">{band.label}</div>
                      <div className="text-[10px] text-white/25">{band.freq}</div>
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
                      className="flex-1 accent-jam-blue h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-jam-blue [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <span className="text-xs font-mono text-white/50 w-12 text-right">
                      {audioSettings.eq[band.key] > 0 ? '+' : ''}
                      {audioSettings.eq[band.key]} dB
                    </span>
                  </div>
                ))}
              </div>

              {/* Output Device */}
              <SectionHeader>Output Device</SectionHeader>
              <select
                value={audioSettings.outputDeviceId}
                onChange={(e) => onUpdateSettings({ outputDeviceId: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white/80 outline-none focus:border-jam-blue/50 appearance-none cursor-pointer"
              >
                {outputDevices.length === 0 && <option value="default">Default</option>}
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-jam-card text-white">
                    {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>

              {/* Visualizer */}
              <SectionHeader>Visualizer</SectionHeader>
              <div className="flex gap-2">
                <button
                  onClick={() => onUpdateSettings({ visualizerMode: 'bars' })}
                  className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all ${
                    audioSettings.visualizerMode === 'bars'
                      ? 'border-jam-blue bg-jam-blue/15 text-jam-blue'
                      : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm">Bars</span>
                </button>
                <button
                  onClick={() => onUpdateSettings({ visualizerMode: 'waveform' })}
                  className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all ${
                    audioSettings.visualizerMode === 'waveform'
                      ? 'border-jam-blue bg-jam-blue/15 text-jam-blue'
                      : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                  }`}
                >
                  <AudioWaveform className="w-4 h-4" />
                  <span className="text-sm">Waveform</span>
                </button>
              </div>

              {/* Room Settings (Admin Only) */}
              {isAdmin && (
                <>
                  <SectionHeader>Room Settings</SectionHeader>

                  {/* Room Mode */}
                  <div className="space-y-2 mb-3">
                    <span className="text-xs text-white/50">Room Mode</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onChangeMode('single-dj')}
                        className={`p-2.5 rounded-xl border text-center transition-all text-sm ${
                          roomMode === 'single-dj'
                            ? 'border-jam-blue bg-jam-blue/15 text-jam-blue'
                            : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                        }`}
                      >
                        Single DJ
                      </button>
                      <button
                        onClick={() => onChangeMode('jam-session')}
                        className={`p-2.5 rounded-xl border text-center transition-all text-sm ${
                          roomMode === 'jam-session'
                            ? 'border-jam-cyan bg-jam-cyan/15 text-jam-cyan'
                            : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20'
                        }`}
                      >
                        Jam Session (3)
                      </button>
                    </div>
                  </div>

                  {/* Lock Room */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2">
                      {isLocked ? (
                        <Lock className="w-4 h-4 text-red-400" />
                      ) : (
                        <Unlock className="w-4 h-4 text-green-400" />
                      )}
                      <span className="text-sm text-white/70">Lock Room</span>
                    </div>
                    <button
                      onClick={() => onLockRoom(!isLocked)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        isLocked ? 'bg-red-500/40' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                          isLocked ? 'left-[22px] bg-red-400' : 'left-0.5 bg-white/40'
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
                  <div className="space-y-3">
                    {Array.from(perStreamVolumes.entries()).map(([peerId, volume]) => (
                      <div key={peerId} className="flex items-center gap-3">
                        <span className="text-xs text-white/50 w-20 truncate">{peerId.slice(0, 8)}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(volume * 100)}
                          onChange={(e) => onSetStreamVolume(peerId, parseInt(e.target.value) / 100)}
                          className="flex-1 accent-jam-cyan h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-jam-cyan [&::-webkit-slider-thumb]:rounded-full"
                        />
                        <span className="text-xs font-mono text-white/50 w-10 text-right">
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

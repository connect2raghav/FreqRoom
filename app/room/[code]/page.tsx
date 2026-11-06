'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio,
  Share2,
  Settings,
  LogOut,
  Volume2,
  VolumeX,
  RefreshCw,
  Mic,
  MicOff,
  Copy,
  Check,
  Users,
  MessageSquare,
  Shield,
  Sparkles,
  Info,
  AlertCircle,
  HelpCircle,
  RadioTower,
} from 'lucide-react';

import { useJamRoom } from '@/hooks/useJamRoom';
import { useAudioMixer } from '@/hooks/useAudioMixer';
import AudioVisualizer from '@/components/AudioVisualizer';
import BroadcasterCard from '@/components/BroadcasterCard';
import ParticipantList from '@/components/ParticipantList';
import AuxRequestQueue from '@/components/AuxRequestQueue';
import SettingsDrawer from '@/components/SettingsDrawer';
import ChatPanel from '@/components/ChatPanel';
import AudioEnableOverlay from '@/components/AudioEnableOverlay';
import { EmojiReactions } from '@/components/EmojiReactions';

import { formatRoomCode, parseRoomCode } from '@/lib/utils';
import type { Participant } from '@/lib/types';

const EMOJI_OPTIONS = ['🔥', '❤️', '🎵', '👏', '💯', '🎉', '⚡', '🔊'];

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawCode = (params?.code as string) || '';
  const roomCode = useMemo(() => parseRoomCode(rawCode), [rawCode]);
  const isAdminQuery = searchParams.get('admin') === 'true';

  // Display name from storage or fallback prompt
  const [displayName, setDisplayName] = useState<string>('');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [tempName, setTempName] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<'participants' | 'aux' | 'chat'>('participants');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; type?: 'info' | 'error' | 'success' }>>([]);

  const addToast = useCallback((text: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Check stored display name on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem('jamhub_display_name');
    if (stored) {
      setDisplayName(stored);
    } else {
      setNameModalOpen(true);
    }
  }, []);

  // WebRTC Room orchestration hook
  const {
    roomState,
    myPeerId,
    myRole,
    isConnected,
    isConnecting,
    error: roomError,
    isBroadcasting,
    broadcastStream,
    incomingStreams,
    chatMessages,
    emojiReactions,
    stats,
    requestAux,
    approveAux,
    denyAux,
    revokeAux,
    startBroadcasting,
    stopBroadcasting,
    kickPeer,
    lockRoom,
    changeMode,
    transferAdmin,
    sendChat,
    sendEmoji,
    muteBroadcaster,
    disconnect,
    resyncAudio,
  } = useJamRoom(roomCode, displayName, isAdminQuery);

  // Audio Mixer DSP pipeline hook (handles both incoming remote streams and local broadcast monitoring)
  const {
    audioSettings,
    updateSettings,
    analyserNode,
    isAudioEnabled,
    enableAudio,
    peakDb,
    perStreamVolumes,
    setStreamVolume,
    outputDevices,
  } = useAudioMixer(incomingStreams, broadcastStream);

  // Listen for Aux Approval to trigger the System Audio Capture Modal
  const [hasShownCaptureModal, setHasShownCaptureModal] = useState(false);
  useEffect(() => {
    if (myRole === 'BROADCASTER' && !isBroadcasting && !hasShownCaptureModal) {
      setCaptureModalOpen(true);
      setHasShownCaptureModal(true);
      addToast('Aux granted! Select your audio source to stream.', 'success');
    }
    if (myRole === 'LISTENER') {
      setHasShownCaptureModal(false);
    }
  }, [myRole, isBroadcasting, hasShownCaptureModal, addToast]);

  // Find active broadcaster participant
  const currentBroadcaster = useMemo<Participant | null>(() => {
    if (isBroadcasting && myPeerId) {
      const me = roomState.participants.find((p) => p.peerId === myPeerId);
      if (me) return me;
    }
    if (roomState.activeBroadcasters.length === 0) return null;
    const activeId = roomState.activeBroadcasters[0];
    return roomState.participants.find((p) => p.peerId === activeId) || null;
  }, [isBroadcasting, myPeerId, roomState.activeBroadcasters, roomState.participants]);

  // Is current user admin
  const isUserAdmin = myRole === 'ADMIN' || (roomState.adminPeerId === myPeerId && !!myPeerId);

  // Handle direct link copy
  const handleCopyInvite = async () => {
    try {
      const url = `${window.location.origin}/room/${roomCode}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      addToast('Invite link copied to clipboard!', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      addToast('Failed to copy link', 'error');
    }
  };

  // Start audio capture flow
  const handleStartCapture = async () => {
    try {
      setCaptureModalOpen(false);
      await startBroadcasting();
      addToast('Broadcasting system audio in studio stereo!', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Failed to capture system audio', 'error');
    }
  };

  // Resync trigger with animation
  const handleResync = () => {
    setIsResyncing(true);
    resyncAudio();
    addToast('Resyncing WebRTC jitter buffer & audio pipeline...', 'info');
    setTimeout(() => setIsResyncing(false), 1200);
  };

  // Leave room
  const handleLeave = () => {
    disconnect();
    router.push('/');
  };

  // Submit direct nickname
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tempName.trim();
    if (!trimmed) return;
    sessionStorage.setItem('jamhub_display_name', trimmed);
    setDisplayName(trimmed);
    setNameModalOpen(false);
  };

  // Check if room is active with audio
  const isAudioActive = isBroadcasting || incomingStreams.size > 0 || peakDb > -50;

  return (
    <div className="relative min-h-screen w-full bg-[#0A0F1D] text-white flex flex-col overflow-x-hidden">
      {/* Background Glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/3 h-[500px] w-[600px] rounded-full bg-jam-blue/10 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[500px] rounded-full bg-jam-cyan/10 blur-[130px]" />
      </div>

      {/* Floating Emoji Reactions Layer */}
      <EmojiReactions reactions={emojiReactions} />

      {/* Autoplay Policy Guard Overlay */}
      <AudioEnableOverlay isVisible={!isAudioEnabled && isConnected} onEnable={enableAudio} />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-white/10 bg-[#0A0F1D]/80 px-4 backdrop-blur-xl sm:px-6">
        {/* Brand & Room Info */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2.5 transition hover:opacity-85"
            title="FreqRoom Home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-jam-blue to-jam-cyan shadow-md shadow-jam-blue/30">
              <RadioTower className="h-5 w-5 text-white" />
            </div>
            <div className="hidden sm:block text-left">
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-white text-base">FreqRoom</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-jam-cyan">Sync</span>
              </div>
              <p className="text-[10px] text-gray-400 font-normal truncate max-w-[220px]">
                devices vibrating at same freq
              </p>
            </div>
          </button>

          {/* Room Code Badge */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md">
            <span className="text-xs text-gray-400">Room:</span>
            <span className="font-mono text-xs font-bold tracking-widest text-jam-cyan">
              {formatRoomCode(roomCode)}
            </span>
            <button
              onClick={handleCopyInvite}
              className="ml-1 text-gray-400 transition hover:text-white"
              title="Copy Room Link"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Center Stereo / Bitrate Status */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
            <span
              className={`h-2 w-2 rounded-full ${
                isAudioActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span>{isAudioActive ? 'Live Audio Stream' : 'Idle / Standby'}</span>
            <span className="text-gray-500">•</span>
            <span className="font-mono text-jam-blue">{audioSettings.bitrate / 1000}kbps Opus</span>
          </div>

          {roomState.isLocked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-300">
              <Shield className="h-3 w-3" /> Locked
            </span>
          )}
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyInvite}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-white/10 hover:text-white"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Invite</span>
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
            title="Audio & Room Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={handleLeave}
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-rose-400 transition hover:bg-rose-500/20 hover:text-rose-300"
            title="Leave Room"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:flex-row">
        {/* Left Column: Visualizer, Broadcaster Card, Aux Controls */}
        <div className="flex flex-1 flex-col gap-5">
          {/* Real-time 60fps Visualizer Stage */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-jam-card/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-jam-cyan animate-pulse" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Audio Spectrum &amp; Vibration Monitor
                </h2>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() =>
                    updateSettings({
                      visualizerMode:
                        audioSettings.visualizerMode === 'bars' ? 'waveform' : 'bars',
                    })
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-gray-400 transition hover:text-white"
                >
                  Mode: <span className="text-jam-cyan capitalize">{audioSettings.visualizerMode}</span>
                </button>
              </div>
            </div>

            <AudioVisualizer
              analyserNode={analyserNode}
              mode={audioSettings.visualizerMode}
              isActive={isAudioActive}
            />
          </div>

          {/* Broadcaster Spotlight Card */}
          <BroadcasterCard
            broadcaster={currentBroadcaster}
            bitrate={audioSettings.bitrate}
            peakDb={peakDb}
            isAdmin={isUserAdmin}
            onRevoke={() => {
              if (currentBroadcaster) revokeAux(currentBroadcaster.peerId);
            }}
            onMute={() => {
              if (currentBroadcaster) muteBroadcaster(currentBroadcaster.peerId);
            }}
          />

          {/* Control Bar: Aux Request, Master Volume, Resync & Emoji */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-jam-card/80 p-4 shadow-xl backdrop-blur-xl">
            {/* Left: Aux Action Button */}
            <div className="flex items-center gap-3">
              {isBroadcasting ? (
                <button
                  onClick={stopBroadcasting}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/30 transition hover:brightness-110 active:scale-95"
                >
                  <MicOff className="h-4 w-4" />
                  Stop Broadcasting
                </button>
              ) : myRole === 'BROADCASTER' ? (
                <button
                  onClick={() => setCaptureModalOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:brightness-110 active:scale-95 animate-pulse"
                >
                  <Mic className="h-4 w-4" />
                  Start Audio Stream
                </button>
              ) : (
                <button
                  onClick={() => {
                    requestAux();
                    addToast('Aux requested! Waiting for Admin approval...', 'info');
                  }}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-jam-blue via-blue-500 to-jam-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-jam-blue/30 transition hover:brightness-110 active:scale-95"
                >
                  <Radio className="h-4 w-4" />
                  Request the Aux (Share Audio)
                </button>
              )}

              {/* Resync Button */}
              <button
                onClick={handleResync}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-medium text-gray-300 transition hover:bg-white/10 hover:text-white"
                title="Flush Jitter Buffer & Re-align Audio"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isResyncing ? 'animate-spin text-jam-cyan' : ''}`} />
                <span className="hidden sm:inline">Resync Audio</span>
              </button>
            </div>

            {/* Center/Right: Master Volume Slider & Mute */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateSettings({ isMuted: !audioSettings.isMuted })}
                className="text-gray-400 transition hover:text-white"
                title={audioSettings.isMuted ? 'Unmute' : 'Mute'}
              >
                {audioSettings.isMuted || audioSettings.masterVolume === 0 ? (
                  <VolumeX className="h-5 w-5 text-rose-400" />
                ) : (
                  <Volume2 className="h-5 w-5 text-jam-cyan" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audioSettings.isMuted ? 0 : audioSettings.masterVolume}
                onChange={(e) =>
                  updateSettings({
                    masterVolume: parseFloat(e.target.value),
                    isMuted: false,
                  })
                }
                className="w-24 sm:w-32 accent-jam-blue"
              />
              <span className="w-9 font-mono text-xs text-gray-400">
                {audioSettings.isMuted ? '0%' : `${Math.round(audioSettings.masterVolume * 100)}%`}
              </span>
            </div>
          </div>

          {/* Quick Floating Emoji Reaction Bar */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur-md">
            <span className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Vibe Check:
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendEmoji(emoji)}
                  className="rounded-lg p-1.5 text-lg transition hover:scale-125 hover:bg-white/10 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Tabbed Sidebar (Participants, Aux Queue, Chat) */}
        <div className="flex w-full flex-col rounded-2xl border border-white/10 bg-jam-card/80 shadow-2xl backdrop-blur-xl lg:w-96">
          {/* Tab Headers */}
          <div className="flex border-b border-white/10 p-2">
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition ${
                activeTab === 'participants'
                  ? 'bg-jam-blue text-white shadow-md shadow-jam-blue/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Peers ({roomState.participants.length})
            </button>

            {isUserAdmin && (
              <button
                onClick={() => setActiveTab('aux')}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition ${
                  activeTab === 'aux'
                    ? 'bg-jam-cyan text-white shadow-md shadow-jam-cyan/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                Aux Queue
                {roomState.auxRequests.length > 0 && (
                  <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white animate-pulse">
                    {roomState.auxRequests.length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('chat')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition ${
                activeTab === 'chat'
                  ? 'bg-jam-blue text-white shadow-md shadow-jam-blue/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 p-3">
            {activeTab === 'participants' && (
              <ParticipantList
                participants={roomState.participants}
                myPeerId={myPeerId}
                isAdmin={isUserAdmin}
                stats={stats}
                onKick={kickPeer}
                onTransferAdmin={transferAdmin}
              />
            )}

            {activeTab === 'aux' && isUserAdmin && (
              <AuxRequestQueue
                requests={roomState.auxRequests}
                onApprove={approveAux}
                onDeny={denyAux}
              />
            )}

            {activeTab === 'chat' && (
              <ChatPanel
                messages={chatMessages}
                onSend={sendChat}
                myPeerId={myPeerId}
              />
            )}
          </div>
        </div>
      </div>

      {/* System Audio Capture Instructions Modal */}
      <AnimatePresence>
        {captureModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-lg rounded-2xl border border-jam-cyan/40 bg-jam-card p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-jam-cyan/20 text-jam-cyan">
                  <Radio className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Share System Audio</h3>
                  <p className="text-xs text-gray-400">High-bitrate stereo WebRTC stream</p>
                </div>
              </div>

              <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-gray-300">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-jam-cyan text-[11px] font-bold text-black">
                    1
                  </span>
                  <p>
                    In the browser popup, pick <strong className="text-white">Chrome Tab</strong> (for Spotify Web, YouTube) or <strong className="text-white">Entire Screen</strong> (for desktop apps &amp; DAWs).
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-jam-cyan text-[11px] font-bold text-black">
                    2
                  </span>
                  <p>
                    <strong className="text-emerald-400 underline">Crucial:</strong> Check the box labeled{' '}
                    <span className="font-semibold text-white">&quot;Also share tab audio&quot;</span> or{' '}
                    <span className="font-semibold text-white">&quot;Share system audio&quot;</span> at the bottom left.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-jam-cyan text-[11px] font-bold text-black">
                    3
                  </span>
                  <p>
                    FreqRoom automatically discards the video feed immediately to preserve bandwidth and stream pure 320kbps stereo Opus audio.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={() => setCaptureModalOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartCapture}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-jam-cyan to-teal-500 px-6 py-2.5 text-xs font-bold text-black shadow-lg shadow-jam-cyan/30 hover:brightness-110"
                >
                  <Sparkles className="h-4 w-4" />
                  Select Source &amp; Stream
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Direct URL Join Name Modal */}
      <AnimatePresence>
        {nameModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-lg">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-jam-card p-6 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-white">Welcome to FreqRoom</h3>
              <p className="mt-1 text-xs text-gray-400">
                You are joining room <span className="font-mono text-jam-cyan">{formatRoomCode(roomCode)}</span>.
                Enter your nickname to tune in.
              </p>

              <form onSubmit={handleNameSubmit} className="mt-4 space-y-4">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Your display name"
                  maxLength={24}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-jam-blue focus:ring-2 focus:ring-jam-blue/20"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-gradient-to-r from-jam-blue to-jam-cyan py-3 text-sm font-semibold text-white shadow-lg shadow-jam-blue/30"
                >
                  Enter Room
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audio & Room Settings Slide-Out Drawer */}
      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        audioSettings={audioSettings}
        onUpdateSettings={updateSettings}
        outputDevices={outputDevices}
        isAdmin={isUserAdmin}
        roomMode={roomState.mode}
        isLocked={roomState.isLocked}
        onChangeMode={changeMode}
        onLockRoom={lockRoom}
        perStreamVolumes={perStreamVolumes}
        onSetStreamVolume={setStreamVolume}
      />

      {/* Toast Notification Stack */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-xl ${
                toast.type === 'error'
                  ? 'border-rose-500/30 bg-rose-950/80 text-rose-200'
                  : toast.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-950/80 text-emerald-200'
                  : 'border-white/10 bg-jam-card/90 text-gray-200'
              }`}
            >
              {toast.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-400" />}
              {toast.type === 'success' && <Check className="h-4 w-4 text-emerald-400" />}
              {toast.type === 'info' && <Info className="h-4 w-4 text-jam-cyan" />}
              <span>{toast.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}


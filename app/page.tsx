'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { RadioTower, Sparkles, Volume2, ShieldCheck, Zap, Sliders, Headphones } from 'lucide-react';
import { CreateJoinRoom } from '@/components/CreateJoinRoom';
import { generateRoomCode } from '@/lib/utils';

export default function LandingPage() {
  const router = useRouter();

  const handleCreateRoom = (displayName: string) => {
    const code = generateRoomCode();
    sessionStorage.setItem('jamhub_display_name', displayName);
    sessionStorage.setItem('jamhub_is_admin', 'true');
    router.push(`/room/${code}?admin=true`);
  };

  const handleJoinRoom = (roomCode: string, displayName: string) => {
    sessionStorage.setItem('jamhub_display_name', displayName);
    sessionStorage.setItem('jamhub_is_admin', 'false');
    router.push(`/room/${roomCode}`);
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-jam-bg text-white flex flex-col justify-between">
      {/* Background Decorative Gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-jam-blue/20 via-jam-cyan/10 to-transparent blur-3xl" />
        <div className="absolute top-1/2 -left-40 h-[400px] w-[400px] rounded-full bg-jam-blue/10 blur-3xl" />
        <div className="absolute bottom-0 -right-40 h-[400px] w-[400px] rounded-full bg-jam-cyan/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-jam-blue to-jam-cyan shadow-lg shadow-jam-blue/30">
            <RadioTower className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">FreqRoom</h1>
            <p className="text-[10px] uppercase tracking-widest text-jam-cyan font-semibold">Multiple Devices Vibrating at the Same Frequency</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-400 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          WebRTC Opus Stereo 320kbps
        </div>
      </header>

      {/* Hero & Form Section */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 py-12 lg:flex-row lg:gap-16">
        {/* Left Hero Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-xl text-center lg:text-left mb-10 lg:mb-0"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-jam-blue/30 bg-jam-blue/10 px-3.5 py-1 text-xs font-semibold text-jam-cyan mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            FreqRoom: Multiple devices vibrating at the same frequency
          </div>

          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Stream your{' '}
            <span className="bg-gradient-to-r from-jam-blue via-sky-400 to-jam-cyan bg-clip-text text-transparent">
              System Audio
            </span>{' '}
            in Synchronized Stereo.
          </h2>

          <p className="mt-5 text-base sm:text-lg text-gray-400 leading-relaxed">
            Pass the Aux to your friends instantly. Broadcast Spotify, YouTube, DAWs, or DJ sessions
            directly from your browser tab to synchronized peers with zero latency drift.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            <div>
              <p className="text-xl font-bold text-white sm:text-2xl">320<span className="text-sm font-normal text-gray-400">kbps</span></p>
              <p className="text-xs text-gray-400">Opus Hi-Fi Audio</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white sm:text-2xl">&lt;60<span className="text-sm font-normal text-gray-400">ms</span></p>
              <p className="text-xs text-gray-400">P2P Latency</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white sm:text-2xl">0<span className="text-sm font-normal text-gray-400">env</span></p>
              <p className="text-xs text-gray-400">Serverless Vercel</p>
            </div>
          </div>
        </motion.div>

        {/* Right Form Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md"
        >
          <CreateJoinRoom
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
          />
        </motion.div>
      </div>

      {/* Feature Highlights Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-jam-card/40 backdrop-blur-md px-6 py-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white/5 p-2 text-jam-blue">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">System/Tab Audio</h3>
              <p className="text-xs text-gray-400">Raw capture with video track auto-stripping for pure audio.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white/5 p-2 text-jam-cyan">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">DSP Drift Sync</h3>
              <p className="text-xs text-gray-400">Manual latency slider &amp; 3-band studio EQ for perfect multi-speaker sync.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white/5 p-2 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Aux Permission Queue</h3>
              <p className="text-xs text-gray-400">Admin-controlled DJ approvals, room locks, and role management.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white/5 p-2 text-amber-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">60fps Visualizer</h3>
              <p className="text-xs text-gray-400">Real-time spectrum bars &amp; oscilloscope waveform engine.</p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

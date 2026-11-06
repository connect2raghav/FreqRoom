'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Users, Sparkles, ArrowRight } from 'lucide-react';
import { formatRoomCode, parseRoomCode } from '@/lib/utils';

interface CreateJoinRoomProps {
  onCreateRoom: (displayName: string) => void;
  onJoinRoom: (roomCode: string, displayName: string) => void;
  initialCode?: string;
}

export const CreateJoinRoom: React.FC<CreateJoinRoomProps> = ({
  onCreateRoom,
  onJoinRoom,
  initialCode = '',
}) => {
  const [tab, setTab] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Please enter a display name');
      return;
    }
    setError(null);
    onCreateRoom(trimmed);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const parsed = parseRoomCode(roomCode);

    if (!trimmedName) {
      setError('Please enter a display name');
      return;
    }
    if (parsed.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }
    setError(null);
    onJoinRoom(parsed, trimmedName);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomCode(raw);
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-jam-card/80 p-8 shadow-2xl backdrop-blur-xl">
      {/* Tab Switcher */}
      <div className="relative mb-6 flex rounded-xl border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => {
            setTab('create');
            setError(null);
          }}
          className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            tab === 'create' ? 'text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          {tab === 'create' && (
            <motion.div
              layoutId="tab-pill"
              className="absolute inset-0 rounded-lg bg-gradient-to-r from-jam-blue to-blue-600 shadow-lg shadow-jam-blue/30"
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Create Room
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab('join');
            setError(null);
          }}
          className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            tab === 'join' ? 'text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          {tab === 'join' && (
            <motion.div
              layoutId="tab-pill"
              className="absolute inset-0 rounded-lg bg-gradient-to-r from-jam-cyan to-teal-500 shadow-lg shadow-jam-cyan/30"
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Join Room
          </span>
        </button>
      </div>

      {/* Forms */}
      <AnimatePresence mode="wait">
        {tab === 'create' ? (
          <motion.form
            key="create-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            onSubmit={handleCreate}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Your Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. DJ Spark"
                maxLength={24}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-jam-blue focus:ring-2 focus:ring-jam-blue/20"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-rose-400">{error}</p>
            )}

            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-jam-blue via-blue-500 to-jam-cyan py-3.5 text-sm font-semibold text-white shadow-lg shadow-jam-blue/25 transition hover:shadow-jam-blue/40 hover:brightness-110"
            >
              <Sparkles className="h-4 w-4 transition group-hover:rotate-12" />
              Launch Studio Room
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>

            <p className="text-center text-xs text-gray-500">
              You will be assigned the <span className="font-semibold text-jam-blue">Room Admin</span> role.
            </p>
          </motion.form>
        ) : (
          <motion.form
            key="join-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            onSubmit={handleJoin}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                6-Character Room Code
              </label>
              <input
                type="text"
                value={formatRoomCode(roomCode)}
                onChange={handleCodeChange}
                placeholder="JAM-84X"
                maxLength={7}
                className="mt-1.5 w-full font-mono text-center text-lg uppercase tracking-widest rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-600 outline-none transition focus:border-jam-cyan focus:ring-2 focus:ring-jam-cyan/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Your Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Audiophile"
                maxLength={24}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-jam-cyan focus:ring-2 focus:ring-jam-cyan/20"
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-rose-400">{error}</p>
            )}

            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-jam-cyan via-teal-500 to-jam-blue py-3.5 text-sm font-semibold text-white shadow-lg shadow-jam-cyan/25 transition hover:shadow-jam-cyan/40 hover:brightness-110"
            >
              <Users className="h-4 w-4" />
              Tune In to Jam
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>

            <p className="text-center text-xs text-gray-500">
              Join as a <span className="font-semibold text-jam-cyan">Listener</span>. You can request the aux anytime.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};


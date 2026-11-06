'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SendHorizonal } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  myPeerId: string;
}

const NAME_COLORS = [
  'text-pink-400',
  'text-purple-400',
  'text-indigo-400',
  'text-sky-400',
  'text-teal-400',
  'text-emerald-400',
  'text-amber-400',
  'text-orange-400',
  'text-rose-400',
  'text-lime-400',
];

function getNameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function ChatPanel({ messages, onSend, myPeerId }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10 min-h-0"
      >
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => {
            const isMe = msg.from === myPeerId;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl ${
                    isMe
                      ? 'bg-jam-blue/25 border border-jam-blue/20 rounded-br-md'
                      : 'bg-white/[0.05] border border-white/5 rounded-bl-md'
                  }`}
                >
                  {!isMe && (
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold ${getNameColor(msg.displayName)}`}>
                        {msg.displayName}
                      </span>
                      <span className="text-[10px] text-white/20">{formatTime(msg.timestamp)}</span>
                    </div>
                  )}
                  {isMe && (
                    <div className="flex items-center gap-2 mb-0.5 justify-end">
                      <span className="text-[10px] text-white/20">{formatTime(msg.timestamp)}</span>
                    </div>
                  )}
                  <p className="text-sm text-white/80 break-words">{msg.message}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-white/15 text-sm">
            No messages yet
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something..."
          maxLength={200}
          className="flex-1 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder-white/25 outline-none focus:border-jam-blue/40 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-2 rounded-xl bg-jam-blue/20 hover:bg-jam-blue/30 text-jam-blue disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <SendHorizonal className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

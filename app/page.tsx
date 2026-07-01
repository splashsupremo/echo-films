'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bebas_Neue, Source_Serif_4, IBM_Plex_Mono } from 'next/font/google';
import { MODULES, TRAINING_ID, USER, TOTAL_MODULES } from './lib/config';

// ---------------------------------------------------------------------------
// Type — a condensed display face for titles/leader numerals, a warm serif
// for the training prose itself (feels like a script page, not a SaaS card),
// and a mono utility face for timecodes, IDs, and controls.
// ---------------------------------------------------------------------------
const display = Bebas_Neue({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const body = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' });

interface Progress {
  currentModule: number;
  currentSection: number;
  lastUnlockedAt: number | null;
  completed: boolean;
}

interface ActivityLogEntry {
  id: string;
  type: 'auth' | 'section' | 'module_completed' | 'training_completed';
  message: string;
  timestamp: number;
}

const STORAGE_KEY = 'echo_progress';
const LOG_KEY = 'echo_activity_log';

// ---------------------------------------------------------------------------
// Token system (CSS variables set once on the root wrapper)
// ink     #0E0D0C  base background — raw film black
// paper   #EDE6D8  primary text — leader/paper white
// panel   #1C1A17  card surfaces
// rule    #3A342C  borders, dividers, unlit states
// ember   #FF5A1F  primary accent — countdown-leader orange
// amber   #C98A3D  secondary accent — in-progress state
// tally   #C22525  alerts / locked / recording dot
// ---------------------------------------------------------------------------
const tokens: React.CSSProperties = {
  '--ink': '#0E0D0C',
  '--paper': '#EDE6D8',
  '--panel': '#1C1A17',
  '--panel2': '#221F1B',
  '--rule': '#3A342C',
  '--ember': '#FF5A1F',
  '--amber': '#C98A3D',
  '--tally': '#C22525',
} as React.CSSProperties;

// ---------------------------------------------------------------------------
// Sprocket strip — the perforated film edge, framing the whole viewport.
// Pure CSS (no loops): a repeating radial-gradient punches holes out of a
// rule-colored strip.
// ---------------------------------------------------------------------------
function Sprockets({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      className={`fixed left-0 right-0 h-6 z-40 ${position === 'top' ? 'top-0' : 'bottom-0'}`}
      style={{
        backgroundColor: 'var(--rule)',
        backgroundImage:
          'radial-gradient(circle at 14px 12px, var(--ink) 5px, transparent 5.5px)',
        backgroundSize: '28px 24px',
        backgroundRepeat: 'repeat-x',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Film reel — the signature element. A radial progress ring standing in for
// a canister of wound film: empty rim (locked), partially wound (active,
// amber), fully wound with a struck hub (done, ember).
// ---------------------------------------------------------------------------
function FilmReel({
  percent,
  state,
  size = 56,
}: {
  percent: number;
  state: 'locked' | 'active' | 'done';
  size?: number;
}) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  const ringColor = state === 'done' ? 'var(--ember)' : state === 'active' ? 'var(--amber)' : 'var(--rule)';
  const hubFill = state === 'done' ? 'var(--ember)' : state === 'active' ? 'var(--ink)' : 'var(--panel)';

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--rule)" strokeWidth="2.5" opacity={0.5} />
      {[0, 72, 144, 216, 288].map((deg) => (
        <line
          key={deg}
          x1="24"
          y1="24"
          x2={24 + r * 0.86 * Math.cos((deg * Math.PI) / 180)}
          y2={24 + r * 0.86 * Math.sin((deg * Math.PI) / 180)}
          stroke="var(--rule)"
          strokeWidth="1.5"
          opacity={0.4}
        />
      ))}
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={ringColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 24 24)"
      />
      <circle cx="24" cy="24" r="7" fill={hubFill} stroke="var(--rule)" strokeWidth="1.5" />
      {state === 'done' && (
        <path d="M20.5 24l2.3 2.6 5-5.8" stroke="var(--ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Filmstrip progress — ten frames in a row, because ten sections is a real
// sequence a person is moving through, frame by frame.
// ---------------------------------------------------------------------------
function FilmStripProgress({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`Section ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < current;
        const isCurrent = i === current;
        return (
          <div
            key={i}
            className="h-6 w-4 rounded-[2px] border transition-colors duration-300"
            style={{
              borderColor: isCurrent ? 'var(--ember)' : filled ? 'var(--amber)' : 'var(--rule)',
              backgroundColor: filled ? 'var(--amber)' : isCurrent ? 'var(--panel2)' : 'transparent',
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity log — a script supervisor's log sheet. Every auth, section
// advance, module wrap, and training completion is timestamped here.
// ---------------------------------------------------------------------------
const LOG_DOT: Record<ActivityLogEntry['type'], string> = {
  auth: 'var(--rule)',
  section: 'var(--amber)',
  module_completed: 'var(--ember)',
  training_completed: 'var(--ember)',
};

function formatTimestamp(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ActivityLogPanel({
  log,
  loading,
  syncError,
  onClose,
}: {
  log: ActivityLogEntry[];
  loading: boolean;
  syncError: string;
  onClose: () => void;
}) {
  const sorted = [...log].sort((a, b) => b.timestamp - a.timestamp);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(14,13,12,0.7)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 24, opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md p-8 overflow-y-auto"
        style={{ backgroundColor: 'var(--panel)', borderLeft: '1px solid var(--rule)' }}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
              Script Supervisor&rsquo;s Log
            </p>
            <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display)' }}>Activity Log</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close activity log"
            className="text-lg leading-none px-2 py-1 rounded-sm"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--paper)', opacity: 0.6, border: '1px solid var(--rule)' }}
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: loading ? 'var(--amber)' : syncError ? 'var(--tally)' : 'var(--ember)' }}
            aria-hidden
          />
          <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--paper)', opacity: 0.6 }}>
            {loading ? 'Syncing with GitHub…' : syncError || 'Synced from GitHub'}
          </p>
        </div>

        {sorted.length === 0 && !loading ? (
          <p className="text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--paper)', opacity: 0.5 }}>
            No activity recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {sorted.map((entry) => (
              <li key={entry.id} className="flex gap-3 pb-4" style={{ borderBottom: '1px solid var(--rule)' }}>
                <span
                  className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: LOG_DOT[entry.type] }}
                  aria-hidden
                />
                <div>
                  <p className="text-sm leading-snug" style={{ fontFamily: 'var(--font-body)', color: 'var(--paper)' }}>
                    {entry.message}
                  </p>
                  <p className="text-xs mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--paper)', opacity: 0.45 }}>
                    {formatTimestamp(entry.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}

function ClapperIcon() {
  return (
    <svg width="88" height="88" viewBox="0 0 64 64" aria-hidden>
      <rect x="8" y="24" width="48" height="32" rx="2" fill="var(--panel)" stroke="var(--rule)" strokeWidth="2" />
      <path d="M8 24l4-10h44l-4 10z" fill="var(--ember)" />
      <path d="M14 24l4-10M22 24l4-10M30 24l4-10M38 24l4-10M46 24l4-10" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="32" cy="40" r="9" fill="none" stroke="var(--rule)" strokeWidth="2" />
      <circle cx="32" cy="40" r="3" fill="var(--ember)" />
    </svg>
  );
}

export default function EchoFilms() {
  const [page, setPage] = useState<'landing' | 'auth' | 'welcome' | 'module' | 'completed'>('landing');
  const [trainingIdInput, setTrainingIdInput] = useState('');
  const [progress, setProgress] = useState<Progress>({ currentModule: 0, currentSection: 0, lastUnlockedAt: null, completed: false });
  const [timeLeft, setTimeLeft] = useState('');
  const [alertMsg, setAlertMsg] = useState('');
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logSyncError, setLogSyncError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      setProgress(data);
      if (data.completed) setPage('completed');
    }
    // Local cache first (instant, works offline) — GitHub is the source of
    // truth and gets pulled in whenever the log panel is opened.
    const savedLog = localStorage.getItem(LOG_KEY);
    if (savedLog) setActivityLog(JSON.parse(savedLog));
  }, []);

  const saveProgress = (newData: Partial<Progress>) => {
    const updated = { ...progress, ...newData };
    setProgress(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addLogEntry = (type: ActivityLogEntry['type'], message: string) => {
    const entry: ActivityLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message,
      timestamp: Date.now(),
    };

    // Optimistic local update — instant, survives if the network call fails.
    setActivityLog((prev) => {
      const updated = [...prev, entry];
      localStorage.setItem(LOG_KEY, JSON.stringify(updated));
      return updated;
    });

    // Fire-and-forget push to GitHub via the server route (token stays server-side).
    fetch('/api/activity-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.entries) {
          setActivityLog(data.entries);
          localStorage.setItem(LOG_KEY, JSON.stringify(data.entries));
        }
      })
      .catch(() => {
        // Offline or GitHub unreachable — the local copy above still holds,
        // it just hasn't synced to the repo yet.
      });
  };

  const openActivityLog = () => {
    setShowLog(true);
    setLogLoading(true);
    setLogSyncError('');
    fetch('/api/activity-log')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setActivityLog(data.entries);
        localStorage.setItem(LOG_KEY, JSON.stringify(data.entries));
      })
      .catch(() => {
        setLogSyncError('Could not reach GitHub — showing the last synced copy.');
      })
      .finally(() => setLogLoading(false));
  };

  useEffect(() => {
    if (page !== 'welcome' || !progress.lastUnlockedAt) return;
    const interval = setInterval(() => {
      const remaining = progress.lastUnlockedAt! + 86400000 - Date.now();
      if (remaining <= 0) return setTimeLeft('');
      const h = Math.floor(remaining / 3600000).toString().padStart(2, '0');
      const m = Math.floor((remaining % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      setTimeLeft(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [progress.lastUnlockedAt, page]);

  const currentModuleData = MODULES[progress.currentModule];
  const currentContent = currentModuleData?.sections[progress.currentSection];

  return (
    <div
      style={tokens}
      className={`${display.variable} ${body.variable} ${mono.variable} min-h-screen`}
    >
      <div className="min-h-screen" style={{ backgroundColor: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-body)' }}>
        <Sprockets position="top" />
        <Sprockets position="bottom" />

        <AnimatePresence mode="wait">
          {page === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="min-h-screen flex items-center justify-center px-6"
            >
              <div className="text-center max-w-2xl">
                <p
                  className="text-sm tracking-[0.35em] uppercase mb-6"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}
                >
                  Production Management Academy
                </p>
                <h1
                  className="text-[6.5rem] leading-[0.85] tracking-tight mb-10"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--paper)' }}
                >
                  ECHO&nbsp;FILMS
                </h1>
                <div className="flex justify-center mb-10" aria-hidden>
                  <div className="h-px w-24" style={{ backgroundColor: 'var(--rule)' }} />
                </div>
                <button
                  onClick={() => setPage('auth')}
                  className="px-14 py-5 text-lg tracking-wide uppercase rounded-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2"
                  style={{
                    backgroundColor: 'var(--ember)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--amber)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--ember)')}
                >
                  Enter the Academy ▸
                </button>
              </div>
            </motion.div>
          )}

          {page === 'auth' && (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="min-h-screen flex items-center justify-center p-6"
            >
              <div
                className="w-full max-w-md rounded-md p-10"
                style={{ backgroundColor: 'var(--panel)', border: '1px solid var(--rule)' }}
              >
                <p className="text-xs tracking-[0.3em] uppercase mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                  Scene 01 · Take 01
                </p>
                <h2 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                  Training Access
                </h2>
                <p className="text-sm mb-8" style={{ color: 'var(--paper)', opacity: 0.65 }}>
                  Enter your Training ID to begin.
                </p>

                <label htmlFor="training-id" className="sr-only">Training ID</label>
                <input
                  id="training-id"
                  type="text"
                  value={trainingIdInput}
                  onChange={(e) => setTrainingIdInput(e.target.value)}
                  placeholder="ECHO201126"
                  className="w-full px-5 py-4 rounded-sm text-lg mb-6 outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--ink)',
                    border: '1px solid var(--rule)',
                    color: 'var(--paper)',
                    fontFamily: 'var(--font-mono)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--ember)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
                />
                <button
                  onClick={() => {
                    if (trainingIdInput === TRAINING_ID) {
                      addLogEntry('auth', `${USER.name} signed in`);
                      setPage('welcome');
                    } else {
                      setAlertMsg('Invalid Training ID');
                    }
                  }}
                  className="w-full py-4 rounded-sm text-base tracking-wide uppercase transition-colors"
                  style={{ backgroundColor: 'var(--ember)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--amber)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--ember)')}
                >
                  Verify &amp; Enter
                </button>
              </div>
            </motion.div>
          )}

          {page === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="min-h-screen p-8 md:p-16"
            >
              <div className="max-w-5xl mx-auto">
                <div className="flex items-start justify-between gap-6 mb-2">
                  <div>
                    <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                      Reel Rack
                    </p>
                    <h1 className="text-4xl md:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>
                      Welcome, {USER.name}
                    </h1>
                  </div>
                  <button
                    onClick={openActivityLog}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-sm text-xs tracking-wide uppercase flex-shrink-0"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--paper)', border: '1px solid var(--rule)' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--ember)' }} aria-hidden />
                    Activity Log
                  </button>
                </div>
                <p className="mb-14" style={{ color: 'var(--paper)', opacity: 0.65 }}>
                  Choose a reel to continue your training.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {MODULES.map((mod, index) => {
                    const state: 'locked' | 'active' | 'done' =
                      index < progress.currentModule ? 'done' : index === progress.currentModule ? 'active' : 'locked';
                    const percent =
                      state === 'done' ? 100 : state === 'active' ? (progress.currentSection / 10) * 100 : 0;

                    return (
                      <motion.div
                        key={index}
                        whileHover={state !== 'locked' ? { y: -4 } : undefined}
                        transition={{ duration: 0.2 }}
                        className="rounded-md p-7 flex flex-col h-full"
                        style={{
                          backgroundColor: 'var(--panel)',
                          border: `1px solid ${state === 'active' ? 'var(--ember)' : 'var(--rule)'}`,
                        }}
                      >
                        <div className="flex items-start justify-between mb-6">
                          <div>
                            <p className="text-xs tracking-[0.25em] uppercase mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)', opacity: state === 'locked' ? 0.4 : 1 }}>
                              Reel {String(index + 1).padStart(2, '0')}
                            </p>
                          </div>
                          <FilmReel percent={percent} state={state} />
                        </div>

                        <h3
                          className="text-lg leading-snug flex-1 mb-6"
                          style={{ opacity: state === 'locked' ? 0.45 : 1, fontFamily: 'var(--font-body)', fontWeight: 600 }}
                        >
                          {mod.title}
                        </h3>

                        {state === 'active' && (
                          <button
                            onClick={() => { if (!timeLeft) setPage('module'); }}
                            disabled={!!timeLeft}
                            aria-disabled={!!timeLeft}
                            className="mt-auto w-full py-3.5 rounded-sm text-sm tracking-wide uppercase transition-colors disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: timeLeft ? 'var(--panel2)' : 'var(--ember)',
                              color: timeLeft ? 'var(--rule)' : 'var(--ink)',
                              border: timeLeft ? '1px solid var(--rule)' : 'none',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                            }}
                            onMouseEnter={(e) => { if (!timeLeft) e.currentTarget.style.backgroundColor = 'var(--amber)'; }}
                            onMouseLeave={(e) => { if (!timeLeft) e.currentTarget.style.backgroundColor = 'var(--ember)'; }}
                          >
                            {timeLeft ? `Locked · ${timeLeft}` : 'Continue Reel'}
                          </button>
                        )}
                        {state === 'locked' && (
                          <p className="text-xs uppercase tracking-wide" style={{ fontFamily: 'var(--font-mono)', color: 'var(--rule)' }}>
                            Locked
                          </p>
                        )}
                        {state === 'done' && (
                          <p className="text-xs uppercase tracking-wide" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ember)' }}>
                            Wrapped
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {page === 'module' && currentModuleData && (
            <motion.div
              key="module"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="min-h-screen p-8 md:p-16"
            >
              <div className="max-w-3xl mx-auto">
                <button
                  onClick={() => setPage('welcome')}
                  className="mb-10 flex items-center gap-2 text-sm transition-opacity hover:opacity-100"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--paper)', opacity: 0.6 }}
                >
                  ← Back to Reel Rack
                </button>

                <div className="flex items-center justify-between mb-6">
                  <p className="text-xs tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                    Reel {String(progress.currentModule + 1).padStart(2, '0')} · Section {String(progress.currentSection + 1).padStart(2, '0')} / 10
                  </p>
                </div>

                <FilmStripProgress total={10} current={progress.currentSection} />

                <div className="rounded-md p-10 md:p-14 mt-8" style={{ backgroundColor: 'var(--panel)', border: '1px solid var(--rule)' }}>
                  <h2 className="text-2xl mb-8" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.01em' }}>
                    {currentModuleData.title}
                  </h2>
                  <div
                    className="max-w-none text-[1.05rem] leading-[1.8]"
                    style={{ fontFamily: 'var(--font-body)', color: 'var(--paper)', opacity: 0.92 }}
                  >
                    {currentContent}
                  </div>
                </div>

                <div className="flex justify-end mt-10">
                  <button
                    onClick={() => {
                      if (progress.currentSection < 9) {
                        addLogEntry(
                          'section',
                          `Reel ${String(progress.currentModule + 1).padStart(2, '0')} — Section ${String(progress.currentSection + 1).padStart(2, '0')}/10 completed`
                        );
                        saveProgress({ currentSection: progress.currentSection + 1 });
                      } else if (progress.currentModule + 1 < TOTAL_MODULES) {
                        addLogEntry(
                          'module_completed',
                          `Reel ${String(progress.currentModule + 1).padStart(2, '0')} completed — "${currentModuleData.title}"`
                        );
                        saveProgress({ currentModule: progress.currentModule + 1, currentSection: 0, lastUnlockedAt: Date.now() });
                        setAlertMsg('Reel Wrapped');
                        setTimeout(() => { setAlertMsg(''); setPage('welcome'); }, 1500);
                      } else {
                        addLogEntry(
                          'module_completed',
                          `Reel ${String(progress.currentModule + 1).padStart(2, '0')} completed — "${currentModuleData.title}"`
                        );
                        addLogEntry('training_completed', `${USER.name} completed the full training`);
                        saveProgress({ completed: true });
                        setPage('completed');
                      }
                    }}
                    className="px-12 py-4 rounded-sm text-sm tracking-wide uppercase transition-colors"
                    style={{ backgroundColor: 'var(--ember)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--amber)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--ember)')}
                  >
                    {progress.currentSection === 9 ? 'Complete Reel' : 'Next Section →'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {page === 'completed' && (
            <motion.div
              key="completed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="min-h-screen flex items-center justify-center text-center p-8"
            >
              <div>
                <div className="flex justify-center mb-8">
                  <ClapperIcon />
                </div>
                <p className="text-xs tracking-[0.35em] uppercase mb-4" style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                  Cut.
                </p>
                <h1 className="text-5xl md:text-6xl mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                  That&rsquo;s a Wrap
                </h1>
                <p style={{ color: 'var(--paper)', opacity: 0.65, fontFamily: 'var(--font-body)' }}>
                  Training completed, {USER.name}.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showLog && (
            <ActivityLogPanel
              log={activityLog}
              loading={logLoading}
              syncError={logSyncError}
              onClose={() => setShowLog(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {alertMsg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3.5 rounded-sm"
              style={{ backgroundColor: 'var(--panel)', border: '1px solid var(--tally)' }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: 'var(--tally)' }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--paper)', fontSize: '0.85rem', letterSpacing: '0.02em' }}>
                {alertMsg}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
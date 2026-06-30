// app/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODULES, TRAINING_ID, USER, TOTAL_MODULES } from './lib/config';

interface Progress {
  currentModule: number;
  currentSection: number;
  lastUnlockedAt: number | null;
  completed: boolean;
}

const STORAGE_KEY = 'echo_progress';

export default function EchoFilms() {
  const [page, setPage] = useState<'landing' | 'auth' | 'welcome' | 'module' | 'completed'>('landing');
  const [trainingIdInput, setTrainingIdInput] = useState('');
  const [progress, setProgress] = useState<Progress>({
    currentModule: 0,
    currentSection: 0,
    lastUnlockedAt: null,
    completed: false,
  });
  const [timeLeft, setTimeLeft] = useState('');
  const [showAlert, setShowAlert] = useState('');

  // Load progress from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: Progress = JSON.parse(saved);
      setProgress(parsed);
      
      if (parsed.completed) {
        setPage('completed');
      } else if (parsed.lastUnlockedAt) {
        checkLockStatus(parsed);
      } else {
        setPage('welcome');
      }
    } else {
      setPage('landing');
    }
  }, []);

  const saveProgress = (newProgress: Partial<Progress>) => {
    const updated = { ...progress, ...newProgress };
    setProgress(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const checkLockStatus = (prog: Progress) => {
    if (!prog.lastUnlockedAt) {
      setPage('welcome');
      return;
    }
    
    const now = Date.now();
    const hoursPassed = (now - prog.lastUnlockedAt) / (1000 * 60 * 60);
    
    if (hoursPassed >= 24) {
      setPage('module');
    } else {
      setPage('welcome');
      startCountdown(prog.lastUnlockedAt);
    }
  };

  const startCountdown = (unlockTime: number) => {
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = unlockTime + 24 * 60 * 60 * 1000 - now;
      
      if (remaining <= 0) {
        clearInterval(interval);
        setTimeLeft('');
        setPage('module');
        return;
      }
      
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      
      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
    
    return () => clearInterval(interval);
  };

  const handleAuth = () => {
    if (trainingIdInput.trim() === TRAINING_ID) {
      setPage('welcome');
    } else {
      setShowAlert('Access Denied. Invalid Training ID');
      setTimeout(() => setShowAlert(''), 3000);
    }
  };

  const startTraining = () => {
    if (!progress.lastUnlockedAt) {
      saveProgress({ lastUnlockedAt: Date.now() });
    }
    setPage('module');
  };

  const nextSection = () => {
    const modIndex = progress.currentModule;
    const secIndex = progress.currentSection;

    if (secIndex < 9) {
      saveProgress({ currentSection: secIndex + 1 });
    } else {
      // Complete module
      const newModule = modIndex + 1;
      
      if (newModule >= TOTAL_MODULES) {
        saveProgress({ completed: true });
        setPage('completed');
      } else {
        saveProgress({
          currentModule: newModule,
          currentSection: 0,
          lastUnlockedAt: Date.now(),
        });
        setShowAlert('Module Complete! Next module unlocks in 24 hours.');
        setTimeout(() => {
          setShowAlert('');
          setPage('welcome');
        }, 2000);
      }
    }
  };

  const currentModuleData = MODULES[progress.currentModule];
  const currentSectionContent = currentModuleData?.sections[progress.currentSection];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Background Elements */}
      <div className="fixed inset-0 bg-[radial-gradient(at_50%_30%,rgba(185,28,28,0.15),transparent_70%)]" />
      
      <AnimatePresence mode="wait">
        {/* LANDING PAGE */}
        {page === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center p-6 relative"
          >
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.6, 0.9, 0.6],
              }}
              transition={{ duration: 8, repeat: Infinity }}
              className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-transparent to-transparent"
            />
            
            <div className="text-center z-10 max-w-2xl">
              <motion.h1 
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-7xl md:text-8xl font-bold tracking-tighter mb-6"
              >
                ECHO<span className="text-red-600">.</span>
              </motion.h1>
              <p className="text-3xl md:text-4xl text-zinc-400 mb-4">FILMS</p>
              <p className="text-xl text-zinc-500 mb-12">Management Training Center</p>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPage('auth')}
                className="px-16 py-6 bg-red-600 hover:bg-red-700 transition-colors text-xl font-medium rounded-xl tracking-wide"
              >
                ENTER TRAINING ROOM
              </motion.button>
            </div>
            
            <div className="absolute bottom-12 text-zinc-600 text-sm">Premium • Cinematic • Professional</div>
          </motion.div>
        )}

        {/* AUTH PAGE */}
        {page === 'auth' && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <div className="w-full max-w-md">
              <div className="text-center mb-12">
                <div className="text-red-600 text-6xl mb-4">🔒</div>
                <h2 className="text-4xl font-semibold mb-3">Training Access</h2>
                <p className="text-zinc-400">Enter your assigned Training ID</p>
              </div>
              
              <div className="space-y-6">
                <input
                  type="text"
                  value={trainingIdInput}
                  onChange={(e) => setTrainingIdInput(e.target.value)}
                  placeholder="ECHO201126"
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-red-600 rounded-2xl px-8 py-6 text-xl outline-none transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                />
                
                <button
                  onClick={handleAuth}
                  className="w-full bg-red-600 hover:bg-red-700 py-6 rounded-2xl text-xl font-medium transition-colors"
                >
                  CONTINUE
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* WELCOME / DASHBOARD */}
        {page === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen p-8 flex flex-col"
          >
            <div className="max-w-3xl mx-auto flex-1 flex flex-col justify-center">
              <div className="mb-16">
                <div className="text-red-600 text-sm tracking-[4px] mb-2">WELCOME BACK</div>
                <h1 className="text-5xl font-bold">Hello, {USER.name}</h1>
                <p className="text-zinc-400 mt-2">{USER.email}</p>
              </div>

              <div className="bg-zinc-900/70 border border-zinc-800 rounded-3xl p-10 mb-12">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <div className="uppercase text-xs tracking-widest text-zinc-500">PROGRESS</div>
                    <div className="text-6xl font-mono mt-3">
                      {progress.currentModule + 1} <span className="text-3xl text-zinc-500">/ 5</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 text-sm">MODULE {progress.currentModule + 1}</div>
                  </div>
                </div>

                {timeLeft && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-8">
                    <div className="text-sm text-zinc-400 mb-1">NEXT MODULE UNLOCKS IN</div>
                    <div className="font-mono text-5xl text-red-500 tabular-nums">{timeLeft}</div>
                  </div>
                )}

                <p className="text-zinc-400 leading-relaxed text-lg">
                  Complete all 10 sections in each module. Each module takes approximately 25 minutes.<br />
                  A new module unlocks 24 hours after completing the previous one.
                </p>
              </div>

              <button
                onClick={startTraining}
                disabled={!!timeLeft}
                className="w-full py-8 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-3xl text-2xl font-medium transition-all disabled:cursor-not-allowed"
              >
                {timeLeft ? "MODULE LOCKED" : "BEGIN MODULE " + (progress.currentModule + 1)}
              </button>
            </div>
          </motion.div>
        )}

        {/* MODULE PAGE */}
        {page === 'module' && currentModuleData && (
          <motion.div
            key="module"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen p-6 md:p-12 flex flex-col"
          >
            <div className="max-w-4xl mx-auto w-full">
              {/* Progress Header */}
              <div className="flex items-center justify-between mb-12 sticky top-6 z-50 bg-zinc-950/80 backdrop-blur-lg py-4">
                <button 
                  onClick={() => setPage('welcome')}
                  className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors"
                >
                  ← BACK
                </button>
                
                <div className="text-center">
                  <div className="text-xs tracking-[3px] text-red-600">MODULE {progress.currentModule + 1}</div>
                  <div className="text-2xl font-semibold">{currentModuleData.title}</div>
                </div>
                
                <div className="font-mono text-sm text-zinc-500">
                  {progress.currentSection + 1} / 10
                </div>
              </div>

              {/* Content */}
              <motion.div
                key={progress.currentSection}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="prose prose-zinc prose-invert max-w-none bg-zinc-900 border border-zinc-800 rounded-3xl p-12 md:p-16 leading-relaxed text-lg"
              >
                <h3 className="text-red-500 text-2xl mb-10 font-medium">
                  Section {progress.currentSection + 1}: {currentModuleData.title.split(': ')[1] || ''}
                </h3>
                <div className="whitespace-pre-line text-zinc-300">
                  {currentSectionContent}
                </div>
              </motion.div>

              {/* Next Button */}
              <div className="mt-12 flex justify-end">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={nextSection}
                  className="px-20 py-7 bg-red-600 hover:bg-red-700 rounded-2xl text-xl font-medium flex items-center gap-4 group"
                >
                  {progress.currentSection < 9 ? 'NEXT SECTION' : 'COMPLETE MODULE'}
                  <span className="group-hover:translate-x-1 transition">→</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* COMPLETED PAGE */}
        {page === 'completed' && (
          <motion.div
            key="completed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <div className="text-center max-w-lg">
              <div className="text-8xl mb-8">✅</div>
              <h1 className="text-6xl font-bold mb-6">Training Completed</h1>
              <p className="text-2xl text-zinc-400 mb-16">
                You have successfully finished all 5 modules of the Echo Films Production Management Training Program.
              </p>
              <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-10 text-left text-zinc-300">
                Further instructions and next steps will be communicated by HR.<br /><br />
                Thank you for your dedication to excellence in film production management.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Alert */}
      <AnimatePresence>
        {showAlert && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 border border-red-600 text-red-400 px-10 py-5 rounded-2xl shadow-2xl z-50"
          >
            {showAlert}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
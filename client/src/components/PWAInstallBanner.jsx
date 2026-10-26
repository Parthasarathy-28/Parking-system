// PWAInstallBanner.jsx — Install prompt for Android/Desktop & iOS Add to Home Screen instructions
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share, PlusSquare, X, Smartphone, Check } from 'lucide-react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if app is already running as installed PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsStandalone(standalone);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Capture Android/Chrome beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Do not show if already installed in standalone mode or dismissed
  if (isStandalone || dismissed) return null;

  // Only show if we actually have an install prompt OR it's iOS Safari
  const canInstallNative = Boolean(deferredPrompt);
  const canInstallIOS = isIOS && !isStandalone;

  if (!canInstallNative && !canInstallIOS) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {/* Sleek bottom install banner */}
      <AnimatePresence>
        <motion.aside
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          aria-label="Install ParkPulse app banner"
          className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-3.5 shadow-2xl border border-slate-700/60 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/20">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Install ParkPulse</p>
              <p className="text-xs text-slate-300 truncate">Fast 1-tap parking access & offline map</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleInstallClick}
              className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/30"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
              className="text-slate-400 hover:text-white p-1.5 rounded-lg active:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.aside>
      </AnimatePresence>

      {/* iOS Add to Home Screen Modal Instructions */}
      <AnimatePresence>
        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-surface-200"
            >
              <div className="flex items-center justify-between pb-3 border-b border-surface-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-black text-sm">
                    P
                  </div>
                  <h3 className="font-bold text-slate-900">Install on iPhone</h3>
                </div>
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0 text-xs mt-0.5">
                    1
                  </div>
                  <p>
                    Tap the <strong className="text-slate-900 inline-flex items-center gap-1"><Share className="w-3.5 h-3.5 text-blue-500" /> Share button</strong> in the Safari toolbar at the bottom.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0 text-xs mt-0.5">
                    2
                  </div>
                  <p>
                    Scroll down and tap <strong className="text-slate-900 inline-flex items-center gap-1"><PlusSquare className="w-3.5 h-3.5 text-slate-700" /> Add to Home Screen</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0 text-xs mt-0.5">
                    3
                  </div>
                  <p>
                    Tap <strong className="text-slate-900">Add</strong> in the top right corner. ParkPulse is now installed on your home screen!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full mt-6 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold py-3 rounded-2xl transition-all"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

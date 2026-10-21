import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already installed in standalone mode, hide button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      await install();
    } finally {
      setIsInstalling(false);
    }
  };

  // Chromium / Android flow
  if (isInstallable) {
    if (compact) {
      return (
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          title="Install Aplikasi Driver"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isInstalling ? 'Memasang...' : 'Pasang App'}</span>
        </button>
      );
    }

    return (
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-xs flex-shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold">Pasang TumpangGo Driver</span>
            <span className="text-[11px] text-emerald-100">Buka langsung dari layar utama HP Android Anda.</span>
          </div>
        </div>
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          className="flex-shrink-0 px-3.5 py-2 rounded-xl bg-white text-emerald-800 text-xs font-bold hover:bg-emerald-50 active:scale-95 shadow-sm transition-all flex items-center gap-1.5"
        >
          <Download className="w-4 h-4 text-emerald-700" />
          <span>{isInstalling ? 'Memasang...' : 'Install'}</span>
        </button>
      </div>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        {compact ? (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-50 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install iOS</span>
          </button>
        ) : (
          <div className="bg-slate-100 border border-slate-200 text-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-4 h-4 text-slate-600 flex-shrink-0" />
              <span className="text-xs font-medium">Bisa diinstall di iPhone / iPad</span>
            </div>
            <button
              onClick={() => setShowIOSGuide(true)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs"
            >
              Petunjuk
            </button>
          </div>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
              <button 
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                Pasang di iPhone / iPad
              </h3>
              <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                1. Ketuk ikon <strong>Share</strong> (kotak panah ke atas) di bar bawah browser Safari.<br />
                2. Geser ke bawah dan pilih <strong>Add to Home Screen</strong> (Tambah ke Layar Utama).<br />
                3. Ketuk <strong>Add</strong> di pojok kanan atas.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

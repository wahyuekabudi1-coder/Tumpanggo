import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X, Store, Bike, Sparkles, CheckCircle2 } from 'lucide-react';

interface PWAInstallButtonProps {
  role?: 'CUSTOMER' | 'MERCHANT' | 'DRIVER';
  compact?: boolean;
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  role = 'CUSTOMER', 
  compact = false,
  className = ''
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Dynamically update the manifest link to match the active role
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }

    const targetHref = role === 'MERCHANT'
      ? '/manifest-merchant.json'
      : role === 'DRIVER'
        ? '/manifest-driver.json'
        : '/manifest.json';

    if (manifestLink.getAttribute('href') !== targetHref) {
      manifestLink.setAttribute('href', targetHref);
    }
  }, [role]);

  // If already running inside standalone PWA mode, hide the install button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      setShowManualGuide(true);
    }
  };

  const getRoleConfig = () => {
    switch (role) {
      case 'MERCHANT':
        return {
          title: 'Install Aplikasi Merchant',
          subtitle: 'Aplikasi Mitra Toko & Dapur TumpangGo',
          desc: 'Akses cepat pesanan dapur, laporan omset, dan notifikasi pesanan dari layar utama HP.',
          icon: Store,
          gradient: 'from-emerald-700 via-emerald-600 to-teal-800',
          btnBg: 'bg-white text-emerald-800 hover:bg-emerald-50',
          badgeText: 'Aplikasi Toko'
        };
      case 'DRIVER':
        return {
          title: 'Install Aplikasi Driver',
          subtitle: 'Aplikasi Operasional & Antar Pesanan',
          desc: 'Buka langsung tugas antar makanan dan navigasi dari layar utama HP Android/iOS.',
          icon: Bike,
          gradient: 'from-slate-900 via-slate-800 to-emerald-950',
          btnBg: 'bg-emerald-600 text-white hover:bg-emerald-500',
          badgeText: 'Aplikasi Driver'
        };
      case 'CUSTOMER':
      default:
        return {
          title: 'Install Aplikasi TumpangGo',
          subtitle: 'Pesan Kuliner Lokal Lebih Praktis',
          desc: 'Pasang TumpangGo di layar utama untuk akses instan tanpa unduh APK berat.',
          icon: Smartphone,
          gradient: 'from-emerald-600 via-emerald-700 to-green-800',
          btnBg: 'bg-white text-emerald-800 hover:bg-emerald-50',
          badgeText: 'Aplikasi Web Resmi'
        };
    }
  };

  const cfg = getRoleConfig();
  const IconComponent = cfg.icon;

  if (compact) {
    return (
      <>
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          title={cfg.title}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-xs transition-all cursor-pointer ${
            role === 'MERCHANT' 
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
              : role === 'DRIVER' 
                ? 'bg-slate-900 hover:bg-slate-800 text-white' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          } ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isInstalling ? 'Memasang...' : cfg.title}</span>
        </button>

        {showIOSGuide && renderIOSGuideModal()}
        {showManualGuide && renderManualGuideModal()}
      </>
    );
  }

  return (
    <>
      <div className={`bg-gradient-to-r ${cfg.gradient} text-white rounded-2xl p-4 shadow-md flex flex-wrap items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs flex-shrink-0">
            <IconComponent className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-extrabold tracking-tight">{cfg.title}</span>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-md bg-white/20 text-white">
                {cfg.badgeText}
              </span>
            </div>
            <span className="text-[11px] text-white/80 line-clamp-1 mt-0.5">{cfg.desc}</span>
          </div>
        </div>

        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold active:scale-95 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${cfg.btnBg}`}
        >
          <Download className="w-4 h-4" />
          <span>{isInstalling ? 'Memasang...' : cfg.title}</span>
        </button>
      </div>

      {showIOSGuide && renderIOSGuideModal()}
      {showManualGuide && renderManualGuideModal()}
    </>
  );

  function renderIOSGuideModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
          <button 
            onClick={() => setShowIOSGuide(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{cfg.title} di iPhone / iPad</h3>
              <p className="text-[11px] text-slate-500">Panduan pemasangan aplikasi via Safari</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">1</span>
              <span>Buka halaman ini menggunakan browser <strong>Safari</strong> di perangkat Apple Anda.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">2</span>
              <span>Tekan tombol <strong>Bagikan / Share</strong> (ikon kotak dengan panah ke atas di bagian bawah layar).</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">3</span>
              <span>Gulir ke bawah dan pilih <strong>"Tambah ke Layar Utama" (Add to Home Screen)</strong>.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">4</span>
              <span>Tekan <strong>Tambah (Add)</strong> di pojok kanan atas. Ikon aplikasi akan langsung muncul di layar iPhone Anda!</span>
            </div>
          </div>

          <button
            onClick={() => setShowIOSGuide(false)}
            className="w-full mt-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Mengerti
          </button>
        </div>
      </div>
    );
  }

  function renderManualGuideModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
          <button 
            onClick={() => setShowManualGuide(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pasang {cfg.title}</h3>
              <p className="text-[11px] text-slate-500">Petunjuk instalasi browser</p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <p>
              Browser Anda saat ini belum menampilkan prompt otomatis, atau aplikasi telah tersimpan di browser Anda.
            </p>
            <p className="font-semibold text-slate-900">
              Untuk memasang secara manual:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px]">
              <li>Tekan tombol menu <strong>titik tiga (⋮)</strong> di pojok kanan atas browser Chrome/Edge.</li>
              <li>Pilih opsi <strong>"Pasang aplikasi" (Install app)</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.</li>
              <li>Aplikasi akan langsung terpasang dan dapat dibuka mandiri tanpa bilah URL.</li>
            </ul>
          </div>

          <button
            onClick={() => setShowManualGuide(false)}
            className="w-full mt-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }
};

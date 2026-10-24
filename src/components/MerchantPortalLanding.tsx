import React from 'react';
import Logo from './Logo.tsx';
import { 
  Store, UserPlus, Lock, ArrowLeft, ShieldCheck, 
  Sparkles, ChevronRight 
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO.ts';

interface MerchantPortalLandingProps {
  onBackToHome: () => void;
  onGoToLogin: () => void;
  onGoToRegister: () => void;
}

export default function MerchantPortalLanding({
  onBackToHome,
  onGoToLogin,
  onGoToRegister
}: MerchantPortalLandingProps) {
  useSEO({
    title: 'Portal Merchant UMKM | TumpangGo',
    description: 'Pusat akses mitra pemilik warung, depot makan, dan usaha kuliner lokal Kecamatan Tumpang. Masuk ke dashboard toko atau daftar menjadi mitra.',
    canonicalPath: '/?page=merchant-portal',
    isNoIndex: false
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-6 px-4 sm:px-6 font-sans">
      <div className="max-w-md w-full mx-auto flex flex-col gap-5">
        
        {/* Top Back Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            id="portal-back-to-home"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Kembali ke Beranda</span>
          </button>
          
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/70">
            Mitra UMKM
          </span>
        </div>

        {/* Portal Hero & Branding Header */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm text-center flex flex-col items-center">
          <div className="mb-3">
            <Logo size={56} mode="full" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200/80 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Portal Resmi Mitra UMKM</span>
          </div>

          <h1 className="font-display font-black text-2xl text-slate-900 tracking-tight">
            Portal Merchant tumpangGo
          </h1>

          <p className="text-xs text-slate-500 leading-relaxed mt-2 max-w-sm">
            Pusat akses resmi bagi pemilik warung, depot makan, kafe, dan pelaku UMKM kuliner di wilayah Kecamatan Tumpang untuk mengelola toko dan menerima pesanan digital.
          </p>
        </div>

        {/* Main Action Selection: 2 Clear Pathways */}
        <div className="flex flex-col gap-3.5">
          
          {/* Card 1: Login Merchant */}
          <div
            id="portal-card-login"
            onClick={onGoToLogin}
            className="bg-white border-2 border-slate-200 hover:border-emerald-600 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-start gap-4">
              <div className="w-13 h-13 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 group-hover:scale-105 transition-transform">
                <Store className="w-6 h-6 text-emerald-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-extrabold text-base text-slate-900 group-hover:text-emerald-800 transition-colors">
                    Login Merchant
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                    Mitra Terdaftar
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Sudah memiliki akun toko? Masuk untuk mengelola menu kuliner, jam operasional, dan pesanan pelanggan.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-extrabold text-emerald-800">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                Masuk ke Dashboard Toko
              </span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>

            <button
              type="button"
              id="btn-login-merchant"
              onClick={(e) => {
                e.stopPropagation();
                onGoToLogin();
              }}
              className="w-full mt-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Login Merchant</span>
            </button>
          </div>

          {/* Card 2: Daftar Menjadi Mitra */}
          <div
            id="portal-card-register"
            onClick={onGoToRegister}
            className="bg-white border-2 border-slate-200 hover:border-amber-500 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-start gap-4">
              <div className="w-13 h-13 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 group-hover:scale-105 transition-transform">
                <UserPlus className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-extrabold text-base text-slate-900 group-hover:text-amber-800 transition-colors">
                    Daftar Menjadi Mitra
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/60">
                    Toko Baru
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Belum memiliki akun toko? Daftarkan usaha kuliner Anda ke ekosistem tumpangGo. Pendaftaran 100% gratis!
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-extrabold text-amber-700">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Buka Formulir Pendaftaran Toko
              </span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>

            <button
              type="button"
              id="btn-register-mitra"
              onClick={(e) => {
                e.stopPropagation();
                onGoToRegister();
              }}
              className="w-full mt-3 bg-amber-600 hover:bg-amber-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Daftar Menjadi Mitra</span>
            </button>
          </div>

        </div>

        {/* Key Values & Benefits for UMKM */}
        <div className="grid grid-cols-3 gap-2 text-center mt-1">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pendaftaran</span>
            <span className="font-display font-extrabold text-xs text-emerald-700 mt-0.5 block">Gratis 100%</span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bagi Hasil</span>
            <span className="font-display font-extrabold text-xs text-slate-800 mt-0.5 block">Transparan</span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Dukungan</span>
            <span className="font-display font-extrabold text-xs text-amber-700 mt-0.5 block">Kurir Lokal</span>
          </div>
        </div>

      </div>

      {/* Clean Minimalist Footer */}
      <div className="text-center mt-6 text-xs text-slate-400">
        <p className="font-medium text-slate-500">tumpangGo — Super App lokal Kecamatan Tumpang.</p>
        <p className="text-[11px] mt-1 select-none">© 2026 tumpangGo</p>
      </div>
    </div>
  );
}

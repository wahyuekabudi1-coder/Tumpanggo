/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Niaga - Coming Soon Teaser View
 * Dedicated teaser page announcing upcoming commerce and MSME services for TumpangGo.
 * Frontend-only placeholder without backend dependencies, database storage, or fake waitlists.
 */

import React from 'react';
import BannerCarousel from './BannerCarousel.tsx';
import { 
  ArrowLeft, ShoppingBag, Store, 
  Truck, ShieldCheck 
} from 'lucide-react';

interface TumpangNiagaComingSoonProps {
  onBackToMain: () => void;
}

export default function TumpangNiagaComingSoon({ onBackToMain }: TumpangNiagaComingSoonProps) {
  return (
    <div className="flex flex-col gap-5 pb-24 animate-in fade-in duration-200">
      {/* 1. Header Back Button to Return to Main Landing */}
      <button
        onClick={onBackToMain}
        className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2.5 px-4 rounded-xl self-start transition-all cursor-pointer active:scale-95 border border-slate-200/50 mb-1"
        id="btn-back-to-main-from-niaga"
      >
        <ArrowLeft className="w-4 h-4 text-slate-700" />
        <span>Kembali ke Layanan Utama</span>
      </button>

      {/* 2. Top Promotional Carousel */}
      <BannerCarousel altPrefix="Banner Tumpang Niaga" />

      {/* 3. Hero Teaser Card */}
      <div className="relative bg-gradient-to-br from-[#0F82FF] via-blue-600 to-indigo-700 text-white p-6 rounded-3xl shadow-lg shadow-blue-500/20 overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-10 -mt-10 blur-xl pointer-events-none"></div>
        <div className="absolute left-[-20px] bottom-[-20px] w-36 h-36 bg-blue-400/20 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 max-w-[85%]">
          <div className="inline-flex items-center gap-1.5 bg-white/20 text-[10px] uppercase font-black tracking-wider px-3 py-1 rounded-full border border-white/20 backdrop-blur-xs">
            <Store className="w-3.5 h-3.5 text-blue-100" />
            <span>Tumpang Niaga</span>
          </div>

          <h3 className="font-display font-black text-2xl leading-tight mt-3 tracking-tight">
            COMING SOON
          </h3>

          <p className="text-xs text-blue-50 mt-2 leading-relaxed">
            Layanan perdagangan dan kebutuhan UMKM akan segera hadir di ekosistem digital TumpangGo.
          </p>
        </div>

        <div className="absolute right-[-15px] bottom-[-15px] opacity-20 pointer-events-none">
          <ShoppingBag className="w-36 h-36 rotate-12 text-white" />
        </div>
      </div>

      {/* 4. Main Information & Teaser Card */}
      <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
        {/* Title Block */}
        <div className="text-center pb-4 border-b border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border-2 border-blue-500 flex items-center justify-center text-blue-600 mx-auto mb-3 shadow-md shadow-blue-500/10">
            <ShoppingBag className="w-8 h-8 text-[#0F82FF]" />
          </div>
          <h4 className="font-display font-black text-lg text-slate-800 tracking-tight">
            Tumpang Niaga
          </h4>
          <div className="mt-1.5 flex items-center justify-center gap-1.5">
            <span className="bg-blue-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
              COMING SOON
            </span>
          </div>
          <p className="text-xs text-slate-600 font-medium mt-3 leading-relaxed max-w-sm mx-auto">
            Layanan belanja komoditas lokal, produk sembako, dan aneka perlengkapan UMKM Kecamatan Tumpang dalam tahap persiapan peluncuran.
          </p>
        </div>

        {/* Highlights / Keunggulan Layanan */}
        <div className="flex flex-col gap-3">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Rencana Layanan Mendatang
          </h5>
          
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:bg-blue-50/30 transition-all">
            <div className="p-2 rounded-xl bg-blue-100/70 text-blue-700 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h6 className="text-xs font-black text-slate-800">Pasokan & Komoditas UMKM</h6>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                Katalog komoditas lokal, bahan kebutuhan usaha, dan produk retail pilihan langsung dari perajin dan pedagang terpercaya di wilayah Tumpang.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:bg-blue-50/30 transition-all">
            <div className="p-2 rounded-xl bg-blue-100/70 text-blue-700 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h6 className="text-xs font-black text-slate-800">Pengantaran Cepat Se-Kecamatan</h6>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                Didukung jaringan kurir lokal TumpangGo dengan tarif ongkir bersahabat flat Rp 5.000 se-Kecamatan Tumpang.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:bg-blue-50/30 transition-all">
            <div className="p-2 rounded-xl bg-blue-100/70 text-blue-700 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h6 className="text-xs font-black text-slate-800">Pembayaran Digital Terpadu</h6>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                Mendukung QRIS praktis semua bank & e-wallet, serta transaksi tunai di tempat (COD).
              </p>
            </div>
          </div>
        </div>

        {/* 5. Primary Back Button to Main Menu */}
        <button
          onClick={onBackToMain}
          className="w-full bg-[#0F82FF] hover:bg-blue-600 text-white font-extrabold py-3.5 px-5 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-98 cursor-pointer mt-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Layanan Utama</span>
        </button>
      </div>
    </div>
  );
}

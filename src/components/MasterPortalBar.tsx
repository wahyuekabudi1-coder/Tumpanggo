/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Master Account Portal Switcher & Cross-Entity Administration Bar
 * Provides seamless cross-portal navigation and entity context switching
 * for the official Master Super Admin account (tumpanggo@gmail.com).
 */

import React, { useState } from 'react';
import { 
  ShieldCheck, Store, Bike, UtensilsCrossed, ShoppingBag, 
  LogOut, ChevronDown, KeyRound, CheckCircle2, AlertCircle, 
  ExternalLink, Eye, EyeOff, ChevronUp, RefreshCw, Sparkles, X, ShieldAlert, Layers
} from 'lucide-react';
import { apiFetch as fetch } from '../utils/apiClient';

interface MasterPortalBarProps {
  currentRole: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN' | 'SHOP_ADMIN';
  activeMerchantId?: string;
  activeDriverId?: string;
  merchants: any[];
  drivers: any[];
  onSelectRole: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN' | 'SHOP_ADMIN', entityId?: string) => void;
  onSelectMerchant: (merchantId: string) => void;
  onSelectDriver: (driverId: string) => void;
  onLogout: () => void;
  onOpenWorkspace?: () => void;
}

export const MasterPortalBar: React.FC<MasterPortalBarProps> = ({
  currentRole,
  activeMerchantId,
  activeDriverId,
  merchants,
  drivers,
  onSelectRole,
  onSelectMerchant,
  onSelectDriver,
  onLogout,
  onOpenWorkspace
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [rotateError, setRotateError] = useState('');
  const [rotateSuccess, setRotateSuccess] = useState('');

  const safeMerchants = Array.isArray(merchants) ? merchants : [];
  const safeDrivers = Array.isArray(drivers) ? drivers : [];

  const currentMerchant = safeMerchants.find(m => m.id === activeMerchantId);
  const currentDriver = safeDrivers.find(d => d.id === activeDriverId);

  const handleRotatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRotateError('');
    setRotateSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setRotateError('Semua kolom kata sandi wajib diisi.');
      return;
    }

    if (newPassword.length < 8) {
      setRotateError('Kata sandi baru minimal harus 8 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setRotateError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setRotateLoading(true);
    try {
      const res = await fetch('/api/auth/master/rotate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.ok && data?.success) {
        setRotateSuccess('Kata sandi Master Account berhasil dirotasi secara aman.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setShowRotateModal(false), 2000);
      } else {
        if (res.status === 401) {
          setRotateError(data?.error || 'Kata sandi lama salah.');
        } else if (res.status === 403) {
          setRotateError('Akses ditolak: Hanya Master Account yang dapat merotasi kata sandi.');
        } else {
          setRotateError(data?.error || `Gagal merotasi kata sandi (HTTP ${res.status}).`);
        }
      }
    } catch (err: any) {
      setRotateError(err?.message?.includes('fetch') ? 'Gagal terhubung ke server jaringan.' : 'Gagal menghubungi server.');
    } finally {
      setRotateLoading(false);
    }
  };

  if (isCollapsed) {
    return (
      <aside aria-label="Master Bar Mini" className="fixed bottom-4 right-4 z-[999]">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-950/95 text-amber-300 border border-amber-500/40 shadow-2xl hover:bg-slate-900 transition-all font-sans text-xs cursor-pointer backdrop-blur"
          title="Buka Master Account Portal Switcher"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span className="font-extrabold tracking-wide">MASTER ACCOUNT</span>
          <span className="bg-amber-500/20 text-amber-200 text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase">
            {currentRole}
          </span>
          <ChevronUp className="w-4 h-4 text-amber-400" />
        </button>
      </aside>
    );
  }

  return (
    <>
      <header 
        aria-label="Panel Master Account"
        className="bg-slate-950 text-white border-b border-amber-500/30 sticky top-0 z-[95] shadow-2xl font-sans"
      >
        {/* Top Identification Bar */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          
          {/* Identity & Status */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/30 px-2.5 py-1 rounded-lg">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-display font-extrabold tracking-wider text-amber-300 uppercase text-[11px]">
                Master Account
              </span>
              <span className="text-slate-400 font-mono text-[10px] hidden sm:inline">
                (tumpanggo@gmail.com)
              </span>
            </div>

            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Otorisasi Lintas Portal Penuh
            </span>

            {/* Active Portal Badge */}
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400">Portal Aktif:</span>
              <span className="font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {currentRole === 'ADMIN' && 'Admin Tumpang Food'}
                {currentRole === 'MERCHANT' && 'Portal Merchant Toko'}
                {currentRole === 'DRIVER' && 'Portal Driver Kurir'}
                {currentRole === 'SHOP_ADMIN' && 'Shop Admin'}
                {currentRole === 'CUSTOMER' && 'Mode Pratinjau Pelanggan'}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowRotateModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition cursor-pointer border border-slate-700"
              title="Rotasi Kata Sandi Master Account"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Rotasi Sandi</span>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 text-[11px] font-bold transition cursor-pointer border border-rose-500/30"
              title="Keluar dari Sesi Master Account"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Keluar</span>
            </button>

            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-slate-800"
              title="Ciutkan Master Bar"
              aria-label="Ciutkan Master Bar"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Portal Navigation Tabs */}
        <div className="bg-slate-900/90 border-t border-white/5 px-3 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            
            {/* Direct Switch Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              
              {/* 1. Admin Food */}
              <button
                onClick={() => onSelectRole('ADMIN')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
                  currentRole === 'ADMIN'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin Food</span>
              </button>

              {/* 2. Merchant Portal */}
              <button
                onClick={() => onSelectRole('MERCHANT', activeMerchantId || safeMerchants[0]?.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
                  currentRole === 'MERCHANT'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Merchant</span>
              </button>

              {/* 3. Driver Portal */}
              <button
                onClick={() => onSelectRole('DRIVER', activeDriverId || safeDrivers[0]?.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
                  currentRole === 'DRIVER'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <Bike className="w-3.5 h-3.5" />
                <span>Driver</span>
              </button>

              {/* 4. Shop Admin */}
              <button
                onClick={() => onSelectRole('SHOP_ADMIN')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
                  currentRole === 'SHOP_ADMIN'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Tumpang Shop</span>
              </button>

              {/* 5. Customer View */}
              <button
                onClick={() => onSelectRole('CUSTOMER')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
                  currentRole === 'CUSTOMER'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Pratinjau Pelanggan</span>
              </button>

              {/* 6. Evaluation Workspace */}
              <button
                onClick={() => {
                  if (onOpenWorkspace) {
                    onOpenWorkspace();
                  } else {
                    const url = new URL(window.location.href);
                    url.searchParams.set('page', 'workspace');
                    window.location.href = url.toString();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#315B4F] hover:bg-[#26483E] text-white border border-[#315B4F]/40 shadow-xs cursor-pointer flex-shrink-0 transition-all"
                title="Buka TumpangGo Evaluation Workspace (4-Portal Matrix)"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Evaluation Workspace</span>
              </button>
            </div>

            {/* Context Selector for Merchant or Driver */}
            {currentRole === 'MERCHANT' && safeMerchants.length > 0 && (
              <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                <span className="text-slate-400 font-medium text-[11px] whitespace-nowrap hidden sm:inline">
                  Mode Lintas Toko:
                </span>
                <select
                  value={activeMerchantId || ''}
                  onChange={(e) => onSelectMerchant(e.target.value)}
                  className="bg-slate-950 text-amber-200 border border-amber-500/40 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer w-full sm:w-auto max-w-xs"
                >
                  {safeMerchants.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                      🏪 {m.name} ({m.ownerName})
                    </option>
                  ))}
                </select>
                {currentMerchant && (
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap hidden lg:inline">
                    Pemilik Asli: <strong className="text-slate-200">{currentMerchant.ownerName}</strong>
                  </span>
                )}
              </div>
            )}

            {currentRole === 'DRIVER' && safeDrivers.length > 0 && (
              <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                <span className="text-slate-400 font-medium text-[11px] whitespace-nowrap hidden sm:inline">
                  Mode Lintas Kurir:
                </span>
                <select
                  value={activeDriverId || ''}
                  onChange={(e) => onSelectDriver(e.target.value)}
                  className="bg-slate-950 text-amber-200 border border-amber-500/40 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer w-full sm:w-auto max-w-xs"
                >
                  {safeDrivers.map((d) => (
                    <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                      🛵 {d.name} ({d.phone})
                    </option>
                  ))}
                </select>
                {currentDriver && (
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap hidden lg:inline">
                    Identitas Asli: <strong className="text-slate-200">{currentDriver.name}</strong>
                  </span>
                )}
              </div>
            )}

            {currentRole === 'CUSTOMER' && (
              <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                <Eye className="w-3.5 h-3.5" />
                <span>Mode Pratinjau Pelanggan: Sesi Master Admin tetap terjaga.</span>
              </div>
            )}

          </div>
        </div>
      </header>

      {/* Password Rotation Modal */}
      {showRotateModal && (
        <div className="fixed inset-0 bg-slate-950/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-slate-900 relative">
            <button
              onClick={() => setShowRotateModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              title="Tutup Modal"
              aria-label="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-base text-slate-900">
                  Rotasi Sandi Master Account
                </h3>
                <p className="text-xs text-slate-500">
                  Perbarui kata sandi tumpanggo@gmail.com secara aman.
                </p>
              </div>
            </div>

            {rotateError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{rotateError}</span>
              </div>
            )}

            {rotateSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{rotateSuccess}</span>
              </div>
            )}

            <form onSubmit={handleRotatePassword} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Kata Sandi Saat Ini
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan kata sandi saat ini"
                    className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-0.5"
                    title={showCurrentPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    aria-label={showCurrentPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Kata Sandi Baru (Min. 8 Karakter)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-0.5"
                    title={showNewPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    aria-label={showNewPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Konfirmasi Kata Sandi Baru
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-0.5"
                    title={showConfirmPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    aria-label={showConfirmPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRotateModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={rotateLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold transition shadow disabled:opacity-50 flex items-center gap-2"
                >
                  {rotateLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Simpan Sandi Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default MasterPortalBar;

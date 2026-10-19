/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Shared component for secret portal access.
 * Only rendered when copyright trigger is active (10 to 13 clicks).
 */

import React from 'react';
import { Shield, Store, Bike, UtensilsCrossed, LogOut } from 'lucide-react';

interface HiddenPortalBarProps {
  currentPortal: 'CUSTOMER' | 'MERCHANT' | 'ADMIN' | 'DRIVER';
  onNavigatePortal: (target: 'CUSTOMER' | 'MERCHANT' | 'ADMIN' | 'DRIVER') => void;
  onLogout?: () => void;
  variant?: 'emerald' | 'light' | 'dark';
  idSuffix?: string;
}

export const HiddenPortalBar: React.FC<HiddenPortalBarProps> = ({
  currentPortal,
  onNavigatePortal,
  onLogout,
  variant = 'emerald',
  idSuffix = ''
}) => {
  const getContainerClasses = () => {
    switch (variant) {
      case 'emerald':
        return 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-100 shadow-xl';
      case 'dark':
        return 'bg-slate-900/95 border border-slate-700/60 text-slate-100 shadow-xl';
      case 'light':
      default:
        return 'bg-white/95 border border-slate-300 text-slate-800 shadow-lg';
    }
  };

  const getButtonClasses = (colorScheme: 'customer' | 'merchant' | 'admin' | 'driver' | 'logout') => {
    switch (colorScheme) {
      case 'customer':
        return variant === 'emerald'
          ? 'bg-emerald-800/80 hover:bg-emerald-700 text-white border border-emerald-500/30'
          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'merchant':
        return variant === 'emerald'
          ? 'bg-amber-800/80 hover:bg-amber-700 text-white border border-amber-500/30'
          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200';
      case 'admin':
        return variant === 'emerald'
          ? 'bg-purple-900/80 hover:bg-purple-800 text-white border border-purple-500/30'
          : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200';
      case 'driver':
        return variant === 'emerald'
          ? 'bg-blue-900/80 hover:bg-blue-800 text-white border border-blue-500/30'
          : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200';
      case 'logout':
        return variant === 'emerald'
          ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/30'
          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200';
    }
  };

  return (
    <div 
      id={`secret-portal-panel${idSuffix ? `-${idSuffix}` : ''}`}
      className={`mt-3 p-2.5 rounded-xl transition-all duration-200 ${getContainerClasses()}`}
    >
      <div className="flex items-center justify-between gap-1 mb-2 px-1">
        <span className="text-[11px] font-semibold tracking-wide flex items-center gap-1.5 opacity-90">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          Akses Portal Internal
        </span>
        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-medium">
          Terverifikasi
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        {/* 1. Customer / Tumpang Food */}
        {currentPortal !== 'CUSTOMER' && (
          <button
            type="button"
            id={`btn-portal-customer${idSuffix ? `-${idSuffix}` : ''}`}
            onClick={() => onNavigatePortal('CUSTOMER')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg font-medium transition active:scale-95 cursor-pointer ${getButtonClasses('customer')}`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tumpang Food</span>
          </button>
        )}

        {/* 2. Merchant Portal */}
        {currentPortal !== 'MERCHANT' && (
          <button
            type="button"
            id={`btn-portal-merchant${idSuffix ? `-${idSuffix}` : ''}`}
            onClick={() => onNavigatePortal('MERCHANT')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg font-medium transition active:scale-95 cursor-pointer ${getButtonClasses('merchant')}`}
          >
            <Store className="w-3.5 h-3.5 text-amber-400" />
            <span>Portal Merchant</span>
          </button>
        )}

        {/* 3. Driver Portal */}
        {currentPortal !== 'DRIVER' && (
          <button
            type="button"
            id={`btn-portal-driver${idSuffix ? `-${idSuffix}` : ''}`}
            onClick={() => onNavigatePortal('DRIVER')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg font-medium transition active:scale-95 cursor-pointer ${getButtonClasses('driver')}`}
          >
            <Bike className="w-3.5 h-3.5 text-blue-400" />
            <span>Portal Driver</span>
          </button>
        )}

        {/* 4. Admin Dashboard */}
        {currentPortal !== 'ADMIN' && (
          <button
            type="button"
            id={`btn-portal-admin${idSuffix ? `-${idSuffix}` : ''}`}
            onClick={() => onNavigatePortal('ADMIN')}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg font-medium transition active:scale-95 cursor-pointer ${getButtonClasses('admin')}`}
          >
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            <span>Dashboard Admin</span>
          </button>
        )}

        {/* Logout Option (for authenticated views) */}
        {onLogout && currentPortal !== 'CUSTOMER' && (
          <button
            type="button"
            id={`btn-portal-logout${idSuffix ? `-${idSuffix}` : ''}`}
            onClick={onLogout}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg font-medium transition active:scale-95 cursor-pointer col-span-2 sm:col-span-1 ${getButtonClasses('logout')}`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Akun</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default HiddenPortalBar;

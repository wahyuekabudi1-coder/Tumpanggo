import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 left-4 right-4 max-w-md mx-auto z-50 flex items-center justify-between gap-3 rounded-2xl bg-slate-900/95 text-white p-3.5 shadow-xl border border-amber-500/30 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-xl">
          <WifiOff className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-amber-300">Mode Offline</span>
          <span className="text-[11px] text-slate-300">Koneksi internet terputus. Menampilkan data cache terakhir.</span>
        </div>
      </div>
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Driver Portal — Consistent System Design with Merchant Portal
 * Dashboard operasional kurir pengiriman kuliner UMKM Kecamatan Tumpang.
 * Dioptimalkan untuk HP Android/iOS (320-430px), Tablet (768-1024px), dan Desktop.
 * 
 * Struktur Menu:
 * 1. Dashboard & Tugas Pengantaran (Tugas Aktif, Siap Jemput, Rute Peta, Detail Pesanan)
 * 2. Riwayat Pengantaran (Pesanan Selesai Diantar, Rekapitulasi Ongkir)
 * 3. Profil Kurir (Identitas Driver, Status Kemitraan, Notifikasi WebPush)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Driver, Order, OrderStatus } from '../types.ts';
import MapPicker from './MapPicker.tsx';
import { compressImage } from '../utils/imageCompressor.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { 
  Navigation, ShoppingBag, Phone, MapPin, ClipboardList, 
  User, LogOut, Check, ChevronRight, X, Image as ImageIcon, RefreshCw, AlertCircle,
  Clock, CheckCircle2, MessageSquare, ExternalLink, ShieldCheck, Bike,
  DollarSign, ChefHat, AlertTriangle, Bell, Store, Menu as MenuIcon,
  Volume2, VolumeX
} from 'lucide-react';
import { useHiddenTrigger } from '../hooks/useHiddenTrigger.ts';
import HiddenPortalBar from './HiddenPortalBar.tsx';
import { useSEO } from '../hooks/useSEO.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { useWebPush } from '../hooks/useWebPush.ts';
import { OfflineIndicator } from './OfflineIndicator.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { 
  calculateRemainingCooking, 
  formatWibTime 
} from '../utils/cookingTimer.ts';
import { useCookingTicker } from '../hooks/useCookingCountdown.ts';
import { useOrderRingtone } from '../hooks/useOrderRingtone.ts';

// Helper to extract clean initials from driver name (e.g., "Ahmad Sobari" -> "AS", "Budi" -> "BU")
export function getDriverInitials(name?: string): string {
  if (!name || !name.trim()) return 'DR';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Driver Avatar component matching MerchantStoreLogo style
export function DriverAvatarBadge({
  driver,
  size = 'md'
}: {
  driver: Driver | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'w-8 h-8 min-w-[32px] text-[10px]',
    md: 'w-10 h-10 min-w-[40px] text-xs',
    lg: 'w-14 h-14 min-w-[56px] text-base'
  }[size];

  const initials = getDriverInitials(driver?.name);

  return (
    <div className={`relative ${sizeClasses} rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-950 border border-emerald-700/60 text-white font-extrabold flex items-center justify-center shadow-xs shrink-0 select-none overflow-hidden group`}>
      <span className="font-display tracking-tight font-black text-emerald-100 group-hover:scale-105 transition-transform">
        {initials}
      </span>
      <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-tl-md flex items-center justify-center">
        <Bike className="w-2 h-2 text-white" />
      </span>
    </div>
  );
}

interface DriverViewProps {
  driverId: string;
  onLogout: () => void;
  onSelectRole?: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN') => void;
}

export type DriverTab = 'dashboard' | 'history' | 'profile';

export default function DriverView({ driverId, onLogout, onSelectRole }: DriverViewProps) {
  useSEO({
    title: 'Portal Driver – TumpangGo Internal',
    isNoIndex: true
  });

  const isNetworkOnline = useOnlineStatus();
  const { isUnlocked, handleCopyrightClick } = useHiddenTrigger();

  // Core Data
  const [driver, setDriver] = useState<Driver | null>(null);
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);

  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<DriverTab>('dashboard');
  const [taskFilter, setTaskFilter] = useState<'all' | 'my' | 'available'>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);

  // Mobile Drawer State
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Loading & Feedback
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const cookingNow = useCookingTicker();
  const {
    isRinging,
    isMuted,
    isAudioUnlocked,
    dismissAlert,
    toggleMute,
    unlockAudio
  } = useOrderRingtone(availableOrders, !loading);

  const {
    isSupported: isPushSupported,
    isSubscribed: isPushSubscribed,
    loading: pushLoading,
    statusMessage: pushStatusMsg,
    subscribe: subscribePush,
    clearStatusMessage: clearPushStatusMsg
  } = useWebPush('DRIVER', driver?.id || driverId);

  // References for zero-flicker state & async race condition prevention
  const selectedOrderIdRef = useRef<string | null>(null);
  const latestFetchIdRef = useRef<number>(0);
  const isFirstMountRef = useRef<boolean>(true);

  // Photo Proof State
  const [deliveryProofUrl, setDeliveryProofUrl] = useState('');
  const [deliveryProofFile, setDeliveryProofFile] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Confirmation Modals
  const [confirmAcceptOrder, setConfirmAcceptOrder] = useState<Order | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Toast timer ref
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Fetch all driver data: profile, assigned tasks, available tasks, and completed history
  const fetchDriverData = useCallback(async (silent = false) => {
    const fetchId = ++latestFetchIdRef.current;
    if (isFirstMountRef.current && !silent) {
      setLoading(true);
    }
    setIsRefreshing(true);

    try {
      // 1. Profile
      const profRes = await fetch(`/api/drivers/${driverId}`);
      if (profRes.ok && fetchId === latestFetchIdRef.current) {
        const d: Driver = await profRes.json();
        setDriver(d);
      }

      // 2. Assigned Tasks for this driver
      const tasksRes = await fetch(`/api/drivers/${driverId}/orders`);
      let allOrders: Order[] = [];
      if (tasksRes.ok) {
        const rawOrders = await tasksRes.json();
        allOrders = extractArrayResponse<Order>(rawOrders, 'orders');
      }

      // 3. Available Unassigned Tasks (READY_FOR_PICKUP or COOKING without driver)
      const availRes = await fetch('/api/orders/available');
      let availOrders: Order[] = [];
      if (availRes.ok) {
        const rawAvail = await availRes.json();
        availOrders = extractArrayResponse<Order>(rawAvail, 'orders');
      }

      if (fetchId === latestFetchIdRef.current) {
        const myActive = allOrders.filter(o => 
          o.status === OrderStatus.READY_FOR_PICKUP || 
          o.status === OrderStatus.ORDER_PICKED_UP || 
          o.status === OrderStatus.COOKING || 
          o.status === OrderStatus.PAYMENT_VERIFIED
        );
        const myHistory = allOrders.filter(o => 
          o.status === OrderStatus.DELIVERED || 
          o.status === OrderStatus.COMPLETED
        );

        setAssignedOrders(myActive);
        setAvailableOrders(availOrders);
        setHistoryOrders(myHistory);
        setLastRefreshedAt(new Date());

        // Update selected order detail if currently opened
        if (selectedOrderIdRef.current) {
          const currentInActive = myActive.find(o => o.id === selectedOrderIdRef.current);
          const currentInAvail = availOrders.find(o => o.id === selectedOrderIdRef.current);
          const currentInHistory = myHistory.find(o => o.id === selectedOrderIdRef.current);
          const updated = currentInActive || currentInAvail || currentInHistory;
          if (updated) {
            setSelectedOrderDetail(updated);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching driver data:', err?.message || err);
    } finally {
      if (fetchId === latestFetchIdRef.current) {
        setIsRefreshing(false);
        setLoading(false);
        isFirstMountRef.current = false;
      }
    }
  }, [driverId]);

  useEffect(() => {
    fetchDriverData();
    const interval = setInterval(() => {
      fetchDriverData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchDriverData]);

  // Online / Offline status toggle handler
  const toggleOnline = async () => {
    if (actionLoading || !driver) return;
    setActionLoading(true);
    const toggled = !driver.online;

    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: toggled, role: 'DRIVER', userId: driverId })
      });

      if (res.ok) {
        const updated = await res.json();
        setDriver(updated);
        showToast(
          toggled ? 'Status Anda kini ONLINE. Siap menerima tugas pengantaran!' : 'Status Anda kini OFFLINE. Istirahat sejenak.',
          toggled ? 'success' : 'info'
        );
      } else {
        const errJson = await res.json().catch(() => null);
        showToast(errJson?.error || 'Gagal mengubah status online.', 'error');
      }
    } catch {
      showToast('Gagal terhubung ke server.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Stable Order Selection Handlers
  const handleSelectOrder = (order: Order) => {
    selectedOrderIdRef.current = order.id;
    setSelectedOrderId(order.id);
    setSelectedOrderDetail(order);
    setDeliveryProofFile(null);
    setDeliveryProofUrl('');
  };

  const handleCloseDetail = () => {
    selectedOrderIdRef.current = null;
    setSelectedOrderId(null);
    setSelectedOrderDetail(null);
    setDeliveryProofFile(null);
    setDeliveryProofUrl('');
  };

  // Action: Accept unassigned task atomically
  const handleAcceptTask = async (orderId: string) => {
    if (actionLoading) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/accept-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId })
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        const orderNum = data.order?.orderNumber || data.order?.id || orderId;
        showToast(`Tugas #${orderNum} berhasil diterima! Segera ambil pesanan.`, 'success');
        setConfirmAcceptOrder(null);
        if (data.order) {
          selectedOrderIdRef.current = data.order.id;
          setSelectedOrderId(data.order.id);
          setSelectedOrderDetail(data.order);
        }
        await fetchDriverData(true);
      } else {
        showToast(data?.error || 'Gagal menerima tugas ini. Mungkin telah diambil kurir lain.', 'error');
      }
    } catch {
      showToast('Kendala koneksi saat menerima tugas.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Confirm food picked up from merchant
  const handlePickUpOrder = async (orderId: string) => {
    if (actionLoading) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.ORDER_PICKED_UP,
          role: 'DRIVER',
          userId: driverId
        })
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        showToast('Pesanan berhasil diambil dari merchant! Hati-hati di jalan.', 'success');
        setSelectedOrderDetail(prev => (prev && prev.id === orderId ? { ...prev, status: OrderStatus.ORDER_PICKED_UP } : prev));
        await fetchDriverData(true);
      } else {
        showToast(data?.error || 'Gagal mengonfirmasi pengambilan pesanan.', 'error');
      }
    } catch {
      showToast('Kendala jaringan saat memperbarui status.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle local image file selection for delivery proof
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 900, 900, 0.7);
        setDeliveryProofFile(compressed);
        setDeliveryProofUrl('');
      } catch {
        const reader = new FileReader();
        reader.onloadend = () => {
          setDeliveryProofFile(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Action: Complete delivery with proof upload
  const handleCompleteDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    const proof = deliveryProofFile || deliveryProofUrl;
    if (!proof) {
      showToast('Silakan pilih foto bukti pengantaran terlebih dahulu.', 'error');
      return;
    }

    if (!selectedOrderDetail || uploadLoading) return;
    setUploadLoading(true);

    try {
      const res = await fetch(`/api/orders/${selectedOrderDetail.id}/upload-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deliveryProof: proof,
          userId: driverId
        })
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        showToast('Pengantaran selesai! Ongkir telah tercatat ke akun Anda.', 'success');
        setDeliveryProofUrl('');
        setDeliveryProofFile(null);
        handleCloseDetail();
        await fetchDriverData(true);
        setActiveTab('history');
      } else {
        showToast(data?.error || 'Gagal mengunggah bukti pengantaran.', 'error');
      }
    } catch {
      showToast('Kendala jaringan saat menyelesaikan pesanan.', 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  // Helper to open Google Maps navigation to destination
  const openMapsNavigation = (address: string, name: string) => {
    const query = encodeURIComponent(`${name}, ${address}`);
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const handleViewCustomerSite = () => {
    if (onSelectRole) {
      onSelectRole('CUSTOMER');
    } else {
      window.location.href = '/';
    }
  };

  // Calculate earnings recap
  const totalCompletedCount = historyOrders.filter(o => o.status === OrderStatus.COMPLETED || o.status === OrderStatus.DELIVERED).length;
  const totalEarningsRp = historyOrders
    .filter(o => o.status === OrderStatus.COMPLETED || o.status === OrderStatus.DELIVERED)
    .reduce((sum, o) => sum + (o.deliveryFee || 5000), 0);

  // Filter tasks in dashboard
  const displayedActiveOrders = taskFilter === 'my' 
    ? assignedOrders 
    : taskFilter === 'available' 
      ? availableOrders 
      : [...assignedOrders, ...availableOrders];

  // Navigation menu items definition matching Merchant format
  const navMenuItems = [
    { 
      id: 'dashboard', 
      label: 'Dashboard & Tugas', 
      shortLabel: 'Tugas',
      icon: Bike,
      count: availableOrders.length + assignedOrders.length,
      highlight: availableOrders.length > 0
    },
    { 
      id: 'history', 
      label: 'Riwayat Pengantaran', 
      shortLabel: 'Riwayat',
      icon: ClipboardList,
      count: totalCompletedCount
    },
    { 
      id: 'profile', 
      label: 'Profil Kurir & Akun', 
      shortLabel: 'Profil',
      icon: User,
      count: undefined 
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center font-sans p-6">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-900 text-sm mt-4 font-bold tracking-tight">Memuat Portal Driver...</p>
        <span className="text-slate-500 text-xs mt-1">Sinkronisasi data operasional pengantaran TumpangGo</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row antialiased text-slate-900 w-full max-w-full overflow-x-hidden font-sans">
      {/* Offline Toast Banner */}
      <OfflineIndicator />

      {/* Floating In-App Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 left-4 right-4 max-w-md mx-auto z-[90] p-3.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200 ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-800/95 text-white border border-emerald-500/40' 
            : toastMessage.type === 'error'
              ? 'bg-rose-700/95 text-white border border-rose-500/40'
              : 'bg-slate-900/95 text-white border border-slate-700/40'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-sky-300 shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:opacity-75 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =========================================================================
          DESKTOP & TABLET SIDEBAR (Tampil pada layar md: ke atas)
          ========================================================================= */}
      <aside className="hidden md:flex flex-col w-56 lg:w-64 xl:w-72 bg-white border-r border-slate-200/90 h-screen sticky top-0 shrink-0 select-none z-20">
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <DriverAvatarBadge driver={driver} size="md" />
            <div className="min-w-0">
              <h1 className="font-display font-bold text-sm text-slate-900 truncate">
                {driver?.name || 'Driver TumpangGo'}
              </h1>
              <p className="text-[11px] text-slate-400 truncate font-mono">
                Kurir ID: {driver?.id || driverId}
              </p>
            </div>
          </div>
        </div>

        {/* Driver Operational Status Widget */}
        <div className="p-3 bg-slate-50 border-b border-slate-100 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600">Status Kurir:</span>
            <span className={`text-[11px] font-extrabold flex items-center gap-1.5 ${driver?.online ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full ${driver?.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {driver?.online ? 'Online (Aktif)' : 'Offline (Istirahat)'}
            </span>
          </div>

          <button
            onClick={toggleOnline}
            disabled={actionLoading}
            className={`w-full min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border flex items-center justify-center gap-1.5 ${
              driver?.online 
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' 
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {driver?.online ? 'Mode Istirahat (Offline)' : 'Aktifkan Mode Online'}
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 p-3 overflow-y-auto space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 block mb-1.5">
            Menu Operasional
          </span>
          {navMenuItems.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  handleCloseDetail();
                  setActiveTab(tab.id as DriverTab);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#064e3b] text-white shadow-xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </div>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-white text-emerald-800'
                      : (tab.highlight ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-slate-200 text-slate-700')
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Audio & Ringtone Control */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/70 text-xs space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-600 font-semibold flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-slate-500" />
              Suara Dering:
            </span>
            <button
              type="button"
              onClick={toggleMute}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer ${
                isMuted ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              {isMuted ? 'Muted' : 'Aktif'}
            </button>
          </div>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/70 text-xs space-y-2">
          <button
            type="button"
            onClick={handleViewCustomerSite}
            className="w-full py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            title="Lihat Website Utama TumpangGo"
          >
            <Store className="w-3.5 h-3.5 text-emerald-700" />
            <span>Lihat Website Utama</span>
          </button>

          <div className="flex gap-2 pt-0.5">
            <button
              onClick={() => fetchDriverData(false)}
              disabled={loading || isRefreshing}
              className="flex-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              title="Perbarui Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing || loading ? 'animate-spin text-emerald-600' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              title="Keluar dari Akun Driver"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          MOBILE DRAWER / OFF-CANVAS SHEET (< md)
          ========================================================================= */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div 
            onClick={() => setIsMobileDrawerOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Content */}
          <div className="fixed top-0 bottom-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl z-50 flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <DriverAvatarBadge driver={driver} size="md" />
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-sm text-slate-900 truncate">
                      {driver?.name || 'Driver TumpangGo'}
                    </h2>
                    <span className={`text-[10px] font-bold flex items-center gap-1 ${driver?.online ? 'text-emerald-700' : 'text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${driver?.online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {driver?.online ? 'Kurir Online' : 'Kurir Offline'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Nav Items */}
              <nav className="p-3 space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 block mb-2">
                  Navigasi Utama
                </span>
                {navMenuItems.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        handleCloseDetail();
                        setActiveTab(tab.id as DriverTab);
                        setIsMobileDrawerOpen(false);
                      }}
                      className={`w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#064e3b] text-white font-extrabold shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                        <span>{tab.label}</span>
                      </div>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-white text-emerald-800'
                            : (tab.highlight ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-slate-200 text-slate-700')
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Drawer Footer Actions with Safe Area support */}
            <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-slate-100 bg-slate-50 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  handleViewCustomerSite();
                }}
                className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
              >
                <Store className="w-4 h-4 text-emerald-700" />
                <span>Lihat Website Utama</span>
              </button>

              <button
                onClick={() => {
                  toggleOnline();
                  setIsMobileDrawerOpen(false);
                }}
                className={`w-full min-h-[44px] py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border flex items-center justify-center gap-1.5 ${
                  driver?.online 
                    ? 'bg-rose-50 text-rose-700 border-rose-200' 
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {driver?.online ? 'Mode Istirahat (Offline)' : 'Aktifkan Mode Online'}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    fetchDriverData(false);
                    setIsMobileDrawerOpen(false);
                  }}
                  className="flex-1 min-h-[44px] py-2 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    setShowLogoutConfirm(true);
                  }}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-slate-900 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MAIN CONTENT AREA (Kanan pada desktop, Full-width pada mobile)
          ========================================================================= */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen max-w-full bg-[#F4F7F5]">
        
        {/* Mobile Header (< md) — Ringkas, Proporsional, Tanpa Elemen Bertumpuk */}
        <header className="md:hidden bg-white border-b border-slate-200/90 sticky top-0 z-30 shadow-xs min-h-[56px] py-1.5 px-3 flex items-center justify-between gap-2 select-none">
          {/* Left: Hamburger & Driver Identity */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 cursor-pointer shrink-0"
              aria-label="Buka Menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>

            {/* Inisial Kurir / Avatar */}
            <DriverAvatarBadge driver={driver} size="md" />

            <div className="min-w-0 flex-1">
              <h1 className="font-display font-bold text-xs sm:text-sm text-slate-900 truncate leading-tight" title={driver?.name || 'Driver TumpangGo'}>
                {driver?.name || 'Driver TumpangGo'}
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] leading-none mt-0.5">
                <span className="text-slate-400 font-medium hidden sm:inline">Kurir</span>
                <span className="text-slate-300 hidden sm:inline">·</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${driver?.online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className={`font-semibold truncate ${driver?.online ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {driver?.online ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Operational Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className={`w-10 h-10 min-w-[40px] rounded-xl border flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                isRinging 
                  ? 'bg-rose-600 text-white border-rose-600 animate-bounce' 
                  : isMuted 
                    ? 'bg-slate-100 text-slate-400 border-slate-200' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
              title={isMuted ? 'Aktifkan Suara' : 'Senyapkan Suara'}
              aria-label="Pengaturan Suara Dering"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Quick Refresh Button */}
            <button
              onClick={() => fetchDriverData(false)}
              disabled={isRefreshing}
              className="w-10 h-10 min-w-[40px] rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 flex items-center justify-center cursor-pointer transition-colors shrink-0"
              title="Perbarui Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* Quick Online/Offline Toggle Button */}
            <button
              onClick={toggleOnline}
              disabled={actionLoading}
              className={`min-h-[40px] px-2.5 sm:px-3 rounded-xl text-[11px] font-extrabold cursor-pointer border transition-colors shrink-0 ${
                driver?.online
                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  : 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'
              }`}
            >
              {driver?.online ? 'Offline' : 'Online'}
            </button>
          </div>
        </header>

        {/* Desktop Top Header Bar (md:) */}
        <header className="hidden md:flex bg-white border-b border-slate-200/80 px-6 lg:px-8 py-3.5 items-center justify-between sticky top-0 z-10 shadow-2xs">
          <div className="flex items-center gap-3">
            <DriverAvatarBadge driver={driver} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base text-slate-900">
                  {driver?.name || 'Portal Driver TumpangGo'}
                </h2>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-semibold text-slate-600">
                  {activeTab === 'dashboard' && 'Dashboard Tugas Pengantaran'}
                  {activeTab === 'history' && 'Riwayat & Rekapitulasi Ongkir'}
                  {activeTab === 'profile' && 'Profil Kurir & Pengaturan Akun'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                TumpangGo Driver • Real-time sync • Update: {lastRefreshedAt.toLocaleTimeString('id-ID')} WIB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 ${
                isRinging 
                  ? 'bg-rose-600 text-white border-rose-600 animate-bounce' 
                  : isMuted 
                    ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}
              title={isMuted ? 'Aktifkan Suara' : 'Senyapkan Suara'}
              aria-label="Pengaturan Suara Dering"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{isMuted ? 'Muted' : 'Suara Aktif'}</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className={`w-2 h-2 rounded-full ${driver?.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="font-semibold text-slate-700">
                {driver?.online ? 'Siap Antar Pesanan' : 'Mode Istirahat'}
              </span>
            </div>

            <button
              onClick={() => fetchDriverData(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
              <span>{isRefreshing ? 'Sinkronisasi...' : 'Sinkronkan'}</span>
            </button>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:pb-8 max-w-7xl w-full mx-auto space-y-4 sm:space-y-5">
          
          {/* PWA Install Banner */}
          <PWAInstallButton role="DRIVER" />

          {/* Web Push Background Notification Banner for Driver */}
          {isPushSupported && !isPushSubscribed && (
            <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm font-bold truncate">Pemberitahuan Tugas Pengantaran</span>
                  <span className="text-[11px] text-slate-300">Dapatkan getar & notifikasi suara saat pesanan kuliner siap dijemput di toko.</span>
                </div>
              </div>
              <button
                onClick={subscribePush}
                disabled={pushLoading}
                className="min-h-[40px] px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-all self-start sm:self-auto"
              >
                {pushLoading ? 'Mengaktifkan...' : 'Aktifkan Notifikasi'}
              </button>
            </div>
          )}

          {pushStatusMsg && (
            <div className="bg-slate-800 text-white text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-between shadow-xs">
              <span>{pushStatusMsg}</span>
              <button onClick={clearPushStatusMsg} className="text-slate-400 hover:text-white ml-2 text-xs">✕</button>
            </div>
          )}

          {/* Offline Alert Box if driver toggled offline */}
          {!driver?.online && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl text-xs flex items-start gap-3 shadow-xs">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex flex-col space-y-0.5">
                <span className="font-bold text-sm text-amber-900">Status Anda Sedang Offline (Mode Istirahat)</span>
                <span className="text-xs text-amber-800 leading-relaxed">
                  Aktifkan tombol <strong>ONLINE</strong> di atas agar sistem dapat menugaskan pesanan kuliner baru dan Anda dapat mengambil tugas siap jemput di toko.
                </span>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 1: DASHBOARD & TUGAS PENGANTARAN
              ========================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4 sm:space-y-5">
              
              {/* 4 Stat Cards in Responsive Grid (matching Merchant style) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                
                {/* 1. Tugas Saya */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Tugas Saya
                    </span>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Bike className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block font-mono">
                    {assignedOrders.length}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    Sedang diproses / diantar
                  </span>
                </div>

                {/* 2. Siap Jemput */}
                <div className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-colors ${
                  availableOrders.length > 0 ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200/90'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Siap Jemput
                    </span>
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center ${
                      availableOrders.length > 0 ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                  </div>
                  <span className={`text-xl sm:text-2xl font-black mt-1 block font-mono ${
                    availableOrders.length > 0 ? 'text-amber-700' : 'text-slate-900'
                  }`}>
                    {availableOrders.length}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    Bisa diambil di merchant
                  </span>
                </div>

                {/* 3. Pengantaran Selesai */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Selesai
                    </span>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block font-mono">
                    {totalCompletedCount}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    Total order berhasil diantar
                  </span>
                </div>

                {/* 4. Total Ongkir */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Total Ongkir
                    </span>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <DollarSign className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-base sm:text-xl lg:text-2xl text-emerald-800 block font-mono truncate font-black mt-1">
                    Rp {totalEarningsRp.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    Flat Rp 5.000 / pengantaran
                  </span>
                </div>

              </div>

              {/* Detail View of Selected Order */}
              {selectedOrderDetail ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Back Navigation Button */}
                  <button 
                    onClick={handleCloseDetail}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180 text-slate-400" />
                    <span>Kembali ke Daftar Tugas</span>
                  </button>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    
                    {/* Left Column (col-span-2): Order Details Card */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-xs space-y-4">
                      
                      {/* Order Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 font-mono">
                            #{selectedOrderDetail.orderNumber || selectedOrderDetail.id}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            ({new Date(selectedOrderDetail.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB)
                          </span>
                        </div>

                        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${
                          selectedOrderDetail.status === OrderStatus.READY_FOR_PICKUP 
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                            : selectedOrderDetail.status === OrderStatus.ORDER_PICKED_UP
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : selectedOrderDetail.status === OrderStatus.COOKING
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : selectedOrderDetail.status === OrderStatus.COMPLETED || selectedOrderDetail.status === OrderStatus.DELIVERED
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {selectedOrderDetail.status === OrderStatus.READY_FOR_PICKUP ? 'SIAP JEMPUT 🔔' :
                           selectedOrderDetail.status === OrderStatus.ORDER_PICKED_UP ? 'SEDANG DIANTAR 🛵' :
                           selectedOrderDetail.status === OrderStatus.COOKING ? 'SEDANG DIMASAK ⏳' :
                           selectedOrderDetail.status === OrderStatus.COMPLETED || selectedOrderDetail.status === OrderStatus.DELIVERED ? 'SELESAI DIANTAR ✅' :
                           selectedOrderDetail.status}
                        </span>
                      </div>

                      {/* Live Cooking Status & Countdown Banner for Driver */}
                      {selectedOrderDetail.status === OrderStatus.COOKING && (() => {
                        const detailCooking = calculateRemainingCooking(selectedOrderDetail, cookingNow);
                        return (
                          <div className={`p-4 rounded-2xl border-2 flex flex-col gap-2.5 transition-all shadow-xs ${
                            detailCooking.isExpired 
                              ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-100' 
                              : 'bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white border-blue-200'
                          }`}>
                            <div className="flex items-center justify-between border-b border-slate-100/80 pb-2">
                              <div className="flex items-center gap-2">
                                <ChefHat className={`w-4 h-4 ${detailCooking.isExpired ? 'text-amber-600' : 'text-blue-600 animate-pulse'}`} />
                                <span className={`text-xs font-extrabold uppercase tracking-wider ${
                                  detailCooking.isExpired ? 'text-amber-800' : 'text-blue-800'
                                }`}>
                                  {detailCooking.isExpired ? 'Estimasi Memasak Selesai' : 'Merchant Sedang Memasak'}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-900 text-white shadow-xs">
                                Estimasi {detailCooking.durationMinutes} Menit
                              </span>
                            </div>

                            <div className="flex items-baseline justify-between pt-1">
                              <div>
                                <span className="text-[10px] text-slate-500 font-semibold block">Waktu Memasak Tersisa:</span>
                                <div className={`font-mono text-3xl font-black tracking-tight ${
                                  detailCooking.isExpired ? 'text-amber-700' : 'text-slate-900'
                                }`}>
                                  {detailCooking.formattedRemaining}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-500 font-semibold block">Perkiraan Selesai:</span>
                                <span className="text-xs font-bold font-mono text-slate-800">
                                  pukul {detailCooking.estimatedEndTime}
                                </span>
                                {selectedOrderDetail.cookingStartedAt && (
                                  <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
                                    Mulai: {formatWibTime(selectedOrderDetail.cookingStartedAt)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-1000 ${
                                  detailCooking.isExpired ? 'bg-amber-500' : 'bg-blue-600'
                                }`}
                                style={{ width: `${detailCooking.percentElapsed}%` }}
                              />
                            </div>

                            <div className={`text-[11px] font-medium rounded-xl p-2.5 border leading-relaxed ${
                              detailCooking.isExpired 
                                ? 'bg-amber-100/70 border-amber-200 text-amber-900' 
                                : 'bg-blue-100/40 border-blue-200/60 text-blue-900'
                            }`}>
                              {detailCooking.isExpired ? (
                                <div className="flex items-start gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <span>Waktu estimasi telah tercapai. Menunggu konfirmasi toko untuk pesanan siap diambil kurir.</span>
                                </div>
                              ) : (
                                <div className="flex items-start gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                                  <span>Merchant sedang memasak — estimasi {detailCooking.durationMinutes} menit. Driver dapat memperkirakan waktu penjemputan ke toko.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Ready for Pickup Alert */}
                      {selectedOrderDetail.status === OrderStatus.READY_FOR_PICKUP && (
                        <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex items-center justify-between shadow-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black">
                              ✓
                            </div>
                            <div>
                              <span className="text-xs font-extrabold text-emerald-950 block">Makanan Siap Diambil!</span>
                              <span className="text-[11px] text-emerald-800">Toko telah selesai memasak &amp; mengemas pesanan. Silakan ambil pesanan.</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-700 text-white shadow-xs uppercase">
                            Siap Jemput
                          </span>
                        </div>
                      )}

                      {/* Merchant & Customer Steps */}
                      <div className="space-y-3">
                        {/* Step 1: Merchant Store */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <ShoppingBag className="w-3.5 h-3.5 text-emerald-700" />
                              Ambil di Toko / Merchant
                            </span>
                            <button
                              onClick={() => openMapsNavigation(selectedOrderDetail.merchantName, selectedOrderDetail.merchantName)}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Rute Toko
                            </button>
                          </div>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900">{selectedOrderDetail.merchantName}</h4>
                          <span className="text-[11px] text-slate-500 block">
                            Estimasi Memasak: {selectedOrderDetail.cookingDurationMinutes || selectedOrderDetail.cookingTimeMinutes || 15} menit
                          </span>
                        </div>

                        {/* Step 2: Customer Destination */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-sky-600" />
                              Antar ke Pemesan
                            </span>
                            <div className="flex items-center gap-2">
                              <a
                                href={`https://wa.me/${selectedOrderDetail.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Halo ${selectedOrderDetail.customerName}, saya kurir TumpangGo mengantarkan pesanan Anda.`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 flex items-center gap-1 hover:bg-emerald-100"
                              >
                                <MessageSquare className="w-3 h-3" />
                                WhatsApp
                              </a>
                              <a
                                href={`tel:${selectedOrderDetail.customerPhone}`}
                                className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-bold border border-sky-200 flex items-center gap-1 hover:bg-sky-100"
                              >
                                <Phone className="w-3 h-3" />
                                Telepon
                              </a>
                            </div>
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                            {selectedOrderDetail.customerName} ({selectedOrderDetail.customerPhone})
                          </span>
                          <p className="text-[11px] text-slate-600 leading-relaxed bg-white p-2.5 rounded-xl border border-slate-100">
                            <strong className="text-slate-800">Alamat:</strong> {selectedOrderDetail.deliveryAddress}
                            {selectedOrderDetail.landmark && (
                              <span className="block text-slate-500 mt-0.5 font-medium">
                                <strong className="text-slate-800">Patokan:</strong> {selectedOrderDetail.landmark}
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Ongkir & Items Summary */}
                        <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 flex justify-between items-center">
                          <div>
                            <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wider block">
                              Ongkir Kurir Flat Tumpang
                            </span>
                            <span className="text-xs text-slate-600 mt-0.5 block">
                              {selectedOrderDetail.items?.length || 0} item pesanan kuliner
                            </span>
                          </div>
                          <span className="text-base font-extrabold text-emerald-800 font-mono">
                            Rp {(selectedOrderDetail.deliveryFee || 5000).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      {/* Contextual Action Button Workflow */}
                      <div className="pt-2 border-t border-slate-100">
                        {/* CASE 0: Claimed by another driver */}
                        {selectedOrderDetail.driverId && selectedOrderDetail.driverId !== driver?.id && (
                          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex flex-col gap-2">
                            <div className="flex items-center gap-2 font-bold text-rose-900">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>Tugas Ini Telah Diambil Kurir Lain</span>
                            </div>
                            <p className="text-[11px] text-rose-700 leading-relaxed">
                              Pesanan ini telah diklaim oleh kurir lain. Anda dapat kembali ke daftar tugas untuk memilih pesanan lainnya.
                            </p>
                            <button
                              onClick={handleCloseDetail}
                              className="self-start min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                            >
                              Kembali ke Daftar Tugas
                            </button>
                          </div>
                        )}
                        
                        {/* CASE 1: Unassigned task -> Accept Task */}
                        {!selectedOrderDetail.driverId && (
                          <button
                            onClick={() => setConfirmAcceptOrder(selectedOrderDetail)}
                            disabled={actionLoading || !driver?.online}
                            className={`w-full min-h-[44px] py-3 font-extrabold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
                              !driver?.online
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                            }`}
                          >
                            <Bike className="w-4 h-4" />
                            <span>{!driver?.online ? 'Aktifkan Mode Online untuk Ambil Tugas' : 'Terima Tugas Pengantaran Ini 🛵'}</span>
                          </button>
                        )}

                        {/* CASE 2: Assigned task, waiting cooking -> Waiting indicator */}
                        {selectedOrderDetail.driverId === driver?.id && 
                         (selectedOrderDetail.status === OrderStatus.COOKING || selectedOrderDetail.status === OrderStatus.PAYMENT_VERIFIED) && (
                          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-xl text-xs flex flex-col items-center justify-center gap-1.5 text-center font-bold">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                              <span>Menunggu Makanan Selesai Dimasak oleh Toko...</span>
                            </div>
                            {selectedOrderDetail.status === OrderStatus.COOKING && (() => {
                              const c = calculateRemainingCooking(selectedOrderDetail, cookingNow);
                              return (
                                <span className="text-[11px] font-medium text-amber-800">
                                  Waktu memasak tersisa: <strong className="font-mono font-bold text-amber-900">{c.formattedRemaining}</strong> (Target selesai pukul {c.estimatedEndTime})
                                </span>
                              );
                            })()}
                          </div>
                        )}

                        {/* CASE 3: Assigned task & READY_FOR_PICKUP -> Confirm Pickup */}
                        {selectedOrderDetail.driverId === driver?.id && selectedOrderDetail.status === OrderStatus.READY_FOR_PICKUP && (
                          <button
                            onClick={() => handlePickUpOrder(selectedOrderDetail.id)}
                            disabled={actionLoading}
                            className="w-full min-h-[44px] py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span>Konfirmasi Pesanan Telah Diambil di Toko 📦</span>
                          </button>
                        )}

                        {/* CASE 4: Assigned task & ORDER_PICKED_UP -> Complete with Photo upload */}
                        {selectedOrderDetail.driverId === driver?.id && selectedOrderDetail.status === OrderStatus.ORDER_PICKED_UP && (
                          <form onSubmit={handleCompleteDelivery} className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-700 font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                                Unggah Foto Bukti Pengantaran
                              </span>
                              <span className="text-[10px] text-rose-600 font-bold">*Wajib</span>
                            </div>

                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleFileChange}
                              className="w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border border-dashed border-slate-300 rounded-xl p-2 bg-slate-50"
                            />

                            {(deliveryProofFile || deliveryProofUrl) && (
                              <div className="w-full h-36 bg-slate-900 rounded-xl overflow-hidden border border-slate-200 relative shadow-inner">
                                <img 
                                  src={deliveryProofFile || deliveryProofUrl} 
                                  alt="Bukti Pengantaran" 
                                  className="w-full h-full object-contain" 
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeliveryProofFile(null);
                                    setDeliveryProofUrl('');
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={uploadLoading || (!deliveryProofFile && !deliveryProofUrl)}
                              className={`w-full min-h-[44px] py-3 font-extrabold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
                                uploadLoading || (!deliveryProofFile && !deliveryProofUrl)
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{uploadLoading ? 'Menyimpan & Menyelesaikan...' : 'Selesaikan Pengantaran (Foto Terlampir) ✅'}</span>
                            </button>
                          </form>
                        )}

                        {/* CASE 5: Completed */}
                        {(selectedOrderDetail.status === OrderStatus.COMPLETED || selectedOrderDetail.status === OrderStatus.DELIVERED) && (
                          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Pengantaran Selesai Tercatat</span>
                            </div>
                            <span className="text-xs font-mono text-emerald-700 font-bold">
                              + Rp {(selectedOrderDetail.deliveryFee || 5000).toLocaleString('id-ID')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column (col-span-1): Interactive Map */}
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-rose-600" />
                          Peta Lokasi Pengantaran
                        </span>
                        <button
                          onClick={() => openMapsNavigation(selectedOrderDetail.deliveryAddress, selectedOrderDetail.customerName)}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Buka Google Maps
                        </button>
                      </div>

                      <div className="h-64 sm:h-72 w-full rounded-xl overflow-hidden relative border border-slate-200">
                        <MapPicker
                          readOnly={true}
                          markerLocations={[
                            { lat: selectedOrderDetail.latitude || -7.982, lng: selectedOrderDetail.longitude || 112.631, label: selectedOrderDetail.customerName, iconType: 'customer' },
                            { lat: -7.9482, lng: 112.7612, label: selectedOrderDetail.merchantName, iconType: 'merchant' }
                          ]}
                        />
                      </div>

                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Klik <strong>Buka Google Maps</strong> untuk panduan suara dan rute tercepat menuju lokasi pemesan di Kecamatan Tumpang.
                      </p>
                    </div>

                  </div>
                </div>
              ) : (
                /* Task List View with Segmented Filter */
                <div className="space-y-3.5">
                  
                  {/* Segmented Filter Pills */}
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto">
                    <button
                      onClick={() => setTaskFilter('all')}
                      className={`flex-1 min-h-[38px] py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        taskFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({assignedOrders.length + availableOrders.length})
                    </button>
                    <button
                      onClick={() => setTaskFilter('my')}
                      className={`flex-1 min-h-[38px] py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        taskFilter === 'my' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tugas Saya ({assignedOrders.length})
                    </button>
                    <button
                      onClick={() => setTaskFilter('available')}
                      className={`flex-1 min-h-[38px] py-1.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        taskFilter === 'available' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Siap Jemput ({availableOrders.length})
                    </button>
                  </div>

                  {/* Empty State */}
                  {displayedActiveOrders.length === 0 ? (
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center shadow-xs">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                        <ClipboardList className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-sm text-slate-800">Tidak Ada Tugas Pengantaran Saat Ini</h4>
                      <p className="text-slate-500 text-xs mt-1 max-w-sm leading-relaxed">
                        {taskFilter === 'available' 
                          ? 'Belum ada pesanan kuliner tanpa kurir yang siap dijemput di toko.' 
                          : 'Tetap aktifkan status ONLINE agar sistem dapat menugaskan pesanan kuliner baru kepada Anda.'}
                      </p>
                    </div>
                  ) : (
                    /* Responsive Cards Grid on Tablet/Desktop */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                      {displayedActiveOrders.map(order => {
                        const isAssignedToMe = order.driverId === driver?.id;
                        const cardCooking = calculateRemainingCooking(order, cookingNow);
                        return (
                          <div
                            key={order.id}
                            onClick={() => handleSelectOrder(order)}
                            className="bg-white border border-slate-200/90 hover:border-emerald-500/80 p-4 rounded-2xl shadow-xs transition-all cursor-pointer flex flex-col justify-between gap-3 group"
                          >
                            <div className="space-y-2.5">
                              {/* Card Header: Order # & Status Badge */}
                              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold text-slate-900">
                                    #{order.orderNumber || order.id}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>

                                {isAssignedToMe ? (
                                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border uppercase flex items-center gap-1 ${
                                    order.status === OrderStatus.READY_FOR_PICKUP 
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                      : order.status === OrderStatus.ORDER_PICKED_UP
                                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                                        : cardCooking.isExpired
                                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                                          : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}>
                                    {order.status === OrderStatus.READY_FOR_PICKUP ? 'SIAP JEMPUT 🔔' :
                                     order.status === OrderStatus.ORDER_PICKED_UP ? 'DIANTAR 🛵' :
                                     order.status === OrderStatus.COOKING ? (cardCooking.isExpired ? 'EST. SELESAI ⚠️' : `DIMASAK ${cardCooking.formattedRemaining} ⏳`) : order.status}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase">
                                    BISA DIAMBIL ⚡
                                  </span>
                                )}
                              </div>

                              {/* Store & Customer Details */}
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-slate-900 text-xs font-bold">
                                  <Store className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  <span className="truncate">{order.merchantName}</span>
                                </div>
                                <div className="flex items-start gap-2 text-slate-600 text-[11px]">
                                  <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                                  <span className="line-clamp-1">{order.customerName} ({order.deliveryAddress.split(',')[0]})</span>
                                </div>
                              </div>

                              {/* Cooking Countdown Strip (if cooking) */}
                              {order.status === OrderStatus.COOKING && (
                                <div className={`p-2.5 rounded-xl border text-[11px] flex flex-col gap-1 ${
                                  cardCooking.isExpired 
                                    ? 'bg-amber-50/90 border-amber-200 text-amber-900' 
                                    : 'bg-blue-50/70 border-blue-100 text-blue-900'
                                }`}>
                                  <div className="flex items-center justify-between font-bold">
                                    <span className="flex items-center gap-1.5">
                                      <ChefHat className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                      <span>Sedang Dimasak</span>
                                    </span>
                                    <span className="font-mono text-xs font-black">
                                      {cardCooking.formattedRemaining}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Ready Alert */}
                              {order.status === OrderStatus.READY_FOR_PICKUP && (
                                <div className="p-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-[11px] font-bold flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Makanan Siap Diambil di Toko</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Card Footer: Fee & Action Arrow */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 font-mono">
                                Rp {(order.deliveryFee || 5000).toLocaleString('id-ID')}
                              </span>
                              <div className="text-xs font-bold text-slate-600 group-hover:text-emerald-700 flex items-center gap-1 transition-colors">
                                <span>Lihat Detail</span>
                                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 transition-colors" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 2: RIWAYAT PENGANTARAN
              ========================================================================= */}
          {activeTab === 'history' && (
            <div className="space-y-4 sm:space-y-5">
              
              {/* Earnings Recap Card matching Merchant Style */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-emerald-400 font-extrabold tracking-wider uppercase block">
                    Total Pendapatan Ongkir Kurir
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black mt-1 font-mono">
                    Rp {totalEarningsRp.toLocaleString('id-ID')}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    {totalCompletedCount} tugas pengantaran kuliner berhasil diselesaikan se-Kecamatan Tumpang.
                  </p>
                </div>

                <div className="px-4 py-2 bg-white/10 rounded-xl backdrop-blur-xs border border-white/10 self-start sm:self-auto">
                  <span className="text-xs font-bold text-emerald-300">Tarif Flat Rp 5.000 / order</span>
                </div>
              </div>

              {historyOrders.length === 0 ? (
                <div className="bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center text-slate-500 text-xs shadow-xs">
                  Belum ada riwayat pengantaran yang diselesaikan.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                  {historyOrders.map(order => (
                    <div 
                      key={order.id} 
                      onClick={() => handleSelectOrder(order)}
                      className="bg-white border border-slate-200/90 hover:border-emerald-500/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3 cursor-pointer transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-2">
                          <span className="font-mono text-slate-600 text-[11px] font-bold">
                            #{order.orderNumber || order.id}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            SELESAI ✅
                          </span>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{order.merchantName}</h4>
                          <span className="text-[11px] text-slate-500 mt-0.5 block">
                            Pemesan: {order.customerName}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 block line-clamp-1">
                            {order.deliveryAddress}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-50 pt-2 text-xs">
                        <span className="text-xs font-extrabold text-emerald-700 font-mono">
                          Rp {(order.deliveryFee || 5000).toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 3: PROFIL KURIR & PENGATURAN AKUN
              ========================================================================= */}
          {activeTab === 'profile' && driver && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              
              {/* Left Column (col-span-2): Profil Kurir Card */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
                  <DriverAvatarBadge driver={driver} size="lg" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 inline-block mb-1">
                      Kurir Pengiriman Resmi
                    </span>
                    <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 truncate">
                      {driver.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {driver.phone}
                    </p>
                  </div>
                </div>

                {/* Account Details Information */}
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Nomor Pegawai (ID):</span>
                    <span className="font-bold text-slate-900 font-mono">{driver.id}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Wilayah Operasional:</span>
                    <span className="font-bold text-slate-900">Kecamatan Tumpang, Malang</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Status Kemitraan:</span>
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Aktif &amp; Terverifikasi
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Total Pengantaran Sukses:</span>
                    <span className="font-bold text-slate-900 font-mono">{totalCompletedCount} Order</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-500">Total Akumulasi Ongkir:</span>
                    <span className="font-bold text-emerald-800 font-mono">Rp {totalEarningsRp.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                {/* Logout Button */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    className="w-full min-h-[44px] py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Keluar dari Akun Driver</span>
                  </button>
                </div>
              </div>

              {/* Right Column (col-span-1): Panduan & Notifikasi */}
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-700" />
                    <h4 className="font-display font-bold text-sm text-slate-900">Standar Layanan Kurir</h4>
                  </div>
                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl leading-relaxed">
                      <strong>Cek Pesanan:</strong> Pastikan seluruh pesanan dan nota dari toko telah lengkap sebelum berangkat.
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl leading-relaxed">
                      <strong>Foto Bukti:</strong> Ambil foto jelas saat menyerahkan pesanan kepada pemesan atau di depan rumah penerima.
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl leading-relaxed">
                      <strong>Ongkir Flat:</strong> Seluruh tarif pengiriman kuliner flat Rp 5.000 se-Kecamatan Tumpang.
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Secret Master Portal Trigger Footer */}
          <footer className="mt-8 pt-6 pb-6 border-t border-slate-200/80 px-4 flex flex-col items-center justify-center text-center">
            <p 
              onClick={handleCopyrightClick}
              className="text-[11px] text-slate-400 font-normal select-none cursor-default"
            >
              © 2026 TumpangGo. All rights reserved.
            </p>

            {isUnlocked && (
              <HiddenPortalBar 
                currentPortal="DRIVER"
                onNavigatePortal={(portal) => {
                  if (onSelectRole) onSelectRole(portal);
                }}
                onLogout={onLogout}
                variant="light"
              />
            )}
          </footer>

        </main>
      </div>

      {/* =========================================================================
          MODAL: Confirm Accept Task
          ========================================================================= */}
      {confirmAcceptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-100 flex flex-col gap-3.5">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Bike className="w-4 h-4" />
              </div>
              <h4 className="font-display font-bold">Konfirmasi Terima Tugas</h4>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Anda akan mengambil tugas pengantaran dari toko <strong>{confirmAcceptOrder.merchantName}</strong> menuju pelanggan <strong>{confirmAcceptOrder.customerName}</strong>.
            </p>

            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs font-bold text-emerald-800 flex justify-between items-center">
              <span>Ongkir Diperoleh:</span>
              <span className="font-mono text-sm">Rp {(confirmAcceptOrder.deliveryFee || 5000).toLocaleString('id-ID')}</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmAcceptOrder(null)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleAcceptTask(confirmAcceptOrder.id)}
                disabled={actionLoading}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Menerima...' : 'Ya, Ambil Tugas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Confirm Logout
          ========================================================================= */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-100 flex flex-col gap-3.5">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </div>
              <h4 className="font-display font-bold">Keluar dari Portal Driver?</h4>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Pastikan Anda telah menyelesaikan tugas aktif sebelum keluar. Anda dapat login kembali sewaktu-waktu.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          BOTTOM NAVIGATION BAR (Mobile HP Only, < md)
          3 menu utama yang dapat disentuh dengan nyaman oleh jempol, dengan safe area support
          ========================================================================= */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200/90 shadow-lg px-2 sm:px-4 py-1 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] flex items-center justify-around select-none">
        {/* 1. Tugas (Dashboard) */}
        <button
          type="button"
          onClick={() => {
            handleCloseDetail();
            setActiveTab('dashboard');
          }}
          className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 relative cursor-pointer transition-colors ${
            activeTab === 'dashboard' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Bike className="w-5 h-5" />
          <span className="text-[10px]">Tugas</span>
          {(assignedOrders.length > 0 || availableOrders.length > 0) && (
            <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          )}
        </button>

        {/* 2. Riwayat */}
        <button
          type="button"
          onClick={() => {
            handleCloseDetail();
            setActiveTab('history');
          }}
          className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            activeTab === 'history' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px]">Riwayat</span>
        </button>

        {/* 3. Profil */}
        <button
          type="button"
          onClick={() => {
            handleCloseDetail();
            setActiveTab('profile');
          }}
          className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            activeTab === 'profile' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px]">Profil</span>
        </button>
      </nav>

    </div>
  );
}

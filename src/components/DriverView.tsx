import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Driver, Order, OrderStatus } from '../types.ts';
import MapPicker from './MapPicker.tsx';
import { compressImage } from '../utils/imageCompressor.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { 
  Navigation, ShoppingBag, Eye, Phone, MapPin, ClipboardList, 
  User, LogOut, Check, ChevronRight, X, Image, RefreshCw, AlertCircle,
  Clock, CheckCircle2, MessageSquare, ExternalLink, ShieldCheck, Bike,
  DollarSign
} from 'lucide-react';
import { useHiddenTrigger } from '../hooks/useHiddenTrigger.ts';
import HiddenPortalBar from './HiddenPortalBar.tsx';
import { useSEO } from '../hooks/useSEO.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { OfflineIndicator } from './OfflineIndicator.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

interface DriverViewProps {
  driverId: string;
  onLogout: () => void;
  onSelectRole?: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN') => void;
}

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile'>('dashboard');
  const [taskFilter, setTaskFilter] = useState<'all' | 'my' | 'available'>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);

  // Loading & Feedback
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

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

  // Fetch all driver data: profile, assigned tasks, available tasks
  // CRITICAL ARCHITECTURE: fetchDriverData depends ONLY on [driverId].
  // It NEVER depends on selectedOrder or selectedOrderId, avoiding infinite re-render loops.
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

      if (fetchId !== latestFetchIdRef.current) return;

      const safeOrders = Array.isArray(allOrders) ? allOrders : [];

      // Filter assigned active tasks
      const active = safeOrders.filter(o => 
        o && [
          OrderStatus.PAYMENT_VERIFIED,
          OrderStatus.COOKING,
          OrderStatus.READY_FOR_PICKUP,
          OrderStatus.ORDER_PICKED_UP
        ].includes(o.status)
      );
      setAssignedOrders(active);

      // Filter history orders
      const past = safeOrders.filter(o => 
        o && [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(o.status)
      );
      setHistoryOrders(past);

      // 3. Available Broadcast Tasks (unassigned orders ready for pickup or being cooked)
      const availRes = await fetch(`/api/drivers/${driverId}/available-orders`).catch(() => null);
      let parsedAvail: Order[] = [];
      if (availRes && availRes.ok) {
        const rawAvail = await availRes.json();
        parsedAvail = extractArrayResponse<Order>(rawAvail, 'orders');
        if (fetchId === latestFetchIdRef.current) {
          setAvailableOrders(Array.isArray(parsedAvail) ? parsedAvail : []);
        }
      }

      // 4. Stable Order Detail Synchronization (Zero Flicker, No Re-render Loop)
      const currentSelectedId = selectedOrderIdRef.current;
      if (currentSelectedId && fetchId === latestFetchIdRef.current) {
        let matching = active.find(o => o && o.id === currentSelectedId);
        if (!matching) {
          matching = past.find(o => o && o.id === currentSelectedId);
        }
        if (!matching && Array.isArray(parsedAvail)) {
          matching = parsedAvail.find(o => o && o.id === currentSelectedId);
        }

        if (matching) {
          setSelectedOrderDetail(prev => {
            if (prev && prev.id === matching!.id && 
                prev.status === matching!.status && 
                prev.updatedAt === matching!.updatedAt &&
                prev.driverId === matching!.driverId &&
                prev.paymentStatus === matching!.paymentStatus) {
              return prev;
            }
            return matching!;
          });
        } else {
          // If not in lists (e.g. claimed by another driver or status changed), query single order
          try {
            const singleRes = await fetch(`/api/orders/${currentSelectedId}`);
            if (singleRes.ok && fetchId === latestFetchIdRef.current) {
              const freshOrder: Order = await singleRes.json();
              setSelectedOrderDetail(prev => {
                if (prev && prev.id === freshOrder.id && 
                    prev.status === freshOrder.status && 
                    prev.updatedAt === freshOrder.updatedAt &&
                    prev.driverId === freshOrder.driverId &&
                    prev.paymentStatus === freshOrder.paymentStatus) {
                  return prev;
                }
                return freshOrder;
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      console.warn('[DriverView] Fetch data warning:', err?.message || err);
    } finally {
      if (fetchId === latestFetchIdRef.current) {
        isFirstMountRef.current = false;
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [driverId]);

  // Initial load & Polling (10s interval when window is active)
  useEffect(() => {
    fetchDriverData(false);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        fetchDriverData(true);
      }
    }, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        fetchDriverData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleVisibility);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [fetchDriverData]);

  // Toggle Driver Online / Offline status
  const toggleOnline = async () => {
    if (!driver || actionLoading) return;
    const toggled = !driver.online;
    setActionLoading(true);

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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
      } catch (err) {
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
    } catch (err) {
      showToast('Kendala jaringan saat menyelesaikan pesanan.', 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  // Helper to open Google Maps navigation to a specific query destination
  const openMapsNavigation = (address: string, name: string) => {
    const query = encodeURIComponent(`${name}, ${address}`);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
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

  if (loading) {
    return (
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col justify-center items-center font-sans p-6">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-700 text-sm mt-4 font-bold tracking-tight">Memuat Dashboard Driver...</p>
        <span className="text-slate-400 text-xs mt-1">Sinkronisasi data operasional TumpangGo</span>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-24 relative font-sans text-slate-800 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Offline Toast Banner */}
      <OfflineIndicator />

      {/* Floating In-App Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 left-4 right-4 max-w-md mx-auto z-[90] p-3.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200 ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-700/95 text-white border border-emerald-500/40' 
            : toastMessage.type === 'error'
              ? 'bg-rose-700/95 text-white border border-rose-500/40'
              : 'bg-slate-900/95 text-white border border-slate-700/40'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-300 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-sky-300 flex-shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <header className="bg-white px-4 py-3 sticky top-0 z-40 border-b border-slate-200 shadow-xs">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-extrabold shadow-xs">
              <Bike className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs text-slate-900 truncate max-w-[170px]">{driver?.name || 'Driver TumpangGo'}</span>
              <span className="text-[10px] text-emerald-700 font-extrabold tracking-wider uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Kurir Internal ({driver?.id || driverId})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchDriverData(false)}
              disabled={isRefreshing}
              title="Perbarui Data"
              className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 transition-all active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* Online / Offline Toggle */}
            <button 
              onClick={toggleOnline}
              disabled={actionLoading}
              className={`text-xs font-bold px-3 py-1.5 rounded-full shadow-xs transition-all flex items-center gap-1.5 ${
                driver?.online 
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95' 
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600 active:scale-95'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${driver?.online ? 'bg-emerald-200 animate-pulse' : 'bg-slate-400'}`}></span>
              <span>{driver?.online ? 'ONLINE' : 'OFFLINE'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-4 flex flex-col gap-4">

        {/* PWA Install Banner */}
        <PWAInstallButton />

        {/* TAB 1: DASHBOARD / TUGAS */}
        {activeTab === 'dashboard' && (
          <div className="flex flex-col gap-4">
            
            {/* Offline Alert Box if driver toggled offline */}
            {!driver?.online && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-2xl text-xs flex items-start gap-2.5 shadow-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold">Status Anda Sedang Offline</span>
                  <span className="text-[11px] text-amber-800 mt-0.5">
                    Aktifkan tombol ONLINE di kanan atas agar sistem dapat menugaskan pesanan baru dan Anda dapat menerima tugas siap jemput.
                  </span>
                </div>
              </div>
            )}

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white border border-slate-200 p-3 rounded-2xl flex flex-col shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tugas Aktif</span>
                <span className="text-lg font-extrabold text-slate-900 mt-0.5">{assignedOrders.length}</span>
              </div>
              <div className="bg-white border border-slate-200 p-3 rounded-2xl flex flex-col shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Siap Jemput</span>
                <span className="text-lg font-extrabold text-emerald-600 mt-0.5">{availableOrders.length}</span>
              </div>
              <div className="bg-white border border-slate-200 p-3 rounded-2xl flex flex-col shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Selesai</span>
                <span className="text-lg font-extrabold text-slate-700 mt-0.5">{totalCompletedCount}</span>
              </div>
            </div>

            {/* Selected Single Order Detailed View */}
            {selectedOrderDetail ? (
              <div className="flex flex-col gap-3.5 animate-in fade-in duration-200">
                {/* Back Button */}
                <button 
                  onClick={handleCloseDetail}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 self-start bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs transition-colors active:scale-95"
                >
                  <ChevronRight className="w-4 h-4 rotate-180 text-slate-400" />
                  <span>Kembali ke Daftar Tugas</span>
                </button>

                {/* Map View & Fast Directions */}
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      Peta Lokasi Pengantaran
                    </span>
                    <button
                      onClick={() => openMapsNavigation(selectedOrderDetail.deliveryAddress, selectedOrderDetail.customerName)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 active:scale-95"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Buka Google Maps
                    </button>
                  </div>

                  <div className="h-52 w-full rounded-xl overflow-hidden relative border border-slate-100">
                    <MapPicker
                      readOnly={true}
                      markerLocations={[
                        { lat: selectedOrderDetail.latitude || -7.982, lng: selectedOrderDetail.longitude || 112.631, label: selectedOrderDetail.customerName, iconType: 'customer' },
                        { lat: -7.9482, lng: 112.7612, label: selectedOrderDetail.merchantName, iconType: 'merchant' }
                      ]}
                    />
                  </div>
                </div>

                {/* Order Details Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3.5">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 font-mono">#{selectedOrderDetail.orderNumber || selectedOrderDetail.id}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({new Date(selectedOrderDetail.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})</span>
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

                  {/* Merchant & Customer Directions info */}
                  <div className="flex flex-col gap-3">
                    {/* Merchant Step */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5 text-rose-500" />
                          Ambil di Toko / Merchant
                        </span>
                        <button
                          onClick={() => openMapsNavigation(selectedOrderDetail.merchantName, selectedOrderDetail.merchantName)}
                          className="text-[10px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 active:scale-95"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Rute Toko
                        </button>
                      </div>
                      <span className="text-xs font-bold text-slate-900">{selectedOrderDetail.merchantName}</span>
                      <span className="text-[11px] text-slate-500">Estimasi Memasak: {selectedOrderDetail.cookingTimeMinutes || 25} menit</span>
                    </div>

                    {/* Customer Destination Step */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-sky-600" />
                          Antar ke Pemesan
                        </span>
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://wa.me/${selectedOrderDetail.customerPhone.replace(/\D/g, '')}?text=Halo%20${encodeURIComponent(selectedOrderDetail.customerName)},%20saya%20kurir%20TumpangGo%20mengantarkan%20pesanan%20Anda.`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 hover:bg-emerald-100"
                          >
                            <MessageSquare className="w-2.5 h-2.5" />
                            WhatsApp
                          </a>
                          <a
                            href={`tel:${selectedOrderDetail.customerPhone}`}
                            className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-bold border border-sky-200 flex items-center gap-1 hover:bg-sky-100"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            Telepon
                          </a>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-900">{selectedOrderDetail.customerName} ({selectedOrderDetail.customerPhone})</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed bg-white p-2 rounded-lg border border-slate-100 mt-0.5">
                        <span className="font-semibold text-slate-800">Alamat:</span> {selectedOrderDetail.deliveryAddress}
                        {selectedOrderDetail.landmark && (
                          <span className="block text-slate-500 mt-0.5 font-medium"><span className="font-semibold text-slate-800">Patokan:</span> {selectedOrderDetail.landmark}</span>
                        )}
                      </p>
                    </div>

                    {/* Items & Delivery Fee Summary */}
                    <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/60 flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wider">Ongkir Kurir (Kecamatan Tumpang)</span>
                        <span className="text-xs text-slate-600 mt-0.5">{selectedOrderDetail.items?.length || 0} item menu makanan</span>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-700">
                        Rp {(selectedOrderDetail.deliveryFee || 5000).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* ACTION BUTTON WORKFLOW - Single Contextual Action */}
                  <div className="pt-2 border-t border-slate-100">

                    {/* CASE 0: Claimed by another driver */}
                    {selectedOrderDetail.driverId && selectedOrderDetail.driverId !== driver?.id && (
                      <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex flex-col gap-2">
                        <div className="flex items-center gap-2 font-bold text-rose-900">
                          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                          <span>Tugas Ini Telah Diambil Kurir Lain</span>
                        </div>
                        <p className="text-[11px] text-rose-700 leading-relaxed">
                          Pesanan ini telah diklaim oleh kurir {selectedOrderDetail.driverName || selectedOrderDetail.driverId}. Anda dapat kembali ke daftar tugas untuk memilih pesanan lainnya.
                        </p>
                        <button
                          onClick={handleCloseDetail}
                          className="self-start mt-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors active:scale-95"
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
                        className={`w-full py-3.5 font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 ${
                          !driver?.online
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98]'
                        }`}
                      >
                        <Bike className="w-4 h-4" />
                        <span>{!driver?.online ? 'Aktifkan Online untuk Ambil Tugas' : 'Terima Tugas Pengantaran Ini 🛵'}</span>
                      </button>
                    )}

                    {/* CASE 2: Assigned task, waiting cooking -> Waiting indicator */}
                    {selectedOrderDetail.driverId === driver?.id && 
                     (selectedOrderDetail.status === OrderStatus.COOKING || selectedOrderDetail.status === OrderStatus.PAYMENT_VERIFIED) && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs flex items-center justify-center gap-2 text-center font-bold">
                        <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                        <span>Menunggu Makanan Selesai Dimasak oleh Toko...</span>
                      </div>
                    )}

                    {/* CASE 3: Assigned task & READY_FOR_PICKUP -> Confirm Pickup */}
                    {selectedOrderDetail.driverId === driver?.id && selectedOrderDetail.status === OrderStatus.READY_FOR_PICKUP && (
                      <button
                        onClick={() => handlePickUpOrder(selectedOrderDetail.id)}
                        disabled={actionLoading}
                        className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Konfirmasi Pesanan Telah Diambil di Toko 📦</span>
                      </button>
                    )}

                    {/* CASE 4: Assigned task & ORDER_PICKED_UP -> Complete with Photo upload */}
                    {selectedOrderDetail.driverId === driver?.id && selectedOrderDetail.status === OrderStatus.ORDER_PICKED_UP && (
                      <form onSubmit={handleCompleteDelivery} className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-700 font-extrabold uppercase tracking-wide flex items-center gap-1">
                            <Image className="w-3.5 h-3.5 text-rose-500" />
                            Upload Foto Bukti Pengantaran
                          </span>
                          <span className="text-[10px] text-rose-600 font-bold">*Wajib</span>
                        </div>

                        {/* File Upload Trigger */}
                        <div className="flex flex-col gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileChange}
                            className="w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border border-dashed border-slate-300 rounded-xl p-2 bg-slate-50"
                          />

                          {/* Fallback URL input */}
                          <input
                            type="text"
                            value={deliveryProofUrl}
                            onChange={(e) => {
                              setDeliveryProofUrl(e.target.value);
                              setDeliveryProofFile(null);
                            }}
                            placeholder="Atau tautan foto bukti pengantaran..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* Photo Preview */}
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
                              className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded-full hover:bg-black/80"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={uploadLoading || (!deliveryProofFile && !deliveryProofUrl)}
                          className={`w-full py-3.5 font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 ${
                            uploadLoading || (!deliveryProofFile && !deliveryProofUrl)
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98]'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{uploadLoading ? 'Menyimpan & Menyelesaikan...' : 'Selesaikan Pengantaran (Foto Terlampir) ✅'}</span>
                        </button>
                      </form>
                    )}

                    {/* CASE 5: Already completed or delivered */}
                    {(selectedOrderDetail.status === OrderStatus.COMPLETED || selectedOrderDetail.status === OrderStatus.DELIVERED) && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Pengantaran Selesai Tercatat</span>
                        </div>
                        <span className="text-[11px] font-mono text-emerald-700 font-bold">
                          + Rp {(selectedOrderDetail.deliveryFee || 5000).toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Task List View with Filter Tabs
              <div className="flex flex-col gap-3">
                
                {/* Filter Pills */}
                <div className="flex items-center gap-2 bg-slate-200/70 p-1 rounded-xl">
                  <button
                    onClick={() => setTaskFilter('all')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      taskFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({assignedOrders.length + availableOrders.length})
                  </button>
                  <button
                    onClick={() => setTaskFilter('my')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      taskFilter === 'my' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tugas Saya ({assignedOrders.length})
                  </button>
                  <button
                    onClick={() => setTaskFilter('available')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      taskFilter === 'available' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Siap Jemput ({availableOrders.length})
                  </button>
                </div>

                {/* Empty State */}
                {displayedActiveOrders.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center shadow-xs">
                    <ClipboardList className="w-10 h-10 text-slate-300" />
                    <h5 className="font-bold text-xs text-slate-700 mt-3">Tidak Ada Tugas Saat Ini</h5>
                    <p className="text-slate-400 text-[11px] mt-1 max-w-[240px]">
                      {taskFilter === 'available' 
                        ? 'Belum ada pesanan tanpa kurir yang siap dijemput.' 
                        : 'Tetap aktifkan status ONLINE untuk menerima penugasan baru dari sistem.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {displayedActiveOrders.map(order => {
                      const isAssignedToMe = order.driverId === driver?.id;
                      return (
                        <div
                          key={order.id}
                          onClick={() => handleSelectOrder(order)}
                          className="bg-white border border-slate-200 hover:border-emerald-300 p-3.5 rounded-2xl shadow-xs transition-all cursor-pointer flex flex-col gap-2.5 active:scale-[0.99]"
                        >
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-slate-900">#{order.orderNumber || order.id}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isAssignedToMe ? (
                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border uppercase ${
                                  order.status === OrderStatus.READY_FOR_PICKUP 
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                    : order.status === OrderStatus.ORDER_PICKED_UP
                                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}>
                                  {order.status === OrderStatus.READY_FOR_PICKUP ? 'SIAP JEMPUT 🔔' :
                                   order.status === OrderStatus.ORDER_PICKED_UP ? 'DIANTAR 🛵' :
                                   order.status === OrderStatus.COOKING ? 'DIMASAK ⏳' : order.status}
                                </span>
                              ) : (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                                  BISA DIAMBIL ⚡
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                          </div>

                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1 text-slate-800 text-xs font-bold truncate">
                                <ShoppingBag className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                                <span className="truncate">{order.merchantName}</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-500 text-[11px] mt-1 truncate">
                                <MapPin className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                                <span className="truncate">{order.customerName} ({order.deliveryAddress.split(',')[0]})</span>
                              </div>
                            </div>

                            <span className="text-xs font-extrabold text-emerald-700 flex-shrink-0 bg-emerald-50/80 px-2 py-1 rounded-lg border border-emerald-100">
                              Rp {(order.deliveryFee || 5000).toLocaleString('id-ID')}
                            </span>
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

        {/* TAB 2: RIWAYAT PENGIRIMAN */}
        {activeTab === 'history' && (
          <div className="flex flex-col gap-3.5">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-800">Riwayat Pengiriman Selesai</h3>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                {totalCompletedCount} Pengantaran
              </span>
            </div>

            {/* Earnings Summary Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-emerald-400 font-extrabold tracking-wider uppercase">Total Ongkir Terkumpul</span>
                <span className="text-xl font-extrabold mt-0.5">Rp {totalEarningsRp.toLocaleString('id-ID')}</span>
                <span className="text-[10px] text-slate-400 mt-1">Tarif flat Rp 5.000 / pengantaran Kec. Tumpang</span>
              </div>
              <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-xs">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
            </div>

            {historyOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs shadow-xs">
                Belum ada riwayat pengantaran yang diselesaikan.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {historyOrders.map(order => (
                  <div 
                    key={order.id} 
                    onClick={() => handleSelectOrder(order)}
                    className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono text-slate-500 text-[11px] font-bold">#{order.orderNumber || order.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        order.status === OrderStatus.COMPLETED || order.status === OrderStatus.DELIVERED
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {order.status === OrderStatus.COMPLETED || order.status === OrderStatus.DELIVERED ? 'SELESAI ✅' : order.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-end border-t border-slate-50 pt-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-900">{order.merchantName}</span>
                        <span className="text-[11px] text-slate-500 mt-0.5">Pemesan: {order.customerName}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-extrabold text-emerald-700">Rp {(order.deliveryFee || 5000).toLocaleString('id-ID')}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROFIL DRIVER */}
        {activeTab === 'profile' && driver && (
          <div className="flex flex-col gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-center text-emerald-700 font-extrabold text-base shadow-xs">
                  <User className="w-6 h-6 text-emerald-700" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Kurir Logistik</span>
                  <h3 className="font-bold text-base text-slate-900 mt-0.5 truncate">{driver.name}</h3>
                  <span className="text-xs text-slate-500">{driver.phone}</span>
                </div>
              </div>

              {/* Account Details */}
              <div className="flex flex-col gap-2.5 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span>Nomor Pegawai (ID):</span>
                  <span className="font-bold text-slate-900 font-mono">{driver.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span>Wilayah Operasional:</span>
                  <span className="font-bold text-slate-900">Kecamatan Tumpang</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span>Status Kemitraan:</span>
                  <span className="font-bold text-emerald-700">Aktif & Terverifikasi</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Total Pengantaran Sukses:</span>
                  <span className="font-bold text-slate-900">{totalCompletedCount} Order</span>
                </div>
              </div>

              {/* Logout Button */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <LogOut className="w-4 h-4 text-rose-600" />
                  <span>Keluar dari Akun Driver</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Secret Master Portal Trigger Footer */}
        <footer className="mt-8 pt-4 pb-20 border-t border-slate-200/60 px-4 flex flex-col items-center justify-center text-center">
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

      {/* MODAL: Confirm Accept Task */}
      {confirmAcceptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl flex flex-col gap-3">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Bike className="w-4 h-4 text-emerald-600" />
              Konfirmasi Terima Tugas
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anda akan mengambil tugas pengantaran dari toko <strong>{confirmAcceptOrder.merchantName}</strong> menuju pelanggan <strong>{confirmAcceptOrder.customerName}</strong>.
            </p>
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs font-bold text-emerald-800 flex justify-between">
              <span>Ongkir Diperoleh:</span>
              <span>Rp {(confirmAcceptOrder.deliveryFee || 5000).toLocaleString('id-ID')}</span>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setConfirmAcceptOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleAcceptTask(confirmAcceptOrder.id)}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-sm"
              >
                {actionLoading ? 'Menerima...' : 'Ya, Ambil Tugas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl flex flex-col gap-3">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <LogOut className="w-4 h-4 text-rose-600" />
              Keluar dari Portal Driver?
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pastikan Anda telah menyelesaikan tugas aktif sebelum keluar. Anda dapat login kembali sewaktu-waktu.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-sm"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 flex justify-around p-2 z-40 shadow-lg">
        <button
          onClick={() => {
            handleCloseDetail();
            setActiveTab('dashboard');
          }}
          className={`flex flex-col items-center gap-1 text-xs font-bold py-1 px-3 rounded-xl transition-all ${
            activeTab === 'dashboard' ? 'text-emerald-700 bg-emerald-50/80' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Navigation className="w-5 h-5 rotate-45" />
          <span>Tugas</span>
        </button>

        <button
          onClick={() => {
            handleCloseDetail();
            setActiveTab('history');
          }}
          className={`flex flex-col items-center gap-1 text-xs font-bold py-1 px-3 rounded-xl transition-all ${
            activeTab === 'history' ? 'text-emerald-700 bg-emerald-50/80' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span>Riwayat</span>
        </button>

        <button
          onClick={() => {
            handleCloseDetail();
            setActiveTab('profile');
          }}
          className={`flex flex-col items-center gap-1 text-xs font-bold py-1 px-3 rounded-xl transition-all ${
            activeTab === 'profile' ? 'text-emerald-700 bg-emerald-50/80' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span>Profil</span>
        </button>
      </nav>
    </div>
  );
}

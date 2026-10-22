/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Merchant Portal
 * Dashboard operasional mitra toko & resto: manajemen pesanan dapur,
 * katalog menu & kategori, profil toko & QRIS statis, serta settlement.
 * 
 * Mobile-First, Real-time Auto-Refresh, Clean RBAC & Single Source of Truth.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Merchant, MenuItem, Category, Order, OrderStatus, PaymentStatus, Settlement, SettlementStatus 
} from '../types.ts';
import { compressImage } from '../utils/imageCompressor.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import { 
  Store, ClipboardList, Utensils, TrendingUp, Clock, DollarSign, 
  Settings, LogOut, Plus, Check, X, Edit, Trash2, Layers,
  Phone, MapPin, AlertCircle, ChefHat, PackageCheck, RefreshCw, Upload,
  QrCode, ZoomIn, Receipt, Search, ExternalLink, ArrowRight, ShieldCheck,
  CheckCircle2, AlertTriangle, Eye, Calendar, Volume2, VolumeX, Bell, BellRing, BellOff
} from 'lucide-react';
import { useHiddenTrigger } from '../hooks/useHiddenTrigger.ts';
import HiddenPortalBar from './HiddenPortalBar.tsx';
import EReceiptModal from './EReceiptModal.tsx';
import { useSEO } from '../hooks/useSEO.ts';
import { 
  calculateRemainingCooking, 
  ALLOWED_COOKING_DURATIONS,
  CookingDurationMinutes,
  formatWibTime
} from '../utils/cookingTimer.ts';
import { useCookingTicker } from '../hooks/useCookingCountdown.ts';
import { useOrderRingtone } from '../hooks/useOrderRingtone.ts';

function MerchantCookingCard({
  order,
  nowTimestamp,
  isCompleting,
  onSetReady
}: {
  order: Order;
  nowTimestamp: number;
  isCompleting: boolean;
  onSetReady: (orderId: string) => void;
}) {
  const timer = calculateRemainingCooking(order, nowTimestamp);

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden flex flex-col justify-between transition-all ${
      timer.isExpired ? 'border-amber-400 ring-2 ring-amber-100' : 'border-blue-200 hover:shadow-md'
    }`}>
      <div>
        {/* Header with Cooking Timer */}
        <div className={`p-4 border-b flex items-center justify-between ${
          timer.isExpired ? 'bg-amber-50/90 border-amber-200' : 'bg-blue-50/70 border-blue-100'
        }`}>
          <div>
            <span className="font-mono text-xs font-extrabold text-slate-900">
              #{order.orderNumber || order.id}
            </span>
            <span className="block text-[10px] text-slate-500">
              Masuk: {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold shadow-xs">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>{timer.durationMinutes} Menit Masak</span>
          </div>
        </div>

        {/* Live Countdown Display */}
        <div className={`p-4 border-b ${
          timer.isExpired ? 'bg-amber-100/50 border-amber-200' : 'bg-gradient-to-br from-blue-500/5 to-indigo-500/5 border-slate-100'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
              timer.isExpired ? 'text-amber-800' : 'text-blue-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                timer.isExpired ? 'bg-amber-500 animate-ping' : 'bg-blue-600 animate-pulse'
              }`} />
              {timer.isExpired ? 'Estimasi Selesai (Perlu Konfirmasi)' : 'Sedang Dimasak di Dapur'}
            </span>
            <span className="text-[10px] font-bold text-slate-500 font-mono">
              Target: {timer.estimatedEndTime}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className={`font-mono text-3xl font-black tracking-tight ${
              timer.isExpired ? 'text-amber-700' : 'text-slate-900'
            }`}>
              {timer.formattedRemaining}
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-500 font-medium block">
                {timer.isExpired ? 'Waktu estimasi habis' : 'sisa estimasi'}
              </span>
              {order.cookingStartedAt && (
                <span className="text-[10px] text-slate-400 font-mono">
                  Mulai: {formatWibTime(order.cookingStartedAt)}
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200/80 rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                timer.isExpired ? 'bg-amber-500' : 'bg-blue-600'
              }`}
              style={{ width: `${timer.percentElapsed}%` }}
            />
          </div>

          {timer.isExpired && (
            <div className="mt-2 text-[11px] text-amber-800 font-medium bg-amber-50 rounded-lg p-2.5 border border-amber-200/70 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>Waktu estimasi telah tercapai. Jika pesanan sudah siap dan dikemas, klik tombol <strong>"Makanan Siap Diambil"</strong> di bawah untuk memanggil kurir penjemput.</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="p-4 space-y-3.5">
          <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Item yang Sedang Dimasak:
            </span>
            {order.items.map((it, idx) => (
              <div key={idx} className="flex justify-between text-xs text-slate-800">
                <span className="font-medium">
                  <strong className="text-blue-700 font-bold mr-1">{it.quantity}x</strong> 
                  {it.name}
                </span>
                <span className="font-mono font-semibold text-slate-600">
                  Rp {(it.price * it.quantity).toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>

          {/* Customer & Delivery Destination */}
          <div className="text-xs space-y-1 pt-1">
            <div className="flex items-center justify-between text-slate-700">
              <span className="font-semibold text-slate-900">{order.customerName}</span>
              <span className="font-mono text-[11px] text-slate-500">{order.customerPhone}</span>
            </div>
            <p className="text-[11px] text-slate-500 line-clamp-1">{order.deliveryAddress}</p>
          </div>

          {/* Subtotal */}
          <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Subtotal Makanan:</span>
            <span className="font-mono font-extrabold text-sm text-emerald-800">
              Rp {order.subtotal.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Action Button: Selesai Masak & Siap Diambil */}
      <div className="p-4 bg-slate-50 border-t border-slate-100">
        <button
          onClick={() => onSetReady(order.id)}
          disabled={isCompleting}
          className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all ${
            timer.isExpired 
              ? 'bg-amber-600 hover:bg-amber-700 text-white' 
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          } disabled:opacity-50`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>{isCompleting ? 'Memperbarui...' : 'Makanan Siap Diambil'}</span>
        </button>
      </div>
    </div>
  );
}

interface MerchantViewProps {
  merchantId: string;
  onLogout: () => void;
  onSelectRole?: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN') => void;
}

export type MerchantTab = 'dashboard' | 'incoming' | 'cooking' | 'history' | 'menu' | 'profile';

export default function MerchantView({ merchantId: rawMerchantId, onLogout, onSelectRole }: MerchantViewProps) {
  useSEO({
    title: 'Portal Merchant – TumpangGo Internal',
    isNoIndex: true
  });
  const { isUnlocked, handleCopyrightClick } = useHiddenTrigger();

  // Effective merchant ID with resilient fallback
  const [effectiveMerchantId, setEffectiveMerchantId] = useState<string>(() => {
    return rawMerchantId || safeStorage.getItem('tumpang_active_merchant_id') || '';
  });

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  
  // Primary Tabs: 'dashboard' | 'incoming' | 'cooking' | 'history' | 'menu' | 'profile'
  const [activeTab, setActiveTab] = useState<MerchantTab>('incoming');
  
  // History tab sub-filter
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'READY_OR_DELIVERY' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // Incoming tab: show pending verification accordion
  const [showPendingVerification, setShowPendingVerification] = useState(false);

  // QRIS Management States
  const [qrisImageFile, setQrisImageFile] = useState<string | null>(null);
  const [isUploadingQris, setIsUploadingQris] = useState<boolean>(false);
  const [qrisUploadMsg, setQrisUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [zoomQrisImage, setZoomQrisImage] = useState<string | null>(null);

  // E-Receipt modal viewer
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [cookEstimateInput, setCookEstimateInput] = useState<Record<string, number>>({});
  const [rejectModal, setRejectModal] = useState<{ orderId: string; visible: boolean; reason: string } | null>(null);
  const [actionLoadingOrderId, setActionLoadingOrderId] = useState<string | null>(null);
  const cookingNow = useCookingTicker();
  const {
    isRinging,
    isMuted,
    isAudioUnlocked,
    activeAlertOrderId,
    dismissAlert,
    toggleMute,
    testRingtone,
    unlockAudio
  } = useOrderRingtone(orders);

  // Menu editor states
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('ALL');
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  // Profil Form
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileOwner, setProfileOwner] = useState('');
  const [profileBankName, setProfileBankName] = useState('');
  const [profileBankAccount, setProfileBankAccount] = useState('');
  const [profileBankHolder, setProfileBankHolder] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileOpenTime, setProfileOpenTime] = useState('08:00');
  const [profileCloseTime, setProfileCloseTime] = useState('21:00');
  const [profileCategory, setProfileCategory] = useState('Nasi & Lauk');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  // Ref to track component mount status for polling
  const isMountedRef = useRef(true);

  // Resolve merchant ID on mount if empty
  useEffect(() => {
    isMountedRef.current = true;
    if (rawMerchantId && rawMerchantId.trim().length > 0) {
      setEffectiveMerchantId(rawMerchantId.trim());
      safeStorage.setItem('tumpang_active_merchant_id', rawMerchantId.trim());
    } else {
      // Fetch /api/auth/me to identify logged-in merchant
      fetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.user?.entityId || data?.user?.id) {
            const foundId = data.user.entityId || data.user.id;
            setEffectiveMerchantId(foundId);
            safeStorage.setItem('tumpang_active_merchant_id', foundId);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [rawMerchantId]);

  // Initial fetch and auto-refresh polling interval
  useEffect(() => {
    if (!effectiveMerchantId) return;

    fetchMerchantData(false);

    // Auto-refresh polling every 8 seconds to catch incoming orders verified by admin
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        fetchMerchantData(true);
      }
    }, 8000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [effectiveMerchantId]);

  const fetchMerchantData = async (isBackground = false) => {
    if (!effectiveMerchantId) return;
    if (!isBackground) setLoading(true);
    else setIsRefreshing(true);

    try {
      const [profRes, ordRes, menuRes, catRes, setRes] = await Promise.all([
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/orders`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/categories`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/settlements`).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      if (!isMountedRef.current) return;

      if (profRes && profRes.id) {
        setMerchant(profRes);
        setProfileName(profRes.name || '');
        setProfilePhone(profRes.phone || '');
        setProfileOwner(profRes.ownerName || '');
        setProfileBankName(profRes.bankName || '');
        setProfileBankAccount(profRes.bankAccount || '');
        setProfileBankHolder(profRes.bankHolder || '');
        setProfileDesc(profRes.description || '');
        setProfileOpenTime(profRes.openTime || '08:00');
        setProfileCloseTime(profRes.closeTime || '21:00');
        setProfileCategory(profRes.category || 'Nasi & Lauk');
      }

      setOrders(extractArrayResponse<Order>(ordRes, 'orders'));
      setMenuItems(extractArrayResponse<MenuItem>(menuRes, 'menuItems'));
      setCategories(extractArrayResponse<Category>(catRes, 'categories'));
      setSettlements(extractArrayResponse<Settlement>(setRes, 'settlements'));
      setLastRefreshedAt(new Date());
    } catch (e) {
      console.error('[MerchantView] Gagal mengambil data toko:', e);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const toggleOpenStatus = async () => {
    if (!merchant || !effectiveMerchantId) return;
    const newStatus = !merchant.active;
    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newStatus, role: 'MERCHANT', userId: effectiveMerchantId })
      });
      if (res.ok) {
        const updated = await res.json();
        setMerchant(updated);
      }
    } catch (e) {
      console.error('[MerchantView] Gagal memperbarui status buka toko:', e);
    }
  };

  // --- ORDER ACTIONS ---
  const acceptOrder = async (orderId: string) => {
    const cookTime = cookEstimateInput[orderId] || 15;
    if (actionLoadingOrderId) return;
    setActionLoadingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.COOKING, 
          cookingDurationMinutes: cookTime,
          cookingTimeMinutes: cookTime,
          role: 'MERCHANT',
          userId: effectiveMerchantId
        })
      });
      if (res.ok) {
        await fetchMerchantData(true);
        setActiveTab('cooking');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal memulai proses memasak pesanan.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kendala jaringan saat menerima pesanan.');
    } finally {
      setActionLoadingOrderId(null);
    }
  };

  const setOrderReady = async (orderId: string) => {
    if (actionLoadingOrderId) return;
    setActionLoadingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.READY_FOR_PICKUP,
          role: 'MERCHANT',
          userId: effectiveMerchantId
        })
      });
      if (res.ok) {
        await fetchMerchantData(true);
        setActiveTab('history');
        setHistoryFilter('READY_OR_DELIVERY');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal mengubah status pesanan siap diambil.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kendala jaringan saat memperbarui pesanan.');
    } finally {
      setActionLoadingOrderId(null);
    }
  };

  const rejectOrder = async (orderId: string, reason: string) => {
    if (!reason || !reason.trim()) {
      alert('Alasan penolakan pesanan wajib diisi.');
      return;
    }
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.CANCELLED, 
          cancelReason: reason.trim(),
          role: 'MERCHANT',
          userId: effectiveMerchantId
        })
      });
      if (res.ok) {
        setRejectModal(null);
        await fetchMerchantData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal menolak pesanan.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kendala jaringan saat menolak pesanan.');
    }
  };

  // --- MENU ITEM ACTIONS ---
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name || !editingItem?.price || !editingItem?.categoryId) {
      alert('Mohon isi nama menu, harga, dan kategori');
      return;
    }

    const url = editingItem.id 
      ? `/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu/${editingItem.id}` 
      : `/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu`;
    
    const method = editingItem.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingItem,
          price: Number(editingItem.price),
          available: editingItem.available !== undefined ? editingItem.available : true
        })
      });
      if (res.ok) {
        setShowItemForm(false);
        setEditingItem(null);
        fetchMerchantData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal menyimpan menu makanan.');
      }
    } catch (e: any) {
      alert(e.message || 'Terjadi kendala saat menyimpan menu.');
    }
  };

  const toggleItemAvailability = async (item: MenuItem) => {
    const newStatus = !item.available;
    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: newStatus })
      });
      if (res.ok) {
        setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, available: newStatus } : m));
      }
    } catch (e) {
      console.error('[MerchantView] Gagal mengubah status menu:', e);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus menu ini dari daftar katalog toko?')) return;
    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchMerchantData(true);
      } else {
        alert('Gagal menghapus menu.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- CATEGORY ACTIONS ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.name || !editingCategory.name.trim()) return;

    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCategory.name.trim() })
      });
      if (res.ok) {
        setShowCategoryForm(false);
        setEditingCategory(null);
        fetchMerchantData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal menyimpan kategori baru.');
      }
    } catch (e: any) {
      alert(e.message || 'Terjadi kendala saat menyimpan kategori.');
    }
  };

  // --- PROFILE UPDATE ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSaveSuccess(false);
    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          phone: profilePhone.trim(),
          ownerName: profileOwner.trim(),
          bankName: profileBankName.trim(),
          bankAccount: profileBankAccount.trim(),
          bankHolder: profileBankHolder.trim(),
          description: profileDesc.trim(),
          openTime: profileOpenTime.trim(),
          closeTime: profileCloseTime.trim(),
          category: profileCategory,
          role: 'MERCHANT',
          userId: effectiveMerchantId
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setMerchant(updated);
        setProfileSaveSuccess(true);
        setTimeout(() => setProfileSaveSuccess(false), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal memperbarui profil toko.');
      }
    } catch (e: any) {
      alert(e.message || 'Terjadi kendala saat menyimpan profil toko.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // --- QRIS STATIS ACTIONS ---
  const handleQrisFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setQrisUploadMsg({ type: 'error', text: 'Format file tidak didukung. Unggah gambar PNG, JPG, atau WebP.' });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setQrisUploadMsg({ type: 'error', text: 'Ukuran file terlalu besar. Maksimal 8MB.' });
      return;
    }

    try {
      const compressed = await compressImage(file, 1200, 1200, 0.85);
      setQrisImageFile(compressed);
      setQrisUploadMsg(null);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setQrisImageFile(reader.result as string);
        setQrisUploadMsg(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveQris = async () => {
    if (!qrisImageFile) {
      setQrisUploadMsg({ type: 'error', text: 'Pilih file gambar QRIS terlebih dahulu.' });
      return;
    }

    setIsUploadingQris(true);
    setQrisUploadMsg(null);
    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/qris`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrisImage: qrisImageFile })
      });
      const data = await res.json();
      if (res.ok) {
        setQrisUploadMsg({ type: 'success', text: 'QRIS statis toko berhasil disimpan! Tampil otomatis saat checkout pelanggan.' });
        setQrisImageFile(null);
        fetchMerchantData(true);
      } else {
        setQrisUploadMsg({ type: 'error', text: data.error || 'Gagal menyimpan QRIS.' });
      }
    } catch (err: any) {
      setQrisUploadMsg({ type: 'error', text: err.message || 'Terjadi kesalahan saat menyimpan QRIS.' });
    } finally {
      setIsUploadingQris(false);
    }
  };

  const handleDeleteQris = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus QRIS statis toko ini? Pelanggan tidak akan dapat membayar menggunakan QRIS toko ini hingga Anda mengunggah QRIS baru.')) return;
    setIsUploadingQris(true);
    setQrisUploadMsg(null);
    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/qris`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        setQrisUploadMsg({ type: 'success', text: 'QRIS statis toko berhasil dihapus.' });
        setQrisImageFile(null);
        fetchMerchantData(true);
      } else {
        setQrisUploadMsg({ type: 'error', text: data.error || 'Gagal menghapus QRIS toko.' });
      }
    } catch (err: any) {
      setQrisUploadMsg({ type: 'error', text: err.message || 'Terjadi kesalahan saat menghapus QRIS.' });
    } finally {
      setIsUploadingQris(false);
    }
  };

  // --- FILTERED ORDERS LOGIC ---
  const safeOrders = Array.isArray(orders) ? orders : [];
  
  // 1. Pesanan Masuk (Payment Verified by Admin - ready for cooking)
  const incomingOrders = safeOrders.filter(o => o && o.status === OrderStatus.PAYMENT_VERIFIED);
  
  // Orders waiting for payment or verification
  const pendingPaymentOrders = safeOrders.filter(o => o && [OrderStatus.WAITING_PAYMENT, OrderStatus.WAITING_PAYMENT_VERIFICATION].includes(o.status));

  // 2. Sedang Diproses (Cooking)
  const cookingOrders = safeOrders.filter(o => o && o.status === OrderStatus.COOKING);

  // 3. Ready for pickup / in delivery
  const readyAndDeliveryOrders = safeOrders.filter(o => o && [
    OrderStatus.READY_FOR_PICKUP, 
    OrderStatus.ORDER_PICKED_UP, 
    OrderStatus.DELIVERED
  ].includes(o.status));

  // 4. Completed Orders
  const completedOrders = safeOrders.filter(o => o && o.status === OrderStatus.COMPLETED);

  // 5. Cancelled / Rejected / Expired Orders
  const cancelledOrders = safeOrders.filter(o => o && [
    OrderStatus.CANCELLED, 
    OrderStatus.PAYMENT_REJECTED, 
    OrderStatus.EXPIRED
  ].includes(o.status));

  // Riwayat Pesanan (Combined with sub-filters)
  const filteredHistoryOrders = safeOrders.filter(o => {
    if (!o) return false;
    // Exclude active kitchen orders (PAYMENT_VERIFIED & COOKING)
    if (o.status === OrderStatus.PAYMENT_VERIFIED || o.status === OrderStatus.COOKING) {
      return false;
    }

    // Sub-filter match
    if (historyFilter === 'READY_OR_DELIVERY') {
      if (![OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP, OrderStatus.DELIVERED].includes(o.status)) return false;
    } else if (historyFilter === 'COMPLETED') {
      if (o.status !== OrderStatus.COMPLETED) return false;
    } else if (historyFilter === 'CANCELLED') {
      if (![OrderStatus.CANCELLED, OrderStatus.PAYMENT_REJECTED, OrderStatus.EXPIRED].includes(o.status)) return false;
    }

    // Search query match
    if (historySearchQuery.trim()) {
      const q = historySearchQuery.trim().toLowerCase();
      const matchId = String(o.id || '').toLowerCase().includes(q);
      const matchName = String(o.customerName || '').toLowerCase().includes(q);
      const matchPhone = String(o.customerPhone || '').toLowerCase().includes(q);
      const matchReceipt = String(o.receiptNumber || '').toLowerCase().includes(q);
      return matchId || matchName || matchPhone || matchReceipt;
    }

    return true;
  });

  // Calculate metrics
  const totalCompletedSales = completedOrders.reduce((sum, o) => sum + (o?.subtotal || 0), 0);

  // Filtered menu items
  const filteredMenuItems = selectedMenuCategory === 'ALL'
    ? menuItems
    : menuItems.filter(m => m.categoryId === selectedMenuCategory);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col md:flex-row">
      
      {/* =========================================================================
          DESKTOP SIDEBAR (Kiri) - Tampil di md & lg
          ========================================================================= */}
      <aside className="hidden md:flex md:w-64 lg:w-72 bg-white border-r border-slate-200/80 sticky top-0 h-screen flex-col justify-between shrink-0 z-20 overflow-y-auto">
        <div className="p-4 sm:p-5 space-y-5">
          {/* Outlet Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white flex items-center justify-center shadow-xs shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display font-bold text-sm lg:text-base text-slate-900 truncate leading-tight">
                {merchant?.name || 'Portal Mitra Toko'}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] font-extrabold px-2 py-0.2 rounded-full border ${
                  merchant?.active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {merchant?.active ? '● Buka' : '○ Tutup'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono truncate">ID: {effectiveMerchantId}</span>
              </div>
            </div>
          </div>

          {/* Quick Ringtone Audio Status Panel in Desktop Sidebar */}
          <div className={`p-3 rounded-xl border transition-all ${
            isRinging 
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-100 animate-pulse' 
              : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isRinging ? (
                  <BellRing className="w-4 h-4 text-rose-600 animate-bounce" />
                ) : isMuted ? (
                  <BellOff className="w-4 h-4 text-slate-400" />
                ) : (
                  <Bell className="w-4 h-4 text-emerald-600" />
                )}
                <div>
                  <span className={`text-xs font-bold block leading-none ${isRinging ? 'text-rose-700' : 'text-slate-800'}`}>
                    {isRinging ? 'Dering Pesanan Masuk!' : isMuted ? 'Dering Senyap' : 'Dering Aktif'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isRinging ? 'Telepon berdering...' : isMuted ? 'Suara dinonaktifkan' : 'Siaga pesanan baru'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleMute}
                className={`p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  isMuted 
                    ? 'bg-rose-100/70 border-rose-200 text-rose-700 hover:bg-rose-200' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title={isMuted ? 'Aktifkan Suara Dering' : 'Senyapkan Suara Dering'}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-2 mt-2 border-t border-slate-200/60">
              {isRinging ? (
                <button
                  type="button"
                  onClick={dismissAlert}
                  className="w-full py-1 text-center font-extrabold text-[11px] bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-2xs cursor-pointer"
                >
                  Matikan Dering
                </button>
              ) : (
                <>
                  <span className="text-slate-500 text-[10px]">Tes nada telepon:</span>
                  <button
                    type="button"
                    onClick={testRingtone}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                  >
                    Tes Dering
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Navigation Menu (6 Tab Aktual) */}
          <nav className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 block mb-2">
              Menu Toko & Dapur
            </span>
            {[
              { id: 'incoming', label: 'Pesanan Masuk', count: incomingOrders.length, highlight: incomingOrders.length > 0, icon: AlertCircle },
              { id: 'cooking', label: 'Sedang Diproses', count: cookingOrders.length, highlight: false, icon: ChefHat },
              { id: 'history', label: 'Riwayat Pesanan', count: undefined, highlight: false, icon: ClipboardList },
              { id: 'menu', label: 'Menu Produk', count: menuItems.length, highlight: false, icon: Utensils },
              { id: 'dashboard', label: 'Dashboard & Rekap', count: undefined, highlight: false, icon: TrendingUp },
              { id: 'profile', label: 'Profil & QRIS Toko', count: undefined, highlight: false, icon: Settings },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as MerchantTab)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
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
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-4 border-t border-slate-200/80 space-y-2 bg-slate-50/50">
          <button
            onClick={toggleOpenStatus}
            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border flex items-center justify-center gap-1.5 ${
              merchant?.active 
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' 
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {merchant?.active ? 'Tutup Toko Sementara' : 'Buka Toko Sekarang'}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => fetchMerchantData(false)}
              disabled={loading || isRefreshing}
              className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              title="Perbarui Data Pesanan"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing || loading ? 'animate-spin text-emerald-600' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onLogout}
              className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              title="Keluar dari Portal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          RIGHT CONTENT AREA (Konten Halaman di Kanan)
          ========================================================================= */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        
        {/* Mobile Header (< md) - Kompak & Operasional 1-Tangan */}
        <header className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display font-bold text-sm text-slate-900 truncate">
                  {merchant?.name || 'Portal Toko'}
                </h1>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className={`font-bold ${merchant?.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {merchant?.active ? '● Buka' : '○ Tutup'}
                  </span>
                  <span className="text-slate-300">•</span>
                  <button
                    onClick={toggleOpenStatus}
                    className="text-[10px] text-slate-600 underline font-medium cursor-pointer"
                  >
                    {merchant?.active ? 'Tutup' : 'Buka'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Mobile Ringtone toggle */}
              <button
                type="button"
                onClick={toggleMute}
                className={`p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                  isRinging 
                    ? 'bg-rose-600 text-white border-rose-600 animate-bounce' 
                    : isMuted 
                      ? 'bg-slate-100 text-slate-400 border-slate-200' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
                title={isMuted ? 'Aktifkan Suara' : 'Senyapkan Suara'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => fetchMerchantData(false)}
                disabled={loading || isRefreshing}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing || loading ? 'animate-spin text-emerald-600' : ''}`} />
              </button>

              <button
                onClick={onLogout}
                className="p-2 rounded-xl bg-slate-900 text-white cursor-pointer"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Horizontal Tabs (< md) */}
          <div className="px-2 border-t border-slate-100 overflow-x-auto scrollbar-none bg-slate-50/80">
            <nav className="flex space-x-1 py-1.5">
              {[
                { id: 'incoming', label: 'Pesanan Masuk', count: incomingOrders.length, highlight: incomingOrders.length > 0, icon: AlertCircle },
                { id: 'cooking', label: 'Sedang Diproses', count: cookingOrders.length, highlight: false, icon: ChefHat },
                { id: 'history', label: 'Riwayat', count: undefined, highlight: false, icon: ClipboardList },
                { id: 'menu', label: 'Menu', count: menuItems.length, highlight: false, icon: Utensils },
                { id: 'dashboard', label: 'Dashboard', count: undefined, highlight: false, icon: TrendingUp },
                { id: 'profile', label: 'Profil Toko', count: undefined, highlight: false, icon: Settings },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as MerchantTab)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                      isActive 
                        ? 'bg-emerald-600 text-white shadow-2xs' 
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
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
        </header>

        {/* Desktop Top Bar (di atas area kanan) */}
        <header className="hidden md:flex bg-white border-b border-slate-200/80 px-6 lg:px-8 py-3.5 items-center justify-between sticky top-0 z-10 shadow-2xs">
          <div>
            <h2 className="font-display font-bold text-base text-slate-900 capitalize">
              {activeTab === 'incoming' && 'Pesanan Masuk (Siap Dimasak)'}
              {activeTab === 'cooking' && 'Sedang Diproses di Dapur'}
              {activeTab === 'history' && 'Riwayat & Arsip Pesanan'}
              {activeTab === 'menu' && 'Katalog Menu & Kategori'}
              {activeTab === 'dashboard' && 'Ringkasan Omset & Settlement'}
              {activeTab === 'profile' && 'Profil Outlet & QRIS Toko'}
            </h2>
            <p className="text-xs text-slate-400">
              TumpangGo Food Merchant • Real-time sync • Terakhir dicek: {lastRefreshedAt.toLocaleTimeString('id-ID')} WIB
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className={`w-2 h-2 rounded-full ${merchant?.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="font-semibold text-slate-700">
                {merchant?.active ? 'Menerima Pesanan' : 'Outlet Tutup'}
              </span>
            </div>

            <button
              onClick={() => fetchMerchantData(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
              <span>{isRefreshing ? 'Sinkronisasi...' : 'Sinkronkan'}</span>
            </button>
          </div>
        </header>

        {/* Audio Ringtone Incoming Call Banner (Menonjol saat telepon pesanan baru berdering!) */}
        {isRinging && (
          <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 text-white px-4 py-3 shadow-md flex flex-wrap items-center justify-between gap-3 sticky top-12 md:top-14 z-30 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5 text-white animate-bounce" />
              </div>
              <div>
                <span className="font-extrabold text-sm tracking-tight block">
                  🔔 PANGGILAN PESANAN BARU MASUK!
                </span>
                <span className="text-xs text-rose-100">
                  Dapur berdering. Segera konfirmasi pesanan pelanggan dan tentukan estimasi waktu memasak.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeTab !== 'incoming' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('incoming')}
                  className="px-3 py-1.5 bg-white text-rose-700 rounded-xl font-extrabold text-xs shadow-xs hover:bg-rose-50 cursor-pointer"
                >
                  Buka Pesanan Masuk
                </button>
              )}
              <button
                type="button"
                onClick={dismissAlert}
                className="px-3 py-1.5 bg-rose-900/40 hover:bg-rose-900/60 text-white rounded-xl font-bold text-xs border border-white/30 cursor-pointer"
              >
                Senyapkan Dering
              </button>
            </div>
          </div>
        )}

        {/* Browser Autoplay Permission Hint Bar if not yet unlocked */}
        {!isAudioUnlocked && !isMuted && (
          <div 
            onClick={unlockAudio}
            className="bg-amber-50 hover:bg-amber-100 border-b border-amber-200 px-4 py-1.5 text-center text-xs text-amber-800 font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
          >
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>Klik di sini untuk mengaktifkan notifikasi suara dering telepon saat ada pesanan baru masuk</span>
          </div>
        )}

        {/* Main Content Body */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">

        {/* 1. TAB: PESANAN MASUK (PAYMENT_VERIFIED - Siap Dimasak) */}
        {activeTab === 'incoming' && (
          <div className="space-y-6">
            
            {/* Header Description */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                  <span>Pesanan Masuk Siap Dimasak</span>
                  {incomingOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800">
                      {incomingOrders.length} Pesanan
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pesanan di bawah ini telah <strong>lunas diverifikasi Admin</strong>. Segera terima pesanan dan mulai memasak.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium">
                  Update: {lastRefreshedAt.toLocaleTimeString('id-ID')}
                </span>
                <button
                  onClick={() => fetchMerchantData(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 cursor-pointer"
                >
                  Cek Pesanan Baru
                </button>
              </div>
            </div>

            {/* Empty State */}
            {incomingOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <ChefHat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-display font-bold text-base text-slate-800">Belum Ada Pesanan Masuk yang Perlu Dimasak</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  Pesanan pelanggan yang sudah diverifikasi pembayarannya oleh admin akan otomatis muncul di sini secara real-time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {incomingOrders.map(order => (
                  <div key={order.id} className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
                    <div>
                      {/* Card Header with Verified Badge */}
                      <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs font-extrabold text-slate-900">
                            #{order.orderNumber || order.id}
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            Masuk: {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                            <CheckCircle2 className="w-3 h-3" />
                            LUNAS
                          </span>
                          {order.receiptNumber && (
                            <span className="block text-[9px] font-mono text-emerald-700 font-bold mt-0.5">
                              {order.receiptNumber}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-3.5">
                        {/* Ordered Items List */}
                        <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Daftar Menu:
                          </span>
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-slate-800">
                              <span className="font-medium">
                                <strong className="text-emerald-700 font-bold mr-1">{it.quantity}x</strong> 
                                {it.name}
                              </span>
                              <span className="font-mono font-semibold text-slate-600">
                                Rp {(it.price * it.quantity).toLocaleString('id-ID')}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Customer & Delivery Destination */}
                        <div className="text-xs space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-slate-700">
                            <span className="font-semibold text-slate-900">{order.customerName}</span>
                            <a 
                              href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-800 font-mono text-[11px] inline-flex items-center gap-1 font-bold"
                            >
                              <Phone className="w-3 h-3" />
                              {order.customerPhone}
                            </a>
                          </div>
                          <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{order.deliveryAddress}</span>
                            </div>
                            {order.deliveryDetails && (
                              <p className="text-[10px] text-slate-400 mt-1 pl-5">Catatan: {order.deliveryDetails}</p>
                            )}
                          </div>
                        </div>

                        {/* Subtotal Food Summary */}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
                          <span className="text-slate-500 font-medium">Hak Merchant (Subtotal):</span>
                          <span className="font-mono font-extrabold text-sm text-emerald-800">
                            Rp {order.subtotal.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions: Pilihan Estimasi Memasak (15, 30, 45, 60 menit) & Konfirmasi */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Pilih Estimasi Waktu Memasak:</span>
                          </label>
                          <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {cookEstimateInput[order.id] || 15} Menit
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {ALLOWED_COOKING_DURATIONS.map((dur) => {
                            const isSelected = (cookEstimateInput[order.id] || 15) === dur;
                            return (
                              <button
                                key={dur}
                                type="button"
                                disabled={actionLoadingOrderId === order.id}
                                onClick={() => setCookEstimateInput(prev => ({ ...prev, [order.id]: dur }))}
                                className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer text-center border ${
                                  isSelected
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs font-extrabold scale-[1.02]'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                                } disabled:opacity-50`}
                              >
                                {dur} mnt
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => acceptOrder(order.id)}
                          disabled={actionLoadingOrderId === order.id}
                          className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <ChefHat className={`w-4 h-4 ${actionLoadingOrderId === order.id ? 'animate-spin' : ''}`} />
                          <span>{actionLoadingOrderId === order.id ? 'Menyimpan...' : 'Konfirmasi & Mulai Memasak'}</span>
                        </button>
                        <button
                          onClick={() => setRejectModal({ orderId: order.id, visible: true, reason: '' })}
                          disabled={actionLoadingOrderId === order.id}
                          className="py-3 px-3.5 rounded-xl border border-rose-200 bg-white text-rose-600 font-bold text-xs hover:bg-rose-50 cursor-pointer transition-colors disabled:opacity-50"
                          title="Tolak Pesanan jika bahan habis"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Collapsible: Pesanan Menunggu Pembayaran / Verifikasi Admin */}
            {pendingPaymentOrders.length > 0 && (
              <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-4 space-y-3">
                <button
                  onClick={() => setShowPendingVerification(!showPendingVerification)}
                  className="w-full flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-xs text-amber-900">
                      {pendingPaymentOrders.length} Pesanan Sedang Menunggu Verifikasi Pembayaran oleh Admin
                    </span>
                  </div>
                  <span className="text-xs text-amber-700 font-bold underline">
                    {showPendingVerification ? 'Sembunyikan' : 'Lihat Detail'}
                  </span>
                </button>

                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Pemberitahuan: Pesanan ini belum diverifikasi pembayarannya oleh admin. Jangan memasak pesanan sebelum status berubah menjadi <strong>Terverifikasi / Lunas</strong> demi menghindari kerugian.
                </p>

                {showPendingVerification && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                    {pendingPaymentOrders.map(order => (
                      <div key={order.id} className="bg-white rounded-xl p-3 border border-amber-200 text-xs space-y-1.5 shadow-2xs">
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-slate-800">#{order.orderNumber || order.id}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Menunggu Admin
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          <span>{order.customerName}</span> • <span className="font-mono font-semibold">Rp {order.subtotal.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {order.items.map(it => `${it.quantity}x ${it.name}`).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. TAB: SEDANG DIPROSES (COOKING) */}
        {activeTab === 'cooking' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                  <span>Pesanan Sedang Dimasak di Dapur</span>
                  {cookingOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800">
                      {cookingOrders.length} Pesanan
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jika makanan sudah selesai disiapkan dan dikemas, klik tombol <strong>"Pesanan Siap Diambil"</strong> agar kurir segera datang mengambil.
                </p>
              </div>

              <span className="text-[11px] text-slate-400 font-medium">
                Update: {lastRefreshedAt.toLocaleTimeString('id-ID')}
              </span>
            </div>

            {cookingOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <ChefHat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-display font-bold text-base text-slate-800">Tidak Ada Pesanan yang Sedang Dimasak</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  Pesanan yang Anda terima dari tab "Pesanan Masuk" akan berpindah ke sini selama proses memasak.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {cookingOrders.map(order => (
                  <MerchantCookingCard
                    key={order.id}
                    order={order}
                    nowTimestamp={cookingNow}
                    isCompleting={actionLoadingOrderId === order.id}
                    onSetReady={setOrderReady}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. TAB: RIWAYAT PESANAN */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            
            {/* Header & Sub-filters */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Riwayat Pesanan</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Daftar pesanan yang siap diambil, sedang diantar kurir, selesai, atau dibatalkan.</p>
                </div>

                <div className="relative min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Cari ID / Nama Pelanggan..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Sub-filter chips */}
              <div className="flex space-x-1.5 overflow-x-auto pt-2 border-t border-slate-100 scrollbar-none">
                {[
                  { id: 'ALL', label: 'Semua Riwayat', count: safeOrders.filter(o => o.status !== OrderStatus.PAYMENT_VERIFIED && o.status !== OrderStatus.COOKING).length },
                  { id: 'READY_OR_DELIVERY', label: 'Siap & Dalam Pengantaran', count: readyAndDeliveryOrders.length },
                  { id: 'COMPLETED', label: 'Pesanan Selesai', count: completedOrders.length },
                  { id: 'CANCELLED', label: 'Dibatalkan', count: cancelledOrders.length }
                ].map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setHistoryFilter(sub.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      historyFilter === sub.id 
                        ? 'bg-slate-900 text-white' 
                        : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    <span>{sub.label}</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                      historyFilter === sub.id ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {sub.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {filteredHistoryOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-display font-bold text-base text-slate-800">Tidak Ada Riwayat Pesanan</h3>
                <p className="text-xs text-slate-500 mt-1">Pesanan yang telah melewati proses dapur akan tersimpan di sini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHistoryOrders.map(order => (
                  <div key={order.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
                    <div className="space-y-3">
                      {/* Top Bar */}
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-800">#{order.orderNumber || order.id}</span>
                          <span className="block text-[10px] text-slate-400">
                            {new Date(order.createdAt).toLocaleDateString('id-ID')} • {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          order.status === OrderStatus.COMPLETED ? 'bg-emerald-100 text-emerald-800' :
                          order.status === OrderStatus.READY_FOR_PICKUP ? 'bg-indigo-100 text-indigo-800' :
                          order.status === OrderStatus.ORDER_PICKED_UP || order.status === OrderStatus.DELIVERED ? 'bg-blue-100 text-blue-800' :
                          order.status === OrderStatus.CANCELLED || order.status === OrderStatus.PAYMENT_REJECTED ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {order.status === OrderStatus.READY_FOR_PICKUP ? 'Siap Diambil' :
                           order.status === OrderStatus.ORDER_PICKED_UP ? 'Dibawa Kurir' :
                           order.status === OrderStatus.DELIVERED ? 'Sampai Tujuan' :
                           order.status === OrderStatus.COMPLETED ? 'Selesai' :
                           order.status === OrderStatus.CANCELLED ? 'Dibatalkan' :
                           order.status === OrderStatus.PAYMENT_REJECTED ? 'Pembayaran Ditolak' :
                           order.status}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="text-xs space-y-1">
                        {order.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-slate-700">
                            <span><strong className="text-slate-900">{it.quantity}x</strong> {it.name}</span>
                            <span className="font-mono">Rp {(it.price * it.quantity).toLocaleString('id-ID')}</span>
                          </div>
                        ))}
                      </div>

                      {/* Customer info */}
                      <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span>Pemesan: <strong>{order.customerName}</strong></span>
                        {order.driverName && (
                          <span className="block text-slate-600 mt-0.5">Kurir: <strong>{order.driverName}</strong></span>
                        )}
                        {order.cancelReason && (
                          <span className="block text-rose-600 font-semibold mt-0.5">Alasan Batal: {order.cancelReason}</span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Info & E-Receipt Button */}
                    <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Subtotal</span>
                        <span className="font-mono font-bold text-sm text-emerald-800">
                          Rp {order.subtotal.toLocaleString('id-ID')}
                        </span>
                      </div>

                      {order.receipt && (
                        <button
                          onClick={() => setSelectedReceiptOrder(order)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                          <span>E-Receipt</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. TAB: MENU PRODUK */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Katalog Menu & Kategori</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tambah menu baru, atur ketersediaan menu (Tersedia / Habis), dan kelola harga.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingCategory({}); setShowCategoryForm(true); }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  + Kategori
                </button>
                <button
                  onClick={() => { setEditingItem({ available: true, categoryId: categories[0]?.id || '' }); setShowItemForm(true); }}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Menu
                </button>
              </div>
            </div>

            {/* Category Filter Chips */}
            {categories.length > 0 && (
              <div className="flex space-x-1.5 overflow-x-auto scrollbar-none pb-1">
                <button
                  onClick={() => setSelectedMenuCategory('ALL')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedMenuCategory === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Semua Kategori ({menuItems.length})
                </button>
                {categories.map(c => {
                  const count = menuItems.filter(m => m.categoryId === c.id).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedMenuCategory(c.id)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        selectedMenuCategory === c.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {c.name} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredMenuItems.map(item => (
                <div key={item.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between hover:border-emerald-200 transition-all">
                  <div>
                    <div className="aspect-video w-full bg-slate-100 relative overflow-hidden">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Utensils className="w-8 h-8" />
                        </div>
                      )}
                      
                      {/* Availability status badge */}
                      <button
                        type="button"
                        onClick={() => toggleItemAvailability(item)}
                        className={`absolute top-2 right-2 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full cursor-pointer shadow-xs transition-transform active:scale-95 ${
                          item.available ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                        }`}
                        title="Klik untuk mengubah ketersediaan menu"
                      >
                        {item.available ? '✓ Tersedia' : '✕ Habis'}
                      </button>
                    </div>

                    <div className="p-3.5 space-y-1">
                      <h4 className="font-display font-bold text-sm text-slate-900 truncate">{item.name}</h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{item.description || 'Menu lezat pilihan khas UMKM Tumpang.'}</p>
                      <div className="pt-2 flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-emerald-800">Rp {item.price.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toggleItemAvailability(item)}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      {item.available ? 'Set Habis' : 'Set Tersedia'}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setEditingItem(item); setShowItemForm(true); }}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                        title="Edit Menu"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 cursor-pointer"
                        title="Hapus Menu"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. TAB: DASHBOARD (METRIKS & RINGKASAN OMSET) */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Pesanan Masuk</span>
                <span className="font-display font-extrabold text-3xl text-slate-900 mt-1 block">
                  {incomingOrders.length}
                </span>
                <span className="text-[11px] text-amber-700 font-semibold mt-1 block">Siap dimasak di dapur</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Sedang Dimasak</span>
                <span className="font-display font-extrabold text-3xl text-blue-700 mt-1 block">
                  {cookingOrders.length}
                </span>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">Dalam proses persiapan</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Pesanan Selesai</span>
                <span className="font-display font-extrabold text-3xl text-emerald-800 mt-1 block">
                  {completedOrders.length}
                </span>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">Telah diterima pembeli</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Omset Selesai</span>
                <span className="font-display font-extrabold text-2xl text-emerald-800 mt-1 block">
                  Rp {totalCompletedSales.toLocaleString('id-ID')}
                </span>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">Subtotal penjualan makanan</span>
              </div>
            </div>

            {/* Outlet Quick Controls */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">Status Operasional Outlet</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Saat ini outlet berstatus: <strong>{merchant?.active ? 'BUKA (Menerima Pesanan)' : 'TUTUP (Tidak Menerima Pesanan)'}</strong>.
                </p>
              </div>
              <button
                onClick={toggleOpenStatus}
                className={`py-2 px-5 rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer ${
                  merchant?.active
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {merchant?.active ? 'Tutup Toko Sementara' : 'Buka Toko Sekarang'}
              </button>
            </div>

            {/* Riwayat Settlement */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Rekap Settlement Pencairan Dana</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Riwayat transfer dana hasil penjualan ke rekening bank toko Anda.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Rekening Tujuan</th>
                      <th className="py-2.5 px-3">Jumlah Transaksi</th>
                      <th className="py-2.5 px-3">Nominal Cair</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          Belum ada data rekap settlement pencairan dana.
                        </td>
                      </tr>
                    ) : (
                      settlements.map(s => (
                        <tr key={s.id}>
                          <td className="py-3 px-3 font-mono">{new Date(s.createdAt).toLocaleDateString('id-ID')}</td>
                          <td className="py-3 px-3">{s.bankName} - {s.bankAccount}</td>
                          <td className="py-3 px-3">{s.orderCount} Pesanan</td>
                          <td className="py-3 px-3 font-mono font-bold text-emerald-800">Rp {s.amountToPay.toLocaleString('id-ID')}</td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'Lunas Ditransfer' : 'Diproses'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* 6. TAB: PROFIL TOKO & QRIS STATIS (Unified) */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: Store Profile Form */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Profil & Rekening Toko</h2>
                <p className="text-xs text-slate-500 mt-0.5">Kelola identitas outlet, nomor rekening pencairan, dan jam operasional.</p>
              </div>

              {profileSaveSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Profil toko berhasil diperbarui!</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Nama Toko / Usaha</label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Nama Pemilik UMKM</label>
                    <input
                      type="text"
                      required
                      value={profileOwner}
                      onChange={(e) => setProfileOwner(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Nomor WhatsApp Toko</label>
                    <input
                      type="text"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Kategori Usaha</label>
                    <select
                      value={profileCategory}
                      onChange={(e) => setProfileCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Bakso & Mie">🍜 Bakso & Mie</option>
                      <option value="Nasi & Lauk">🍛 Nasi & Lauk</option>
                      <option value="Sate & Bakaran">🍢 Sate & Bakaran</option>
                      <option value="Cemilan & Jajanan">🍘 Cemilan & Jajanan</option>
                      <option value="Minuman Segar">🥤 Minuman Segar</option>
                      <option value="Makanan Berat">🍲 Makanan Berat</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Jam Buka</label>
                    <input
                      type="text"
                      value={profileOpenTime}
                      onChange={(e) => setProfileOpenTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                      placeholder="08:00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Jam Tutup</label>
                    <input
                      type="text"
                      value={profileCloseTime}
                      onChange={(e) => setProfileCloseTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                      placeholder="21:00"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Deskripsi Toko</label>
                  <textarea
                    value={profileDesc}
                    onChange={(e) => setProfileDesc(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Rekening Settlement Bank */}
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                    Rekening Bank untuk Pencairan Dana
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Bank</label>
                      <input
                        type="text"
                        value={profileBankName}
                        onChange={(e) => setProfileBankName(e.target.value)}
                        placeholder="BCA / BRI / Mandiri"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Nomor Rekening</label>
                      <input
                        type="text"
                        value={profileBankAccount}
                        onChange={(e) => setProfileBankAccount(e.target.value)}
                        placeholder="1234567890"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Atas Nama Rekening</label>
                      <input
                        type="text"
                        value={profileBankHolder}
                        onChange={(e) => setProfileBankHolder(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingProfile ? 'Menyimpan...' : 'Simpan Profil Toko'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right: QRIS Statis Toko */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-display font-bold text-sm text-slate-900">QRIS Statis Toko</h3>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    merchant?.qrisImage ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {merchant?.qrisImage ? 'Aktif' : 'Belum Ada'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  QRIS statis ini tampil otomatis saat pelanggan checkout via QRIS di toko Anda.
                </p>

                {qrisUploadMsg && (
                  <div className={`mt-3 p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
                    qrisUploadMsg.type === 'success' 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    <span>{qrisUploadMsg.text}</span>
                    <button onClick={() => setQrisUploadMsg(null)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Display Current QRIS */}
                {merchant?.qrisImage ? (
                  <div className="mt-4 flex flex-col items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="relative group w-40 h-40 bg-white rounded-xl border border-slate-200 p-2 flex items-center justify-center">
                      <img
                        src={merchant.qrisImage}
                        alt="QRIS Toko"
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={() => setZoomQrisImage(merchant.qrisImage || null)}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomQrisImage(merchant.qrisImage || null)}
                        className="absolute bottom-1 right-1 bg-slate-900/80 hover:bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer"
                      >
                        <ZoomIn className="w-3 h-3" />
                        Perbesar
                      </button>
                    </div>

                    <div className="flex gap-2 w-full pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('merchant-qris-file-input');
                          if (input) input.click();
                        }}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg cursor-pointer text-center"
                      >
                        Ganti QRIS
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteQris}
                        disabled={isUploadingQris}
                        className="py-1.5 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs rounded-lg cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-center space-y-2">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                    <p className="text-xs text-amber-800 font-medium">Toko belum memiliki QRIS aktif.</p>
                  </div>
                )}

                {/* Upload Input */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                  <input
                    id="merchant-qris-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    onChange={handleQrisFileChange}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">Maksimal 5MB (JPG, PNG, WebP)</span>

                  {qrisImageFile && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center gap-2 mt-2">
                      <div className="w-32 h-32 bg-white rounded-lg p-1 border border-slate-200 flex items-center justify-center">
                        <img src={qrisImageFile} alt="Preview" className="w-full h-full object-contain" />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveQris}
                          disabled={isUploadingQris}
                          className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                        >
                          {isUploadingQris ? 'Menyimpan...' : 'Simpan QRIS'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrisImageFile(null)}
                          className="py-1.5 px-2 text-slate-500 text-xs font-semibold"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                Pencairan otomatis diproses oleh sistem TumpangGo ke rekening terdaftar.
              </div>
            </div>

          </div>
        )}

        {/* Footer & Secret Hidden Trigger */}
        <footer className="mt-12 pt-6 pb-8 border-t border-slate-200/80 px-4 flex flex-col items-center justify-center text-center">
          <p 
            onClick={handleCopyrightClick}
            className="text-[11px] text-slate-400 font-normal select-none cursor-default"
          >
            © 2026 TumpangGo. All rights reserved.
          </p>

          {isUnlocked && (
            <HiddenPortalBar 
              currentPortal="MERCHANT"
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

      {/* --- MODALS --- */}

      {/* 1. Item Form Modal */}
      {showItemForm && editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-display font-bold text-sm text-slate-900">
                {editingItem.id ? 'Edit Menu Makanan' : 'Tambah Menu Makanan Baru'}
              </h3>
              <button onClick={() => setShowItemForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Menu</label>
                <input
                  type="text"
                  required
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="Contoh: Bakso Urat Jumbo"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Harga (Rp)</label>
                  <input
                    type="number"
                    required
                    value={editingItem.price || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                    placeholder="15000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Kategori</label>
                  <select
                    value={editingItem.categoryId || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Deskripsi Menu</label>
                <textarea
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Isian porsi, kuah kaldu, bumbu rempah..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">URL Gambar Menu</label>
                <input
                  type="text"
                  value={editingItem.image || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, image: e.target.value })}
                  placeholder="https://... atau data:image/..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.available !== false}
                    onChange={(e) => setEditingItem({ ...editingItem, available: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">Tersedia untuk Dipesan Pelanggan</span>
                </label>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowItemForm(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Simpan Menu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tambah Kategori Baru</h3>
            <form onSubmit={handleSaveCategory} className="space-y-3">
              <input
                type="text"
                required
                value={editingCategory?.name || ''}
                onChange={(e) => setEditingCategory({ name: e.target.value })}
                placeholder="Contoh: Aneka Jus & Minuman"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryForm(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  Simpan Kategori
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Reject Order Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tolak Pesanan</h3>
            <p className="text-xs text-slate-500">Berikan alasan penolakan pesanan (stok habis, kendala dapur, dll):</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              placeholder="Contoh: Bahan menu habis..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => rejectOrder(rejectModal.orderId, rejectModal.reason)}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Tolak Pesanan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Zoom QRIS Modal */}
      {zoomQrisImage && (
        <div 
          onClick={() => setZoomQrisImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-sm sm:max-w-md w-full bg-white rounded-2xl p-4 overflow-hidden shadow-2xl flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800">QRIS Statis Toko: {merchant?.name}</span>
              <button
                type="button"
                onClick={() => setZoomQrisImage(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img src={zoomQrisImage} alt="QRIS Toko Full" className="w-full max-h-[70vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* 5. E-Receipt Modal */}
      {selectedReceiptOrder && (
        <EReceiptModal 
          order={selectedReceiptOrder} 
          onClose={() => setSelectedReceiptOrder(null)} 
        />
      )}

    </div>
  );
}

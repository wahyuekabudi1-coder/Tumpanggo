/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Merchant Portal — Mobile-First Redesign
 * Dashboard operasional mitra toko & dapur kuliner UMKM Tumpang.
 * Dioptimalkan untuk HP Android (360-430px), Tablet, dan Desktop.
 * 
 * Struktur Menu:
 * 1. Dashboard Recap (Default Landing)
 * 2. Pesanan Masuk (Operasional: Perlu Masak, Dimasak, Siap Diambil)
 * 3. Riwayat Pesanan (Selesai, Dalam Pengantaran, Dibatalkan)
 * 4. Produk / Menu (Katalog Menu, File Upload Foto, Kategori Resmi Admin Pusat)
 * 5. Profil & Jam Operasional (Identitas Toko, Jam Buka/Tutup, Rekening Bank Pencairan)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Merchant, MenuItem, Category, Order, OrderStatus, Settlement, SettlementStatus 
} from '../types.ts';
import { compressImage } from '../utils/imageCompressor.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import { 
  Store, ClipboardList, Utensils, TrendingUp, Clock,
  Settings, LogOut, Plus, Check, X, Edit, Trash2,
  Phone, MapPin, AlertCircle, ChefHat, RefreshCw, Upload,
  CreditCard, Receipt, Search,
  CheckCircle2, AlertTriangle, Volume2, VolumeX, Bell, BellRing,
  Menu as MenuIcon, ChevronRight, ArrowRight, Image as ImageIcon
} from 'lucide-react';
import { useHiddenTrigger } from '../hooks/useHiddenTrigger.ts';
import HiddenPortalBar from './HiddenPortalBar.tsx';
import EReceiptModal from './EReceiptModal.tsx';
import { useSEO } from '../hooks/useSEO.ts';
import { 
  calculateRemainingCooking, 
  CookingDurationMinutes,
  formatWibTime
} from '../utils/cookingTimer.ts';
import { useCookingTicker } from '../hooks/useCookingCountdown.ts';
import { useOrderRingtone } from '../hooks/useOrderRingtone.ts';
import { useWebPush } from '../hooks/useWebPush.ts';

// Helper to extract clean initials from store name (e.g., "Warung Ombe" -> "WO", "Bakso Cak Ahmad" -> "BC")
function getStoreInitials(name?: string): string {
  if (!name || !name.trim()) return 'TG';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Store Logo Component: renders verified merchant photo/logo if available, or personalized initials fallback
function MerchantStoreLogo({
  merchant,
  size = 'md'
}: {
  merchant: Merchant | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = merchant?.image?.trim() || merchant?.businessPhoto?.trim() || '';
  const initials = getStoreInitials(merchant?.name);

  // Reset imgError if merchant or logo changes
  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  const sizeClass = {
    sm: 'w-8 h-8 min-w-[32px] text-[11px]',
    md: 'w-10 h-10 min-w-[40px] text-xs sm:text-sm',
    lg: 'w-12 h-12 min-w-[48px] text-base'
  }[size];

  if (logoUrl && !imgError) {
    return (
      <div className={`${sizeClass} rounded-xl overflow-hidden border border-slate-200/90 bg-slate-100 shadow-2xs shrink-0 flex items-center justify-center select-none`}>
        <img
          src={logoUrl}
          alt={merchant?.name ? `Logo ${merchant.name}` : 'Logo Toko'}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-display font-black shadow-2xs border border-emerald-900/10 shrink-0 flex items-center justify-center tracking-wider select-none`}
      aria-label={merchant?.name ? `Inisial ${merchant.name}` : 'Logo Toko'}
      title={merchant?.name || 'Toko Mitra'}
    >
      {initials}
    </div>
  );
}

// Cooking Card Component with live countdown
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
    <div className={`bg-white rounded-2xl border shadow-xs overflow-hidden flex flex-col justify-between transition-all ${
      timer.isExpired ? 'border-amber-400 ring-2 ring-amber-100' : 'border-blue-200 hover:shadow-md'
    }`}>
      <div>
        {/* Header with Cooking Timer */}
        <div className={`p-3.5 border-b flex items-center justify-between ${
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
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold shadow-xs">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>{timer.durationMinutes} Menit Masak</span>
          </div>
        </div>

        {/* Live Countdown Display */}
        <div className={`p-3.5 border-b ${
          timer.isExpired ? 'bg-amber-100/50 border-amber-200' : 'bg-gradient-to-br from-blue-500/5 to-indigo-500/5 border-slate-100'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
              timer.isExpired ? 'text-amber-800' : 'text-blue-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                timer.isExpired ? 'bg-amber-500 animate-ping' : 'bg-blue-600 animate-pulse'
              }`} />
              {timer.isExpired ? 'Estimasi Selesai (Konfirmasi Siap)' : 'Sedang Dimasak di Dapur'}
            </span>
            <span className="text-[10px] font-bold text-slate-500 font-mono">
              Target: {timer.estimatedEndTime}
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div className={`font-mono text-2xl sm:text-3xl font-black tracking-tight ${
              timer.isExpired ? 'text-amber-700' : 'text-slate-900'
            }`}>
              {timer.formattedRemaining}
            </div>
            <div className="text-right">
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium block">
                {timer.isExpired ? 'Waktu habis' : 'sisa waktu'}
              </span>
              {order.cookingStartedAt && (
                <span className="text-[9px] text-slate-400 font-mono">
                  Mulai: {formatWibTime(order.cookingStartedAt)}
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200/80 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                timer.isExpired ? 'bg-amber-500' : 'bg-blue-600'
              }`}
              style={{ width: `${timer.percentElapsed}%` }}
            />
          </div>

          {timer.isExpired && (
            <div className="mt-2 text-[10px] text-amber-900 font-medium bg-amber-50 rounded-lg p-2 border border-amber-200/70 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>Makanan selesai dimasak? Klik <strong>"Makanan Siap Diambil"</strong> di bawah untuk memanggil kurir.</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="p-3.5 space-y-2.5">
          <div className="bg-slate-50 rounded-xl p-2.5 space-y-1.5 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Menu yang Dimasak:
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

          {/* Customer & Address */}
          <div className="text-xs space-y-1 text-slate-600">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900">{order.customerName}</span>
              <a 
                href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-emerald-700 font-mono text-[11px] font-bold inline-flex items-center gap-1"
              >
                <Phone className="w-3 h-3" />
                {order.customerPhone}
              </a>
            </div>
            <div className="flex items-start gap-1 text-[11px] text-slate-500">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{order.deliveryAddress}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button: Siap Diambil */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-100">
        <button
          onClick={() => onSetReady(order.id)}
          disabled={isCompleting}
          className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className={`w-4 h-4 ${isCompleting ? 'animate-spin' : ''}`} />
          <span>{isCompleting ? 'Memproses...' : 'Makanan Siap Diambil'}</span>
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

// 5 Recommended Navigation Menus
export type MerchantTab = 'dashboard' | 'incoming' | 'history' | 'menu' | 'profile';

export type DashboardPeriod = 'TODAY' | 'WEEK' | 'MONTH';

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
  
  // Requirement D: DASHBOARD RECAP SEBAGAI HALAMAN DEFAULT SETELAH LOGIN
  const [activeTab, setActiveTab] = useState<MerchantTab>('dashboard');
  
  // Dashboard Period Filter: TODAY (Harian), WEEK (Mingguan), MONTH (Bulanan)
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('TODAY');

  // Operational Sub-filter inside Pesanan Masuk: 'perlu_masak' | 'cooking' | 'ready'
  const [operationalSubTab, setOperationalSubTab] = useState<'perlu_masak' | 'cooking' | 'ready'>('perlu_masak');

  // Mobile Drawer State
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // History tab sub-filter
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'READY_OR_DELIVERY' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // Pending verification accordion
  const [showPendingVerification, setShowPendingVerification] = useState(false);


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
    dismissAlert,
    toggleMute,
    unlockAudio
  } = useOrderRingtone(orders, !loading);

  const {
    isSupported: isPushSupported,
    isSubscribed: isPushSubscribed,
    loading: pushLoading,
    statusMessage: pushStatusMsg,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
    sendTestNotification: sendTestPush,
    clearStatusMessage: clearPushStatusMsg
  } = useWebPush('MERCHANT', effectiveMerchantId);

  // Menu editor states
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('ALL');
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [itemImageError, setItemImageError] = useState<string | null>(null);

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
  const [merchantAccessError, setMerchantAccessError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  // Resolve merchant ID on mount if empty
  useEffect(() => {
    isMountedRef.current = true;
    if (rawMerchantId && rawMerchantId.trim().length > 0) {
      setEffectiveMerchantId(rawMerchantId.trim());
      safeStorage.setItem('tumpang_active_merchant_id', rawMerchantId.trim());
    } else {
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

    // Optimized auto-refresh polling every 25 seconds when page is visible
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && isMountedRef.current && navigator.onLine) {
        fetchMerchantData(true);
      }
    }, 25000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [effectiveMerchantId]);

  const fetchMerchantData = async (isBackground = false) => {
    if (!effectiveMerchantId) return;
    if (!isBackground) setLoading(true);
    else setIsRefreshing(true);

    try {
      if (isBackground) {
        const ordRes = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/orders`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => []);
        if (!isMountedRef.current) return;
        setOrders(extractArrayResponse<Order>(ordRes, 'orders'));
        setLastRefreshedAt(new Date());
        return;
      }

      const profFetch = await fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}`);
      if (!profFetch.ok) {
        const errJson = await profFetch.json().catch(() => ({}));
        if (profFetch.status === 403 || errJson.isPendingApproval) {
          setMerchantAccessError(errJson.error || 'Pendaftaran toko Anda sedang dalam peninjauan oleh Admin Pusat tumpangGo.');
          setLoading(false);
          setIsRefreshing(false);
          return;
        }
      }
      const profRes = profFetch.ok ? await profFetch.json() : null;

      const [ordRes, menuRes, catRes, setRes] = await Promise.all([
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/orders`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/categories`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${encodeURIComponent(effectiveMerchantId)}/settlements`).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      if (!isMountedRef.current) return;

      if (profRes && profRes.id) {
        setMerchant(profRes);
        setMerchantAccessError(null);
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
        setActiveTab('incoming');
        setOperationalSubTab('cooking');
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
        setActiveTab('incoming');
        setOperationalSubTab('ready');
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
      alert('Mohon cantumkan alasan penolakan pesanan.');
      return;
    }
    if (actionLoadingOrderId) return;
    setActionLoadingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reason: reason.trim(),
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
      alert(err.message || 'Terjadi kendala saat menolak pesanan.');
    } finally {
      setActionLoadingOrderId(null);
    }
  };

  // --- MENU ITEM ACTIONS (WITH FILE UPLOAD & ADMIN CATEGORIES) ---
  const handleItemImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setItemImageError('Format file tidak didukung. Pilih gambar PNG, JPG, atau WebP.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setItemImageError('Ukuran file maksimal 8MB.');
      return;
    }

    try {
      setItemImageError(null);
      // Client-side compression to lightweight base64 DataURL (image/jpeg, <100KB)
      const compressed = await compressImage(file, 800, 800, 0.75);
      setEditingItem(prev => ({ ...(prev || {}), image: compressed }));
    } catch (err: any) {
      setItemImageError(err?.message || 'Gagal memproses gambar dari file.');
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const itemName = (editingItem.name || '').trim();
    if (!itemName) {
      alert('Nama menu wajib diisi.');
      return;
    }

    const priceNum = Number(editingItem.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('Harga menu harus berupa angka lebih dari Rp 0.');
      return;
    }

    if (!editingItem.categoryId) {
      alert('Kategori menu wajib dipilih dari kategori resmi.');
      return;
    }

    const selectedCategory = categories.find(c => c.id === editingItem.categoryId);
    const categoryName = selectedCategory ? selectedCategory.name : (editingItem.category || 'Menu Utama');

    const payload = {
      name: itemName,
      price: priceNum,
      categoryId: editingItem.categoryId,
      category: categoryName,
      description: (editingItem.description || '').trim(),
      image: editingItem.image || '',
      available: editingItem.available !== false
    };

    const url = editingItem.id 
      ? `/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu/${editingItem.id}` 
      : `/api/merchants/${encodeURIComponent(effectiveMerchantId)}/menu`;
    
    const method = editingItem.id ? 'PUT' : 'POST';

    try {
      setIsSavingItem(true);
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowItemForm(false);
        setEditingItem(null);
        setItemImageError(null);
        await fetchMerchantData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal menyimpan menu makanan.');
      }
    } catch (e: any) {
      alert(e.message || 'Terjadi kendala saat menyimpan menu.');
    } finally {
      setIsSavingItem(false);
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


  const handleViewCustomerSite = () => {
    if (onSelectRole) {
      onSelectRole('CUSTOMER');
    } else {
      window.location.href = '/';
    }
  };

  const handleConfirmLogout = () => {
    if (window.confirm('Apakah Anda yakin ingin keluar dari Portal Toko?')) {
      onLogout();
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

  // 3. Ready for pickup
  const readyOrders = safeOrders.filter(o => o && o.status === OrderStatus.READY_FOR_PICKUP);

  // 4. In delivery
  const inDeliveryOrders = safeOrders.filter(o => o && [
    OrderStatus.ORDER_PICKED_UP, 
    OrderStatus.DELIVERED
  ].includes(o.status));

  // 5. Completed Orders
  const completedOrders = safeOrders.filter(o => o && o.status === OrderStatus.COMPLETED);

  // 6. Cancelled Orders
  const cancelledOrders = safeOrders.filter(o => o && [OrderStatus.CANCELLED, OrderStatus.PAYMENT_REJECTED].includes(o.status));

  // --- REQUIREMENT D: DASHBOARD PERIOD FILTER CALCULATIONS (WIB / Local Time) ---
  const periodData = useMemo(() => {
    const now = new Date();
    // Start of Today (00:00:00)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    // Start of Week (last 7 days window)
    const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
    // Start of Month (1st day of current month)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const filterStartDate = dashboardPeriod === 'TODAY' 
      ? startOfToday 
      : dashboardPeriod === 'WEEK' 
        ? startOfWeek 
        : startOfMonth;

    // Filter orders within period
    const periodOrders = safeOrders.filter(o => {
      if (!o || !o.createdAt) return false;
      const orderDate = new Date(o.createdAt);
      return !isNaN(orderDate.getTime()) && orderDate >= filterStartDate;
    });

    // Today's total orders (always calculated for reference)
    const todayOrdersCount = safeOrders.filter(o => {
      if (!o || !o.createdAt) return false;
      const d = new Date(o.createdAt);
      return !isNaN(d.getTime()) && d >= startOfToday;
    }).length;

    const completedInPeriod = periodOrders.filter(o => o.status === OrderStatus.COMPLETED);
    const completedSalesInPeriod = completedInPeriod.reduce((sum, o) => sum + (o.subtotal || 0), 0);
    const activeInPeriod = periodOrders.filter(o => [
      OrderStatus.PAYMENT_VERIFIED,
      OrderStatus.COOKING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.ORDER_PICKED_UP,
      OrderStatus.DELIVERED
    ].includes(o.status));

    return {
      periodOrders,
      totalOrdersInPeriod: periodOrders.length,
      todayOrdersCount,
      completedOrdersCount: completedInPeriod.length,
      completedSales: completedSalesInPeriod,
      activeOrdersCount: activeInPeriod.length,
      cancelledOrdersCount: periodOrders.filter(o => [OrderStatus.CANCELLED, OrderStatus.PAYMENT_REJECTED].includes(o.status)).length
    };
  }, [safeOrders, dashboardPeriod]);

  // History Tab Filter
  const filteredHistoryOrders = useMemo(() => {
    return safeOrders.filter(order => {
      if (!order) return false;
      // Exclude orders still in incoming / cooking
      if (order.status === OrderStatus.PAYMENT_VERIFIED || order.status === OrderStatus.COOKING) {
        return false;
      }
      
      if (historyFilter === 'READY_OR_DELIVERY') {
        if (![OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP, OrderStatus.DELIVERED].includes(order.status)) return false;
      } else if (historyFilter === 'COMPLETED') {
        if (order.status !== OrderStatus.COMPLETED) return false;
      } else if (historyFilter === 'CANCELLED') {
        if (order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.PAYMENT_REJECTED) return false;
      }

      if (historySearchQuery.trim()) {
        const q = historySearchQuery.toLowerCase().trim();
        const numMatch = (order.orderNumber || order.id || '').toLowerCase().includes(q);
        const nameMatch = (order.customerName || '').toLowerCase().includes(q);
        const phoneMatch = (order.customerPhone || '').includes(q);
        if (!numMatch && !nameMatch && !phoneMatch) return false;
      }

      return true;
    });
  }, [safeOrders, historyFilter, historySearchQuery]);

  // Menu items filtered by category
  const filteredMenuItems = useMemo(() => {
    if (selectedMenuCategory === 'ALL') return menuItems;
    return menuItems.filter(m => m.categoryId === selectedMenuCategory);
  }, [menuItems, selectedMenuCategory]);

  const navMenuItems = [
    { 
      id: 'dashboard', 
      label: 'Dashboard & Rekap', 
      shortLabel: 'Dashboard',
      icon: TrendingUp,
      count: undefined 
    },
    { 
      id: 'incoming', 
      label: 'Pesanan Masuk', 
      shortLabel: 'Pesanan',
      icon: ChefHat,
      count: incomingOrders.length,
      highlight: incomingOrders.length > 0
    },
    { 
      id: 'history', 
      label: 'Riwayat Pesanan', 
      shortLabel: 'Riwayat',
      icon: ClipboardList,
      count: undefined 
    },
    { 
      id: 'menu', 
      label: 'Produk / Menu', 
      shortLabel: 'Menu',
      icon: Utensils,
      count: menuItems.length 
    },
    { 
      id: 'profile', 
      label: 'Profil & Jam Operasional', 
      shortLabel: 'Profil',
      icon: Settings,
      count: undefined 
    },
  ];

  // Access Error View
  if (merchantAccessError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center shadow-lg border border-slate-200">
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="font-display font-bold text-lg text-slate-900 mb-2">Pendaftaran Dalam Peninjauan</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">{merchantAccessError}</p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchMerchantData(false)}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              Cek Ulang Status
            </button>
            <button
              onClick={onLogout}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row antialiased text-slate-900 w-full max-w-full overflow-x-hidden">
      
      {/* =========================================================================
          DESKTOP SIDEBAR (Tampil pada layar md: ke atas)
          ========================================================================= */}
      <aside className="hidden md:flex flex-col w-56 lg:w-64 xl:w-72 bg-white border-r border-slate-200/90 h-screen sticky top-0 shrink-0 select-none z-20">
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <MerchantStoreLogo merchant={merchant} size="md" />
            <div className="min-w-0">
              <h1 className="font-display font-bold text-sm text-slate-900 truncate">
                {merchant?.name || 'Portal Toko'}
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                {merchant?.ownerName ? `Mitra: ${merchant.ownerName}` : 'Mitra Merchant'}
              </p>
            </div>
          </div>
        </div>

        {/* Store Live Status Widget */}
        <div className="p-3 bg-slate-50 border-b border-slate-100 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600">Status Operasional:</span>
            <span className={`text-[11px] font-extrabold flex items-center gap-1.5 ${merchant?.active ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full ${merchant?.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {merchant?.active ? 'Buka (Aktif)' : 'Tutup Sementara'}
            </span>
          </div>

          <button
            onClick={toggleOpenStatus}
            className={`w-full min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border flex items-center justify-center gap-1.5 ${
              merchant?.active 
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' 
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {merchant?.active ? 'Tutup Toko Sementara' : 'Buka Toko Sekarang'}
          </button>
        </div>

        {/* Sidebar Nav */}
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
                onClick={() => setActiveTab(tab.id as MerchantTab)}
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

        {/* Sidebar Audio & Push Control */}
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
              {isMuted ? 'Mati' : 'Aktif'}
            </button>
          </div>

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
              onClick={() => fetchMerchantData(false)}
              disabled={loading || isRefreshing}
              className="flex-1 py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              title="Perbarui Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing || loading ? 'animate-spin text-emerald-600' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleConfirmLogout}
              className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              title="Keluar dari Akun Toko"
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
                  <MerchantStoreLogo merchant={merchant} size="md" />
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-sm text-slate-900 truncate">
                      {merchant?.name || 'Portal Toko'}
                    </h2>
                    <span className={`text-[10px] font-bold flex items-center gap-1 ${merchant?.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${merchant?.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {merchant?.active ? 'Toko Buka' : 'Toko Tutup'}
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
                        setActiveTab(tab.id as MerchantTab);
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
                  toggleOpenStatus();
                  setIsMobileDrawerOpen(false);
                }}
                className={`w-full min-h-[44px] py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border flex items-center justify-center gap-1.5 ${
                  merchant?.active 
                    ? 'bg-rose-50 text-rose-700 border-rose-200' 
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {merchant?.active ? 'Tutup Toko Sementara' : 'Buka Toko Sekarang'}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    fetchMerchantData(false);
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
                    handleConfirmLogout();
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
      <div className="flex-1 min-w-0 flex flex-col min-h-screen max-w-full">
        
        {/* Mobile Header (< md) — Ringkas, Proporsional, Tanpa Elemen Bertumpuk */}
        <header className="md:hidden bg-white border-b border-slate-200/90 sticky top-0 z-30 shadow-xs min-h-[56px] py-1.5 px-3 flex items-center justify-between gap-2 select-none">
          {/* Left: Hamburger & Store Identity with Store Logo */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 cursor-pointer shrink-0"
              aria-label="Buka Menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>

            {/* Logo Warung Asli / Inisial Toko */}
            <MerchantStoreLogo merchant={merchant} size="md" />

            <div className="min-w-0 flex-1">
              <h1 className="font-display font-bold text-xs sm:text-sm text-slate-900 truncate leading-tight" title={merchant?.name || 'Portal Toko'}>
                {merchant?.name || 'Portal Toko'}
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] leading-none mt-0.5">
                <span className="text-slate-400 font-medium hidden sm:inline">Merchant</span>
                <span className="text-slate-300 hidden sm:inline">·</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${merchant?.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className={`font-semibold truncate ${merchant?.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {merchant?.active ? 'Buka' : 'Tutup'}
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

            {/* Quick Order Bell if incoming orders waiting */}
            {incomingOrders.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('incoming');
                  setOperationalSubTab('perlu_masak');
                }}
                className="relative min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] flex items-center gap-1 animate-pulse shadow-xs cursor-pointer shrink-0"
                title={`${incomingOrders.length} Pesanan Masuk Perlu Masak`}
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>{incomingOrders.length}</span>
              </button>
            )}

            {/* Quick Open/Close Button */}
            <button
              onClick={toggleOpenStatus}
              className={`min-h-[40px] px-2.5 sm:px-3 rounded-xl text-[11px] font-extrabold cursor-pointer border transition-colors shrink-0 ${
                merchant?.active
                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {merchant?.active ? 'Tutup' : 'Buka'}
            </button>
          </div>
        </header>

        {/* Desktop Top Header Bar (md:) */}
        <header className="hidden md:flex bg-white border-b border-slate-200/80 px-6 lg:px-8 py-3.5 items-center justify-between sticky top-0 z-10 shadow-2xs">
          <div className="flex items-center gap-3">
            <MerchantStoreLogo merchant={merchant} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base text-slate-900">
                  {merchant?.name || 'Dashboard Merchant'}
                </h2>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-semibold text-slate-600">
                  {activeTab === 'dashboard' && 'Dashboard Rekap Penjualan'}
                  {activeTab === 'incoming' && 'Pesanan Masuk & Operasional Dapur'}
                  {activeTab === 'history' && 'Riwayat & Arsip Pesanan'}
                  {activeTab === 'menu' && 'Katalog Produk & Menu'}
                  {activeTab === 'profile' && 'Profil Outlet & Jam Operasional'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                TumpangGo Merchant • Real-time sync • Update: {lastRefreshedAt.toLocaleTimeString('id-ID')} WIB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className={`w-2 h-2 rounded-full ${merchant?.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="font-semibold text-slate-700">
                {merchant?.active ? 'Outlet Buka' : 'Outlet Tutup'}
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

        {/* Ringtone Incoming Alert Banner */}
        {isRinging && (
          <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 text-white px-4 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-2 sticky top-14 md:top-14 z-30 animate-pulse">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <BellRing className="w-4 h-4 text-white animate-bounce" />
              </div>
              <div>
                <span className="font-extrabold text-xs sm:text-sm tracking-tight block">
                  🔔 PESANAN BARU MASUK!
                </span>
                <span className="text-[11px] text-rose-100">
                  Dapur berdering. Segera konfirmasi pesanan dan estimasi waktu masak.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeTab !== 'incoming' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('incoming');
                    setOperationalSubTab('perlu_masak');
                  }}
                  className="px-3 py-1 bg-white text-rose-700 rounded-lg font-extrabold text-xs shadow-xs hover:bg-rose-50 cursor-pointer"
                >
                  Buka Pesanan
                </button>
              )}
              <button
                type="button"
                onClick={dismissAlert}
                className="px-2.5 py-1 bg-rose-900/40 hover:bg-rose-900/60 text-white rounded-lg font-bold text-xs border border-white/30 cursor-pointer"
              >
                Senyapkan
              </button>
            </div>
          </div>
        )}

        {/* Browser Autoplay Hint Bar */}
        {!isAudioUnlocked && !isMuted && (
          <div 
            onClick={unlockAudio}
            className="bg-amber-50 hover:bg-amber-100 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-900 font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
          >
            <Bell className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Ketuk di sini untuk mengaktifkan notifikasi suara dering telepon saat ada pesanan baru</span>
          </div>
        )}

        {/* Content Body — Added dynamic safe area padding for mobile bottom bar clearance */}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3.5 sm:py-6 w-full flex-1 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:pb-12 min-w-0">

          {/* =========================================================================
              1. TAB: DASHBOARD RECAP (DEFAULT LANDING PAGE)
              ========================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4 sm:space-y-6">
              
              {/* Header with Filter: Harian, Mingguan, Bulanan */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-black text-lg sm:text-xl text-slate-900">
                      Ringkasan Penjualan Toko
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Statistik operasional pesanan dan pendapatan kuliner Anda.
                    </p>
                  </div>

                  {/* Filter Period Controls (Harian, Mingguan, Bulanan) — Full-width on mobile */}
                  <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setDashboardPeriod('TODAY')}
                      className={`flex-1 sm:flex-initial min-h-[38px] px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap text-center ${
                        dashboardPeriod === 'TODAY' 
                          ? 'bg-white text-slate-900 shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Hari Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardPeriod('WEEK')}
                      className={`flex-1 sm:flex-initial min-h-[38px] px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap text-center ${
                        dashboardPeriod === 'WEEK' 
                          ? 'bg-white text-slate-900 shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Mingguan
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardPeriod('MONTH')}
                      className={`flex-1 sm:flex-initial min-h-[38px] px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap text-center ${
                        dashboardPeriod === 'MONTH' 
                          ? 'bg-white text-slate-900 shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Bulan Ini
                    </button>
                  </div>
                </div>

                {/* Primary Hero: Total Order Hari Ini */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-500">Total Order Hari Ini:</span>
                    <strong className="font-mono text-emerald-800 text-sm">{periodData.todayOrdersCount} Pesanan</strong>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Periode Aktif: <strong>{dashboardPeriod === 'TODAY' ? 'Hari Ini' : dashboardPeriod === 'WEEK' ? '7 Hari Terakhir' : 'Bulan Ini'}</strong>
                  </span>
                </div>
              </div>

              {/* Action Banner if orders are waiting in kitchen */}
              {incomingOrders.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <ChefHat className="w-5 h-5 animate-bounce" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-xs sm:text-sm text-amber-950 truncate">
                        {incomingOrders.length} Pesanan Baru Menunggu Dikonfirmasi!
                      </h3>
                      <p className="text-[11px] text-amber-800 leading-snug">
                        Pembayaran sudah terverifikasi admin. Segera tentukan estimasi masak.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('incoming');
                      setOperationalSubTab('perlu_masak');
                    }}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shrink-0 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Proses Sekarang</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Stat Cards: 2 Kolom pada HP & Tablet Portrait, 4 Kolom pada Tablet Landscape & Desktop */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                {/* 1. Total Pesanan */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                    Total Pesanan
                  </span>
                  <div className="mt-1">
                    <span className="font-display font-black text-xl sm:text-2xl lg:text-3xl text-slate-900 block font-mono">
                      {periodData.totalOrdersInPeriod}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5 block truncate">
                      {dashboardPeriod === 'TODAY' ? 'Masuk hari ini' : 'Dalam periode ini'}
                    </span>
                  </div>
                </div>

                {/* 2. Total Omset Selesai */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                    Omset Selesai
                  </span>
                  <div className="mt-1">
                    <span 
                      className="font-display font-black text-base sm:text-xl lg:text-2xl text-emerald-800 block font-mono truncate"
                      title={`Rp ${periodData.completedSales.toLocaleString('id-ID')}`}
                    >
                      Rp {periodData.completedSales.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-emerald-700 font-medium mt-0.5 block truncate">
                      Hak bersih makanan
                    </span>
                  </div>
                </div>

                {/* 3. Pesanan Selesai */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                    Pesanan Selesai
                  </span>
                  <div className="mt-1">
                    <span className="font-display font-black text-xl sm:text-2xl lg:text-3xl text-emerald-700 block font-mono">
                      {periodData.completedOrdersCount}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5 block truncate">
                      Diterima pelanggan
                    </span>
                  </div>
                </div>

                {/* 4. Sedang Berjalan */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                    Sedang Berjalan
                  </span>
                  <div className="mt-1">
                    <span className="font-display font-black text-xl sm:text-2xl lg:text-3xl text-blue-700 block font-mono">
                      {periodData.activeOrdersCount}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-blue-600 font-medium mt-0.5 block truncate">
                      Dapur &amp; Kurir
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Shortcuts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setActiveTab('incoming');
                    setOperationalSubTab('perlu_masak');
                  }}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200/90 hover:border-emerald-300 shadow-xs flex items-center justify-between text-left cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                      <ChefHat className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Buka Pesanan Masuk Dapur</h4>
                      <p className="text-[10px] text-slate-500">Konfirmasi masak &amp; pantau hitung mundur timer</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    setEditingItem({ available: true, categoryId: categories[0]?.id || '' });
                    setShowItemForm(true);
                  }}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200/90 hover:border-emerald-300 shadow-xs flex items-center justify-between text-left cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Tambah Menu Makanan Baru</h4>
                      <p className="text-[10px] text-slate-500">Unggah foto dari galeri HP &amp; atur harga</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* Settlement History Table (Responsive) */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-sm sm:text-base text-slate-900">
                      Rekap Settlement Pencairan Dana
                    </h3>
                    <p className="text-[11px] text-slate-500">Transfer dana penjualan makanan ke rekening bank mitra</p>
                  </div>
                </div>

                {settlements.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada riwayat settlement pencairan dana.
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-left text-xs min-w-[480px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-3">Tanggal</th>
                          <th className="py-2.5 px-3">Rekening Bank</th>
                          <th className="py-2.5 px-3">Pesanan</th>
                          <th className="py-2.5 px-3">Nominal Cair</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {settlements.slice(0, 5).map(s => (
                          <tr key={s.id}>
                            <td className="py-2.5 px-3 font-mono text-[11px]">{new Date(s.createdAt).toLocaleDateString('id-ID')}</td>
                            <td className="py-2.5 px-3 text-[11px]">{s.bankName} - {s.bankAccount}</td>
                            <td className="py-2.5 px-3 text-[11px]">{s.orderCount} pesanan</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-800 text-[11px]">Rp {s.amountToPay.toLocaleString('id-ID')}</td>
                            <td className="py-2.5 px-3">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'Lunas' : 'Diproses'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* =========================================================================
              2. TAB: PESANAN MASUK (OPERASIONAL DAPUR TERSENDIRI)
              ========================================================================= */}
          {activeTab === 'incoming' && (
            <div className="space-y-4 sm:space-y-6">
              
              {/* Header Tab Operasional */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-black text-base sm:text-lg text-slate-900 flex items-center gap-2">
                      <span>Pesanan Masuk &amp; Dapur</span>
                      {incomingOrders.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900">
                          {incomingOrders.length} Baru
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kelola alur dapur: konfirmasi masak, pantau waktu memasak, dan tandai siap dijemput kurir.
                    </p>
                  </div>

                  <button
                    onClick={() => fetchMerchantData(true)}
                    className="self-start sm:self-auto min-h-[36px] px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>Cek Pesanan Baru</span>
                  </button>
                </div>

                {/* Segmented Operational Sub-tabs — Mobile First, 1 Baris Rapi & Proporsional */}
                <div className="w-full bg-slate-100/90 p-1 rounded-xl sm:rounded-2xl border border-slate-200/60 overflow-x-auto scrollbar-none">
                  <div className="grid grid-cols-3 gap-1 min-w-[280px] sm:min-w-0">
                    {/* Tab 1: Perlu Masak */}
                    <button
                      type="button"
                      onClick={() => setOperationalSubTab('perlu_masak')}
                      className={`min-h-[42px] px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 select-none ${
                        operationalSubTab === 'perlu_masak'
                          ? 'bg-white text-slate-900 shadow-xs font-black ring-1 ring-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span className="truncate">Perlu Masak</span>
                      <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                        incomingOrders.length > 0 
                          ? (operationalSubTab === 'perlu_masak' ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300/60' : 'bg-amber-500 text-white animate-pulse') 
                          : 'bg-slate-200/80 text-slate-600'
                      }`}>
                        {incomingOrders.length}
                      </span>
                    </button>

                    {/* Tab 2: Dimasak */}
                    <button
                      type="button"
                      onClick={() => setOperationalSubTab('cooking')}
                      className={`min-h-[42px] px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 select-none ${
                        operationalSubTab === 'cooking'
                          ? 'bg-white text-slate-900 shadow-xs font-black ring-1 ring-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span className="truncate">Dimasak</span>
                      <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                        cookingOrders.length > 0
                          ? (operationalSubTab === 'cooking' ? 'bg-blue-100 text-blue-900 ring-1 ring-blue-300/60' : 'bg-blue-600 text-white')
                          : 'bg-slate-200/80 text-slate-600'
                      }`}>
                        {cookingOrders.length}
                      </span>
                    </button>

                    {/* Tab 3: Siap Diambil */}
                    <button
                      type="button"
                      onClick={() => setOperationalSubTab('ready')}
                      className={`min-h-[42px] px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 select-none ${
                        operationalSubTab === 'ready'
                          ? 'bg-white text-slate-900 shadow-xs font-black ring-1 ring-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span className="truncate">Siap Diambil</span>
                      <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                        readyOrders.length > 0
                          ? (operationalSubTab === 'ready' ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/60' : 'bg-emerald-600 text-white')
                          : 'bg-slate-200/80 text-slate-600'
                      }`}>
                        {readyOrders.length}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2A. SUB-TAB: PERLU MASAK */}
              {operationalSubTab === 'perlu_masak' && (
                <div className="space-y-4">
                  {incomingOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 text-center shadow-xs">
                      <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <h3 className="font-display font-bold text-sm sm:text-base text-slate-800">
                        Tidak Ada Pesanan Baru yang Menunggu Dimasak
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                        Pesanan pelanggan yang sudah lunas dan diverifikasi admin akan otomatis muncul di sini.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-5">
                      {incomingOrders.map(order => (
                        <div key={order.id} className="bg-white rounded-2xl border-2 border-emerald-300 shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
                          <div>
                            {/* Card Header */}
                            <div className="p-3.5 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between">
                              <div>
                                <span className="font-mono text-xs font-black text-slate-900">
                                  #{order.orderNumber || order.id}
                                </span>
                                <span className="block text-[10px] text-slate-500">
                                  {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                                <CheckCircle2 className="w-3 h-3" />
                                LUNAS
                              </span>
                            </div>

                            {/* Card Items */}
                            <div className="p-3.5 space-y-3">
                              <div className="bg-slate-50 rounded-xl p-2.5 space-y-1.5 border border-slate-100">
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

                              {/* Customer and Delivery info */}
                              <div className="text-xs space-y-1 text-slate-700">
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-slate-900">{order.customerName}</span>
                                  <a 
                                    href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-emerald-700 font-mono text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <Phone className="w-3 h-3" />
                                    {order.customerPhone}
                                  </a>
                                </div>
                                <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-start gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                  <span className="line-clamp-2">{order.deliveryAddress}</span>
                                </div>
                              </div>

                              {/* Hak Merchant */}
                              <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
                                <span className="text-slate-500 font-medium">Hak Merchant (Subtotal):</span>
                                <span className="font-mono font-black text-sm text-emerald-800">
                                  Rp {order.subtotal.toLocaleString('id-ID')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Action: Cooking Duration & Confirm / Reject */}
                          <div className="p-3.5 bg-slate-50 border-t border-slate-100 space-y-2.5">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Estimasi Waktu Memasak:</span>
                              </label>
                              <select
                                value={cookEstimateInput[order.id] || 15}
                                onChange={(e) => setCookEstimateInput(prev => ({ ...prev, [order.id]: Number(e.target.value) as CookingDurationMinutes }))}
                                disabled={actionLoadingOrderId === order.id}
                                className="w-full min-h-[40px] px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-xs"
                              >
                                <option value={15}>15 menit</option>
                                <option value={30}>30 menit</option>
                                <option value={45}>45 menit</option>
                                <option value={60}>60 menit</option>
                              </select>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => acceptOrder(order.id)}
                                disabled={actionLoadingOrderId === order.id}
                                className="flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                              >
                                <ChefHat className={`w-4 h-4 ${actionLoadingOrderId === order.id ? 'animate-spin' : ''}`} />
                                <span>{actionLoadingOrderId === order.id ? 'Menyimpan...' : 'Konfirmasi Masak'}</span>
                              </button>
                              <button
                                onClick={() => setRejectModal({ orderId: order.id, visible: true, reason: '' })}
                                disabled={actionLoadingOrderId === order.id}
                                className="min-h-[44px] py-2 px-3 rounded-xl border border-rose-200 bg-white text-rose-600 font-bold text-xs hover:bg-rose-50 cursor-pointer"
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
                    <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-3.5 sm:p-4 space-y-2">
                      <button
                        onClick={() => setShowPendingVerification(!showPendingVerification)}
                        className="w-full flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="font-bold text-xs text-amber-950">
                            {pendingPaymentOrders.length} Pesanan Sedang Menunggu Verifikasi Pembayaran Admin
                          </span>
                        </div>
                        <span className="text-xs text-amber-800 font-bold underline">
                          {showPendingVerification ? 'Sembunyikan' : 'Lihat'}
                        </span>
                      </button>

                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Perhatian: Pesanan ini belum diverifikasi lunas oleh admin. Jangan memasak sebelum status berubah menjadi <strong>Lunas</strong>.
                      </p>

                      {showPendingVerification && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
                          {pendingPaymentOrders.map(order => (
                            <div key={order.id} className="bg-white rounded-xl p-3 border border-amber-200 text-xs space-y-1 shadow-2xs">
                              <div className="flex justify-between items-center">
                                <span className="font-mono font-bold text-slate-800">#{order.orderNumber || order.id}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                  Menunggu Admin
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600">
                                <span>{order.customerName}</span> • <span className="font-mono font-semibold">Rp {order.subtotal.toLocaleString('id-ID')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 2B. SUB-TAB: DIMASAK */}
              {operationalSubTab === 'cooking' && (
                <div>
                  {cookingOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 text-center shadow-xs">
                      <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <h3 className="font-display font-bold text-sm sm:text-base text-slate-800">
                        Tidak Ada Pesanan yang Sedang Dimasak
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                        Pesanan yang Anda konfirmasi dari daftar &ldquo;Perlu Masak&rdquo; akan berjalan di sini dengan hitung mundur timer.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-5">
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

              {/* 2C. SUB-TAB: SIAP DIAMBIL KURIR */}
              {operationalSubTab === 'ready' && (
                <div>
                  {readyOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 text-center shadow-xs">
                      <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <h3 className="font-display font-bold text-sm sm:text-base text-slate-800">
                        Tidak Ada Pesanan Menunggu Penjemputan Kurir
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                        Makanan yang selesai dimasak dan telah ditandai &ldquo;Siap Diambil&rdquo; akan tampil di sini saat kurir TumpangGo menuju toko Anda.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-5">
                      {readyOrders.map(order => (
                        <div key={order.id} className="bg-white rounded-2xl border border-indigo-200 shadow-xs p-4 flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                              <div>
                                <span className="font-mono text-xs font-bold text-slate-900">#{order.orderNumber || order.id}</span>
                                <span className="block text-[10px] text-slate-400">
                                  {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                </span>
                              </div>
                              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                                Siap Diambil Kurir
                              </span>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-2.5 text-xs space-y-1 border border-slate-100">
                              {order.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between text-slate-700">
                                  <span><strong className="text-slate-900">{it.quantity}x</strong> {it.name}</span>
                                  <span className="font-mono">Rp {(it.price * it.quantity).toLocaleString('id-ID')}</span>
                                </div>
                              ))}
                            </div>

                            <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                              <div>Pemesan: <strong>{order.customerName}</strong></div>
                              {order.driverName ? (
                                <div className="text-indigo-800 font-bold flex items-center gap-1">
                                  <span>Kurir Penjemput:</span> <span>{order.driverName}</span>
                                </div>
                              ) : (
                                <div className="text-amber-700 font-semibold">
                                  Menunggu sistem menugaskan kurir terdekat...
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-medium">Subtotal Toko:</span>
                            <span className="font-mono font-bold text-sm text-emerald-800">
                              Rp {order.subtotal.toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* =========================================================================
              3. TAB: RIWAYAT PESANAN
              ========================================================================= */}
          {activeTab === 'history' && (
            <div className="space-y-4 sm:space-y-6">
              
              {/* Header & Filter Controls */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Riwayat Pesanan</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Daftar pesanan dalam pengantaran, selesai, dan dibatalkan.</p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="Cari ID / Nama Pemesan..."
                      className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Sub-filter chips */}
                <div className="flex space-x-1.5 overflow-x-auto pt-2 border-t border-slate-100 scrollbar-none">
                  {[
                    { id: 'ALL', label: 'Semua', count: safeOrders.filter(o => o.status !== OrderStatus.PAYMENT_VERIFIED && o.status !== OrderStatus.COOKING).length },
                    { id: 'READY_OR_DELIVERY', label: 'Dalam Antaran', count: readyOrders.length + inDeliveryOrders.length },
                    { id: 'COMPLETED', label: 'Selesai', count: completedOrders.length },
                    { id: 'CANCELLED', label: 'Batal', count: cancelledOrders.length }
                  ].map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setHistoryFilter(sub.id as any)}
                      className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
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

              {/* Order Cards List */}
              {filteredHistoryOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 text-center shadow-xs">
                  <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <h3 className="font-display font-bold text-sm sm:text-base text-slate-800">Tidak Ada Riwayat Pesanan</h3>
                  <p className="text-xs text-slate-500 mt-1">Pesanan yang telah diproses akan tercatat di sini.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                  {filteredHistoryOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100 flex-wrap gap-1.5">
                          <div>
                            <span className="font-mono text-xs font-bold text-slate-900">#{order.orderNumber || order.id}</span>
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

                        {/* Customer & Courier info */}
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
                            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
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

          {/* =========================================================================
              4. TAB: PRODUK / MENU (FILE UPLOAD & KATEGORI RESMI ADMIN PUSAT)
              ========================================================================= */}
          {activeTab === 'menu' && (
            <div className="space-y-4 sm:space-y-6">
              
              {/* Header Menu */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Katalog Menu Toko</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kelola menu makanan, foto produk, harga, dan ketersediaan stok (Tersedia / Habis).
                  </p>
                </div>

                {/* Section E: Tombol tambah kategori dihapus; hanya tombol Tambah Menu */}
                <button
                  onClick={() => { 
                    setEditingItem({ available: true, categoryId: categories[0]?.id || '' }); 
                    setShowItemForm(true); 
                  }}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Menu</span>
                </button>
              </div>

              {/* Category Filter Chips (Data dari Kategori Resmi Admin Pusat) */}
              {categories.length > 0 ? (
                <div className="flex space-x-1.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                  <button
                    onClick={() => setSelectedMenuCategory('ALL')}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedMenuCategory === 'ALL'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Semua ({menuItems.length})
                  </button>
                  {categories.map(c => {
                    const count = menuItems.filter(m => m.categoryId === c.id).length;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedMenuCategory(c.id)}
                        className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          selectedMenuCategory === c.id
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {c.name} ({count})
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                  ⚠️ Belum ada kategori menu yang ditetapkan oleh Admin Pusat untuk toko Anda. Hubungi Admin Pusat untuk menambahkan kategori.
                </div>
              )}

              {/* Menu Items Grid */}
              {filteredMenuItems.length === 0 ? (
                <div className="py-12 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <Utensils className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <h4 className="font-display font-bold text-sm text-slate-800">Belum ada menu makanan</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Katalog toko masih kosong. Tambahkan menu makanan favorit Anda beserta foto langsung dari galeri HP.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem({ name: '', price: 10000, description: '', categoryId: categories[0]?.id || '', category: categories[0]?.name || 'Menu Utama', available: true, image: '' });
                      setShowItemForm(true);
                    }}
                    className="mt-3 min-h-[44px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Tambah Menu Pertama
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                  {filteredMenuItems.map(item => (
                    <div key={item.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between hover:border-emerald-200 transition-all">
                      <div>
                        {/* Image Preview with availability toggle badge */}
                        <div className="aspect-video w-full bg-slate-100 relative overflow-hidden">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1">
                              <ImageIcon className="w-8 h-8 text-slate-300" />
                              <span className="text-[10px]">Tanpa Foto</span>
                            </div>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => toggleItemAvailability(item)}
                            className={`absolute top-2 right-2 text-[10px] font-extrabold px-2.5 py-1 rounded-full cursor-pointer shadow-xs transition-transform active:scale-95 ${
                              item.available ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                            }`}
                            title="Klik untuk mengubah ketersediaan"
                          >
                            {item.available ? '✓ Tersedia' : '✕ Habis'}
                          </button>
                        </div>

                        <div className="p-3.5 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-display font-bold text-sm text-slate-900 line-clamp-1">{item.name}</h4>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                              {item.category || 'Menu'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                            {item.description || 'Pilihan kuliner khas UMKM Tumpang.'}
                          </p>
                          <div className="pt-2 flex items-center justify-between">
                            <span className="font-mono font-bold text-sm text-emerald-800">
                              Rp {item.price.toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => toggleItemAvailability(item)}
                          className="min-h-[40px] px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
                        >
                          {item.available ? 'Set Habis' : 'Set Tersedia'}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingItem(item); setShowItemForm(true); }}
                            className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center justify-center transition-colors shadow-2xs"
                            title="Edit Menu"
                            aria-label="Edit Menu"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 cursor-pointer flex items-center justify-center transition-colors shadow-2xs"
                            title="Hapus Menu"
                            aria-label="Hapus Menu"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* =========================================================================
              5. TAB: PROFIL & JAM OPERASIONAL
              ========================================================================= */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              
              {/* Left: Store Profile Form */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <MerchantStoreLogo merchant={merchant} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 truncate">
                      {merchant?.name || 'Profil & Jam Operasional'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      Atur jam buka/tutup, nomor kontak WhatsApp, dan rekening bank pencairan.
                    </p>
                  </div>
                </div>

                {profileSaveSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Profil toko berhasil disimpan dan diperbarui!</span>
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Nama Toko / Resto</label>
                      <input
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Nama Pemilik UMKM</label>
                      <input
                        type="text"
                        required
                        value={profileOwner}
                        onChange={(e) => setProfileOwner(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Nomor WhatsApp</label>
                      <input
                        type="text"
                        required
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Kategori Usaha</label>
                      <select
                        value={profileCategory}
                        onChange={(e) => setProfileCategory(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Bakso & Mie">🍜 Bakso &amp; Mie</option>
                        <option value="Nasi & Lauk">🍛 Nasi &amp; Lauk</option>
                        <option value="Sate & Bakaran">🍢 Sate &amp; Bakaran</option>
                        <option value="Cemilan & Jajanan">🍘 Cemilan &amp; Jajanan</option>
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
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                        placeholder="08:00"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Jam Tutup</label>
                      <input
                        type="text"
                        value={profileCloseTime}
                        onChange={(e) => setProfileCloseTime(e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
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

                  {/* Rekening Bank */}
                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                      Rekening Bank untuk Pencairan Penjualan
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Bank</label>
                        <input
                          type="text"
                          value={profileBankName}
                          onChange={(e) => setProfileBankName(e.target.value)}
                          placeholder="BCA / BRI / Mandiri"
                          className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Nomor Rekening</label>
                        <input
                          type="text"
                          value={profileBankAccount}
                          onChange={(e) => setProfileBankAccount(e.target.value)}
                          placeholder="1234567890"
                          className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Atas Nama Rekening</label>
                        <input
                          type="text"
                          value={profileBankHolder}
                          onChange={(e) => setProfileBankHolder(e.target.value)}
                          className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="w-full min-h-[44px] py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingProfile ? 'Menyimpan...' : 'Simpan Profil Toko'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Right: Info Sistem Pembayaran & WebPush Settings */}
              <div className="space-y-4">
                
                {/* Informasi Pembayaran Terpusat TumpangGo */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-emerald-700" />
                      <h3 className="font-display font-bold text-sm text-slate-900">Sistem Pembayaran</h3>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      QRIS TumpangGo
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Seluruh pembayaran pesanan pelanggan (QRIS &amp; Tunai/COD) diproses secara terpusat oleh sistem TumpangGo.
                  </p>

                  <div className="space-y-2 pt-1 text-xs text-slate-600">
                    <div className="p-2.5 bg-emerald-50/70 border border-emerald-100 rounded-xl flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-slate-700 leading-snug">
                        <strong>Bebas Repot:</strong> Anda tidak perlu menyediakan atau mengunggah QRIS pribadi toko.
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-slate-700 leading-snug">
                        <strong>Pencairan Langsung:</strong> Pendapatan bersih disalurkan ke rekening bank yang Anda cantumkan di formulir profil.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Web Push Notification Settings */}
                {isPushSupported && (
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Bell className="w-4 h-4 text-emerald-700" />
                        Notifikasi Layar HP Mati
                      </span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isPushSubscribed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {isPushSubscribed ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Dapatkan pemberitahuan suara &amp; getar saat ada pesanan masuk, bahkan ketika browser sedang di latar belakang.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!isPushSubscribed ? (
                        <button
                          type="button"
                          onClick={subscribePush}
                          disabled={pushLoading}
                          className="min-h-[38px] px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                        >
                          {pushLoading ? 'Mengaktifkan...' : 'Aktifkan Notifikasi'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={sendTestPush}
                            disabled={pushLoading}
                            className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl shadow-2xs cursor-pointer"
                          >
                            {pushLoading ? '...' : 'Tes Notifikasi'}
                          </button>
                          <button
                            type="button"
                            onClick={unsubscribePush}
                            disabled={pushLoading}
                            className="min-h-[38px] px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-bold text-xs rounded-xl cursor-pointer"
                          >
                            Matikan
                          </button>
                        </>
                      )}
                    </div>
                    {pushStatusMsg && (
                      <p className="text-[11px] font-semibold text-emerald-700 pt-1">{pushStatusMsg}</p>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Footer & Secret Hidden Trigger */}
          <footer className="mt-8 pt-6 pb-6 border-t border-slate-200/80 px-4 flex flex-col items-center justify-center text-center">
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

        {/* =========================================================================
            BOTTOM NAVIGATION BAR (Mobile HP Only, < md)
            5 menu utama yang dapat disentuh dengan nyaman oleh jempol, dengan safe area support
            ========================================================================= */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200/90 shadow-lg px-1 sm:px-2 py-1 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] flex items-center justify-around select-none">
          {/* 1. Dashboard */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              activeTab === 'dashboard' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-[9px] sm:text-[10px]">Dashboard</span>
          </button>

          {/* 2. Pesanan Masuk (with live notification badge) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('incoming');
              setOperationalSubTab('perlu_masak');
            }}
            className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 relative cursor-pointer transition-colors ${
              activeTab === 'incoming' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <ChefHat className="w-5 h-5" />
              {incomingOrders.length > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-amber-500 text-white font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-bounce">
                  {incomingOrders.length}
                </span>
              )}
            </div>
            <span className="text-[9px] sm:text-[10px]">Pesanan</span>
          </button>

          {/* 3. Produk / Menu */}
          <button
            type="button"
            onClick={() => setActiveTab('menu')}
            className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              activeTab === 'menu' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-5 h-5" />
            <span className="text-[9px] sm:text-[10px]">Menu</span>
          </button>

          {/* 4. Riwayat Pesanan */}
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              activeTab === 'history' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-[9px] sm:text-[10px]">Riwayat</span>
          </button>

          {/* 5. Profil & Jam Operasional */}
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex-1 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              activeTab === 'profile' ? 'text-emerald-700 font-extrabold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[9px] sm:text-[10px]">Profil</span>
          </button>
        </nav>

      </div>

      {/* =========================================================================
          MODALS
          ========================================================================= */}

      {/* 1. Modal Form Tambah / Edit Menu (File Upload & Kategori Resmi Admin Pusat) */}
      {showItemForm && editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <h3 className="font-display font-bold text-sm sm:text-base text-slate-900">
                {editingItem.id ? 'Edit Menu Makanan' : 'Tambah Menu Makanan Baru'}
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setShowItemForm(false);
                  setItemImageError(null);
                }} 
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
              {/* Field 1: Nama Menu */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  1. Nama Menu Makanan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="Contoh: Bakso Urat Jumbo Spesial"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Field 2 & 3: Harga & Kategori */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    2. Harga (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={500}
                    value={editingItem.price || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                    placeholder="15000"
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    3. Kategori Resmi <span className="text-rose-500">*</span>
                  </label>
                  {categories.length > 0 ? (
                    <select
                      required
                      value={editingItem.categoryId || ''}
                      onChange={(e) => {
                        const sel = categories.find(c => c.id === e.target.value);
                        setEditingItem({
                          ...editingItem,
                          categoryId: e.target.value,
                          category: sel ? sel.name : editingItem.category
                        });
                      }}
                      className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="" disabled>Pilih Kategori...</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                      Belum ada kategori dari Admin Pusat.
                    </div>
                  )}
                </div>
              </div>

              {/* Field 4: Deskripsi */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  4. Deskripsi Menu
                </label>
                <textarea
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Porsi, kuah kaldu, bumbu rempah khas, rasa pedas/manis..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Field 5: Foto Menu Berupa Unggahan File */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  5. Foto Menu (Pilih File Gambar dari HP)
                </label>

                {itemImageError && (
                  <div className="mb-2 p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[11px]">
                    {itemImageError}
                  </div>
                )}

                {/* Preview if image is present */}
                {editingItem.image ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0">
                      <img src={editingItem.image} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-bold text-slate-700 block truncate">Foto Menu Terpilih</span>
                      <span className="text-[10px] text-emerald-700 font-semibold block">Siap disimpan permanen</span>
                      <div className="flex gap-2 mt-1.5">
                        <label className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer">
                          Ganti Foto
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/*"
                            onChange={handleItemImageFileChange}
                            className="hidden"
                          />
                        </label>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => setEditingItem({ ...editingItem, image: '' })}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                        >
                          Hapus Foto
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="w-full min-h-[56px] border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl bg-slate-50 hover:bg-emerald-50/50 flex items-center justify-center gap-2 p-3 cursor-pointer transition-colors text-slate-600">
                    <Upload className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-emerald-800">
                      Pilih Foto dari Galeri / Kamera HP
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      onChange={handleItemImageFileChange}
                      className="hidden"
                    />
                  </label>
                )}
                <span className="text-[10px] text-slate-400 block mt-1">
                  Format didukung: JPEG, PNG, WebP (Maksimal 8MB)
                </span>
              </div>

              {/* Ketersediaan Checkbox */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={editingItem.available !== false}
                    onChange={(e) => setEditingItem({ ...editingItem, available: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Menu Tersedia untuk Dipesan Pelanggan
                  </span>
                </label>
              </div>

              {/* Form Buttons: Sticky at bottom of modal body */}
              <div className="flex gap-2 pt-3 border-t border-slate-100 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    setShowItemForm(false);
                    setItemImageError(null);
                  }}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                >
                  {isSavingItem ? 'Menyimpan...' : 'Simpan Menu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Reject Order Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 sm:p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tolak Pesanan</h3>
            <p className="text-xs text-slate-500">
              Mohon berikan alasan penolakan pesanan ini (misal: bahan baku habis, kendala operasional dapur):
            </p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              placeholder="Contoh: Bahan baku menu habis..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 min-h-[44px] py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => rejectOrder(rejectModal.orderId, rejectModal.reason)}
                className="flex-1 min-h-[44px] py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Tolak Pesanan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. E-Receipt Modal */}
      {selectedReceiptOrder && (
        <EReceiptModal 
          order={selectedReceiptOrder} 
          onClose={() => setSelectedReceiptOrder(null)} 
        />
      )}

    </div>
  );
}

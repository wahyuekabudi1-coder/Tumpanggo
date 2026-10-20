/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Evaluation Workspace
 * Dedicated, private inspection & QA evaluation console for project owners.
 * Allows simultaneous inspection, diagnostics, and cross-portal workflow testing
 * across the 4 independent TumpangGo websites (Customer, Merchant, Driver, Admin).
 * 
 * Primary Brand Color: #315B4F (Natural Forest Green)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldCheck, Store, Bike, ShoppingBag, RefreshCw, Maximize2, Minimize2, 
  ExternalLink, CheckCircle2, XCircle, AlertTriangle, Clock, Activity, 
  Settings, CheckSquare, Layers, ArrowLeft, Copy, Check, Eye, EyeOff, Lock, 
  HelpCircle, ChevronDown, ChevronUp, Play, Zap, Info, Server, Wifi, WifiOff
} from 'lucide-react';
import Logo from './Logo';
import { safeStorage } from '../utils/safeStorage';
import { apiFetch as fetch } from '../utils/apiClient';

export interface PortalConfig {
  id: 'customer' | 'merchant' | 'driver' | 'admin';
  name: string;
  role: string;
  description: string;
  defaultPath: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  healthEndpoint?: string;
}

export const PORTAL_DEFINITIONS: PortalConfig[] = [
  {
    id: 'customer',
    name: 'TumpangGo Pelanggan (Customer)',
    role: 'CUSTOMER',
    description: 'Eksplorasi UMKM kuliner, daftar menu, pemesanan flat Rp 5.000, lacak pesanan & pembayaran QRIS.',
    defaultPath: '/?role=customer',
    icon: ShoppingBag,
    accentColor: '#315B4F',
    badgeBg: 'bg-[#315B4F]/10',
    badgeText: 'text-[#315B4F]',
    healthEndpoint: '/api/config'
  },
  {
    id: 'merchant',
    name: 'TumpangGo Mitra Toko (Merchant)',
    role: 'MERCHANT',
    description: 'Pendaftaran & login pemilik toko, manajemen produk, jam buka, penerimaan pesanan & status masak.',
    defaultPath: '/?role=merchant',
    icon: Store,
    accentColor: '#D97706',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    healthEndpoint: '/api/merchants'
  },
  {
    id: 'driver',
    name: 'TumpangGo Kurir (Driver)',
    role: 'DRIVER',
    description: 'Login kurir lokal, daftar penugasan antar, penerimaan pesanan, pembaruan status jemput & tiba.',
    defaultPath: '/?role=driver',
    icon: Bike,
    accentColor: '#059669',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    healthEndpoint: '/api/drivers'
  },
  {
    id: 'admin',
    name: 'TumpangGo Pusat Kontrol (Admin)',
    role: 'ADMIN',
    description: 'Manajemen merchant & driver, pengawasan pesanan, verifikasi pembayaran, komisi, settlement & log.',
    defaultPath: '/?role=admin',
    icon: ShieldCheck,
    accentColor: '#DC2626',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    healthEndpoint: '/api/health'
  }
];

export type QAStatus = 'NOT_TESTED' | 'PASSED' | 'FAILED' | 'BLOCKED';

export interface QACheckItem {
  id: string;
  portalId: 'customer' | 'merchant' | 'driver' | 'admin';
  title: string;
  description: string;
  status: QAStatus;
  notes?: string;
  testedAt?: string;
}

export interface CrossPortalScenario {
  id: string;
  stepNumber: number;
  title: string;
  action: string;
  expectedResult: string;
  involvedPortals: Array<'customer' | 'merchant' | 'driver' | 'admin'>;
  status: QAStatus;
  notes?: string;
  testedAt?: string;
}

export interface HealthCheckResult {
  portalId: string;
  url: string;
  isOnline: boolean;
  httpStatus?: number;
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

const DEFAULT_QA_ITEMS: QACheckItem[] = [
  // Customer
  { id: 'c1', portalId: 'customer', title: 'Website Pelanggan Dapat Dimuat', description: 'Halaman beranda terbuka tanpa blank screen atau syntax error.', status: 'NOT_TESTED' },
  { id: 'c2', portalId: 'customer', title: 'Daftar Mitra Toko Muncul', description: 'Data toko kuliner Kecamatan Tumpang ter-render dengan foto dan rating.', status: 'NOT_TESTED' },
  { id: 'c3', portalId: 'customer', title: 'Menu Makanan & Minuman Terbuka', description: 'Katalog menu beserta harga dan estimasi waktu masak tampil akurat.', status: 'NOT_TESTED' },
  { id: 'c4', portalId: 'customer', title: 'Pembuatan Pesanan & Ongkir Flat', description: 'Keranjang menghitung subtotal + ongkir flat Rp 5.000 + biaya layanan.', status: 'NOT_TESTED' },
  { id: 'c5', portalId: 'customer', title: 'Pelacakan Status Pesanan', description: 'Status pesanan (Menunggu, Dimasak, Diantar, Selesai) terbarui otomatis.', status: 'NOT_TESTED' },

  // Merchant
  { id: 'm1', portalId: 'merchant', title: 'Login & Aktivasi Toko Bekerja', description: 'Mitra merchant dapat login menggunakan email/WhatsApp dan kata sandi.', status: 'NOT_TESTED' },
  { id: 'm2', portalId: 'merchant', title: 'Manajemen Profil & Jam Buka', description: 'Pengaturan informasi toko, estimasi masak, dan nomor rekening berhasil disimpan.', status: 'NOT_TESTED' },
  { id: 'm3', portalId: 'merchant', title: 'Tambah & Ubah Menu Toko', description: 'Dapat menambahkan item menu baru dan mengubah status ketersediaan.', status: 'NOT_TESTED' },
  { id: 'm4', portalId: 'merchant', title: 'Pesanan Masuk Masuk Real-Time', description: 'Pesanan dari pelanggan muncul pada tab pesanan aktif merchant.', status: 'NOT_TESTED' },
  { id: 'm5', portalId: 'merchant', title: 'Pembaruan Status Masak', description: 'Merchant dapat mengubah status pesanan menjadi sedang dimasak dan siap diantar.', status: 'NOT_TESTED' },

  // Driver
  { id: 'd1', portalId: 'driver', title: 'Login Driver Kurir Bekerja', description: 'Kurir dapat masuk ke portal kurir dengan kredensial yang terdaftar.', status: 'NOT_TESTED' },
  { id: 'd2', portalId: 'driver', title: 'Daftar Penugasan Antar Tampil', description: 'Pesanan yang siap diantar muncul pada daftar antaran kurir.', status: 'NOT_TESTED' },
  { id: 'd3', portalId: 'driver', title: 'Terima Penugasan / Dispatch', description: 'Kurir dapat menerima penugasan dan melihat rincian alamat tujuan.', status: 'NOT_TESTED' },
  { id: 'd4', portalId: 'driver', title: 'Pembaruan Status Pengantaran', description: 'Kurir dapat mengubah status pengantaran menuju lokasi dan selesai antar.', status: 'NOT_TESTED' },

  // Admin
  { id: 'a1', portalId: 'admin', title: 'Login Terproteksi Administrator', description: 'Autentikasi Master Admin dan Administrator bertoken valid.', status: 'NOT_TESTED' },
  { id: 'a2', portalId: 'admin', title: 'Manajemen Merchant & Driver', description: 'Admin dapat meninjau, mengaktifkan, dan mengelola mitra terdaftar.', status: 'NOT_TESTED' },
  { id: 'a3', portalId: 'admin', title: 'Pengawasan Pesanan & Keuangan', description: 'Seluruh pesanan, komisi 10%, dan rekapitulasi settlement tampil terpadu.', status: 'NOT_TESTED' },
  { id: 'a4', portalId: 'admin', title: 'Audit Log & Diagnostik Sistem', description: 'Catatan audit aktivitas login, rotasi password, dan error sistem tercatat rapi.', status: 'NOT_TESTED' }
];

const DEFAULT_SCENARIOS: CrossPortalScenario[] = [
  {
    id: 's1',
    stepNumber: 1,
    title: 'Pendaftaran / Pembaruan Profil Toko',
    action: 'Merchant mendaftarkan toko atau memperbarui jam operasional di Portal Merchant.',
    expectedResult: 'Data merchant tersimpan di database dan status toko terbarui.',
    involvedPortals: ['merchant'],
    status: 'NOT_TESTED'
  },
  {
    id: 's2',
    stepNumber: 2,
    title: 'Sinkronisasi Profil Toko ke Website Pelanggan',
    action: 'Buka Website Pelanggan dan muat ulang daftar merchant.',
    expectedResult: 'Toko yang aktif dan disetujui muncul pada daftar restoran pelanggan.',
    involvedPortals: ['customer', 'merchant'],
    status: 'NOT_TESTED'
  },
  {
    id: 's3',
    stepNumber: 3,
    title: 'Penambahan / Pembaruan Menu Toko',
    action: 'Merchant menambahkan menu baru atau mengubah harga di Dashboard Merchant.',
    expectedResult: 'Menu baru tersimpan dan terhubung ke ID merchant bersangkutan.',
    involvedPortals: ['merchant'],
    status: 'NOT_TESTED'
  },
  {
    id: 's4',
    stepNumber: 4,
    title: 'Refleksi Menu di Sisi Pelanggan',
    action: 'Pelanggan membuka halaman detail toko tersebut.',
    expectedResult: 'Menu baru muncul dengan foto, nama, deskripsi, dan harga yang tepat.',
    involvedPortals: ['customer'],
    status: 'NOT_TESTED'
  },
  {
    id: 's5',
    stepNumber: 5,
    title: 'Pelanggan Melakukan Pemesanan Uji Coba',
    action: 'Pelanggan memilih menu, mengisi nama & WhatsApp, lalu checkout dengan flat Rp 5.000.',
    expectedResult: 'Pesanan terbuat dengan ID unik, status PENDING/PAID, dan kode pembayaran.',
    involvedPortals: ['customer'],
    status: 'NOT_TESTED'
  },
  {
    id: 's6',
    stepNumber: 6,
    title: 'Pesanan Diterima oleh Merchant',
    action: 'Merchant memeriksa tab Pesanan Aktif di Portal Merchant.',
    expectedResult: 'Pesanan baru tampil dengan rincian item pesanan, total harga, dan catatan pelanggan.',
    involvedPortals: ['merchant'],
    status: 'NOT_TESTED'
  },
  {
    id: 's7',
    stepNumber: 7,
    title: 'Penugasan Kurir (Dispatch System)',
    action: 'Merchant menyelesaikan masakan; sistem menetapkan atau menawarkan ke kurir.',
    expectedResult: 'Pesanan masuk ke daftar penugasan kurir di Portal Driver.',
    involvedPortals: ['merchant', 'driver'],
    status: 'NOT_TESTED'
  },
  {
    id: 's8',
    stepNumber: 8,
    title: 'Kurir Menjalankan Pengantaran',
    action: 'Kurir menekan tombol "Ambil Pesanan" lalu "Selesai Antar".',
    expectedResult: 'Status pesanan berubah menjadi DELIVERING kemudian COMPLETED.',
    involvedPortals: ['driver'],
    status: 'NOT_TESTED'
  },
  {
    id: 's9',
    stepNumber: 9,
    title: 'Pembaruan Status Real-Time di Pelanggan',
    action: 'Periksa layar pelacakan pesanan di Website Pelanggan.',
    expectedResult: 'Status berubah sesuai tahapan kurir hingga selesai tanpa reload manual.',
    involvedPortals: ['customer'],
    status: 'NOT_TESTED'
  },
  {
    id: 's10',
    stepNumber: 10,
    title: 'Pencatatan Keuangan & Settlement di Portal Admin',
    action: 'Admin membuka tab Laporan Keuangan & Settlement di Dashboard Admin.',
    expectedResult: 'Pesanan selesai tercatat, komisi 10% terhitung, dan saldo siap di-settle.',
    involvedPortals: ['admin'],
    status: 'NOT_TESTED'
  }
];

interface EvaluationWorkspaceProps {
  onExitWorkspace: () => void;
  onNavigateToPortal: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN') => void;
}

export default function EvaluationWorkspace({ onExitWorkspace, onNavigateToPortal }: EvaluationWorkspaceProps) {
  // Master Admin Auth check
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    return safeStorage.getItem('tumpang_is_master') === 'true' || 
           safeStorage.getItem('tumpang_auth_role') === 'MASTER_ADMIN';
  });
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Layout View mode: 2x2 grid ('all') or focused on one portal
  const [focusedPortal, setFocusedPortal] = useState<'all' | 'customer' | 'merchant' | 'driver' | 'admin'>('all');
  const [activeTab, setActiveTab] = useState<'workspace' | 'checklist' | 'scenarios' | 'diagnostics' | 'settings'>('workspace');

  // Custom Portal URLs
  const [portalUrls, setPortalUrls] = useState<Record<string, string>>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_eval_urls');
      if (saved) return JSON.parse(saved);
    } catch {}
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return {
      customer: `${origin}/?role=customer`,
      merchant: `${origin}/?role=merchant`,
      driver: `${origin}/?role=driver`,
      admin: `${origin}/?role=admin`
    };
  });

  // Iframe states: loading, loaded, error
  const [iframeLoaded, setIframeLoaded] = useState<Record<string, boolean>>({
    customer: false,
    merchant: false,
    driver: false,
    admin: false
  });
  const [iframeErrors, setIframeErrors] = useState<Record<string, string>>({});
  const [iframeTimeouts, setIframeTimeouts] = useState<Record<string, boolean>>({
    customer: false,
    merchant: false,
    driver: false,
    admin: false
  });
  const [reloadCounter, setReloadCounter] = useState<Record<string, number>>({
    customer: 0,
    merchant: 0,
    driver: 0,
    admin: 0
  });

  // Safe runtime error reporting stream from child portals
  const [runtimeErrors, setRuntimeErrors] = useState<Array<{
    id: string;
    portalId: string;
    message: string;
    timestamp: string;
    source?: string;
  }>>([]);

  // Listen to postMessage error events from child frames
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'TUMPANG_RUNTIME_ERROR') {
        setRuntimeErrors(prev => [
          {
            id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            portalId: event.data.portalId || event.data.role?.toLowerCase() || 'unknown',
            message: event.data.message || 'Unknown runtime error',
            timestamp: event.data.timestamp || new Date().toLocaleTimeString('id-ID'),
            source: event.data.source
          },
          ...prev.slice(0, 49)
        ]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Set timeout monitor per portal iframe
  useEffect(() => {
    const timerIds: Record<string, any> = {};
    PORTAL_DEFINITIONS.forEach(portal => {
      if (!iframeLoaded[portal.id]) {
        timerIds[portal.id] = setTimeout(() => {
          setIframeTimeouts(prev => ({ ...prev, [portal.id]: true }));
        }, 12000);
      }
    });

    return () => {
      Object.values(timerIds).forEach(t => clearTimeout(t));
    };
  }, [reloadCounter, iframeLoaded]);

  // Copied indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Diagnostics & Health Checks
  const [healthResults, setHealthResults] = useState<Record<string, HealthCheckResult>>({});
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [lastGlobalHealthCheck, setLastGlobalHealthCheck] = useState<string | null>(null);

  // Manual QA Checklist state
  const [checklist, setChecklist] = useState<QACheckItem[]>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_eval_checklist');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_QA_ITEMS;
  });

  // Cross-portal Scenarios state
  const [scenarios, setScenarios] = useState<CrossPortalScenario[]>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_eval_scenarios');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_SCENARIOS;
  });

  // Save checklist to localStorage whenever updated
  useEffect(() => {
    safeStorage.setItem('tumpang_eval_checklist', JSON.stringify(checklist));
  }, [checklist]);

  // Save scenarios to localStorage whenever updated
  useEffect(() => {
    safeStorage.setItem('tumpang_eval_scenarios', JSON.stringify(scenarios));
  }, [scenarios]);

  // Save portal URLs whenever updated
  useEffect(() => {
    safeStorage.setItem('tumpang_eval_urls', JSON.stringify(portalUrls));
  }, [portalUrls]);

  // Handle Master Account authorization submission
  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authEmail.trim(),
          password: authPassword.trim(),
          role: 'ADMIN'
        })
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok && data?.token && (data?.isMasterAdmin || data?.role === 'MASTER_ADMIN' || authEmail.trim().toLowerCase() === 'tumpanggo@gmail.com')) {
        safeStorage.setItem('tumpang_is_master', 'true');
        safeStorage.setItem('tumpang_auth_role', 'MASTER_ADMIN');
        safeStorage.setItem('tumpang_auth_email', authEmail.trim());
        safeStorage.setItem('tumpang_auth_token', data.token);
        setIsAuthorized(true);
      } else {
        setAuthError(data?.error || 'Akses ditolak: Hanya akun Master Super Admin (tumpanggo@gmail.com) yang diizinkan mengakses Evaluation Workspace.');
      }
    } catch (err: any) {
      setAuthError('Gagal memverifikasi kredensial ke server backend.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Run Health Checks for All Portals
  const runAllHealthChecks = async () => {
    setIsCheckingHealth(true);
    const results: Record<string, HealthCheckResult> = {};

    for (const portal of PORTAL_DEFINITIONS) {
      const endpoint = portal.healthEndpoint || '/api/health';
      const start = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - start);

        results[portal.id] = {
          portalId: portal.id,
          url: portalUrls[portal.id] || portal.defaultPath,
          isOnline: res.ok,
          httpStatus: res.status,
          latencyMs: latency,
          lastChecked: new Date().toLocaleTimeString('id-ID'),
          error: res.ok ? undefined : `HTTP ${res.status}`
        };
      } catch (err: any) {
        const latency = Math.round(performance.now() - start);
        results[portal.id] = {
          portalId: portal.id,
          url: portalUrls[portal.id] || portal.defaultPath,
          isOnline: false,
          latencyMs: latency,
          lastChecked: new Date().toLocaleTimeString('id-ID'),
          error: err.name === 'AbortError' ? 'Koneksi timeout (>6s)' : (err.message || 'Gagal terhubung')
        };
      }
    }

    setHealthResults(results);
    setLastGlobalHealthCheck(new Date().toLocaleTimeString('id-ID'));
    setIsCheckingHealth(false);
  };

  // Initial health check on mount
  useEffect(() => {
    if (isAuthorized) {
      runAllHealthChecks();
    }
  }, [isAuthorized]);

  // Copy helper
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Reset URLs to default
  const resetUrlsToDefault = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const def = {
      customer: `${origin}/?role=customer`,
      merchant: `${origin}/?role=merchant`,
      driver: `${origin}/?role=driver`,
      admin: `${origin}/?role=admin`
    };
    setPortalUrls(def);
  };

  // Update QA item status
  const updateQAItemStatus = (id: string, status: QAStatus, notes?: string) => {
    setChecklist(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status,
          notes: notes !== undefined ? notes : item.notes,
          testedAt: new Date().toLocaleTimeString('id-ID')
        };
      }
      return item;
    }));
  };

  // Update Scenario status
  const updateScenarioStatus = (id: string, status: QAStatus, notes?: string) => {
    setScenarios(prev => prev.map(sc => {
      if (sc.id === id) {
        return {
          ...sc,
          status,
          notes: notes !== undefined ? notes : sc.notes,
          testedAt: new Date().toLocaleTimeString('id-ID')
        };
      }
      return sc;
    }));
  };

  // QA Checklist stats calculation
  const qaStats = useMemo(() => {
    const total = checklist.length;
    const passed = checklist.filter(i => i.status === 'PASSED').length;
    const failed = checklist.filter(i => i.status === 'FAILED').length;
    const blocked = checklist.filter(i => i.status === 'BLOCKED').length;
    const notTested = checklist.filter(i => i.status === 'NOT_TESTED').length;
    const percent = Math.round((passed / total) * 100);
    return { total, passed, failed, blocked, notTested, percent };
  }, [checklist]);

  // Scenarios stats calculation
  const scenarioStats = useMemo(() => {
    const total = scenarios.length;
    const passed = scenarios.filter(s => s.status === 'PASSED').length;
    const failed = scenarios.filter(s => s.status === 'FAILED').length;
    const percent = Math.round((passed / total) * 100);
    return { total, passed, failed, percent };
  }, [scenarios]);

  // If NOT authorized as Master Admin, show secure login barrier
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200/80 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#315B4F]/10 border border-[#315B4F]/20 flex items-center justify-center text-[#315B4F] mb-4">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <span className="px-3 py-1 rounded-full bg-[#315B4F]/10 text-[#315B4F] text-[11px] font-extrabold uppercase tracking-wider mb-2">
              Private Owner Workspace
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 font-display">TumpangGo Evaluation Workspace</h1>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Konsol evaluasi terisolasi untuk menguji 4 portal TumpangGo (Pelanggan, Merchant, Driver, Admin). Akses dibatasi khusus akun <strong>Master Super Admin</strong>.
            </p>
          </div>

          <form onSubmit={handleMasterLogin} className="mt-6 space-y-4">
            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Email Master Account
              </label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="tumpanggo@gmail.com"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#315B4F]/20 focus:border-[#315B4F] font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Masukkan kata sandi Master"
                  className="w-full pl-3.5 pr-10 py-2.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#315B4F]/20 focus:border-[#315B4F] font-semibold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-[#315B4F] hover:bg-[#26483E] active:bg-[#1D362E] text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-[#315B4F]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {authLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Akses...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Buka Evaluation Workspace</span>
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onExitWorkspace}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Website Pelanggan Publik</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* ============================================================ */}
      {/* 1. TOP CONTROL BAR / HEADER                                  */}
      {/* ============================================================ */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Mode Identification */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#315B4F] flex items-center justify-center text-white shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                  TumpangGo Evaluation Workspace
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#315B4F]/10 text-[#315B4F] text-[10px] font-extrabold uppercase">
                  <ShieldCheck className="w-3 h-3" />
                  Master Console
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Inspeksi & komparasi 4 portal independen secara simultan sebelum rilis produksi.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('workspace')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'workspace' 
                  ? 'bg-white text-[#315B4F] shadow-xs font-extrabold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>4-Portal Matrix</span>
            </button>

            <button
              onClick={() => setActiveTab('scenarios')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'scenarios' 
                  ? 'bg-white text-[#315B4F] shadow-xs font-extrabold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Skenario Integrasi</span>
              <span className="ml-0.5 bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">
                {scenarioStats.passed}/{scenarioStats.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('checklist')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'checklist' 
                  ? 'bg-white text-[#315B4F] shadow-xs font-extrabold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>QA Checklist</span>
              <span className="ml-0.5 bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">
                {qaStats.passed}/{qaStats.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'diagnostics' 
                  ? 'bg-white text-[#315B4F] shadow-xs font-extrabold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Diagnostik</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'settings' 
                  ? 'bg-white text-[#315B4F] shadow-xs font-extrabold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>URL Config</span>
            </button>
          </nav>

          {/* Quick Actions & Exit */}
          <div className="flex items-center gap-2">
            <button
              onClick={runAllHealthChecks}
              disabled={isCheckingHealth}
              title="Periksa kesehatan endpoint backend untuk seluruh portal"
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin text-[#315B4F]' : ''}`} />
              <span className="hidden sm:inline">Health Check</span>
            </button>

            <button
              onClick={onExitWorkspace}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              title="Kembali ke halaman utama Pelanggan"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Tutup Workspace</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. MAIN BODY CONTENT                                         */}
      {/* ============================================================ */}
      <main className="flex-1 p-3 sm:p-4 max-w-7xl mx-auto w-full flex flex-col">
        {/* TAB 1: 4-PORTAL MATRIX / PREVIEW WORKSPACE */}
        {activeTab === 'workspace' && (
          <div className="flex-1 flex flex-col gap-3">
            {/* View Mode Controller */}
            <div className="bg-white px-3 py-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-700">Tampilan Evaluasi:</span>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                  <button
                    onClick={() => setFocusedPortal('all')}
                    className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                      focusedPortal === 'all' ? 'bg-[#315B4F] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2×2 Matrix (Semua)
                  </button>
                  {PORTAL_DEFINITIONS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setFocusedPortal(p.id)}
                      className={`px-2 py-1 rounded-md font-bold transition cursor-pointer capitalize ${
                        focusedPortal === p.id ? 'bg-[#315B4F] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {p.id}
                    </button>
                  ))}
                </div>
              </div>

              {lastGlobalHealthCheck && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>Pemeriksaan terakhir: <strong>{lastGlobalHealthCheck}</strong></span>
                </div>
              )}
            </div>

            {/* 4-Portal Grid Container */}
            <div className={`grid gap-3 flex-1 ${
              focusedPortal === 'all' 
                ? 'grid-cols-1 lg:grid-cols-2' 
                : 'grid-cols-1'
            }`}>
              {PORTAL_DEFINITIONS.filter(p => focusedPortal === 'all' || focusedPortal === p.id).map(portal => {
                const IconComponent = portal.icon;
                const portalUrl = portalUrls[portal.id] || portal.defaultPath;
                const health = healthResults[portal.id];
                const isLoaded = iframeLoaded[portal.id];
                const reloadKey = `${portal.id}_${reloadCounter[portal.id] || 0}`;

                return (
                  <div 
                    key={portal.id}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden min-h-[480px] lg:min-h-[540px]"
                  >
                    {/* Portal Header */}
                    <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${portal.accentColor}18`, color: portal.accentColor }}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                              {portal.name}
                            </h2>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${portal.badgeBg} ${portal.badgeText}`}>
                              {portal.role}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono truncate">
                            <span className="truncate max-w-[200px] sm:max-w-[280px]" title={portalUrl}>
                              {portalUrl}
                            </span>
                            <button
                              onClick={() => copyToClipboard(portalUrl, `url_${portal.id}`)}
                              className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                              title="Salin URL Portal"
                            >
                              {copiedKey === `url_${portal.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Header Controls */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Health Badge */}
                        {health && (
                          <div 
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              health.isOnline 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                            title={`Status Endpoint: ${health.httpStatus || health.error || 'N/A'} (${health.latencyMs}ms)`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${health.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span>{health.isOnline ? `${health.latencyMs}ms` : 'Error'}</span>
                          </div>
                        )}

                        {/* Reload Iframe */}
                        <button
                          onClick={() => {
                            setIframeLoaded(prev => ({ ...prev, [portal.id]: false }));
                            setIframeTimeouts(prev => ({ ...prev, [portal.id]: false }));
                            setReloadCounter(prev => ({ ...prev, [portal.id]: (prev[portal.id] || 0) + 1 }));
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 hover:text-slate-900 transition cursor-pointer"
                          title="Muat ulang panel portal ini"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        {/* Maximize / Restore Focus */}
                        <button
                          onClick={() => setFocusedPortal(focusedPortal === portal.id ? 'all' : portal.id)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 hover:text-slate-900 transition cursor-pointer"
                          title={focusedPortal === portal.id ? "Kembalikan ke tampilan 2x2" : "Fokuskan portal ini satu layar penuh"}
                        >
                          {focusedPortal === portal.id ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        </button>

                        {/* Open Original in New Tab */}
                        <a
                          href={portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-[#315B4F]/10 hover:bg-[#315B4F]/20 text-[#315B4F] font-bold transition flex items-center gap-1 text-[11px]"
                          title="Buka portal asli di tab baru peramban"
                        >
                          <span className="hidden sm:inline">Buka Asli</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Iframe Viewport Container */}
                    <div className="relative flex-1 bg-slate-50 w-full min-h-[380px]">
                      {/* Timeout / Embedding Restriction Fallback */}
                      {!isLoaded && iframeTimeouts[portal.id] ? (
                        <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center p-6 text-center z-20">
                          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-3 shadow-2xs">
                            <AlertTriangle className="w-6 h-6" />
                          </div>
                          <h3 className="font-extrabold text-xs sm:text-sm text-slate-800">
                            Waktu Muat Melebihi Batas atau Iframe Terblokir
                          </h3>
                          <p className="text-[11px] text-slate-500 max-w-sm mt-1.5 leading-relaxed">
                            Situs mungkin menerapkan kebijakan keamanan peramban (<em>CSP</em>, <em>X-Frame-Options</em>, atau partisi cookies pihak ketiga). Anda tetap dapat mengevaluasi portal ini secara penuh pada jendela terpisah.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                            <a
                              href={portalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 bg-[#315B4F] hover:bg-[#26483E] text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition"
                            >
                              <span>Buka Website Asli di Tab Baru</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => {
                                setIframeLoaded(prev => ({ ...prev, [portal.id]: false }));
                                setIframeTimeouts(prev => ({ ...prev, [portal.id]: false }));
                                setReloadCounter(prev => ({ ...prev, [portal.id]: (prev[portal.id] || 0) + 1 }));
                              }}
                              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Coba Muat Ulang</span>
                            </button>
                          </div>
                        </div>
                      ) : !isLoaded ? (
                        /* Loading Spinner */
                        <div className="absolute inset-0 bg-slate-50/90 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-10">
                          <RefreshCw className="w-6 h-6 animate-spin text-[#315B4F] mb-2" />
                          <p className="text-xs font-bold text-slate-700">Memuat {portal.name}...</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{portalUrl}</p>
                          <p className="text-[10px] text-slate-400 mt-2">Batas waktu deteksi 12 detik...</p>
                        </div>
                      ) : null}

                      {/* Embedded Iframe */}
                      <iframe
                        key={reloadKey}
                        src={portalUrl}
                        title={portal.name}
                        onLoad={() => {
                          setIframeLoaded(prev => ({ ...prev, [portal.id]: true }));
                          setIframeTimeouts(prev => ({ ...prev, [portal.id]: false }));
                        }}
                        className="w-full h-full border-0 absolute inset-0 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                      />
                    </div>

                    {/* Panel Footer Security Note */}
                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between gap-2">
                      <span className="truncate">{portal.description}</span>
                      <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">Isolated Iframe</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CROSS-PORTAL INTEGRATION SCENARIOS */}
        {activeTab === 'scenarios' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 font-display flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#315B4F]" />
                  <span>Skenario Pengujian Lintas Portal (Cross-Portal Workflow)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  10 skenario pengujian komprehensif untuk mengevaluasi apakah keempat portal beroperasi selaras sebagai satu ekosistem utuh.
                </p>
              </div>

              {/* Progress Summary */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-700">Kemajuan Uji:</div>
                  <div className="text-sm font-extrabold text-[#315B4F]">{scenarioStats.passed} dari {scenarioStats.total} Selesai ({scenarioStats.percent}%)</div>
                </div>
                <div className="w-24 h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div 
                    className="h-full bg-[#315B4F] transition-all"
                    style={{ width: `${scenarioStats.percent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Scenarios List */}
            <div className="space-y-3">
              {scenarios.map((sc) => (
                <div 
                  key={sc.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    sc.status === 'PASSED'
                      ? 'bg-emerald-50/60 border-emerald-200/80'
                      : sc.status === 'FAILED'
                        ? 'bg-rose-50/60 border-rose-200/80'
                        : 'bg-slate-50/70 border-slate-200/70'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="w-7 h-7 rounded-xl bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                        {sc.stepNumber}
                      </span>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-xs sm:text-sm text-slate-900">{sc.title}</h3>
                          <div className="flex items-center gap-1">
                            {sc.involvedPortals.map(p => (
                              <span key={p} className="px-1.5 py-0.2 rounded bg-white text-slate-700 font-bold border border-slate-200 text-[10px] uppercase">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 font-medium">
                          <strong>Tindakan:</strong> {sc.action}
                        </p>
                        <p className="text-xs text-slate-500">
                          <strong>Ekspektasi:</strong> {sc.expectedResult}
                        </p>
                        {sc.testedAt && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Diperiksa pada: {sc.testedAt}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Toggle Buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {(['NOT_TESTED', 'PASSED', 'FAILED'] as QAStatus[]).map(st => (
                        <button
                          key={st}
                          onClick={() => updateScenarioStatus(sc.id, st)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                            sc.status === st
                              ? st === 'PASSED'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : st === 'FAILED'
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-slate-700 text-white shadow-xs'
                              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {st === 'NOT_TESTED' ? 'Belum Diuji' : st === 'PASSED' ? 'Lulus' : 'Gagal'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: STRUCTURED MANUAL QA CHECKLIST */}
        {activeTab === 'checklist' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 font-display flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-[#315B4F]" />
                  <span>Daftar Periksa QA Manual (Manual QA Checklist)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Catat pengujian fungsional per portal: Not Tested, Passed, Failed, atau Blocked.
                </p>
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {qaStats.passed} Lulus
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                  {qaStats.failed} Gagal
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  {qaStats.blocked} Terblokir
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">
                  {qaStats.notTested} Belum Diuji
                </span>
              </div>
            </div>

            {/* Checklist Grouped by Portal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PORTAL_DEFINITIONS.map(portal => {
                const items = checklist.filter(i => i.portalId === portal.id);
                const IconComponent = portal.icon;

                return (
                  <div key={portal.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
                      <div 
                        className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
                        style={{ backgroundColor: `${portal.accentColor}20`, color: portal.accentColor }}
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <h3 className="font-extrabold text-xs text-slate-900">{portal.name}</h3>
                    </div>

                    <div className="space-y-2">
                      {items.map(item => (
                        <div 
                          key={item.id}
                          className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-800">{item.title}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                            </div>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              item.status === 'PASSED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'FAILED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : item.status === 'BLOCKED'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.status}
                            </span>
                          </div>

                          {/* Quick Status Setter */}
                          <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                            {(['NOT_TESTED', 'PASSED', 'FAILED', 'BLOCKED'] as QAStatus[]).map(st => (
                              <button
                                key={st}
                                onClick={() => updateQAItemStatus(item.id, st)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition cursor-pointer ${
                                  item.status === st
                                    ? 'bg-slate-800 text-white'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: DIAGNOSTICS & SYSTEM HEALTH */}
        {activeTab === 'diagnostics' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 font-display flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#315B4F]" />
                  <span>Diagnostik Kesehatan API & Ketersediaan Portal</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Status keterjangkauan endpoint backend, waktu respon (latensi), dan verifikasi ketersediaan.
                </p>
              </div>

              <button
                onClick={runAllHealthChecks}
                disabled={isCheckingHealth}
                className="px-4 py-2 bg-[#315B4F] hover:bg-[#26483E] text-white font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                <span>Uji Ulang Seluruh Endpoint</span>
              </button>
            </div>

            {/* Diagnostic Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PORTAL_DEFINITIONS.map(portal => {
                const res = healthResults[portal.id];
                const IconComponent = portal.icon;

                return (
                  <div key={portal.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                          style={{ backgroundColor: `${portal.accentColor}20`, color: portal.accentColor }}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="font-extrabold text-xs text-slate-900">{portal.role}</div>
                      </div>

                      <span className={`w-2.5 h-2.5 rounded-full ${res?.isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Endpoint:</span>
                        <span className="font-mono font-bold text-slate-700">{portal.healthEndpoint}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>HTTP Status:</span>
                        <span className={`font-bold ${res?.isOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {res?.httpStatus || (res?.isOnline ? '200 OK' : 'Offline')}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Latensi:</span>
                        <span className="font-bold text-slate-700">{res?.latencyMs !== undefined ? `${res.latencyMs} ms` : '—'}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Terakhir Uji:</span>
                        <span className="text-slate-600">{res?.lastChecked || '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Diagnostics Guidance Note */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-slate-800">
                <Info className="w-4 h-4 text-[#315B4F]" />
                <span>Pedoman Keamanan & Evaluasi Iframe:</span>
              </div>
              <p className="leading-relaxed">
                Event <em>onLoad</em> pada elemen iframe membuktikan bahwa dokumen web berhasil di-request oleh browser, namun tidak menjamin bahwa backend atau session state bekerja secara optimal. Gunakan tombol <strong>Buka Asli</strong> untuk menguji portal pada jendela penuh browser guna mengevaluasi perilaku penyimpanan sesi (cookies/localStorage) secara independen.
              </p>
            </div>

            {/* Frontend Runtime Error Logs (Safe Cross-Portal Stream) */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <h3 className="text-xs font-extrabold text-slate-900">
                    Log Error Runtime Frontend (Live Error Stream)
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    runtimeErrors.length > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {runtimeErrors.length > 0 ? `${runtimeErrors.length} Error Terdeteksi` : 'Tidak Ada Error'}
                  </span>
                </div>

                {runtimeErrors.length > 0 && (
                  <button
                    onClick={() => setRuntimeErrors([])}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-bold px-2 py-1 rounded bg-white border border-slate-200 cursor-pointer"
                  >
                    Bersihkan Log
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                <strong>Catatan Batas Keamanan Cross-Origin:</strong> Peramban modern menerapkan <em>Same-Origin Policy</em> sehingga Workspace tidak dapat mengintip objek JavaScript iframe secara ilegal. Log di bawah ini ditangkap melalui jalur pesan aman (<code>postMessage</code>) yang dikirimkan oleh portal saat terjadi error JavaScript yang tidak tertangani.
              </p>

              {runtimeErrors.length === 0 ? (
                <div className="p-3 bg-white rounded-xl border border-slate-200/80 text-center text-xs text-slate-400">
                  Belum ada error runtime JavaScript yang dilaporkan oleh frame portal.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {runtimeErrors.map(err => (
                    <div key={err.id} className="p-2.5 bg-rose-50/70 rounded-xl border border-rose-200/80 text-xs flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-rose-900 uppercase text-[10px] bg-rose-200/60 px-1.5 py-0.2 rounded">
                            {err.portalId}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{err.timestamp}</span>
                        </div>
                        <p className="text-slate-800 font-mono text-[11px] break-words">{err.message}</p>
                        {err.source && <p className="text-[10px] text-slate-400 truncate">{err.source}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: PORTAL URL SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 font-display flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#315B4F]" />
                  <span>Konfigurasi URL Portal (Portal URLs Configuration)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Sesuaikan alamat URL masing-masing portal jika di-deploy pada subdomain atau server yang terpisah.
                </p>
              </div>

              <button
                onClick={resetUrlsToDefault}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Reset ke Default Origin
              </button>
            </div>

            {/* URL Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PORTAL_DEFINITIONS.map(portal => (
                <div key={portal.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <label className="block text-xs font-extrabold text-slate-800">
                    URL {portal.name}
                  </label>
                  <p className="text-[11px] text-slate-500">{portal.description}</p>
                  <input
                    type="url"
                    value={portalUrls[portal.id] || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPortalUrls(prev => ({ ...prev, [portal.id]: val }));
                    }}
                    placeholder={portal.defaultPath}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#315B4F]/20 focus:border-[#315B4F] font-mono text-slate-900"
                  />
                  <div className="text-[10px] text-slate-400">
                    Default: <span className="font-mono">{portal.defaultPath}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

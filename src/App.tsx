/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import CustomerView from './components/CustomerView.tsx';
import MerchantView from './components/MerchantView.tsx';
import DriverView from './components/DriverView.tsx';
import AdminView from './components/AdminView.tsx';
import AuthModal from './components/AuthModal.tsx';
import PortalLogin from './components/PortalLogin.tsx';
import MerchantRegisterPage from './components/MerchantRegisterPage.tsx';
import MerchantPortalLanding from './components/MerchantPortalLanding.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import MasterPortalBar from './components/MasterPortalBar.tsx';
import EvaluationWorkspace from './components/EvaluationWorkspace.tsx';
import { SystemConfig } from './types.ts';
import { safeStorage } from './utils/safeStorage.ts';
import { apiFetch as fetch, extractArrayResponse } from './utils/apiClient.ts';
import { ShieldAlert, Key, HelpCircle, Store, Navigation, ChevronRight } from 'lucide-react';
import { useSEO } from './hooks/useSEO.ts';

export default function App() {
  const [currentRole, setCurrentRole] = useState<'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN'>(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname.toLowerCase();
      if (pathname === '/merchant' || pathname.startsWith('/merchant/')) {
        return 'MERCHANT';
      }
      if (pathname === '/driver' || pathname.startsWith('/driver/')) {
        return 'DRIVER';
      }
      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        return 'ADMIN';
      }

      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role')?.toUpperCase();
      if (roleParam && ['CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN'].includes(roleParam)) {
        return roleParam as any;
      }
      const isMaster = safeStorage.getItem('tumpang_is_master') === 'true' || safeStorage.getItem('tumpang_auth_role') === 'MASTER_ADMIN';
      const savedPortal = safeStorage.getItem('tumpang_current_portal');
      if (isMaster && savedPortal && ['CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN'].includes(savedPortal)) {
        return savedPortal as any;
      }
    }
    return 'CUSTOMER';
  });
  const [isMasterAdmin, setIsMasterAdmin] = useState<boolean>(() => {
    return safeStorage.getItem('tumpang_is_master') === 'true' || safeStorage.getItem('tumpang_auth_role') === 'MASTER_ADMIN';
  });

  // Dynamic SEO Synchronization at App Level for Internal Roles
  useSEO({
    isNoIndex: currentRole !== 'CUSTOMER',
    title: currentRole === 'ADMIN'
      ? 'Dashboard Admin – TumpangGo Internal'
      : currentRole === 'DRIVER'
        ? 'Portal Driver – TumpangGo Internal'
        : undefined
  });

  // Dynamic PWA Manifest Synchronization based on active role
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    const manifestHref = currentRole === 'MERCHANT'
      ? '/manifest-merchant.json'
      : currentRole === 'DRIVER'
        ? '/manifest-driver.json'
        : '/manifest.json';
    if (link.getAttribute('href') !== manifestHref) {
      link.setAttribute('href', manifestHref);
    }
  }, [currentRole]);
  const [activeMerchantId, setActiveMerchantId] = useState<string>(() => safeStorage.getItem('tumpang_active_merchant_id') || '');
  const [activeDriverId, setActiveDriverId] = useState<string>(() => safeStorage.getItem('tumpang_active_driver_id') || '');
  const [merchantPortalTab, setMerchantPortalTab] = useState<'login' | 'register'>('login');
  const [verifiedEmail, setVerifiedEmail] = useState<string>(() => safeStorage.getItem('tumpang_auth_email') || '');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    id: 'config_1',
    qrisImage: '/qris-merchant.png',
    defaultDeliveryFee: 5000,
    serviceFee: 2000
  });

  const checkIsRegisterPage = () => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    return page === 'merchant-register' || page === 'partner-register' || page === 'register-merchant';
  };

  const checkIsMerchantPortal = () => {
    return false;
  };

  const [isRegisterPage, setIsRegisterPage] = useState<boolean>(() => {
    return checkIsRegisterPage();
  });

  const [isMerchantPortal, setIsMerchantPortal] = useState<boolean>(false);

  const [isEvaluationWorkspace, setIsEvaluationWorkspace] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const ws = params.get('workspace') || params.get('eval') || params.get('evaluation');
    return page === 'workspace' || page === 'evaluation' || ws === 'true' || ws === '1';
  });

  // Check URL parameters on mount and handle ?page=merchant-portal / merchant-register
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const ws = params.get('workspace') || params.get('eval') || params.get('evaluation');
    if (page === 'workspace' || page === 'evaluation' || ws === 'true' || ws === '1') {
      setIsEvaluationWorkspace(true);
    }
    if (page === 'merchant-portal' || page === 'portal-merchant') {
      setIsMerchantPortal(false);
      setIsRegisterPage(false);
      setCurrentRole('MERCHANT');
      setMerchantPortalTab('login');
      if (typeof window !== 'undefined' && window.location.search.includes('page=merchant-portal')) {
        window.history.replaceState(null, '', '/?role=merchant');
      }
    } else if (page === 'merchant-register' || page === 'partner-register' || page === 'register-merchant') {
      setIsRegisterPage(true);
      setIsMerchantPortal(false);
      // Clean up /merchant if present in pathname to prevent 404 on refresh or sub-navigation
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState(null, '', `/?page=${encodeURIComponent(page)}`);
      }
    }
    const roleParam = params.get('role')?.toUpperCase();
    const idParam = params.get('id') || params.get('merchantId') || params.get('driverId');
    const demoParam = params.get('demo') || params.get('dev');

    if (roleParam && ['CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN'].includes(roleParam)) {
      setCurrentRole(roleParam as any);
      if (roleParam === 'MERCHANT') {
        if (idParam) setActiveMerchantId(idParam);
        const newUrl = idParam ? `/merchant?id=${encodeURIComponent(idParam)}` : '/merchant';
        window.history.replaceState(null, '', newUrl);
      } else if (roleParam === 'DRIVER') {
        if (idParam) setActiveDriverId(idParam);
        const newUrl = idParam ? `/driver?id=${encodeURIComponent(idParam)}` : '/driver';
        window.history.replaceState(null, '', newUrl);
      }
    }

    if (demoParam === 'true') {
      setIsDemoMode(true);
    }

    // Support browser Back/Forward navigation
    const handlePopState = () => {
      const isReg = checkIsRegisterPage();
      setIsRegisterPage(isReg);
      const isPortal = checkIsMerchantPortal();
      setIsMerchantPortal(isPortal);
      const currentParams = new URLSearchParams(window.location.search);
      const curRole = currentParams.get('role')?.toUpperCase();
      if (curRole && ['CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN'].includes(curRole)) {
        setCurrentRole(curRole as any);
      } else if (window.location.pathname.startsWith('/merchant')) {
        setCurrentRole('MERCHANT');
      } else if (window.location.pathname.startsWith('/driver')) {
        setCurrentRole('DRIVER');
      } else if (window.location.pathname.startsWith('/admin')) {
        setCurrentRole('ADMIN');
      } else {
        setCurrentRole('CUSTOMER');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch configuration on load
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.qrisImage) {
          setSystemConfig(data);
        }
      })
      .catch(err => console.error('Error fetching config:', err));
  }, []);

  // Fetch lists for custom selection/login portal
  useEffect(() => {
    setLoadingSelection(true);
    Promise.all([
      fetch('/api/merchants')
        .then(async res => {
          if (!res.ok) return [];
          const data = await res.json();
          return extractArrayResponse<any>(data, 'merchants');
        })
        .catch(() => []),
      fetch('/api/drivers')
        .then(async res => {
          if (!res.ok) return [];
          const data = await res.json();
          return extractArrayResponse<any>(data, 'drivers');
        })
        .catch(() => [])
    ]).then(([merData, drData]) => {
      setMerchants(Array.isArray(merData) ? merData : []);
      setDrivers(Array.isArray(drData) ? drData : []);
      setLoadingSelection(false);
    });
  }, []);

  // Revalidate session on mount via /api/auth/me
  useEffect(() => {
    const token = safeStorage.getItem('tumpang_auth_token');
    if (token) {
      fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.authenticated && data.user) {
            const isMaster = Boolean(
              data.user.isMasterAdmin || 
              data.user.role === 'MASTER_ADMIN' || 
              (data.user.email && (
                data.user.email.toLowerCase() === 'tumpanggo@gmail.com' ||
                data.user.email.toLowerCase() === 'suaiimokeras@gmail.com'
              ))
            );
            if (isMaster) {
              setIsMasterAdmin(true);
              setVerifiedEmail(data.user.email || 'tumpanggo@gmail.com');
              safeStorage.setItem('tumpang_is_master', 'true');
              safeStorage.setItem('tumpang_auth_role', 'MASTER_ADMIN');
              const savedMId = safeStorage.getItem('tumpang_active_merchant_id') || data.user.activeMerchantId || data.user.entityId;
              if (savedMId) {
                setActiveMerchantId(savedMId);
                safeStorage.setItem('tumpang_active_merchant_id', savedMId);
              }
            } else if (data.user.email) {
              setVerifiedEmail(data.user.email);
              if (data.user.role === 'MERCHANT') {
                const targetMId = data.user.entityId || data.user.id || safeStorage.getItem('tumpang_active_merchant_id');
                if (targetMId) {
                  setActiveMerchantId(targetMId);
                  safeStorage.setItem('tumpang_active_merchant_id', targetMId);
                }
              }
            }
          } else {
            if (safeStorage.getItem('tumpang_is_master') === 'true') {
              setIsMasterAdmin(false);
              safeStorage.removeItem('tumpang_is_master');
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Safe runtime error reporting to parent Evaluation Workspace if running in an iframe
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'TUMPANG_RUNTIME_ERROR',
            portalId: currentRole.toLowerCase(),
            role: currentRole,
            message: event.message || 'Uncaught JavaScript Error',
            source: event.filename ? `${event.filename}:${event.lineno}` : undefined,
            timestamp: new Date().toLocaleTimeString('id-ID')
          }, '*');
        }
      } catch {}
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      try {
        if (window.parent && window.parent !== window) {
          const reason = event.reason;
          const msg = reason?.message || (typeof reason === 'string' ? reason : 'Unhandled Promise Rejection');
          window.parent.postMessage({
            type: 'TUMPANG_RUNTIME_ERROR',
            portalId: currentRole.toLowerCase(),
            role: currentRole,
            message: msg,
            timestamp: new Date().toLocaleTimeString('id-ID')
          }, '*');
        }
      } catch {}
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [currentRole]);

  // Helper for admin email check
  const isAdminEmail = (email: string) => {
    if (!email) return false;
    const e = email.trim().toLowerCase();
    return (
      e === 'tumpanggo@gmail.com' ||
      e === 'tumpanggo' ||
      e === 'suaiimokeras@gmail.com' ||
      e === 'suaiimokeras' ||
      e === 'admin@tumpanggo.com' ||
      e === 'sawahjayagroup@gmail.com' ||
      e === 'sawahjayatrans@gmail.com' ||
      e === 'admin' ||
      e.includes('admin')
    );
  };

  // Master Admin auto-selection of first entity if none is selected or invalid
  useEffect(() => {
    if (isMasterAdmin) {
      if (currentRole === 'MERCHANT' && (!activeMerchantId || !merchants.some(m => m.id === activeMerchantId)) && merchants.length > 0) {
        setActiveMerchantId(merchants[0].id);
      } else if (currentRole === 'DRIVER' && (!activeDriverId || !drivers.some(d => d.id === activeDriverId)) && drivers.length > 0) {
        setActiveDriverId(drivers[0].id);
      }
    }
  }, [isMasterAdmin, currentRole, activeMerchantId, activeDriverId, merchants, drivers]);

  // Auto-route logged in merchant owners to their specific store (regular merchants)
  useEffect(() => {
    const safeMerchants = Array.isArray(merchants) ? merchants : [];
    if (!isMasterAdmin && currentRole === 'MERCHANT' && !activeMerchantId && verifiedEmail && !isAdminEmail(verifiedEmail) && safeMerchants.length > 0) {
      const ownedMerchant = safeMerchants.find(m => m && m.email?.trim().toLowerCase() === verifiedEmail.trim().toLowerCase());
      if (ownedMerchant) {
        setActiveMerchantId(ownedMerchant.id);
      } else {
        // Logged in email does not own any merchant, reset session
        setVerifiedEmail('');
        safeStorage.removeItem('tumpang_auth_email');
      }
    }
  }, [isMasterAdmin, currentRole, activeMerchantId, verifiedEmail, merchants]);

  // Auto-route logged in drivers to their specific driver panel (regular drivers)
  useEffect(() => {
    const safeDrivers = Array.isArray(drivers) ? drivers : [];
    if (!isMasterAdmin && currentRole === 'DRIVER' && !activeDriverId && verifiedEmail && !isAdminEmail(verifiedEmail) && safeDrivers.length > 0) {
      const matchedDriver = safeDrivers.find(d => d && d.email?.trim().toLowerCase() === verifiedEmail.trim().toLowerCase());
      if (matchedDriver) {
        setActiveDriverId(matchedDriver.id);
      } else {
        // Logged in email does not match any driver, reset session
        setVerifiedEmail('');
        safeStorage.removeItem('tumpang_auth_email');
      }
    }
  }, [isMasterAdmin, currentRole, activeDriverId, verifiedEmail, drivers]);

  const handleRoleSelection = (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN', id?: string, initialTab?: 'login' | 'register', email?: string) => {
    setCurrentRole(role);
    safeStorage.setItem('tumpang_current_portal', role);
    if (email) {
      setVerifiedEmail(email);
      safeStorage.setItem('tumpang_auth_email', email);
    } else if (!isMasterAdmin) {
      const stored = safeStorage.getItem('tumpang_auth_email');
      if (stored) {
        setVerifiedEmail(stored);
      } else {
        setVerifiedEmail('');
      }
    }
    if (role === 'MERCHANT') {
      const targetMId = id || activeMerchantId || safeStorage.getItem('tumpang_active_merchant_id') || (merchants[0]?.id || '');
      setActiveMerchantId(targetMId);
      if (targetMId) safeStorage.setItem('tumpang_active_merchant_id', targetMId);
      setMerchantPortalTab(initialTab || 'login');
      if (typeof window !== 'undefined' && window.location.pathname !== '/merchant') {
        window.history.pushState(null, '', targetMId ? `/merchant?id=${encodeURIComponent(targetMId)}` : '/merchant');
      }
    } else if (role === 'DRIVER') {
      const targetDId = id || activeDriverId || safeStorage.getItem('tumpang_active_driver_id') || (drivers[0]?.id || '');
      setActiveDriverId(targetDId);
      if (targetDId) safeStorage.setItem('tumpang_active_driver_id', targetDId);
      if (typeof window !== 'undefined' && window.location.pathname !== '/driver') {
        window.history.pushState(null, '', targetDId ? `/driver?id=${encodeURIComponent(targetDId)}` : '/driver');
      }
    } else if (role === 'ADMIN') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/admin') {
        window.history.pushState(null, '', '/admin');
      }
    } else if (role === 'CUSTOMER') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
    }
    setShowAuthModal(false);
  };

  const handleMasterLogout = () => {
    setIsMasterAdmin(false);
    setVerifiedEmail('');
    safeStorage.removeItem('tumpang_auth_email');
    safeStorage.removeItem('tumpang_auth_token');
    safeStorage.removeItem('tumpang_auth_role');
    safeStorage.removeItem('tumpang_is_master');
    safeStorage.removeItem('tumpang_current_portal');
    safeStorage.removeItem('tumpang_active_merchant_id');
    safeStorage.removeItem('tumpang_active_driver_id');
    setActiveMerchantId('');
    setActiveDriverId('');
    setCurrentRole('CUSTOMER');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  };

  const handleInstantDashboardAccess = (role: 'ADMIN' | 'MERCHANT' | 'DRIVER') => {
    handleRoleSelection(role);
  };

  const handleOpenMerchantPortal = () => {
    setIsMerchantPortal(false);
    setIsRegisterPage(false);
    setCurrentRole('MERCHANT');
    setMerchantPortalTab('login');
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/?role=merchant');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenMerchantRegister = () => {
    setIsRegisterPage(true);
    setIsMerchantPortal(false);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/?page=merchant-register');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // If merchant portal triggered, directly navigate to merchant login
  if (isMerchantPortal) {
    setIsMerchantPortal(false);
    setCurrentRole('MERCHANT');
    setMerchantPortalTab('login');
  }

  // Dedicated registration page link
  if (isRegisterPage) {
    return (
      <MerchantRegisterPage 
        onBackToHome={() => {
          setIsRegisterPage(false);
          setIsMerchantPortal(true);
          if (typeof window !== 'undefined') {
            window.history.pushState(null, '', '/?page=merchant-portal');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        onGoToLogin={() => {
          setIsRegisterPage(false);
          setIsMerchantPortal(false);
          setCurrentRole('MERCHANT');
          setMerchantPortalTab('login');
          if (typeof window !== 'undefined') {
            window.history.pushState(null, '', '/?role=merchant');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
      />
    );
  }

  // Dedicated TumpangGo Evaluation Workspace (Inspection Console for Project Owner)
  if (isEvaluationWorkspace) {
    return (
      <EvaluationWorkspace
        onExitWorkspace={() => {
          setIsEvaluationWorkspace(false);
          const url = new URL(window.location.href);
          url.searchParams.delete('workspace');
          url.searchParams.delete('eval');
          url.searchParams.delete('evaluation');
          if (url.searchParams.get('page') === 'workspace' || url.searchParams.get('page') === 'evaluation') {
            url.searchParams.delete('page');
          }
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        }}
        onNavigateToPortal={(role) => {
          setIsEvaluationWorkspace(false);
          const url = new URL(window.location.href);
          url.searchParams.delete('workspace');
          url.searchParams.delete('eval');
          url.searchParams.delete('evaluation');
          if (url.searchParams.get('page') === 'workspace' || url.searchParams.get('page') === 'evaluation') {
            url.searchParams.delete('page');
          }
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
          handleRoleSelection(role);
        }}
      />
    );
  }

  // If merchant role is selected but no merchant ID is provided (direct link ?role=merchant)
  if (currentRole === 'MERCHANT' && !activeMerchantId && !isMasterAdmin) {
    if (!verifiedEmail && !isDemoMode) {
      return (
        <PortalLogin 
          role="MERCHANT" 
          initialTab={merchantPortalTab}
          onRegisterRedirect={handleOpenMerchantRegister}
          onSuccess={(email, mId, isMaster) => {
            if (isMaster) {
              setIsMasterAdmin(true);
              setVerifiedEmail(email || 'tumpanggo@gmail.com');
              const targetStoreId = (mId && merchants.some(m => m.id === mId)) ? mId : (merchants[0]?.id || '');
              setActiveMerchantId(targetStoreId);
            } else {
              setVerifiedEmail(email);
              if (mId) setActiveMerchantId(mId);
            }
          }} 
          onCancel={() => {
            setCurrentRole('CUSTOMER');
          }} 
        />
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mb-4 flex-shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <h3 className="font-display font-extrabold text-base text-slate-800">Portal Pemilik Toko (Merchant)</h3>
          <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
            Selamat datang di Portal Merchant tumpangGo. Silakan pilih toko Anda di bawah ini untuk mengelola menu dan pesanan pelanggan.
          </p>

          <div className="mt-6 flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
            {loadingSelection ? (
              <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Memuat daftar toko...</div>
            ) : (!Array.isArray(merchants) || merchants.length === 0) ? (
              <div className="py-6 text-center text-xs text-slate-400">Tidak ada toko terdaftar. Hubungi Admin.</div>
            ) : (
              (Array.isArray(merchants) ? merchants : []).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveMerchantId(m.id)}
                  className="w-full p-2.5 text-left border border-slate-200 hover:border-rose-500 hover:bg-rose-50/10 rounded-xl transition-all text-xs flex justify-between items-center cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={m.image} alt={m.name} className="w-8 h-8 rounded-lg object-cover bg-slate-100 flex-shrink-0" referrerPolicy="no-referrer" />
                    <div className="truncate">
                      <p className="text-slate-800 font-bold truncate">{m.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">Owner: {m.ownerName}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-rose-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // If driver role is selected but no driver ID is provided (direct link ?role=driver)
  if (currentRole === 'DRIVER' && !activeDriverId && !isMasterAdmin) {
    if (!verifiedEmail && !isDemoMode) {
      return (
        <PortalLogin 
          role="DRIVER" 
          onSuccess={(email, dId, isMaster) => {
            if (isMaster) {
              setIsMasterAdmin(true);
              setVerifiedEmail(email || 'tumpanggo@gmail.com');
              const targetDriverId = (dId && drivers.some(d => d.id === dId)) ? dId : (drivers[0]?.id || '');
              setActiveDriverId(targetDriverId);
            } else {
              setVerifiedEmail(email);
              if (dId) setActiveDriverId(dId);
            }
          }} 
          onCancel={() => {
            setCurrentRole('CUSTOMER');
          }} 
        />
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4 flex-shrink-0">
            <Navigation className="w-6 h-6 rotate-45" />
          </div>
          <h3 className="font-display font-extrabold text-base text-slate-800">Portal Kurir Internal</h3>
          <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
            Selamat datang di Portal Kurir tumpangGo. Silakan pilih nama Anda untuk melihat tugas pengantaran makanan hari ini.
          </p>

          <div className="mt-6 flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
            {loadingSelection ? (
              <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Memuat daftar kurir...</div>
            ) : (!Array.isArray(drivers) || drivers.length === 0) ? (
              <div className="py-6 text-center text-xs text-slate-400">Tidak ada kurir terdaftar. Hubungi Admin.</div>
            ) : (
              (Array.isArray(drivers) ? drivers : []).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDriverId(d.id)}
                  className="w-full p-3 text-left border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/10 rounded-xl transition-all text-xs flex justify-between items-center cursor-pointer group"
                >
                  <div className="truncate">
                    <p className="text-slate-850 font-bold truncate">{d.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{d.phone}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${d.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {d.online ? 'Online' : 'Offline'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-100 min-h-screen text-slate-900 selection:bg-rose-500 selection:text-white">
      
      {/* Master Account Portal Switcher & Administration Bar */}
      {isMasterAdmin && (
        <MasterPortalBar
          currentRole={currentRole}
          activeMerchantId={activeMerchantId}
          activeDriverId={activeDriverId}
          merchants={merchants}
          drivers={drivers}
          onSelectRole={(role, entityId) => {
            setCurrentRole(role);
            if (role === 'MERCHANT') {
              setActiveMerchantId(entityId || activeMerchantId || merchants[0]?.id || '');
            } else if (role === 'DRIVER') {
              setActiveDriverId(entityId || activeDriverId || drivers[0]?.id || '');
            }
          }}
          onSelectMerchant={(mId) => {
            setActiveMerchantId(mId);
            if (currentRole !== 'MERCHANT') setCurrentRole('MERCHANT');
          }}
          onSelectDriver={(dId) => {
            setActiveDriverId(dId);
            if (currentRole !== 'DRIVER') setCurrentRole('DRIVER');
          }}
          onLogout={handleMasterLogout}
          onOpenWorkspace={() => setIsEvaluationWorkspace(true)}
        />
      )}

      {/* Simulation Persona Control Top Bar - ONLY shown when explicit demo=true URL query is active and not master */}
      {isDemoMode && !isMasterAdmin && (
        <div className="bg-slate-950 text-white py-2 px-4 flex justify-between items-center text-xs border-b border-white/10 z-[80] sticky top-0 shadow">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            <span className="font-medium">Peran Aktif:</span>
            <span className="bg-rose-600/20 text-rose-400 font-bold px-2 py-0.5 rounded tracking-wide uppercase border border-rose-500/10">
              {currentRole === 'MERCHANT' ? `Merchant: ${activeMerchantId}` : currentRole === 'DRIVER' ? `Kurir: ${activeDriverId}` : currentRole}
            </span>
          </div>
          
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-md transition-all shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            Ganti Peran / Portal Demo
          </button>
        </div>
      )}

      {/* Render Current Active Portal View */}
      <div className="min-h-screen">
        {currentRole === 'CUSTOMER' && (
          <ErrorBoundary fallbackTitle="Kendala Memuat Menu Pelanggan">
            <CustomerView 
              systemConfig={systemConfig} 
              onSwitchView={(v) => console.log('Sub-view transition:', v)}
              onOpenAuthModal={() => setShowAuthModal(true)}
              onSelectRole={handleRoleSelection}
              onInstantDashboard={handleInstantDashboardAccess}
              onOpenRegisterPage={handleOpenMerchantPortal}
              onOpenMerchantPortal={handleOpenMerchantPortal}
            />
          </ErrorBoundary>
        )}

        {currentRole === 'MERCHANT' && (
          isMasterAdmin ? (
            <ErrorBoundary fallbackTitle="Kendala Memuat Portal Mitra Toko">
              <MerchantView 
                merchantId={activeMerchantId || merchants[0]?.id || ''} 
                onLogout={handleMasterLogout}
                onSelectRole={handleRoleSelection}
              />
            </ErrorBoundary>
          ) : (!verifiedEmail && !isDemoMode) ? (
            <PortalLogin 
              role="MERCHANT" 
              initialTab={merchantPortalTab}
              onRegisterRedirect={handleOpenMerchantRegister}
              onSuccess={(email, mId, isMaster) => {
                if (isMaster) {
                  setIsMasterAdmin(true);
                  setVerifiedEmail(email || 'tumpanggo@gmail.com');
                  const targetStoreId = (mId && merchants.some(m => m.id === mId)) ? mId : (merchants[0]?.id || '');
                  setActiveMerchantId(targetStoreId);
                } else {
                  setVerifiedEmail(email);
                  if (mId) setActiveMerchantId(mId);
                }
              }} 
              onCancel={() => {
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (activeMerchantId && merchants.length > 0 && !isDemoMode && 
               !(isAdminEmail(verifiedEmail) || 
                 (merchants.find(m => m.id === activeMerchantId)?.email?.trim().toLowerCase() === verifiedEmail.trim().toLowerCase()))
          ) ? (
            <PortalLogin 
              role="MERCHANT" 
              targetMerchantId={activeMerchantId} 
              onRegisterRedirect={handleOpenMerchantRegister}
              onSuccess={(email, _mId, isMaster) => {
                safeStorage.setItem('tumpang_current_portal', 'MERCHANT');
                if (isMaster) {
                  setIsMasterAdmin(true);
                  setVerifiedEmail(email || 'tumpanggo@gmail.com');
                } else {
                  setVerifiedEmail(email);
                }
              }} 
              onCancel={() => {
                setActiveMerchantId('');
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (
            <ErrorBoundary fallbackTitle="Kendala Memuat Portal Mitra Toko">
              <MerchantView 
                merchantId={activeMerchantId || safeStorage.getItem('tumpang_active_merchant_id') || merchants[0]?.id || ''} 
                onLogout={() => {
                  setVerifiedEmail('');
                  safeStorage.removeItem('tumpang_auth_email');
                  safeStorage.removeItem('tumpang_active_merchant_id');
                  setActiveMerchantId('');
                  setCurrentRole('CUSTOMER');
                }}
                onSelectRole={handleRoleSelection}
              />
            </ErrorBoundary>
          )
        )}

        {currentRole === 'DRIVER' && (
          isMasterAdmin ? (
            <ErrorBoundary fallbackTitle="Kendala Memuat Portal Kurir">
              <DriverView 
                driverId={activeDriverId || drivers[0]?.id || ''} 
                onLogout={handleMasterLogout}
                onSelectRole={handleRoleSelection}
              />
            </ErrorBoundary>
          ) : (!verifiedEmail && !isDemoMode) ? (
            <PortalLogin 
              role="DRIVER" 
              onSuccess={(email, dId, isMaster) => {
                safeStorage.setItem('tumpang_current_portal', 'DRIVER');
                if (isMaster) {
                  setIsMasterAdmin(true);
                  setVerifiedEmail(email || 'tumpanggo@gmail.com');
                  const targetDriver = (dId && drivers.some(d => d.id === dId)) ? dId : (drivers[0]?.id || '');
                  setActiveDriverId(targetDriver);
                  safeStorage.setItem('tumpang_active_driver_id', targetDriver);
                } else {
                  setVerifiedEmail(email);
                  if (dId) {
                    setActiveDriverId(dId);
                    safeStorage.setItem('tumpang_active_driver_id', dId);
                  }
                }
              }} 
              onCancel={() => {
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (activeDriverId && drivers.length > 0 && !isDemoMode && 
               !(isAdminEmail(verifiedEmail) || 
                 (() => {
                   const d = drivers.find(drv => drv.id === activeDriverId);
                   if (!d) return false;
                   const normVerified = verifiedEmail.trim().toLowerCase();
                   const normPhone = (d.phone || '').replace(/\D/g, '');
                   const normInputPhone = normVerified.replace(/\D/g, '');
                   return (
                     (d.email && d.email.trim().toLowerCase() === normVerified) ||
                     (normPhone && normInputPhone && (normPhone === normInputPhone || normPhone.endsWith(normInputPhone))) ||
                     d.id.toLowerCase() === normVerified
                   );
                 })())
          ) ? (
            <PortalLogin 
              role="DRIVER" 
              targetDriverId={activeDriverId} 
              onSuccess={(email, dId, isMaster) => {
                if (isMaster) {
                  setIsMasterAdmin(true);
                  setVerifiedEmail(email || 'tumpanggo@gmail.com');
                  safeStorage.setItem('tumpang_active_driver_id', dId || activeDriverId || drivers[0]?.id || '');
                } else {
                  setVerifiedEmail(email);
                  if (dId) safeStorage.setItem('tumpang_active_driver_id', dId);
                }
              }} 
              onCancel={() => {
                setActiveDriverId('');
                safeStorage.removeItem('tumpang_active_driver_id');
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (
            <ErrorBoundary fallbackTitle="Kendala Memuat Portal Kurir">
              <DriverView 
                driverId={activeDriverId || safeStorage.getItem('tumpang_active_driver_id') || drivers[0]?.id || ''} 
                onLogout={() => {
                  setVerifiedEmail('');
                  safeStorage.removeItem('tumpang_auth_email');
                  safeStorage.removeItem('tumpang_active_driver_id');
                  setActiveDriverId('');
                  setCurrentRole('CUSTOMER');
                }}
                onSelectRole={handleRoleSelection}
              />
            </ErrorBoundary>
          )
        )}

        {currentRole === 'ADMIN' && (
          (isMasterAdmin || (verifiedEmail && isAdminEmail(verifiedEmail)) || isDemoMode) ? (
            <ErrorBoundary fallbackTitle="Kendala Memuat Portal Admin">
              <AdminView 
                systemConfig={systemConfig}
                onUpdateConfig={(conf) => setSystemConfig(conf)}
                onLogout={isMasterAdmin ? handleMasterLogout : () => {
                  setVerifiedEmail('');
                  safeStorage.removeItem('tumpang_auth_email');
                  setCurrentRole('CUSTOMER');
                }}
                onSelectRole={handleRoleSelection}
              />
            </ErrorBoundary>
          ) : (
            <PortalLogin 
              role="ADMIN" 
              onSuccess={(email, _id, isMaster) => {
                safeStorage.setItem('tumpang_current_portal', 'ADMIN');
                if (isMaster) {
                  setIsMasterAdmin(true);
                  setVerifiedEmail(email || 'tumpanggo@gmail.com');
                } else {
                  setVerifiedEmail(email || 'tumpanggo@gmail.com');
                }
              }} 
              onCancel={() => setCurrentRole('CUSTOMER')} 
            />
          )
        )}
      </div>

      {/* Multi-Persona Modal Picker overlay */}
      {showAuthModal && (
        <AuthModal 
          currentRole={currentRole}
          onSelectRole={handleRoleSelection}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}

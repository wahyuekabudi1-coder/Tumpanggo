import React, { useState, useEffect } from 'react';
import { Merchant, Driver } from '../types.ts';
import Logo from './Logo.tsx';
import { safeStorage } from '../utils/safeStorage.ts';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import { 
  ShieldCheck, Lock, Mail, ArrowRight, ChevronLeft, Store, 
  CheckCircle, AlertCircle, Loader2, Phone, Bike, User, MapPin, Tag, ExternalLink,
  Eye, EyeOff, Key, X
} from 'lucide-react';

interface PortalLoginProps {
  role: 'ADMIN' | 'MERCHANT' | 'DRIVER';
  targetMerchantId?: string;
  targetDriverId?: string;
  initialTab?: 'login' | 'register';
  onSuccess: (email: string, targetId?: string, isMaster?: boolean) => void;
  onCancel: () => void;
  onRegisterRedirect?: () => void;
}

export default function PortalLogin({ role, targetMerchantId, targetDriverId, initialTab, onSuccess, onCancel, onRegisterRedirect }: PortalLoginProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab || (role === 'MERCHANT' ? 'login' : 'login'));
  const [emailInput, setEmailInput] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [targetMerchant, setTargetMerchant] = useState<Merchant | null>(null);
  
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [targetDriver, setTargetDriver] = useState<Driver | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Merchant Registration state
  const [regStoreName, setRegStoreName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCategory, setRegCategory] = useState('Nasi & Lauk');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  
  // Activation state
  const [isActivationMode, setIsActivationMode] = useState(false);
  const [activationEmail, setActivationEmail] = useState('');
  const [activationStoreName, setActivationStoreName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password login input state
  const [passwordInput, setPasswordInput] = useState('');

  // Show/Hide password toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Administrative Master Account recovery state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryShowPass, setRecoveryShowPass] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isActivate = params.get('activate') === 'true';
    if (isActivate && role === 'MERCHANT') {
      setIsActivationMode(true);
      setActivationEmail(params.get('email') || '');
      setActivationStoreName(params.get('storeName') || '');
    }
  }, [role]);

  useEffect(() => {
    if (role === 'MERCHANT') {
      fetch('/api/merchants')
        .then(res => res.json())
        .then((data: Merchant[]) => {
          setMerchants(data);
          if (targetMerchantId) {
            const match = data.find(m => m.id === targetMerchantId);
            if (match) setTargetMerchant(match);
          }
        })
        .catch(err => console.error('Error fetching merchants:', err));
    } else if (role === 'DRIVER') {
      fetch('/api/drivers')
        .then(res => res.json())
        .then((data: Driver[]) => {
          setDrivers(data);
          if (targetDriverId) {
            const match = data.find(d => d.id === targetDriverId);
            if (match) setTargetDriver(match);
          }
        })
        .catch(err => console.error('Error fetching drivers:', err));
    }
  }, [role, targetMerchantId, targetDriverId]);

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!newPassword || !confirmPassword) {
      setError('Mohon isi kata sandi baru Anda.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok dengan kata sandi baru Anda.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Kata sandi harus terdiri dari minimal 6 karakter demi keamanan akun Anda.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/merchants/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: activationEmail,
          password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengaktifkan akun toko.');
      }

      setSuccessMsg(`Aktivasi berhasil! Akun toko "${activationStoreName}" telah aktif.`);
      safeStorage.setItem('tumpang_auth_email', activationEmail);
      window.history.replaceState({}, document.title, window.location.pathname);
      
      setTimeout(() => {
        onSuccess(activationEmail, data.merchant?.id);
      }, 1200);

    } catch (err: any) {
      console.error('Activation error:', err);
      setError(err.message || 'Terjadi kesalahan saat mengaktifkan akun toko Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');

    if (!recoveryKey.trim()) {
      setRecoveryError('Kunci otorisasi administratif wajib diisi.');
      return;
    }
    if (!recoveryNewPassword || recoveryNewPassword.trim().length < 8) {
      setRecoveryError('Kata sandi baru minimal harus 8 karakter.');
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setRecoveryLoading(true);
    try {
      const res = await fetch('/api/auth/master/emergency-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Recovery-Key': recoveryKey.trim()
        },
        body: JSON.stringify({
          newPassword: recoveryNewPassword.trim()
        })
      });

      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = {};
        }
      } else {
        const text = await res.text().catch(() => '');
        data = { error: text && text.length < 200 ? text : `Server merespons status HTTP ${res.status}` };
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Kunci pemulihan tidak valid atau telah kedaluwarsa.');
      }

      setRecoverySuccess('Kredensial Master Account berhasil dipulihkan! Silakan login.');
      setPasswordInput(recoveryNewPassword.trim());
      setEmailInput('tumpanggo@gmail.com');
      setTimeout(() => {
        setShowRecoveryModal(false);
        setRecoveryKey('');
        setRecoveryNewPassword('');
        setRecoveryConfirmPassword('');
      }, 1500);
    } catch (err: any) {
      setRecoveryError(err.message || 'Terjadi kesalahan saat memulihkan kata sandi.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!emailInput || !passwordInput) {
      setError('Mohon isi alamat email / no. telepon dan kata sandi Anda.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: emailInput.trim(),
          email: emailInput.trim(),
          password: passwordInput,
          role: role
        })
      });

      // Safely parse JSON or text response to prevent unhandled SyntaxError
      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        const text = await res.text().catch(() => '');
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text && text.length < 200 ? text : `Server merespons status HTTP ${res.status}` };
        }
      }

      if (res.ok && data?.token) {
        const userEmail = emailInput.trim();
        const isMaster = Boolean(
          data.isMasterAdmin || 
          data.role === 'MASTER_ADMIN' || 
          userEmail.toLowerCase() === 'tumpanggo@gmail.com' ||
          userEmail.toLowerCase() === 'suaiimokeras@gmail.com'
        );
        safeStorage.setItem('tumpang_auth_email', userEmail);
        safeStorage.setItem('tumpang_auth_token', data.token);
        if (isMaster) {
          safeStorage.setItem('tumpang_is_master', 'true');
          safeStorage.setItem('tumpang_auth_role', 'MASTER_ADMIN');
          setSuccessMsg('Login Master Account Berhasil! Otorisasi penuh lintas portal aktif...');
        } else {
          safeStorage.removeItem('tumpang_is_master');
          safeStorage.setItem('tumpang_auth_role', data.role || role);
          setSuccessMsg('Login Berhasil! Mengalihkan...');
        }
        const targetEntity = isMaster
          ? (role === 'MERCHANT' ? (targetMerchantId || data.user?.activeMerchantId || data.user?.entityId)
             : role === 'DRIVER' ? (targetDriverId || data.user?.activeDriverId || data.user?.entityId)
             : data.user?.id)
          : (data.user?.id || targetMerchantId || targetDriverId);
        setTimeout(() => {
          onSuccess(userEmail, targetEntity, isMaster);
        }, 500);
      } else {
        const diagSuffix = data?.diagnostic?.code ? ` (${data.diagnostic.code})` : '';
        // Differentiate HTTP error status codes clearly
        if (res.status === 401) {
          setError((data?.error || 'Email/No. Telepon atau kata sandi tidak cocok. Silakan periksa kembali.') + diagSuffix);
        } else if (res.status === 403) {
          setError((data?.error || 'Akses ditolak: Akun tidak memiliki izin untuk masuk ke portal ini.') + diagSuffix);
        } else if (res.status === 404) {
          setError('Layanan login backend tidak ditemukan (HTTP 404). Pastikan server backend sedang aktif.');
        } else if (res.status >= 500) {
          setError((data?.error || `Terjadi kendala pada server backend (HTTP ${res.status}). Silakan coba beberapa saat lagi.`) + diagSuffix);
        } else {
          setError((data?.error || `Gagal melakukan login (HTTP ${res.status}).`) + diagSuffix);
        }
      }
    } catch (err: any) {
      console.error('Password login network error:', err?.message || err);
      if (err?.name === 'TypeError' || err?.message?.includes('fetch') || err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError')) {
        setError('Gagal terhubung ke server backend (Network/CORS Error). Pastikan server backend aktif dan dapat diakses.');
      } else {
        setError(err?.message || 'Gagal terhubung ke server. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMerchantRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!regStoreName.trim() || !regOwnerName.trim() || !regPhone.trim() || !regPassword) {
      setError('Mohon lengkapi seluruh kolom bertanda bintang (*).');
      return;
    }

    if (regPassword.length < 6) {
      setError('Kata sandi harus terdiri dari minimal 6 karakter.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/merchants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regStoreName,
          ownerName: regOwnerName,
          phone: regPhone,
          email: regEmail,
          category: regCategory,
          address: regAddress,
          password: regPassword
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mendaftarkan toko.');
      }

      const authIdentifier = data.merchant.email || data.merchant.phone || data.merchant.id;
      setSuccessMsg(`Pendaftaran berhasil! Selamat datang, Toko "${data.merchant.name}". Mengalihkan ke dashboard...`);
      safeStorage.setItem('tumpang_auth_email', authIdentifier);

      setTimeout(() => {
        onSuccess(authIdentifier, data.merchant.id);
      }, 1000);

    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Terjadi kesalahan saat mendaftarkan toko.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-3 sm:p-6 z-[100] backdrop-blur-md animate-fadeIn font-sans overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100/80 flex flex-col my-auto max-h-[92vh] overflow-hidden">
        
        {/* Header Branding - Uniform Clean Light Theme */}
        <div className="bg-gradient-to-b from-slate-50 via-slate-50/70 to-white text-slate-800 p-5 sm:p-6 pb-4 border-b border-slate-100 relative flex-shrink-0">
          <div className="absolute top-4 left-4">
            <button 
              onClick={onCancel}
              className="p-2 rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-sm"
              title="Kembali"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex flex-col items-center text-center mt-1">
            <div className="mb-2">
              <Logo size={60} mode="full" />
            </div>

            {/* Role Badge */}
            {role === 'ADMIN' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200/80 mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                <span>Portal Administrator</span>
              </span>
            ) : role === 'DRIVER' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200/80 mb-1.5">
                <Bike className="w-3.5 h-3.5 text-emerald-600" />
                <span>Portal Driver Kurir</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold border border-amber-200/80 mb-1.5">
                <Store className="w-3.5 h-3.5 text-amber-600" />
                <span>Portal Merchant Toko</span>
              </span>
            )}
            
            <h3 className="font-display font-extrabold text-xl text-slate-900 tracking-tight">
              {isActivationMode 
                ? 'Aktivasi Akun Toko' 
                : role === 'ADMIN' 
                  ? 'Login Dashboard Admin' 
                  : role === 'DRIVER' 
                    ? 'Login Dashboard Driver' 
                    : activeTab === 'register'
                      ? 'Pendaftaran Mitra UMKM'
                      : 'Login Dashboard Merchant'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-[340px] leading-relaxed">
              {isActivationMode
                ? `Selamat! Toko "${activationStoreName}" telah disetujui. Silakan atur kata sandi baru untuk mengaktifkan portal merchant Anda.`
                : role === 'ADMIN' 
                  ? 'Masukkan Email dan Kata Sandi Administrator untuk masuk ke dashboard utama.' 
                  : role === 'DRIVER'
                    ? targetDriver
                      ? `Portal khusus untuk Driver: ${targetDriver.name}`
                      : 'Masukkan No. WhatsApp / Email dan Kata Sandi Driver Anda.'
                    : activeTab === 'register'
                      ? 'Lengkapi data usaha UMKM Anda di bawah ini untuk bergabung menjadi mitra kuliner.'
                      : targetMerchant 
                        ? `Portal khusus untuk Toko: ${targetMerchant.name}`
                        : 'Masukkan Email / No. Telepon dan Kata Sandi Toko UMKM Anda.'
              }
            </p>
          </div>
        </div>

        {/* Content Body - Scrollable Container */}
        <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto max-h-[calc(92vh-160px)]">

          {/* Status Message Containers */}
          {error && (
            <div 
              className="bg-red-50 border-2 border-red-500 text-red-700 text-xs p-3.5 rounded-2xl flex gap-2.5 items-start font-semibold shadow-sm animate-fadeIn"
              style={{ backgroundColor: '#fef2f2', borderColor: '#ef4444', color: '#b91c1c' }}
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" style={{ color: '#dc2626' }} />
              <span className="leading-relaxed font-bold">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-2xl flex gap-2.5 items-start font-semibold animate-fadeIn">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span className="leading-relaxed font-bold">{successMsg}</span>
            </div>
          )}

          {/* Activation Form or Registration Form or Standard Login Form */}
          {isActivationMode ? (
            <form onSubmit={handleActivateAccount} className="flex flex-col gap-4 animate-fadeIn">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Email Merchant</label>
                <input
                  type="email"
                  disabled
                  value={activationEmail}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Nama Toko / UMKM</label>
                <input
                  type="text"
                  disabled
                  value={activationStoreName}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Buat Kata Sandi Baru</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    disabled={loading}
                    placeholder="Minimal 6 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white rounded-xl pl-10 pr-11 py-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                    title={showNewPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    aria-label={showNewPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Konfirmasi Kata Sandi</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    disabled={loading}
                    placeholder="Ulangi kata sandi"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white rounded-xl pl-10 pr-11 py-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                    title={showConfirmPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    aria-label={showConfirmPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-xl transition-all shadow-md shadow-rose-600/20 text-xs mt-2 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 active:scale-98"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Aktifkan Akun & Masuk Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Email / Phone + Kata Sandi Form - Uniform Layout */
            <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4 animate-fadeIn">

              <div>
                <label 
                  className={`text-[11px] font-bold uppercase tracking-wider block mb-1.5 ${error ? 'text-red-600 font-extrabold' : 'text-slate-700'}`}
                  style={error ? { color: '#dc2626' } : undefined}
                >
                  {role === 'ADMIN' 
                    ? 'Email / Username Administrator' 
                    : role === 'DRIVER' 
                      ? 'No. WhatsApp / Email Driver' 
                      : 'Email / No. Telepon Toko'}
                </label>
                <div className="relative">
                  {role === 'ADMIN' ? (
                    <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  ) : role === 'DRIVER' ? (
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  ) : (
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  )}
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder={
                      role === 'ADMIN' 
                        ? 'Masukkan Email / Username Admin' 
                        : role === 'DRIVER' 
                          ? 'Masukkan No. WhatsApp / Email' 
                          : 'Masukkan Email / No. Telepon'
                    }
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (error) setError('');
                    }}
                    className={`w-full rounded-xl pl-10 pr-4 py-3 text-xs font-semibold transition-all disabled:opacity-55 focus:outline-none ${
                      error 
                        ? 'bg-red-50 border-2 border-red-500 text-red-900 focus:ring-2 focus:ring-red-500/30' 
                        : 'bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white text-slate-900 focus:ring-2 focus:ring-rose-500/20'
                    }`}
                    style={error ? { backgroundColor: '#fef2f2', borderColor: '#ef4444', color: '#7f1d1d' } : undefined}
                  />
                </div>
                {error && (
                  <p className="text-[11px] font-bold text-red-600 mt-1.5 flex items-center gap-1.5 animate-fadeIn" style={{ color: '#dc2626' }}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-600" style={{ color: '#dc2626' }} />
                    <span>Periksa kembali email / akun yang Anda masukkan.</span>
                  </p>
                )}
              </div>

              <div>
                <label 
                  className={`text-[11px] font-bold uppercase tracking-wider block mb-1.5 ${error ? 'text-red-600 font-extrabold' : 'text-slate-700'}`}
                  style={error ? { color: '#dc2626' } : undefined}
                >
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    disabled={loading}
                    placeholder="Masukkan kata sandi"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (error) setError('');
                    }}
                    className={`w-full rounded-xl pl-10 pr-11 py-3 text-xs font-semibold transition-all disabled:opacity-55 focus:outline-none ${
                      error 
                        ? 'bg-red-50 border-2 border-red-500 text-red-900 focus:ring-2 focus:ring-red-500/30' 
                        : 'bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white text-slate-900 focus:ring-2 focus:ring-rose-500/20'
                    }`}
                    style={error ? { backgroundColor: '#fef2f2', borderColor: '#ef4444', color: '#7f1d1d' } : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                    title={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-2xl transition-all shadow-md shadow-rose-600/20 text-xs mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 active:scale-98"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>
                      {role === 'ADMIN' ? 'MASUK DASHBOARD ADMIN' : role === 'DRIVER' ? 'MASUK PORTAL DRIVER' : 'MASUK PORTAL MERCHANT'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {role === 'ADMIN' && (
                <div className="text-center pt-2 border-t border-slate-100 mt-2 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryError('');
                      setRecoverySuccess('');
                      setShowRecoveryModal(true);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    <span>Pemulihan Administratif Master Account</span>
                  </button>
                </div>
              )}

              {role === 'MERCHANT' && (
                <div className="text-center pt-2 border-t border-slate-100 mt-1 flex flex-col items-center gap-1.5">
                  <p className="text-xs text-slate-500 font-medium">
                    Belum menjadi mitra UMKM?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        const regUrl = window.location.origin + window.location.pathname + '?page=merchant-register';
                        window.open(regUrl, '_blank') || (window.location.href = regUrl);
                      }}
                      className="text-rose-600 font-extrabold hover:underline cursor-pointer inline-flex items-center gap-1"
                    >
                      <span>Daftar Jadi Mitra UMKM</span>
                      <ExternalLink className="w-3 h-3 text-rose-600" />
                    </button>
                  </p>
                </div>
              )}
            </form>
          )}

        </div>
      </div>

      {/* Modal Pemulihan Administratif Master Account */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 relative animate-scaleUp">
            <button
              type="button"
              onClick={() => setShowRecoveryModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pemulihan Kredensial Master Account</h3>
                <p className="text-[11px] text-slate-500">Proses administratif resmi dengan otorisasi khusus</p>
              </div>
            </div>

            {recoveryError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{recoveryError}</span>
              </div>
            )}

            {recoverySuccess && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>{recoverySuccess}</span>
              </div>
            )}

            <form onSubmit={handleRecoverySubmit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                  Target Akun
                </label>
                <input
                  type="text"
                  disabled
                  value="tumpanggo@gmail.com"
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-600 font-semibold cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                  Kunci Otorisasi Administratif
                </label>
                <input
                  type="password"
                  required
                  disabled={recoveryLoading}
                  placeholder="Masukkan Kunci / Token Otorisasi Pemulihan"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-amber-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                  Kata Sandi Baru (Min. 8 Karakter)
                </label>
                <div className="relative">
                  <input
                    type={recoveryShowPass ? "text" : "password"}
                    required
                    disabled={recoveryLoading}
                    placeholder="Masukkan kata sandi baru"
                    value={recoveryNewPassword}
                    onChange={(e) => setRecoveryNewPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-amber-500 focus:bg-white rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setRecoveryShowPass(!recoveryShowPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {recoveryShowPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type={recoveryShowPass ? "text" : "password"}
                  required
                  disabled={recoveryLoading}
                  placeholder="Ulangi kata sandi baru"
                  value={recoveryConfirmPassword}
                  onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-amber-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  disabled={recoveryLoading}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {recoveryLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Terapkan Pemulihan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { 
  Store, Bike, ArrowRight, ArrowLeft, Lock, UserPlus, Eye, EyeOff, 
  CheckCircle2, AlertCircle, Loader2, ShieldCheck, Camera, Check,
  ChevronRight, Sparkles, Building2, User
} from 'lucide-react';
import { safeStorage } from '../utils/safeStorage.ts';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import { compressImage } from '../utils/imageCompressor.ts';

export type PartnerRole = 'MERCHANT' | 'DRIVER';
export type PortalStep = 'role_selection' | 'action_selection' | 'login' | 'register';

interface PartnerPortalHubProps {
  initialRole?: PartnerRole;
  initialStep?: PortalStep;
  onBackToHome: () => void;
  onLoginSuccess: (role: 'MERCHANT' | 'DRIVER', entityId?: string, email?: string) => void;
}

export default function PartnerPortalHub({
  initialRole,
  initialStep = 'role_selection',
  onBackToHome,
  onLoginSuccess
}: PartnerPortalHubProps) {
  // Step & Role states
  const [step, setStep] = useState<PortalStep>(initialRole ? (initialStep || 'action_selection') : 'role_selection');
  const [selectedRole, setSelectedRole] = useState<PartnerRole | null>(initialRole || null);

  // Common Login Form states
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  // Merchant Register Form states
  const [mStoreName, setMStoreName] = useState('');
  const [mOwnerName, setMOwnerName] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mEmail, setMEmail] = useState('');
  const [mCategory, setMCategory] = useState('Nasi & Lauk');
  const [mAddress, setMAddress] = useState('');
  const [mPassword, setMPassword] = useState('');
  const [mConfirmPassword, setMConfirmPassword] = useState('');
  const [mShowPassword, setMShowPassword] = useState(false);
  const [mBusinessPhoto, setMBusinessPhoto] = useState<string>('');
  const [mIdPhoto, setMIdPhoto] = useState<string>('');
  const [mAgreeTerms, setMAgreeTerms] = useState(true);

  // Driver Register Form states
  const [dName, setDName] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [dEmail, setDEmail] = useState('');
  const [dVehicleType, setDVehicleType] = useState<'motor' | 'mobil'>('motor');
  const [dPlateNumber, setDPlateNumber] = useState('');
  const [dOperatingArea, setDOperatingArea] = useState('Kecamatan Tumpang & Sekitarnya');
  const [dPassword, setDPassword] = useState('');
  const [dConfirmPassword, setDConfirmPassword] = useState('');
  const [dShowPassword, setDShowPassword] = useState(false);
  const [dVehiclePhoto, setDVehiclePhoto] = useState<string>('');
  const [dSimPhoto, setDSimPhoto] = useState<string>('');
  const [dAgreeTerms, setDAgreeTerms] = useState(true);

  // Register submission status
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  // Photo upload helper
  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800, 800, 0.7);
      setter(compressed);
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') setter(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // -------------------------------------------------------------
  // HANDLER: SELECT ROLE
  // -------------------------------------------------------------
  const handleSelectRole = (role: PartnerRole) => {
    setSelectedRole(role);
    setStep('action_selection');
    setLoginError('');
    setRegisterError('');
    setRegisterSuccess(null);
    setPendingNotice(null);
  };

  // -------------------------------------------------------------
  // HANDLER: LOGIN SUBMISSION
  // -------------------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setPendingNotice(null);

    const cleanUser = loginIdentifier.trim();
    const cleanPass = loginPassword.trim();

    if (!cleanUser || !cleanPass) {
      setLoginError('Email atau Nomor WhatsApp dan kata sandi wajib diisi.');
      return;
    }

    if (!selectedRole) {
      setLoginError('Peran mitra tidak terdefinisi.');
      return;
    }

    setLoginLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          email: cleanUser,
          password: cleanPass,
          role: selectedRole
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.token) {
        // Successful login
        safeStorage.setItem('tumpang_auth_email', cleanUser);
        safeStorage.setItem('tumpang_auth_token', data.token);
        safeStorage.setItem('tumpang_auth_role', selectedRole);
        safeStorage.setItem('tumpang_current_portal', selectedRole);

        const entityId = data.user?.entityId || data.user?.id || '';
        if (selectedRole === 'MERCHANT' && entityId) {
          safeStorage.setItem('tumpang_active_merchant_id', entityId);
        } else if (selectedRole === 'DRIVER' && entityId) {
          safeStorage.setItem('tumpang_active_driver_id', entityId);
        }

        onLoginSuccess(selectedRole, entityId, cleanUser);
        return;
      }

      // Check if status is pending admin approval
      if (res.status === 403 && (data?.isPendingApproval || (data?.error && data.error.includes('peninjauan')))) {
        setPendingNotice(
          data.error || 'Pendaftaran kemitraan Anda sedang dalam tahap peninjauan oleh Admin. Akses operasional akan aktif setelah disetujui.'
        );
        return;
      }

      // Other login failure messages
      setLoginError(data?.error || 'Email/No. WhatsApp atau kata sandi tidak cocok. Silakan periksa kembali.');
    } catch (err: any) {
      console.error('Login error:', err);
      setLoginError('Terjadi kendala saat terhubung ke server. Pastikan koneksi internet Anda aktif.');
    } finally {
      setLoginLoading(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLER: MERCHANT REGISTRATION
  // -------------------------------------------------------------
  const handleMerchantRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess(null);

    if (!mStoreName.trim() || !mOwnerName.trim() || !mPhone.trim() || !mAddress.trim() || !mPassword) {
      setRegisterError('Mohon lengkapi seluruh kolom wajib bertanda bintang (*).');
      return;
    }

    if (mPassword.length < 6) {
      setRegisterError('Kata sandi minimal harus 6 karakter.');
      return;
    }

    if (mPassword !== mConfirmPassword) {
      setRegisterError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (!mAgreeTerms) {
      setRegisterError('Anda harus menyetujui Syarat & Ketentuan Kemitraan UMKM TumpangGo.');
      return;
    }

    setRegisterLoading(true);

    try {
      const payload = {
        type: 'MERCHANT',
        name: mOwnerName.trim(),
        storeName: mStoreName.trim(),
        phone: mPhone.trim(),
        email: mEmail.trim().toLowerCase(),
        category: mCategory,
        storeAddress: mAddress.trim(),
        password: mPassword,
        businessPhoto: mBusinessPhoto || undefined,
        idPhoto: mIdPhoto || undefined,
        status: 'PENDING'
      };

      const res = await fetch('/api/partner-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim pendaftaran mitra toko.');
      }

      setRegisterSuccess(
        `Pendaftaran Toko "${mStoreName.trim()}" Berhasil Dikirim! Akun Anda kini berstatus Menunggu Persetujuan Admin TumpangGo.`
      );
      // Pre-fill login email for convenience
      setLoginIdentifier(mEmail.trim() || mPhone.trim());
      setLoginPassword(mPassword);
    } catch (err: any) {
      console.error('Merchant registration error:', err);
      setRegisterError(err.message || 'Terjadi kesalahan saat pendaftaran.');
    } finally {
      setRegisterLoading(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLER: DRIVER REGISTRATION
  // -------------------------------------------------------------
  const handleDriverRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess(null);

    if (!dName.trim() || !dPhone.trim() || !dPlateNumber.trim() || !dPassword) {
      setRegisterError('Mohon lengkapi seluruh kolom wajib bertanda bintang (*).');
      return;
    }

    if (dPassword.length < 6) {
      setRegisterError('Kata sandi minimal harus 6 karakter.');
      return;
    }

    if (dPassword !== dConfirmPassword) {
      setRegisterError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (!dAgreeTerms) {
      setRegisterError('Anda harus menyetujui Syarat & Ketentuan Kemitraan Kurir TumpangGo.');
      return;
    }

    setRegisterLoading(true);

    try {
      const payload = {
        type: 'DRIVER',
        name: dName.trim(),
        phone: dPhone.trim(),
        email: dEmail.trim().toLowerCase() || `${dPhone.trim()}@driver.tumpanggo.local`,
        vehicleNumber: `${dVehicleType === 'motor' ? 'Motor' : 'Mobil'} - ${dPlateNumber.trim().toUpperCase()}`,
        operatingArea: dOperatingArea.trim(),
        password: dPassword,
        businessPhoto: dVehiclePhoto || undefined,
        idPhoto: dSimPhoto || undefined,
        status: 'PENDING'
      };

      const res = await fetch('/api/partner-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim pendaftaran mitra kurir.');
      }

      setRegisterSuccess(
        `Pendaftaran Kurir "${dName.trim()}" Berhasil Dikirim! Akun Anda kini berstatus Menunggu Persetujuan Admin TumpangGo.`
      );
      // Pre-fill login identifier for convenience
      setLoginIdentifier(dEmail.trim() || dPhone.trim());
      setLoginPassword(dPassword);
    } catch (err: any) {
      console.error('Driver registration error:', err);
      setRegisterError(err.message || 'Terjadi kesalahan saat pendaftaran.');
    } finally {
      setRegisterLoading(false);
    }
  };

  // =============================================================
  // RENDER LEVEL 1: ROLE SELECTION (HANYA 2 PILIHAN UTAMA)
  // =============================================================
  if (step === 'role_selection' || !selectedRole) {
    return (
      <div className="flex flex-col gap-5 pb-6">
        {/* Header Portal */}
        <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-800 text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-emerald-100 text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Portal Kemitraan Resmi
            </span>
          </div>
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white tracking-tight">
            Portal Mitra TumpangGo
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed mt-1.5 max-w-md">
            Pusat akses mitra lokal Kecamatan Tumpang. Pilih jenis kemitraan Anda untuk mendaftar akun baru atau masuk ke dashboard operasional.
          </p>
        </div>

        {/* 2 Main Choice Cards */}
        <div className="grid grid-cols-1 gap-4">
          {/* Card 1: Mitra Toko (Merchant) */}
          <div
            id="portal-select-merchant"
            onClick={() => handleSelectRole('MERCHANT')}
            className="bg-white border-2 border-slate-200/90 hover:border-emerald-600 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700 shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                <Store className="w-7 h-7 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 group-hover:text-emerald-700 transition-colors">
                    Mitra Toko (Merchant)
                  </h3>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    UMKM Kuliner
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Untuk pemilik warung, depot makan, kafe, dan usaha kuliner lokal di Kecamatan Tumpang.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                    Kelola Menu
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                    Terima Order
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                    QRIS Toko
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-extrabold text-emerald-700 group-hover:text-emerald-800">
              <span>Masuk atau Daftar Mitra Toko</span>
              <div className="w-7 h-7 rounded-full bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Card 2: Mitra Kurir (Driver) */}
          <div
            id="portal-select-driver"
            onClick={() => handleSelectRole('DRIVER')}
            className="bg-white border-2 border-slate-200/90 hover:border-emerald-600 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                <Bike className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 group-hover:text-emerald-700 transition-colors">
                    Mitra Kurir (Driver)
                  </h3>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Armada Kurir
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Untuk pengemudi kurir pengantaran pesanan makanan dan barang di seluruh wilayah Kecamatan Tumpang.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                    Antar Pesanan
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                    Ongkir Flat Rp 5rb
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                    Kerja Fleksibel
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-extrabold text-emerald-700 group-hover:text-emerald-800">
              <span>Masuk atau Daftar Mitra Kurir</span>
              <div className="w-7 h-7 rounded-full bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <button
          type="button"
          onClick={onBackToHome}
          className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Beranda Utama</span>
        </button>
      </div>
    );
  }

  // =============================================================
  // RENDER LEVEL 2: ACTION SELECTION (DAFTAR vs LOGIN)
  // =============================================================
  if (step === 'action_selection') {
    const isMerchant = selectedRole === 'MERCHANT';

    return (
      <div className="flex flex-col gap-5 pb-6 animate-fadeIn">
        {/* Role Header Banner */}
        <div className={`text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden ${
          isMerchant ? 'bg-gradient-to-br from-emerald-800 to-amber-700' : 'bg-gradient-to-br from-emerald-800 to-teal-800'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider">
              {isMerchant ? '🍲 Portal Mitra Toko (Merchant)' : '🏍️ Portal Mitra Kurir (Driver)'}
            </span>
          </div>
          <h2 className="font-display font-extrabold text-xl text-white">
            {isMerchant ? 'Akses Mitra Toko Kuliner' : 'Akses Mitra Kurir Pengantaran'}
          </h2>
          <p className="text-xs text-white/90 leading-relaxed mt-1 max-w-sm">
            Silakan pilih apakah Anda ingin mendaftar sebagai mitra baru atau masuk ke akun yang sudah terdaftar.
          </p>
        </div>

        {/* 2 Clear Action Choices */}
        <div className="grid grid-cols-1 gap-4">
          {/* Aksi 1: Daftar Baru */}
          <div
            id="portal-action-register"
            onClick={() => {
              setStep('register');
              setRegisterError('');
              setRegisterSuccess(null);
            }}
            className="bg-white border-2 border-slate-200 hover:border-emerald-600 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-start gap-4"
          >
            <div className="w-13 h-13 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 group-hover:scale-105 transition-transform">
              <UserPlus className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-extrabold text-base text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Daftar
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Pengguna Baru
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {isMerchant
                  ? 'Belum punya akun toko? Isi formulir pendaftaran untuk mulai berjualan kuliner online di TumpangGo.'
                  : 'Belum punya akun kurir? Daftarkan diri Anda sebagai pengemudi kurir pengantaran resmi TumpangGo.'}
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                <span>Buka Formulir Pendaftaran</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Aksi 2: Login */}
          <div
            id="portal-action-login"
            onClick={() => {
              setStep('login');
              setLoginError('');
              setPendingNotice(null);
            }}
            className="bg-white border-2 border-slate-200 hover:border-emerald-600 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-start gap-4"
          >
            <div className="w-13 h-13 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 group-hover:scale-105 transition-transform">
              <Lock className="w-6 h-6 text-slate-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-extrabold text-base text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Login
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  Sudah Ada Akun
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {isMerchant
                  ? 'Sudah terdaftar sebagai mitra toko? Masuk untuk mengelola menu, pesanan pelanggan, dan laporan omset.'
                  : 'Sudah terdaftar sebagai kurir? Masuk untuk mulai menerima dan mengantar pesanan makanan hari ini.'}
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-800 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                <span>Masuk ke Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <button
          type="button"
          onClick={() => setStep('role_selection')}
          className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Pemilihan Jenis Mitra</span>
        </button>
      </div>
    );
  }

  // =============================================================
  // RENDER LEVEL 3A: ALUR LOGIN (EMAIL / WHATSAPP & PASSWORD)
  // =============================================================
  if (step === 'login') {
    const isMerchant = selectedRole === 'MERCHANT';

    return (
      <div className="flex flex-col gap-5 pb-6 animate-fadeIn">
        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep('action_selection')}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            {isMerchant ? 'Portal Toko' : 'Portal Kurir'}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${
              isMerchant ? 'bg-amber-600' : 'bg-emerald-600'
            }`}>
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                {isMerchant ? 'Login Mitra Toko (Merchant)' : 'Login Mitra Kurir (Driver)'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Masukkan email atau nomor WhatsApp dan kata sandi Anda.
              </p>
            </div>
          </div>

          {/* Pending Approval Notice */}
          {pendingNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">Pendaftaran Menunggu Persetujuan</p>
                <p className="mt-0.5 leading-relaxed text-amber-800">{pendingNotice}</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {loginError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-rose-950">Gagal Masuk</p>
                <p className="mt-0.5 leading-relaxed">{loginError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email atau No. WhatsApp
              </label>
              <input
                id="portal-login-identifier"
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder={isMerchant ? 'Contoh: warung@gmail.com atau 08123456789' : 'Contoh: driver@gmail.com atau 08123456789'}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  id="portal-login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Masukkan kata sandi akun Anda"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="btn-portal-submit-login"
              type="submit"
              disabled={loginLoading}
              className={`w-full py-3.5 text-white font-extrabold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer ${
                isMerchant
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              } disabled:opacity-60`}
            >
              {loginLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Akun...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{isMerchant ? 'Masuk ke Dashboard Merchant' : 'Masuk ke Dashboard Driver'}</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Switch to Register */}
          <div className="pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Belum memiliki akun {isMerchant ? 'toko' : 'kurir'}?{' '}
              <button
                type="button"
                onClick={() => {
                  setStep('register');
                  setRegisterError('');
                  setRegisterSuccess(null);
                }}
                className="font-extrabold text-emerald-700 hover:underline cursor-pointer"
              >
                Daftar Sebagai Mitra Baru
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =============================================================
  // RENDER LEVEL 3B: ALUR DAFTAR (FORMULIR PENDAFTARAN RESMI)
  // =============================================================
  const isMerchant = selectedRole === 'MERCHANT';

  return (
    <div className="flex flex-col gap-5 pb-6 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep('action_selection')}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
          Formulir {isMerchant ? 'Mitra Toko' : 'Mitra Kurir'}
        </span>
      </div>

      {/* Success Notification */}
      {registerSuccess ? (
        <div className="bg-white border border-emerald-200 rounded-3xl p-6 text-center shadow-lg flex flex-col items-center gap-4 animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-sm">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">
              Pendaftaran Berhasil Dikirim!
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto mt-1.5">
              {registerSuccess}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 text-left max-w-sm w-full space-y-1.5">
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Langkah Selanjutnya:
            </p>
            <p>1. Administrator TumpangGo akan meninjau data pendaftaran Anda.</p>
            <p>2. Setelah akun Anda disetujui, Anda dapat langsung masuk melalui tombol Login.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-sm mt-2">
            <button
              type="button"
              onClick={() => {
                setStep('login');
                setRegisterSuccess(null);
              }}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-md transition-colors cursor-pointer"
            >
              Menuju Halaman Login
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      ) : (
        /* The Actual Registration Form */
        <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 ${
              isMerchant ? 'bg-amber-600' : 'bg-emerald-600'
            }`}>
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                {isMerchant ? 'Pendaftaran Mitra Toko Kuliner' : 'Pendaftaran Mitra Kurir Pengantaran'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Lengkapi data di bawah ini. Akun akan ditinjau dan disetujui oleh Administrator TumpangGo.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {registerError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-rose-950">Gagal Mengirim Formulir</p>
                <p className="mt-0.5 leading-relaxed">{registerError}</p>
              </div>
            </div>
          )}

          {/* FORM: MERCHANT */}
          {isMerchant ? (
            <form onSubmit={handleMerchantRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nama Usaha / Toko Kuliner *
                  </label>
                  <input
                    id="merchant-reg-storename"
                    type="text"
                    required
                    value={mStoreName}
                    onChange={(e) => setMStoreName(e.target.value)}
                    placeholder="Contoh: Warung Barokah Mak Nyus"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nama Lengkap Pemilik Toko *
                  </label>
                  <input
                    id="merchant-reg-ownername"
                    type="text"
                    required
                    value={mOwnerName}
                    onChange={(e) => setMOwnerName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nomor WhatsApp Aktif *
                  </label>
                  <input
                    id="merchant-reg-phone"
                    type="tel"
                    required
                    value={mPhone}
                    onChange={(e) => setMPhone(e.target.value)}
                    placeholder="Contoh: 081298765432"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Alamat Email Toko *
                  </label>
                  <input
                    id="merchant-reg-email"
                    type="email"
                    required
                    value={mEmail}
                    onChange={(e) => setMEmail(e.target.value)}
                    placeholder="Contoh: warungbarokah@gmail.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Kategori Kuliner *
                  </label>
                  <select
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  >
                    <option value="Nasi & Lauk">Nasi & Lauk</option>
                    <option value="Bakso & Mie">Bakso & Mie</option>
                    <option value="Sate & Bakaran">Sate & Bakaran</option>
                    <option value="Cemilan & Jajanan">Cemilan & Jajanan</option>
                    <option value="Minuman Segar">Minuman Segar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Alamat Lengkap Toko (Kecamatan Tumpang) *
                  </label>
                  <input
                    id="merchant-reg-address"
                    type="text"
                    required
                    value={mAddress}
                    onChange={(e) => setMAddress(e.target.value)}
                    placeholder="Contoh: Jl. Raya Tumpang No. 45, Malang"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Kata Sandi Akun Toko *
                  </label>
                  <div className="relative">
                    <input
                      id="merchant-reg-password"
                      type={mShowPassword ? 'text' : 'password'}
                      required
                      value={mPassword}
                      onChange={(e) => setMPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setMShowPassword(!mShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                    >
                      {mShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Konfirmasi Kata Sandi *
                  </label>
                  <input
                    id="merchant-reg-confirm-password"
                    type={mShowPassword ? 'text' : 'password'}
                    required
                    value={mConfirmPassword}
                    onChange={(e) => setMConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Optional Photos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-slate-100 pt-3">
                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Foto Tempat Usaha (Opsional)
                  </span>
                  <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 rounded-xl p-3 flex items-center gap-2.5 cursor-pointer text-xs transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, setMBusinessPhoto)}
                      className="hidden"
                    />
                    <Camera className="w-5 h-5 text-slate-400" />
                    <span className="truncate text-slate-600">
                      {mBusinessPhoto ? 'Foto dipilih (Klik untuk ganti)' : 'Unggah foto tempat usaha'}
                    </span>
                  </label>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Foto KTP Pemilik (Opsional)
                  </span>
                  <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 rounded-xl p-3 flex items-center gap-2.5 cursor-pointer text-xs transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, setMIdPhoto)}
                      className="hidden"
                    />
                    <Camera className="w-5 h-5 text-slate-400" />
                    <span className="truncate text-slate-600">
                      {mIdPhoto ? 'Foto KTP dipilih (Klik untuk ganti)' : 'Unggah foto identitas / KTP'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start gap-2.5 pt-2">
                <input
                  id="merchant-agree-terms"
                  type="checkbox"
                  checked={mAgreeTerms}
                  onChange={(e) => setMAgreeTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 accent-emerald-600 cursor-pointer"
                />
                <label htmlFor="merchant-agree-terms" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                  Saya menyatakan bahwa data yang diisi adalah benar dan menyetujui seluruh ketentuan kemitraan UMKM TumpangGo.
                </label>
              </div>

              <button
                id="btn-submit-merchant-register"
                type="submit"
                disabled={registerLoading}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-60"
              >
                {registerLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengirim Pendaftaran Toko...</span>
                  </>
                ) : (
                  <>
                    <Store className="w-4 h-4" />
                    <span>Kirim Pendaftaran Mitra Toko</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* FORM: DRIVER */
            <form onSubmit={handleDriverRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nama Lengkap Kurir / Driver *
                  </label>
                  <input
                    id="driver-reg-name"
                    type="text"
                    required
                    value={dName}
                    onChange={(e) => setDName(e.target.value)}
                    placeholder="Contoh: Rian Pratama"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nomor WhatsApp Aktif *
                  </label>
                  <input
                    id="driver-reg-phone"
                    type="tel"
                    required
                    value={dPhone}
                    onChange={(e) => setDPhone(e.target.value)}
                    placeholder="Contoh: 081298765432"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Alamat Email (Untuk Login)
                  </label>
                  <input
                    id="driver-reg-email"
                    type="email"
                    value={dEmail}
                    onChange={(e) => setDEmail(e.target.value)}
                    placeholder="Contoh: driver.rian@gmail.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Jenis Armada Kendaraan *
                  </label>
                  <select
                    value={dVehicleType}
                    onChange={(e) => setDVehicleType(e.target.value as 'motor' | 'mobil')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  >
                    <option value="motor">Sepeda Motor (Kurir Makanan)</option>
                    <option value="mobil">Mobil (Taksi / Muatan)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nomor Plat Kendaraan *
                  </label>
                  <input
                    id="driver-reg-platenumber"
                    type="text"
                    required
                    value={dPlateNumber}
                    onChange={(e) => setDPlateNumber(e.target.value)}
                    placeholder="Contoh: N 5432 AB"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Wilayah Operasional *
                  </label>
                  <input
                    id="driver-reg-operatingarea"
                    type="text"
                    required
                    value={dOperatingArea}
                    onChange={(e) => setDOperatingArea(e.target.value)}
                    placeholder="Kecamatan Tumpang & Sekitarnya"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Kata Sandi Akun Kurir *
                  </label>
                  <div className="relative">
                    <input
                      id="driver-reg-password"
                      type={dShowPassword ? 'text' : 'password'}
                      required
                      value={dPassword}
                      onChange={(e) => setDPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setDShowPassword(!dShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                    >
                      {dShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Konfirmasi Kata Sandi *
                  </label>
                  <input
                    id="driver-reg-confirm-password"
                    type={dShowPassword ? 'text' : 'password'}
                    required
                    value={dConfirmPassword}
                    onChange={(e) => setDConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Optional Photos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-slate-100 pt-3">
                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Foto Kendaraan (Opsional)
                  </span>
                  <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 rounded-xl p-3 flex items-center gap-2.5 cursor-pointer text-xs transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, setDVehiclePhoto)}
                      className="hidden"
                    />
                    <Camera className="w-5 h-5 text-slate-400" />
                    <span className="truncate text-slate-600">
                      {dVehiclePhoto ? 'Foto kendaraan dipilih' : 'Unggah foto kendaraan'}
                    </span>
                  </label>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Foto SIM / KTP (Opsional)
                  </span>
                  <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 rounded-xl p-3 flex items-center gap-2.5 cursor-pointer text-xs transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, setDSimPhoto)}
                      className="hidden"
                    />
                    <Camera className="w-5 h-5 text-slate-400" />
                    <span className="truncate text-slate-600">
                      {dSimPhoto ? 'Foto SIM dipilih' : 'Unggah foto SIM / KTP'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start gap-2.5 pt-2">
                <input
                  id="driver-agree-terms"
                  type="checkbox"
                  checked={dAgreeTerms}
                  onChange={(e) => setDAgreeTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 accent-emerald-600 cursor-pointer"
                />
                <label htmlFor="driver-agree-terms" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                  Saya menyatakan bahwa data armada pengemudi yang diisi adalah benar dan menyetujui seluruh ketentuan kemitraan kurir TumpangGo.
                </label>
              </div>

              <button
                id="btn-submit-driver-register"
                type="submit"
                disabled={registerLoading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-60"
              >
                {registerLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengirim Pendaftaran Kurir...</span>
                  </>
                ) : (
                  <>
                    <Bike className="w-4 h-4" />
                    <span>Kirim Pendaftaran Mitra Kurir</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Switch to Login */}
          <div className="pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Sudah memiliki akun {isMerchant ? 'toko' : 'kurir'}?{' '}
              <button
                type="button"
                onClick={() => {
                  setStep('login');
                  setRegisterError('');
                  setRegisterSuccess(null);
                }}
                className="font-extrabold text-emerald-700 hover:underline cursor-pointer"
              >
                Masuk ke Halaman Login
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

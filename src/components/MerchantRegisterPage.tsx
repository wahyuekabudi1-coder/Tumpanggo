import React, { useState } from 'react';
import { safeStorage } from '../utils/safeStorage.ts';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import Logo from './Logo.tsx';
import { useSEO } from '../hooks/useSEO.ts';

import { 
  Store, User, Phone, Mail, MapPin, Tag, Lock, ArrowRight, CheckCircle2, 
  AlertCircle, Loader2, ArrowLeft, Clock, FileText, Camera, ShieldCheck, ExternalLink,
  Eye, EyeOff, Download
} from 'lucide-react';
import { downloadPartnershipContractPdf, OFFICIAL_CONTRACT_VERSION } from '../utils/contractDocument.ts';

interface MerchantRegisterPageProps {
  onBackToHome?: () => void;
  onGoToLogin?: () => void;
}

export default function MerchantRegisterPage({ onBackToHome, onGoToLogin }: MerchantRegisterPageProps) {
  useSEO({
    title: 'Pendaftaran Mitra UMKM Kuliner | Bawa Usaha Lokal Naik Kelas – TumpangGo',
    description: 'Daftarkan usaha kuliner dan toko lokal Anda di TumpangGo. Buka pasar lebih luas di Kecamatan Tumpang Malang dengan dukungan teknologi digital terintegrasi.',
    canonicalPath: '/?page=merchant-register',
    isNoIndex: false
  });
  // Form states
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('Nasi & Lauk');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Photos (Base64 or previews)
  const [businessPhoto, setBusinessPhoto] = useState<string | null>(null);
  const [idPhoto, setIdPhoto] = useState<string | null>(null);

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<any | null>(null);

  // Handle Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!storeName.trim() || !ownerName.trim() || !phone.trim() || !address.trim() || !password) {
      setError('Mohon lengkapi seluruh kolom wajib bertanda bintang (*).');
      return;
    }

    if (password.length < 6) {
      setError('Kata sandi minimal harus 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (!agreeTerms) {
      setError('Anda harus menyetujui Perjanjian Kerja Sama Kemitraan UMKM tumpangGo.');
      return;
    }

    setLoading(true);

    try {
      const contractAgreedAt = new Date().toISOString();
      const res = await fetch('/api/merchants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: storeName.trim(),
          ownerName: ownerName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          category,
          address: address.trim(),
          description: description.trim() || `Toko Kuliner ${storeName.trim()} Kecamatan Tumpang`,
          password,
          image: businessPhoto || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=60',
          bannerImage: businessPhoto || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=60',
          contractVersion: OFFICIAL_CONTRACT_VERSION,
          contractAgreedAt
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengajukan pendaftaran toko kuliner Anda.');
      }

      const reg = data.registration || {
        storeName: storeName.trim(),
        name: ownerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        category,
        status: 'PENDING',
        contractVersion: OFFICIAL_CONTRACT_VERSION,
        contractAgreedAt
      };

      setSuccessData(reg);
      const authIdentifier = reg.email || reg.phone || reg.id;
      if (authIdentifier) {
        safeStorage.setItem('tumpang_auth_email', authIdentifier);
      }
    } catch (err: any) {
      console.error('Merchant registration error:', err);
      setError(err.message || 'Terjadi kesalahan saat pendaftaran toko.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-16">
      
      {/* Top Header Navigation */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-50 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBackToHome && (
              <button 
                onClick={onBackToHome}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Kembali</span>
              </button>
            )}
            <Logo size={40} mode="full" />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onGoToLogin) {
                  onGoToLogin();
                } else {
                  window.location.href = '/?role=merchant';
                }
              }}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs px-3.5 py-2 rounded-xl border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Login Portal Merchant</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner Section */}
      <div className="bg-gradient-to-br from-[#185338] via-[#14532d] to-slate-900 text-white py-10 px-4 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-60 h-60 bg-amber-400/10 rounded-full blur-3xl"></div>
        <div className="max-w-3xl mx-auto relative z-10 text-center flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-[11px] font-extrabold border border-amber-400/30 uppercase tracking-wider mb-3">
            <Store className="w-3.5 h-3.5" />
            <span>Formulir Resmi Pendaftaran Mitra UMKM</span>
          </span>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight leading-tight">
            Pendaftaran Mitra UMKM Kuliner tumpangGo
          </h1>
          <p className="text-slate-200 text-xs sm:text-sm mt-2.5 max-w-xl leading-relaxed">
            Daftarkan warung, depot, atau toko kuliner Anda sekarang. Nikmati kemudahan berjualan online dan jangkau ribuan pelanggan di Kecamatan Tumpang & sekitarnya.
          </p>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 -mt-6 relative z-20">
        {successData ? (
          /* SUCCESS SCREEN (STATUS PENDING) */
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 text-center flex flex-col items-center gap-4 animate-fadeIn">
            <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-500 text-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/10 mb-1">
              <Clock className="w-12 h-12" />
            </div>

            <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
              Status: Menunggu Persetujuan Admin (PENDING)
            </span>

            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
              Pengajuan Mitra Toko Berhasil Dikirim!
            </h2>

            <p className="text-slate-600 text-xs sm:text-sm max-w-md leading-relaxed">
              Terima kasih, <strong>{successData.name || successData.ownerName}</strong>. Pengajuan toko kuliner <strong>{successData.storeName || successData.name}</strong> telah masuk ke antrean verifikasi Administrator tumpangGo. Akses login Portal Merchant akan dibuka setelah disetujui.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 w-full max-w-md text-left text-xs flex flex-col gap-2 my-2">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Nomor Registrasi:</span>
                <span className="font-mono font-bold text-slate-800">{successData.id || 'reg_pending'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Nama Toko:</span>
                <span className="font-bold text-slate-800">{successData.storeName || successData.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Pemilik:</span>
                <span className="font-bold text-slate-800">{successData.name || successData.ownerName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">No. WhatsApp:</span>
                <span className="font-bold text-emerald-700">{successData.phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Versi Kontrak:</span>
                <span className="font-mono font-bold text-indigo-700">{successData.contractVersion || OFFICIAL_CONTRACT_VERSION}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Status Toko:</span>
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">PENDING (Menunggu Verifikasi)</span>
              </div>
            </div>

            {/* Contract Download Button */}
            <button
              type="button"
              onClick={() => {
                downloadPartnershipContractPdf({
                  storeName: successData.storeName || successData.name,
                  ownerName: successData.name || successData.ownerName,
                  phone: successData.phone,
                  email: successData.email,
                  address: successData.storeAddress || address,
                  role: 'MERCHANT'
                });
              }}
              className="w-full max-w-md py-3 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-extrabold rounded-2xl transition-colors text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>Unduh Dokumen Kontrak Kerja Sama (PDF)</span>
            </button>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mt-2">
              <button
                onClick={() => {
                  if (onGoToLogin) {
                    onGoToLogin();
                  } else {
                    window.location.href = '/?role=merchant';
                  }
                }}
                className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl transition-all shadow-md text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Cek Status di Login Merchant</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => {
                  if (onBackToHome) {
                    onBackToHome();
                  } else {
                    window.location.href = '/';
                  }
                }}
                className="py-3.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors text-xs cursor-pointer"
              >
                Ke Beranda
              </button>
            </div>
          </div>
        ) : (
          /* REGISTRATION FORM */
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-slate-200/80 flex flex-col gap-6">
            
            {/* Form Error Banner */}
            {error && (
              <div className="bg-red-50 border-2 border-red-500 text-red-700 text-xs p-4 rounded-2xl flex gap-3 items-center font-bold animate-fadeIn">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* SECTION 1: PROFIL PEMILIK */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <User className="w-5 h-5 text-rose-600" />
                <h3 className="font-display font-bold text-sm text-slate-800 uppercase tracking-wider">
                  1. Data Pemilik / Pengelola Usaha
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Nama Lengkap Pemilik <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="Sesuai KTP (Contoh: Budi Santoso)"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    No. WhatsApp / Telepon Aktif <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    disabled={loading}
                    placeholder="Contoh: 081234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Email Pemilik / Email Toko (Opsional)
                </label>
                <input
                  type="email"
                  disabled={loading}
                  placeholder="Contoh: tokobudi@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Foto KTP Pemilik (Opsional)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl p-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>{idPhoto ? 'Ubah Foto KTP' : 'Unggah Foto KTP Pemilik'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, setIdPhoto)} />
                  </label>
                  {idPhoto && (
                    <img src={idPhoto} alt="KTP" className="w-12 h-12 object-cover rounded-xl border border-slate-200" />
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: PROFIL TOKO */}
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Store className="w-5 h-5 text-rose-600" />
                <h3 className="font-display font-bold text-sm text-slate-800 uppercase tracking-wider">
                  2. Informasi Usaha / Outlet Kuliner
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Nama Toko / UMKM <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="Contoh: Bakso Solo Pak Joko Tumpang"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Kategori Kuliner <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={category}
                    disabled={loading}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all cursor-pointer"
                  >
                    <option value="Bakso & Mie">Bakso & Mie</option>
                    <option value="Nasi & Lauk">Nasi & Lauk</option>
                    <option value="Sate & Bakaran">Sate & Bakaran</option>
                    <option value="Cemilan & Jajanan">Cemilan & Jajanan</option>
                    <option value="Minuman Segar">Minuman Segar</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Alamat Lengkap Toko / Dapur (Kecamatan Tumpang) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  placeholder="Contoh: Jl. Raya Malangsuko No. 45, Kecamatan Tumpang"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Jam Buka Toko
                  </label>
                  <input
                    type="time"
                    value={openTime}
                    disabled={loading}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Jam Tutup Toko
                  </label>
                  <input
                    type="time"
                    value={closeTime}
                    disabled={loading}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Foto Tempat Usaha / Spanduk Toko (Opsional)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl p-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>{businessPhoto ? 'Ubah Foto Toko' : 'Unggah Foto Toko / Spanduk'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, setBusinessPhoto)} />
                  </label>
                  {businessPhoto && (
                    <img src={businessPhoto} alt="Toko" className="w-12 h-12 object-cover rounded-xl border border-slate-200" />
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 3: KEAMANAN PORTAL */}
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Lock className="w-5 h-5 text-rose-600" />
                <h3 className="font-display font-bold text-sm text-slate-800 uppercase tracking-wider">
                  3. Kata Sandi Portal Merchant
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Buat Kata Sandi Login <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      disabled={loading}
                      placeholder="Minimal 6 karakter"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl pl-4 pr-10 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-0.5"
                      title={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                      aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Ulangi Kata Sandi <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      disabled={loading}
                      placeholder="Ulangi kata sandi"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl pl-4 pr-10 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-0.5"
                      title={showConfirmPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                      aria-label={showConfirmPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: KONTRAK KERJA SAMA KEMITRAAN */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <FileText className="w-5 h-5 text-emerald-700" />
                <h3 className="font-display font-bold text-sm text-slate-800 uppercase tracking-wider">
                  4. Dokumen Kontrak Kerja Sama Kemitraan
                </h3>
              </div>

              <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md border border-emerald-300 font-mono">
                      {OFFICIAL_CONTRACT_VERSION}
                    </span>
                    <span className="text-xs font-bold text-slate-900">Perjanjian Kemitraan UMKM Kuliner tumpangGo</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Mengatur hak & kewajiban: Ongkir Flat Rp 5.000 se-Kecamatan Tumpang, komisi platform 10%, pencairan H+1, dan standar mutu produk.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    downloadPartnershipContractPdf({
                      storeName: storeName.trim() || 'Toko Kuliner',
                      ownerName: ownerName.trim() || 'Pemilik Toko',
                      phone: phone.trim(),
                      email: email.trim(),
                      address: address.trim(),
                      role: 'MERCHANT'
                    });
                  }}
                  className="shrink-0 py-2.5 px-3.5 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4 text-emerald-700" />
                  <span>Unduh Kontrak (PDF)</span>
                </button>
              </div>

              {/* Mandatory Agreement Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  required
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-slate-700 leading-relaxed font-medium">
                  Saya menyatakan data yang diisi adalah sah dan benar, serta <strong>telah membaca, mengunduh, dan menyetujui seluruh ketentuan Perjanjian Kerja Sama Kemitraan UMKM Kuliner tumpangGo ({OFFICIAL_CONTRACT_VERSION})</strong>. <span className="text-rose-600 font-bold">*</span>
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#185338] hover:bg-[#14532d] active:bg-slate-900 text-white font-extrabold rounded-2xl transition-all shadow-lg shadow-[#185338]/20 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-60 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>MEMPROSES PENDAFTARAN...</span>
                </>
              ) : (
                <>
                  <span>KIRIM PENDAFTARAN MITRA UMKM</span>
                  <ArrowRight className="w-5 h-5 text-amber-300" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <p className="text-xs text-slate-500">
                Sudah mendaftar sebagai mitra?{' '}
                <button
                  type="button"
                  onClick={() => {
                    if (onGoToLogin) {
                      onGoToLogin();
                    } else {
                      window.location.href = '/?role=merchant';
                    }
                  }}
                  className="text-rose-600 font-extrabold hover:underline cursor-pointer"
                >
                  Login Portal Merchant Di Sini
                </button>
              </p>
            </div>

          </form>
        )}
      </main>

    </div>
  );
}

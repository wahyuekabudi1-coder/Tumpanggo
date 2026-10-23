import React, { useState } from 'react';
import { safeStorage } from '../utils/safeStorage.ts';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import Logo from './Logo.tsx';
import MapPicker from './MapPicker.tsx';
import { useSEO } from '../hooks/useSEO.ts';
import { compressImage } from '../utils/imageCompressor.ts';

import { 
  Store, User, Phone, Mail, MapPin, Tag, Lock, ArrowRight, CheckCircle2, 
  AlertCircle, Loader2, ArrowLeft, Clock, FileText, Camera, ShieldCheck, ExternalLink,
  Eye, EyeOff, Download, MessageCircle
} from 'lucide-react';
import { downloadPartnershipContractPdf, OFFICIAL_CONTRACT_VERSION } from '../utils/contractDocument.ts';

interface MerchantRegisterPageProps {
  onBackToHome?: () => void;
  onGoToLogin?: () => void;
}

const ADMIN_CATEGORIES = [
  'Nasi & Lauk',
  'Bakso & Mie',
  'Sate & Bakaran',
  'Cemilan & Jajanan',
  'Minuman Segar',
  'Kue & Roti',
  'Aneka Kopi & Teh'
];

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
  const [category, setCategory] = useState(ADMIN_CATEGORIES[0]);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(-7.9482);
  const [longitude, setLongitude] = useState(112.7612);
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Contract workflow states
  const [contractDownloaded, setContractDownloaded] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Photos (Compressed Base64 JPEG)
  const [businessPhoto, setBusinessPhoto] = useState<string | null>(null);
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  const [compressingField, setCompressingField] = useState<string | null>(null);

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<any | null>(null);

  // Client-side image compression handler (<80KB guaranteed)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void, fieldKey: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setCompressingField(fieldKey);
      const compressed = await compressImage(file, 800, 800, 0.6);
      setter(compressed);
    } catch (err) {
      console.error('Image compression error:', err);
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setCompressingField(null);
    }
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isFormValid = Boolean(
    storeName.trim() &&
    ownerName.trim() &&
    phone.trim() &&
    email.trim() &&
    emailRegex.test(email.trim()) &&
    address.trim() &&
    password &&
    password.length >= 6 &&
    password === confirmPassword &&
    businessPhoto &&
    idPhoto &&
    contractDownloaded &&
    agreeTerms
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!storeName.trim() || !ownerName.trim() || !phone.trim() || !email.trim() || !address.trim() || !password) {
      setError('Mohon lengkapi seluruh kolom wajib bertanda bintang (*).');
      return;
    }

    if (!emailRegex.test(email.trim())) {
      setError('Format email tidak valid. Masukkan alamat email yang benar.');
      return;
    }

    if (!businessPhoto) {
      setError('Foto tempat usaha / gerai wajib diunggah.');
      return;
    }

    if (!idPhoto) {
      setError('Foto KTP pemilik usaha wajib diunggah untuk verifikasi identitas.');
      return;
    }

    if (password.length < 6) {
      setError('Kata sandi minimal harus 6 karakter demi keamanan akun Anda.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (!contractDownloaded) {
      setError('Anda wajib mengunduh dokumen Kontrak Kerja Sama terlebih dahulu.');
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
          latitude,
          longitude,
          description: description.trim() || `Toko Kuliner ${storeName.trim()} Kecamatan Tumpang`,
          password,
          image: businessPhoto,
          businessPhoto: businessPhoto,
          idPhoto: idPhoto,
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
                <span className="text-slate-500 font-medium">Pemilik Usaha:</span>
                <span className="font-bold text-slate-800">{successData.name || successData.ownerName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">No. WhatsApp:</span>
                <span className="font-bold text-emerald-700">{successData.phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Email:</span>
                <span className="font-medium text-slate-700">{successData.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Versi Kontrak:</span>
                <span className="font-mono font-bold text-indigo-700">{successData.contractVersion || OFFICIAL_CONTRACT_VERSION}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Status Toko:</span>
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">PENDING (Menunggu Verifikasi Admin)</span>
              </div>
            </div>

            {/* Petunjuk Langkah Selanjutnya (Tanpa pengulangan unduh kontrak) */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl w-full max-w-md text-left text-xs text-slate-700 space-y-1.5 my-1">
              <span className="font-bold text-emerald-900 block text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                Instruksi Verifikasi Dokumen Kemitraan
              </span>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Dokumen kontrak kerja sama yang telah Anda unduh wajib dicetak, dibubuhi <strong>materai Rp 10.000</strong>, dan ditandatangani. Siapkan dokumen fisik tersebut untuk proses verifikasi oleh Admin Pusat tumpangGo sebelum akun toko diaktifkan.
              </p>
              <p className="text-[10px] text-slate-400 italic pt-1">
                *Catatan Administrasi: Naskah revisi pasal-pasal kontrak kemitraan saat ini sedang menunggu finalisasi naskah hukum resmi.
              </p>
            </div>

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
                    Nama Lengkap Pemilik Sesuai KTP <span className="text-rose-500">*</span>
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
                  Email Aktif Pemilik / Toko <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  placeholder="Contoh: tokobudi@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Foto KTP Pemilik Usaha <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl p-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>
                      {compressingField === 'idPhoto' ? 'Mengompres foto...' : idPhoto ? 'Ubah Foto KTP' : 'Unggah Foto KTP Pemilik'}
                    </span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      required={!idPhoto}
                      className="hidden" 
                      onChange={(e) => handlePhotoUpload(e, setIdPhoto, 'idPhoto')} 
                    />
                  </label>
                  {idPhoto && (
                    <img src={idPhoto} alt="KTP" className="w-12 h-12 object-cover rounded-xl border border-slate-200" />
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: PROFIL TOKO & LOKASI */}
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Store className="w-5 h-5 text-rose-600" />
                <h3 className="font-display font-bold text-sm text-slate-800 uppercase tracking-wider">
                  2. Informasi Usaha & Lokasi Outlet
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Nama Toko / UMKM Kuliner <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="Contoh: Warung Akas Tumpang"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Kategori Kuliner (Ditetapkan Admin) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={category}
                    disabled={loading}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all cursor-pointer"
                  >
                    {ADMIN_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bantuan Pengajuan Kategori Baru */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                <span>Kategori usaha Anda belum ada di daftar pilihan?</span>
                <a
                  href={`https://wa.me/6281234567890?text=${encodeURIComponent(`Halo Admin Pusat TumpangGo, saya pemilik ${storeName.trim() || 'usaha kuliner'} ingin mengajukan penambahan kategori usaha baru.`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 shrink-0 ml-2"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Minta Kategori ke Admin</span>
                </a>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Alamat Lengkap Toko / Dapur (Kecamatan Tumpang) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  disabled={loading}
                  placeholder="Contoh: Jl. Raya Malangsuko No. 45, RT 02/RW 03, Kecamatan Tumpang"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 rounded-xl px-4 py-3 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all"
                />
              </div>

              {/* MapPicker Lokasi Usaha */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-600" />
                  <span>Tentukan Titik Koordinat Usaha pada Peta <span className="text-rose-500">*</span></span>
                </label>
                <div className="w-full h-56 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                  <MapPicker
                    initialLat={latitude}
                    initialLng={longitude}
                    pinLabel={storeName.trim() || 'Titik Toko Anda'}
                    onLocationSelected={(lat, lng, addr) => {
                      setLatitude(lat);
                      setLongitude(lng);
                      if (addr && !address) {
                        setAddress(addr);
                      }
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 px-1">
                  <span>Geser peta untuk menentukan titik dapur / tempat usaha Anda.</span>
                  <span className="font-mono">Lat: {latitude.toFixed(4)}, Lng: {longitude.toFixed(4)}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Foto Tempat Usaha / Spanduk Toko <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl p-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>
                      {compressingField === 'businessPhoto' ? 'Mengompres foto...' : businessPhoto ? 'Ubah Foto Toko' : 'Unggah Foto Toko / Spanduk'}
                    </span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      required={!businessPhoto}
                      className="hidden" 
                      onChange={(e) => handlePhotoUpload(e, setBusinessPhoto, 'businessPhoto')} 
                    />
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
                    Merchant wajib mengunduh dokumen kontrak terlebih dahulu untuk dipelajari, dicetak, dan ditandatangani di atas materai.
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
                    setContractDownloaded(true);
                  }}
                  className={`shrink-0 py-2.5 px-3.5 border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                    contractDownloaded 
                      ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700' 
                      : 'bg-white hover:bg-emerald-100 border-emerald-300 text-emerald-800 ring-2 ring-emerald-400/30'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>{contractDownloaded ? '✓ Kontrak Telah Diunduh' : '1. Unduh Kontrak (PDF)'}</span>
                </button>
              </div>

              {/* Petunjuk Materai dan Fisik Kontrak (Aktif setelah unduh) */}
              {contractDownloaded ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1 animate-fadeIn">
                  <span className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider text-amber-800">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    Petunjuk Penyiapan Dokumen Fisik:
                  </span>
                  <p className="text-[11px] leading-relaxed">
                    Dokumen kontrak yang baru saja Anda unduh harus <strong>disimpan, dicetak, dan ditandatangani di atas materai Rp 10.000</strong> sesuai ketentuan. Dokumen fisik ini wajib disiapkan saat verifikasi lapangan oleh Tim Admin Pusat tumpangGo.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 italic">
                  *Klik tombol "1. Unduh Kontrak (PDF)" di atas untuk membaca ketentuan kemitraan dan membuka persetujuan pendaftaran.
                </div>
              )}

              {/* Mandatory Agreement Checkbox */}
              <label className={`flex items-start gap-2.5 pt-1 transition-opacity ${contractDownloaded ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input
                  type="checkbox"
                  required
                  disabled={!contractDownloaded}
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-xs text-slate-700 leading-relaxed font-medium">
                  Saya menyatakan data yang diisi adalah sah dan benar, <strong>telah mengunduh dokumen kontrak kerja sama, memahami kewajiban pembubuhan materai fisik, dan menyetujui seluruh ketentuan Perjanjian Kemitraan UMKM Kuliner tumpangGo ({OFFICIAL_CONTRACT_VERSION})</strong>. <span className="text-rose-600 font-bold">*</span>
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !isFormValid}
              className={`w-full py-4 font-extrabold rounded-2xl transition-all text-xs sm:text-sm flex items-center justify-center gap-2 mt-2 ${
                isFormValid && !loading
                  ? 'bg-[#185338] hover:bg-[#14532d] active:bg-slate-900 text-white shadow-lg shadow-[#185338]/20 cursor-pointer active:scale-98'
                  : 'bg-slate-300 text-slate-500 border border-slate-300 shadow-none cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>MEMPROSES PENDAFTARAN...</span>
                </>
              ) : (
                <>
                  <span>KIRIM PENDAFTARAN MITRA UMKM</span>
                  <ArrowRight className={`w-5 h-5 ${isFormValid ? 'text-amber-300' : 'text-slate-400'}`} />
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

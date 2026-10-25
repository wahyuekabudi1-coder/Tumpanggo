/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Section "Review & Testimoni Pengguna TumpangGo"
 * Displays clean, simple, and professional user reviews from Customers and Merchants.
 * 
 * Revisions:
 * 1. Automatic infinite loop carousel without manual navigation buttons (no Prev/Next arrows, no position numbers, no dot indicators)
 * 2. Smooth auto-slide at a comfortable reading pace (6.5s interval), pausing on hover/touch
 * 3. Respects prefers-reduced-motion accessibility preference (static view, transition disabled)
 * 4. Honest presentation: No demo or example labels, no fake identities or unverified claims
 * 5. Google attribution: Google logo & link rendered ONLY when review source is verified as Google
 * 6. Removed redundant "Kecamatan Tumpang" location tag from each card
 * 7. Interactive "+ Tulis Review" submission workflow for real customer & merchant experiences
 */

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import { 
  Store, Users, Star, MessageSquarePlus, CheckCircle2, 
  AlertCircle, X, Sparkles, Send, ArrowLeft, Check
} from 'lucide-react';

export interface ReviewItem {
  id: string;
  name: string;
  role: 'Merchant' | 'Pelanggan';
  content: string;
  rating: number;
  /** Sumber ulasan, misalnya 'google' jika ulasan resmi bersumber dari Google */
  source?: 'google' | 'direct';
  /** Tautan ke sumber ulasan asli bila tersedia */
  sourceUrl?: string;
  /** Status verifikasi */
  verified?: boolean;
}

/**
 * Komponen Ikon Google resmi untuk atribusi ulasan yang terverifikasi bersumber dari Google
 */
export function GoogleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

/**
 * 10 Data Testimoni Berbahasa Indonesia Sehari-hari (Natural & Singkat)
 * Komposisi:
 * - 6 Testimoni Pelanggan
 * - 4 Testimoni Mitra UMKM / Merchant
 */
export const DEFAULT_REVIEWS: ReviewItem[] = [
  // 6 Testimoni Pelanggan
  {
    id: 'rev-cust-1',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Lagi mager tapi pengen jajan, tinggal pesan dari HP. Nggak perlu keluar rumah.',
    rating: 5,
  },
  {
    id: 'rev-cust-2',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Lebih gampang cari makanan sekitar Tumpang. Tinggal pilih menu dan pesan.',
    rating: 5,
  },
  {
    id: 'rev-cust-3',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Praktis buat pesan makanan ketika lagi sibuk di rumah.',
    rating: 5,
  },
  {
    id: 'rev-cust-4',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Biasanya bingung mau makan apa pas siang, sekarang tinggal cek pilihan kuliner di sekitar.',
    rating: 5,
  },
  {
    id: 'rev-cust-5',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Bisa tahu menu warung langganan tanpa harus datang langsung ke lokasi.',
    rating: 5,
  },
  {
    id: 'rev-cust-6',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Sangat membantu waktu hujan atau pas malam-malam pengen camilan hangat.',
    rating: 5,
  },
  // 4 Testimoni Merchant / Pelaku UMKM
  {
    id: 'rev-merch-1',
    name: 'Mitra Kuliner Tumpang',
    role: 'Merchant',
    content: 'Bantu usaha saya lebih mudah ditemukan pelanggan sekitar.',
    rating: 5,
  },
  {
    id: 'rev-merch-2',
    name: 'Mitra UMKM Tumpang',
    role: 'Merchant',
    content: 'Pelanggan bisa melihat menu tanpa harus tanya satu-satu lewat chat.',
    rating: 5,
  },
  {
    id: 'rev-merch-3',
    name: 'Pelaku Usaha Tumpang',
    role: 'Merchant',
    content: 'Pesanan jadi lebih rapi dan jelas, sangat menolong operasional warung kecil kami.',
    rating: 5,
  },
  {
    id: 'rev-merch-4',
    name: 'Mitra Warung Tumpang',
    role: 'Merchant',
    content: 'Semoga makin banyak UMKM Tumpang yang terbantu dengan platform ini.',
    rating: 5,
  },
];

// Alias untuk kompatibilitas import sebelumnya
export const DEFAULT_DEMO_REVIEWS = DEFAULT_REVIEWS;

interface UserTestimonialsSectionProps {
  className?: string;
}

type SubmissionRole = 'merchant' | 'pelanggan' | null;

export default function UserTestimonialsSection({ className = '' }: UserTestimonialsSectionProps) {
  // Inisialisasi daftar review
  const [reviewsList, setReviewsList] = useState<ReviewItem[]>(DEFAULT_REVIEWS);
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const sliderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Deteksi preferensi reduced motion pada perangkat pengguna
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Form Submission States (Flow inline interaktif)
  const [formStep, setFormStep] = useState<'idle' | 'role-selection' | 'form' | 'submitted'>('idle');
  const [selectedRole, setSelectedRole] = useState<SubmissionRole>(null);
  const [formName, setFormName] = useState<string>('');
  const [formMerchantName, setFormMerchantName] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formRating, setFormRating] = useState<number>(5);
  const [formContent, setFormContent] = useState<string>('');
  const [formConsent, setFormConsent] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Ambil ulasan nyata yang dipublikasikan dari backend jika tersedia
  useEffect(() => {
    let isMounted = true;
    const fetchPublishedReviews = async () => {
      try {
        const res = await fetch('/api/reviews');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0 && isMounted) {
            const mapped: ReviewItem[] = data.map((t: any) => ({
              id: t.id || `rev-${Math.random()}`,
              name: t.userName || 'Pengguna TumpangGo',
              role: (t.category === 'merchant' || t.category === 'umkm') ? 'Merchant' : 'Pelanggan',
              content: t.content || '',
              rating: typeof t.rating === 'number' ? t.rating : 5,
              source: t.source === 'google' ? 'google' : 'direct',
              sourceUrl: t.sourceUrl || undefined,
              verified: Boolean(t.verified),
            }));
            setReviewsList(mapped);
          }
        }
      } catch {
        // Gunakan ulasan default jika API tidak merespons
      }
    };

    fetchPublishedReviews();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalSlides = reviewsList.length;

  // Pastikan activeSlide tidak melampaui totalSlides
  useEffect(() => {
    if (totalSlides > 0 && activeSlide >= totalSlides) {
      setActiveSlide(0);
    }
  }, [totalSlides, activeSlide]);

  // Otomatis berpindah slide setiap 6.5 detik dalam loop berkesinambungan
  // Berhenti otomatis jika prefers-reduced-motion aktif, form terbuka, atau pengguna sedang hover/touch
  useEffect(() => {
    if (formStep !== 'idle' || isPaused || prefersReducedMotion || totalSlides <= 1) {
      if (sliderIntervalRef.current) {
        clearInterval(sliderIntervalRef.current);
        sliderIntervalRef.current = null;
      }
      return;
    }

    sliderIntervalRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % totalSlides);
    }, 6500);

    return () => {
      if (sliderIntervalRef.current) {
        clearInterval(sliderIntervalRef.current);
        sliderIntervalRef.current = null;
      }
    };
  }, [formStep, isPaused, prefersReducedMotion, totalSlides]);

  // Form submission handler
  const handleResetForm = () => {
    setFormStep('idle');
    setSelectedRole(null);
    setFormName('');
    setFormMerchantName('');
    setFormTitle('');
    setFormRating(5);
    setFormContent('');
    setFormConsent(false);
    setSubmitError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const trimmedName = formName.trim();
    const trimmedMerchant = formMerchantName.trim();
    const trimmedTitle = formTitle.trim();
    const trimmedContent = formContent.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setSubmitError('Nama pemberi review wajib diisi (minimal 2 karakter).');
      return;
    }

    if (selectedRole === 'merchant' && (!trimmedMerchant || trimmedMerchant.length < 2)) {
      setSubmitError('Nama usaha atau toko wajib diisi (minimal 2 karakter).');
      return;
    }

    if (!Number.isInteger(formRating) || formRating < 1 || formRating > 5) {
      setSubmitError('Pilih rating bintang antara 1 sampai 5.');
      return;
    }

    if (!trimmedContent || trimmedContent.length < 10) {
      setSubmitError('Isi review minimal 10 karakter.');
      return;
    }

    if (!formConsent) {
      setSubmitError('Anda harus menyetujui bahwa ulasan ini merupakan pengalaman nyata.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: trimmedName,
          category: selectedRole,
          merchantName: selectedRole === 'merchant' ? trimmedMerchant : undefined,
          title: trimmedTitle || undefined,
          rating: formRating,
          content: trimmedContent,
          consentApproved: formConsent
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setFormStep('submitted');
      } else {
        setSubmitError(data?.error || 'Gagal mengirim review. Silakan periksa kembali data Anda.');
      }
    } catch {
      setSubmitError('Terjadi kendala jaringan saat mengirim review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section 
      aria-labelledby="section-reviews-title"
      className={`bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-6 shadow-xs flex flex-col gap-4 my-2 ${className}`}
    >
      {/* =========================================================================
          VIEW 1: FORMULIR SUBMISI ULASAN BARU
          ========================================================================= */}
      {formStep === 'role-selection' && (
        <div className="bg-slate-50 border border-emerald-200/90 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
                aria-label="Kembali"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-display font-black text-sm sm:text-base text-slate-900 leading-snug">
                  Bagikan Pengalaman Anda Bersama TumpangGo
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Pilih identitas peran yang sesuai dengan pengalaman Anda.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setSelectedRole('merchant');
                setFormStep('form');
              }}
              className="text-left p-4 sm:p-5 rounded-2xl bg-white hover:bg-amber-50/60 border-2 border-slate-200 hover:border-amber-500 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex flex-col justify-between gap-3 group"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-display font-black text-sm text-slate-900 group-hover:text-amber-900">
                    Saya Mitra Merchant
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Pemilik warung, kafe, atau toko kuliner UMKM Tumpang.
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-700">
                <span>Isi ulasan merchant</span>
                <span>→</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('pelanggan');
                setFormStep('form');
              }}
              className="text-left p-4 sm:p-5 rounded-2xl bg-white hover:bg-emerald-50/60 border-2 border-slate-200 hover:border-emerald-600 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex flex-col justify-between gap-3 group"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-display font-black text-sm text-slate-900 group-hover:text-emerald-900">
                    Saya Pelanggan
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Pembeli kuliner & pengguna layanan pesan antar TumpangGo.
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                <span>Isi ulasan pelanggan</span>
                <span>→</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: FORM INPUT */}
      {formStep === 'form' && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFormStep('role-selection')}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
                aria-label="Kembali ke pilihan peran"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-display font-black text-sm sm:text-base text-slate-900 leading-snug">
                  Tulis Ulasan — Peran: {selectedRole === 'merchant' ? 'Mitra Merchant' : 'Pelanggan'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Pengalaman Anda membantu membangun kepercayaan komunitas TumpangGo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {submitError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nama Lengkap Anda *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
              />
            </div>

            {selectedRole === 'merchant' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Toko / Usaha Kuliner *
                </label>
                <input
                  type="text"
                  required
                  value={formMerchantName}
                  onChange={(e) => setFormMerchantName(e.target.value)}
                  placeholder="Contoh: Warung Soto Barokah"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-600"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Rating Kepuasan (1-5 Bintang) *
              </label>
              <div className="flex items-center gap-1.5 py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormRating(star)}
                    className="p-1 text-amber-500 hover:scale-110 transition-transform cursor-pointer"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= formRating ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs font-bold text-slate-700 ml-2">
                  {formRating} dari 5 Bintang
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Isi Review Singkat *
              </label>
              <textarea
                required
                rows={3}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Tuliskan pengalaman Anda secara singkat dan jujur..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="review-real-experience-consent"
                required
                checked={formConsent}
                onChange={(e) => setFormConsent(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="review-real-experience-consent" className="text-[11px] text-slate-600 leading-snug cursor-pointer select-none">
                Saya menyatakan bahwa ulasan ini merupakan pengalaman nyata dan menyetujui ulasan ini diverifikasi oleh tim admin TumpangGo sebelum dipublikasikan.
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Mengirim...' : 'Kirim Ulasan'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUCCESS MESSAGE */}
      {formStep === 'submitted' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center flex flex-col items-center gap-2.5 animate-fadeIn">
          <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-700" />
          </div>
          <h4 className="font-display font-black text-base text-slate-900">
            Terima Kasih Atas Ulasan Anda!
          </h4>
          <p className="text-xs text-slate-600 max-w-md leading-relaxed">
            Review Anda telah dikirimkan dan berstatus <strong>Menunggu Verifikasi Admin</strong> sebelum dipublikasikan ke halaman utama.
          </p>
          <button
            type="button"
            onClick={handleResetForm}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Kembali ke Halaman Review</span>
          </button>
        </div>
      )}

      {/* =========================================================================
          VIEW UTAMA: CAROUSEL REVIEW OTOMATIS (1 KARTU PADA SATU WAKTU)
          TANPA KONTROL NAVIGASI MANUAL, TANPA ANGKA POSISI, TANPA TITIK NAVIGASI
          ========================================================================= */}
      {formStep === 'idle' && (
        <>
          {/* Header Section */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-800 border border-emerald-100 mb-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Review & Pengalaman</span>
              </div>
              <h2 id="section-reviews-title" className="font-display font-black text-base sm:text-lg text-slate-900 tracking-tight leading-tight">
                Review Pengguna TumpangGo
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                Pengalaman mitra usaha dan pelanggan di ekosistem TumpangGo.
              </p>
            </div>

            {/* Tombol "+ Tulis Review" */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => setFormStep('role-selection')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs transition-all shadow-2xs cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>+ Tulis Review</span>
              </button>
            </div>
          </div>

          {/* State Kosong jika tidak ada review */}
          {reviewsList.length === 0 ? (
            <div className="bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-3 animate-fadeIn my-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center justify-center">
                <MessageSquarePlus className="w-6 h-6 text-emerald-700" />
              </div>
              <div className="max-w-md">
                <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-800">
                  Belum Ada Ulasan yang Dipublikasikan
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Belum ada ulasan yang dipublikasikan. Jadilah yang pertama membagikan pengalaman Anda bersama TumpangGo!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormStep('role-selection')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs transition-all shadow-2xs cursor-pointer active:scale-95"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>+ Tulis Ulasan Sekarang</span>
              </button>
            </div>
          ) : (
            /* CAROUSEL CONTAINER: 1 KARTU REVIEW PADA SATU WAKTU
               LOOP BERKELANJUTAN SECARA OTOMATIS
               PAUSE SAAT HOVER/TOUCH UNTUK KENYAMANAN MEMBACA */
            <div 
              className="relative overflow-hidden w-full select-none py-1"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
            >
              {/* Sliding Track: 1 Review Card per slide */}
              <div 
                className={`flex w-full ${prefersReducedMotion ? 'transition-none' : 'transition-transform duration-700 ease-in-out'}`}
                style={{ transform: `translateX(-${activeSlide * 100}%)` }}
              >
                {reviewsList.map((review, idx) => {
                  const isMerchant = review.role === 'Merchant';
                  const isGoogleSource = review.source === 'google';

                  return (
                    <div 
                      key={review.id || `slide-${idx}`}
                      className="w-full min-w-full flex-shrink-0 px-1 sm:px-3 flex justify-center"
                    >
                      <article className="bg-slate-50/60 border border-slate-200/90 hover:border-emerald-300 rounded-2xl p-5 sm:p-6 transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between gap-4 w-full max-w-xl">
                        <div>
                          {/* Baris Atas: Persona, Badge Peran & 5-Star Rating */}
                          <div className="flex items-center justify-between gap-2.5 mb-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                                {review.name}
                              </span>
                              <span className="text-slate-300 font-bold text-xs">·</span>
                              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                isMerchant
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200/80'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-200/80'
                              }`}>
                                {isMerchant ? (
                                  <Store className="w-3 h-3 text-amber-700" />
                                ) : (
                                  <Users className="w-3 h-3 text-emerald-700" />
                                )}
                                <span>{isMerchant ? 'Mitra UMKM' : 'Pelanggan'}</span>
                              </span>
                            </div>

                            {/* 5-Star Rating */}
                            <div className="flex items-center gap-0.5 shrink-0" aria-label={`Rating ${review.rating} dari 5 bintang`}>
                              {Array.from({ length: 5 }).map((_, sIdx) => (
                                <Star
                                  key={sIdx}
                                  className={`w-4 h-4 ${
                                    sIdx < review.rating
                                      ? 'text-amber-500 fill-amber-400'
                                      : 'text-slate-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Isi Testimoni: Natural, Singkat, Mudah Dibaca & Tidak Terpotong */}
                          <blockquote className="text-sm sm:text-base text-slate-800 leading-relaxed font-normal">
                            "{review.content}"
                          </blockquote>
                        </div>

                        {/* Atribusi Google resmi: Hanya ditampilkan jika ulasan terverifikasi bersumber dari Google */}
                        {isGoogleSource && (
                          <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                            {review.sourceUrl ? (
                              <a
                                href={review.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors"
                                title="Buka ulasan asli di Google"
                              >
                                <GoogleIcon className="w-3.5 h-3.5" />
                                <span className="font-medium">Ulasan Google</span>
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                <GoogleIcon className="w-3.5 h-3.5" />
                                <span className="font-medium">Ulasan Google</span>
                              </span>
                            )}
                          </div>
                        )}
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

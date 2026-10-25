/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Section "Review & Testimoni Pengguna TumpangGo"
 * Displays clean, simple, and professional user reviews from Customers and Merchants.
 * Features:
 * - Exactly 10 testimonial entries (6 Pelanggan, 4 Mitra UMKM/Merchant)
 * - Single review card at a time (1 card per slide)
 * - Automatic smooth slider transition every 5 seconds
 * - Pauses on hover and touch gestures
 * - Respects prefers-reduced-motion accessibility setting
 * - Manual navigation: Prev/Next buttons, touch swipe, and 10 dot indicators
 * - Honest & transparent labeling: "Contoh ulasan pelanggan / mitra UMKM" when demo
 * - Support for verified reviews fetched from /api/reviews
 * - Interactive "+ Tulis Review" submission modal with admin moderation workflow
 */

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import { 
  Store, Users, Star, MessageSquarePlus, CheckCircle2, 
  AlertCircle, X, Sparkles, Send, ArrowLeft, ChevronLeft, ChevronRight,
  Check, Info
} from 'lucide-react';

export interface ReviewItem {
  id: string;
  name: string;
  role: 'Merchant' | 'Pelanggan';
  content: string;
  rating: number;
  /** Ditandai sebagai contoh/demo jika belum ada data review asli dari database */
  isExample?: boolean;
}

/**
 * 10 Data Testimoni Berbahasa Indonesia Sehari-hari (Natural & Singkat)
 * Komposisi tepat:
 * - 6 Testimoni sudut pandang Pelanggan
 * - 4 Testimoni sudut pandang Merchant / Pelaku UMKM
 * Ditandai secara transparan sebagai contoh ulasan agar tidak mengklaim identitas nyata.
 */
export const DEFAULT_DEMO_REVIEWS: ReviewItem[] = [
  // 6 Testimoni Pelanggan
  {
    id: 'demo-cust-1',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Lagi mager tapi pengen jajan, tinggal pesan dari HP. Nggak perlu keluar rumah.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-cust-2',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Lebih gampang cari makanan sekitar Tumpang. Tinggal pilih menu dan pesan.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-cust-3',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Praktis buat pesan makanan ketika lagi sibuk di rumah.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-cust-4',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Biasanya bingung mau makan apa pas siang, sekarang tinggal cek pilihan kuliner di sekitar.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-cust-5',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Bisa tahu menu warung langganan tanpa harus datang langsung ke lokasi.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-cust-6',
    name: 'Pelanggan Tumpang',
    role: 'Pelanggan',
    content: 'Sangat membantu waktu hujan atau pas malam-malam pengen camilan hangat.',
    rating: 5,
    isExample: true,
  },
  // 4 Testimoni Merchant / Pelaku UMKM
  {
    id: 'demo-merch-1',
    name: 'Mitra Kuliner Tumpang',
    role: 'Merchant',
    content: 'Bantu usaha saya lebih mudah ditemukan pelanggan sekitar.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-merch-2',
    name: 'Mitra UMKM Tumpang',
    role: 'Merchant',
    content: 'Pelanggan bisa melihat menu tanpa harus tanya satu-satu lewat chat.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-merch-3',
    name: 'Pelaku Usaha Tumpang',
    role: 'Merchant',
    content: 'Pesanan jadi lebih rapi dan jelas, sangat menolong operasional warung kecil kami.',
    rating: 5,
    isExample: true,
  },
  {
    id: 'demo-merch-4',
    name: 'Mitra Warung Tumpang',
    role: 'Merchant',
    content: 'Semoga makin banyak UMKM Tumpang yang terbantu dengan platform ini.',
    rating: 5,
    isExample: true,
  },
];

interface UserTestimonialsSectionProps {
  className?: string;
}

type SubmissionRole = 'merchant' | 'pelanggan' | null;

export default function UserTestimonialsSection({ className = '' }: UserTestimonialsSectionProps) {
  // Inisialisasi dengan 10 testimoni default (6 Pelanggan, 4 Merchant)
  const [reviewsList, setReviewsList] = useState<ReviewItem[]>(DEFAULT_DEMO_REVIEWS);
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

  // Touch Swipe Gesture References
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

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

  // Ambil ulasan asli yang dipublikasikan dari backend jika tersedia
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
              isExample: false
            }));
            setReviewsList(mapped);
          }
        }
      } catch {
        // Tetap gunakan DEFAULT_DEMO_REVIEWS yang sudah diinisialisasi
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

  // Helper untuk me-reset timer auto slide 5 detik ketika pengguna berinteraksi manual
  const resetAutoSlideTimer = () => {
    if (sliderIntervalRef.current) {
      clearInterval(sliderIntervalRef.current);
      sliderIntervalRef.current = null;
    }
    if (formStep === 'idle' && !isPaused && !prefersReducedMotion && totalSlides > 1) {
      sliderIntervalRef.current = setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % totalSlides);
      }, 5000);
    }
  };

  // Otomatis berpindah slide setiap 5 detik (slide 1 -> 2 -> ... -> 1)
  // Berhenti otomatis jika prefers-reduced-motion aktif atau saat form terbuka atau saat hover
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
    }, 5000);

    return () => {
      if (sliderIntervalRef.current) {
        clearInterval(sliderIntervalRef.current);
        sliderIntervalRef.current = null;
      }
    };
  }, [formStep, isPaused, prefersReducedMotion, totalSlides]);

  // Handler navigasi slide manual (reset timer 5s agar tidak langsung terloncat)
  const handleNextSlide = () => {
    if (totalSlides <= 1) return;
    setActiveSlide((prev) => (prev + 1) % totalSlides);
    resetAutoSlideTimer();
  };

  const handlePrevSlide = () => {
    if (totalSlides <= 1) return;
    setActiveSlide((prev) => (prev === 0 ? totalSlides - 1 : prev - 1));
    resetAutoSlideTimer();
  };

  const handleGoToSlide = (index: number) => {
    if (index >= 0 && index < totalSlides) {
      setActiveSlide(index);
      resetAutoSlideTimer();
    }
  };

  // Touch Swipe Handlers untuk gesture usap pada layar sentuh
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 45) {
      // Usap ke kiri: slide berikutnya
      handleNextSlide();
    } else if (distance < -45) {
      // Usap ke kanan: slide sebelumnya
      handlePrevSlide();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

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
                    Masyarakat yang pernah memesan kuliner melalui TumpangGo.
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

      {/* FORM ISIAN REVIEW */}
      {formStep === 'form' && selectedRole && (
        <div className="bg-slate-50 border border-emerald-300 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setFormStep('role-selection')}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  selectedRole === 'merchant'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {selectedRole === 'merchant' ? 'Review Merchant' : 'Review Pelanggan'}
                </span>
                <h3 className="font-display font-black text-sm sm:text-base text-slate-900 mt-0.5">
                  Tulis Ulasan Sebagai {selectedRole === 'merchant' ? 'Mitra Merchant' : 'Pelanggan'}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
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
          VIEW UTAMA: CAROUSEL REVIEW (1 KARTU REVIEW PADA SATU WAKTU)
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
                Pengalaman nyata mitra usaha dan pelanggan di ekosistem TumpangGo.
              </p>
            </div>

            {/* Slider Navigation Buttons & "+ Tulis Review" */}
            <div className="flex items-center gap-1.5 shrink-0">
              {totalSlides > 1 && (
                <>
                  <div className="hidden sm:inline-flex text-[11px] font-semibold text-slate-400 mr-1 select-none">
                    {activeSlide + 1} / {totalSlides}
                  </div>
                  <button
                    type="button"
                    onClick={handlePrevSlide}
                    aria-label="Review sebelumnya"
                    className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                    title="Review sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleNextSlide}
                    aria-label="Review berikutnya"
                    className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                    title="Review berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setFormStep('role-selection')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs transition-all shadow-2xs cursor-pointer ml-1"
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
            <>
              {/* CAROUSEL CONTAINER (1 KARTU REVIEW PADA SATU WAKTU, PAUSE ON HOVER + TOUCH SWIPE) */}
              <div 
                className="relative overflow-hidden w-full select-none py-1"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Sliding Track: 1 Review Card per slide */}
                <div 
                  className={`flex w-full ${prefersReducedMotion ? 'transition-none' : 'transition-transform duration-500 ease-in-out'}`}
                  style={{ transform: `translateX(-${activeSlide * 100}%)` }}
                >
                  {reviewsList.map((review, idx) => {
                    const isMerchant = review.role === 'Merchant';

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

                          {/* Footer Card: Label Kejujuran Sumber Review */}
                          <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                            <span className="flex items-center gap-1.5 font-medium">
                              {review.isExample ? (
                                <>
                                  <Info className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-slate-500">
                                    {isMerchant ? 'Contoh ulasan mitra UMKM' : 'Contoh ulasan pelanggan'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-emerald-700 font-semibold">Ulasan Terverifikasi</span>
                                </>
                              )}
                            </span>
                            <span className="text-slate-400 text-[11px]">Kecamatan Tumpang</span>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* INDIKATOR POSISI REVIEW: 10 TITIK NAVIGASI DI TENGAH */}
              {totalSlides > 1 && (
                <div className="flex flex-col items-center justify-center gap-1.5 pt-1">
                  <div 
                    className="flex items-center gap-1.5"
                    role="tablist"
                    aria-label="Indikator Posisi Review"
                  >
                    {Array.from({ length: totalSlides }).map((_, slideIndex) => (
                      <button
                        key={slideIndex}
                        type="button"
                        role="tab"
                        aria-selected={activeSlide === slideIndex}
                        aria-label={`Buka Ulasan ${slideIndex + 1} dari ${totalSlides}`}
                        onClick={() => handleGoToSlide(slideIndex)}
                        className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                          activeSlide === slideIndex
                            ? 'w-5 bg-emerald-800 shadow-xs'
                            : 'w-2 bg-slate-300 hover:bg-slate-400'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="sm:hidden text-[11px] text-slate-400 font-medium">
                    {activeSlide + 1} dari {totalSlides}
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Section "Review Pengguna TumpangGo" (Google Maps-Style Experience)
 * Displays genuine, authentic reviews from local merchants and customers.
 * Includes interactive Google Maps-inspired overview, role selection ("Saya Merchant" / "Saya Pelanggan"),
 * interactive 5-star rating, strict validation, and admin moderation workflow.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Testimonial } from '../types.ts';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import { 
  Store, Users, Star, MessageSquarePlus, CheckCircle2, 
  AlertCircle, X, Sparkles, Send, Calendar, ArrowLeft,
  Check
} from 'lucide-react';

interface UserTestimonialsSectionProps {
  className?: string;
}

type CategoryFilter = 'all' | 'merchant' | 'pelanggan';
type SubmissionRole = 'merchant' | 'pelanggan' | null;

function formatReviewDate(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return '';
  }
}

export default function UserTestimonialsSection({ className = '' }: UserTestimonialsSectionProps) {
  const [reviews, setReviews] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  // Interactive Flow States (Inline transition, Zero disruptive popup modals)
  // 'idle' -> 'role-selection' -> 'form' -> 'submitted'
  const [formStep, setFormStep] = useState<'idle' | 'role-selection' | 'form' | 'submitted'>('idle');
  const [selectedRole, setSelectedRole] = useState<SubmissionRole>(null);

  // Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formMerchantName, setFormMerchantName] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formRating, setFormRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [formContent, setFormContent] = useState<string>('');
  const [formConsent, setFormConsent] = useState<boolean>(false);

  // Submission Process State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load published reviews
  const loadReviews = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/reviews');
      if (res.ok) {
        const data = await res.json();
        setReviews(Array.isArray(data) ? data : []);
      } else {
        setFetchError('Tidak dapat memuat ulasan pengguna saat ini.');
        setReviews([]);
      }
    } catch {
      setFetchError('Terjadi kendala jaringan saat memuat ulasan pengguna.');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    if (categoryFilter === 'all') return reviews;
    return reviews.filter(item => {
      const normCat = (item.category === 'merchant' || item.category === 'umkm') ? 'merchant' : 'pelanggan';
      return normCat === categoryFilter;
    });
  }, [reviews, categoryFilter]);

  // Counts
  const totalCount = reviews.length;
  const merchantCount = reviews.filter(t => t.category === 'merchant' || t.category === 'umkm').length;
  const pelangganCount = reviews.filter(t => t.category === 'pelanggan').length;

  // Google Maps-style rating summary calculation
  const ratingSummary = useMemo(() => {
    const ratedReviews = reviews.filter(r => typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5);
    const count = ratedReviews.length;
    if (count === 0) {
      return {
        average: 0,
        count: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      };
    }
    const sum = ratedReviews.reduce((acc, curr) => acc + (curr.rating || 0), 0);
    const average = Math.round((sum / count) * 10) / 10;
    const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratedReviews.forEach(r => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
      distribution[star] = (distribution[star] || 0) + 1;
    });
    return { average, count, distribution };
  }, [reviews]);

  // Handle open review flow
  const handleOpenAddReview = () => {
    setSubmitError(null);
    setFormStep('role-selection');
  };

  // Handle role selection
  const handleSelectRole = (role: 'merchant' | 'pelanggan') => {
    setSelectedRole(role);
    setFormRating(5);
    setSubmitError(null);
    setFormStep('form');
  };

  // Reset form
  const handleResetForm = () => {
    setFormStep('idle');
    setSelectedRole(null);
    setFormName('');
    setFormMerchantName('');
    setFormTitle('');
    setFormRating(5);
    setHoverRating(null);
    setFormContent('');
    setFormConsent(false);
    setSubmitError(null);
  };

  // Submit review handler
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
      setSubmitError('Nama usaha atau merchant wajib diisi (minimal 2 karakter).');
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

      const data = await res.json();
      if (res.ok && data.success) {
        setFormStep('submitted');
      } else {
        setSubmitError(data.error || 'Gagal mengirim review. Silakan periksa kembali data Anda.');
      }
    } catch {
      setSubmitError('Terjadi kendala jaringan saat mengirim review. Pastikan koneksi internet stabil.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentDisplayRating = hoverRating !== null ? hoverRating : formRating;

  return (
    <section 
      aria-labelledby="section-reviews-title"
      className={`bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-6 shadow-xs flex flex-col gap-5 my-3 ${className}`}
    >
      {/* =========================================================================
          VIEW 1: ROLE SELECTION PANEL (WHEN USER CLICKS "+ TAMBAHKAN REVIEW")
          ========================================================================= */}
      {formStep === 'role-selection' && (
        <div className="bg-slate-50 border border-emerald-200/90 rounded-2xl p-5 sm:p-7 flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
                aria-label="Kembali ke daftar review"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-display font-black text-base sm:text-lg text-slate-900 leading-snug">
                  Bagikan Pengalamanmu Bersama TumpangGo
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Pilih kategori yang sesuai dengan pengalaman Anda menggunakan TumpangGo.
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

          {/* Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            {/* Card A: Merchant */}
            <button
              type="button"
              onClick={() => handleSelectRole('merchant')}
              className="group text-left p-4 sm:p-5 rounded-2xl bg-white hover:bg-emerald-50/60 border-2 border-slate-200 hover:border-emerald-600 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex flex-col justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-display font-black text-sm sm:text-base text-slate-900 group-hover:text-emerald-900">
                    Saya Merchant
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Saya pemilik usaha atau mitra kuliner di TumpangGo.
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                <span>Lanjut isi ulasan merchant</span>
                <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </button>

            {/* Card B: Pelanggan */}
            <button
              type="button"
              onClick={() => handleSelectRole('pelanggan')}
              className="group text-left p-4 sm:p-5 rounded-2xl bg-white hover:bg-blue-50/60 border-2 border-slate-200 hover:border-blue-600 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex flex-col justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-display font-black text-sm sm:text-base text-slate-900 group-hover:text-blue-900">
                    Saya Pelanggan
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Saya pernah memesan makanan melalui TumpangGo.
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-700">
                <span>Lanjut isi ulasan pelanggan</span>
                <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: FORM SUBMISSION PANEL
          ========================================================================= */}
      {formStep === 'form' && selectedRole && (
        <div className="bg-slate-50 border border-emerald-300 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 animate-fade-in">
          {/* Form Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setFormStep('role-selection')}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
                aria-label="Kembali ke pemilihan peran"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    selectedRole === 'merchant'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {selectedRole === 'merchant' ? 'Formulir Merchant' : 'Formulir Pelanggan'}
                  </span>
                </div>
                <h3 className="font-display font-black text-base text-slate-900 mt-0.5">
                  {selectedRole === 'merchant' ? 'Tulis Ulasan Sebagai Pemilik Usaha / Mitra' : 'Tulis Ulasan Sebagai Pelanggan'}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetForm}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 cursor-pointer"
              aria-label="Batal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Banner */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="font-medium">{submitError}</span>
            </div>
          )}

          {/* Form Content */}
          <form onSubmit={handleFormSubmit} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Nama Pemberi Review */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nama Pemberi Review <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={selectedRole === 'merchant' ? 'Contoh: Pak Slamet' : 'Contoh: Siti Rahma'}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600 transition-colors"
                />
              </div>

              {/* Nama Usaha (Khusus Merchant) atau Judul Review (Khusus Pelanggan) */}
              {selectedRole === 'merchant' ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nama Usaha / Merchant <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formMerchantName}
                    onChange={(e) => setFormMerchantName(e.target.value)}
                    placeholder="Contoh: Warung Bakso Barokah Tumpang"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600 transition-colors"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Judul Review <span className="text-slate-400 font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Contoh: Pengalaman Pesan Bakso Cepat & Puas"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600 transition-colors"
                  />
                </div>
              )}
            </div>

            {/* Merchant optional title row */}
            {selectedRole === 'merchant' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Judul Review <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Penjualan Meningkat Berkat TumpangGo"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600 transition-colors"
                />
              </div>
            )}

            {/* Interactive Star Rating Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Rating Bintang <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const isFilled = starVal <= currentDisplayRating;
                    return (
                      <button
                        key={starVal}
                        type="button"
                        onClick={() => setFormRating(starVal)}
                        onMouseEnter={() => setHoverRating(starVal)}
                        onMouseLeave={() => setHoverRating(null)}
                        aria-label={`Pilih ${starVal} bintang`}
                        className="p-1 cursor-pointer transition-transform hover:scale-125 active:scale-95 focus:outline-none"
                      >
                        <Star
                          className={`w-5 h-5 transition-colors ${
                            isFilled
                              ? 'text-amber-500 fill-amber-400'
                              : 'text-slate-200 hover:text-slate-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs font-bold text-slate-800 ml-2">
                  {currentDisplayRating} dari 5 Bintang
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {currentDisplayRating === 5 && '— Sangat Puas'}
                  {currentDisplayRating === 4 && '— Puas'}
                  {currentDisplayRating === 3 && '— Cukup'}
                  {currentDisplayRating === 2 && '— Kurang Puas'}
                  {currentDisplayRating === 1 && '— Kecewa'}
                </span>
              </div>
            </div>

            {/* Isi Komentar / Pengalaman */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Komentar / Pengalaman Menggunakan TumpangGo <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                maxLength={500}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder={
                  selectedRole === 'merchant'
                    ? 'Ceritakan kemudahan menerima pesanan, dukungan promosi UMKM lokal, atau pengalaman bermitra dengan TumpangGo...'
                    : 'Ceritakan pengalaman memesan makanan kuliner lokal Tumpang, ketepatan pengantaran kurir, tarif hemat ongkir Rp 5.000...'
                }
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600 resize-none transition-colors"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                <span>Minimal 10 karakter</span>
                <span>{formContent.length}/500 karakter</span>
              </div>
            </div>

            {/* Checkbox Persetujuan Pengalaman Nyata */}
            <div className="flex items-start gap-2.5 bg-white border border-slate-200 rounded-xl p-3">
              <input
                type="checkbox"
                id="review-real-experience-consent"
                required
                checked={formConsent}
                onChange={(e) => setFormConsent(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="review-real-experience-consent" className="text-[11px] text-slate-600 leading-snug cursor-pointer select-none">
                Saya menyatakan bahwa ulasan yang saya kirimkan merupakan <strong>pengalaman nyata</strong> dan menyetujui ulasan ini diverifikasi oleh tim admin TumpangGo sebelum dipublikasikan.
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFormStep('role-selection')}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Ganti Kategori
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-extrabold text-xs px-5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Mengirim Review...' : 'Kirim Review'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          VIEW 3: SUBMITTED SUCCESS CARD
          ========================================================================= */}
      {formStep === 'submitted' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center flex flex-col items-center gap-2.5 animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-700" />
          </div>
          <h4 className="font-display font-black text-base text-slate-900">
            Terima Kasih Atas Ulasan Anda!
          </h4>
          <p className="text-xs text-slate-600 max-w-md leading-relaxed">
            Review Anda berhasil dikirim dan saat ini berstatus <strong>Menunggu Moderasi Admin</strong>. Tim kami akan memverifikasi keaslian ulasan sebelum dipublikasikan ke halaman utama.
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
          MAIN HOMEPAGE SECTION (HEADER, GOOGLE MAPS SUMMARY, FILTERS, CARDS)
          ========================================================================= */}
      {formStep === 'idle' && (
        <>
          {/* 1. Header with Title & "+ Tambahkan Review" button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-800 border border-emerald-100 mb-1.5">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Ulasan Pengguna TumpangGo</span>
              </div>
              <h2 id="section-reviews-title" className="font-display font-black text-lg sm:text-xl text-slate-900 tracking-tight leading-tight">
                Cerita Mereka Bersama TumpangGo
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-2xl leading-relaxed">
                Pengalaman merchant dan pelanggan dalam menikmati kemudahan layanan kuliner lokal.
              </p>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleOpenAddReview}
              className="self-start sm:self-center inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-xs transition-all shadow-xs hover:shadow cursor-pointer active:scale-95"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>+ Tambahkan Review</span>
            </button>
          </div>

          {/* 2. Google Maps-Inspired Rating Summary (Only rendered if genuine reviews exist) */}
          {ratingSummary.count > 0 && (
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              {/* Left Score Box */}
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center min-w-[70px]">
                  <span className="font-display font-black text-3xl sm:text-4xl text-slate-900 leading-none">
                    {ratingSummary.average.toFixed(1)}
                  </span>
                  <div className="flex items-center gap-0.5 mt-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= Math.round(ratingSummary.average)
                            ? 'text-amber-500 fill-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium mt-1">
                    {ratingSummary.count} ulasan terverifikasi
                  </span>
                </div>

                {/* Rating Distribution Bars (5 down to 1) */}
                <div className="flex-1 min-w-[180px] max-w-xs space-y-1">
                  {[5, 4, 3, 2, 1].map((starNum) => {
                    const countForStar = ratingSummary.distribution[starNum] || 0;
                    const percent = ratingSummary.count > 0 ? (countForStar / ratingSummary.count) * 100 : 0;
                    return (
                      <div key={starNum} className="flex items-center gap-2 text-[10px] text-slate-600">
                        <span className="w-2.5 font-bold">{starNum}</span>
                        <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-400 shrink-0" />
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="w-4 text-right text-slate-400 text-[9px]">{countForStar}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick stats badges */}
              <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 border-t sm:border-t-0 sm:border-l border-slate-200/80 pt-3 sm:pt-0 sm:pl-5 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-800">{merchantCount}</span>
                  <span>Ulasan Mitra Merchant</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="font-semibold text-slate-800">{pelangganCount}</span>
                  <span>Ulasan Pelanggan</span>
                </div>
              </div>
            </div>
          )}

          {/* 3. Category Filter Chips ("Semua", "Merchant", "Pelanggan") */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5" role="tablist" aria-label="Filter Ulasan">
            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
              }`}
            >
              <span>Semua</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === 'all' ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-700'
              }`}>
                {totalCount}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'merchant'}
              onClick={() => setCategoryFilter('merchant')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === 'merchant'
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Merchant</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === 'merchant' ? 'bg-emerald-950 text-emerald-200' : 'bg-slate-200 text-slate-700'
              }`}>
                {merchantCount}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'pelanggan'}
              onClick={() => setCategoryFilter('pelanggan')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === 'pelanggan'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Pelanggan</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === 'pelanggan' ? 'bg-blue-900 text-blue-100' : 'bg-slate-200 text-slate-700'
              }`}>
                {pelangganCount}
              </span>
            </button>
          </div>

          {/* 4. Review Cards List / Empty State */}
          <div className="min-h-[160px] flex flex-col justify-center">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <span>Memuat ulasan pengguna TumpangGo...</span>
              </div>
            ) : fetchError ? (
              <div className="bg-red-50/80 border border-red-200/70 rounded-2xl p-6 text-center text-xs flex flex-col items-center justify-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <p className="font-bold text-slate-800">{fetchError}</p>
                <button
                  type="button"
                  onClick={loadReviews}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-all cursor-pointer"
                >
                  Coba Lagi
                </button>
              </div>
            ) : filteredReviews.length > 0 ? (
              /* Google Maps-Style Review Cards Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredReviews.map((item, idx) => {
                  const isMerchant = (item.category === 'merchant' || item.category === 'umkm');
                  const dateLabel = formatReviewDate(item.createdAt);

                  return (
                    <article
                      key={item.id}
                      aria-label={`Ulasan ${idx + 1} dari ${filteredReviews.length}`}
                      className="bg-slate-50/90 hover:bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 transition-all flex flex-col justify-between shadow-2xs hover:shadow-xs gap-3"
                    >
                      <div>
                        {/* Top: User Profile & Category Badge */}
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.avatarUrl ? (
                              <img
                                src={item.avatarUrl}
                                alt={`Foto ${item.userName}`}
                                className="w-9 h-9 rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 text-white ${
                                isMerchant ? 'bg-emerald-800' : 'bg-blue-600'
                              }`}>
                                {item.userName.substring(0, 2).toUpperCase()}
                              </div>
                            )}

                            <div className="min-w-0">
                              <h3 className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                                {item.userName}
                              </h3>
                              <p className="text-[10px] text-slate-500 font-medium truncate">
                                {item.merchantName 
                                  ? `Mitra ${item.merchantName}`
                                  : (item.roleDetail || (isMerchant ? 'Pemilik Usaha Kuliner' : 'Pelanggan TumpangGo'))
                                }
                              </p>
                            </div>
                          </div>

                          {/* Category Badge */}
                          {isMerchant ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200/60 shrink-0">
                              <Store className="w-2.5 h-2.5 text-emerald-700" />
                              <span>Merchant</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200/60 shrink-0">
                              <Users className="w-2.5 h-2.5 text-blue-700" />
                              <span>Pelanggan</span>
                            </span>
                          )}
                        </div>

                        {/* Rating Stars & Date */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          {typeof item.rating === 'number' && item.rating > 0 && (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, starIdx) => (
                                <Star
                                  key={starIdx}
                                  className={`w-3.5 h-3.5 ${
                                    starIdx < (item.rating || 0)
                                      ? 'text-amber-500 fill-amber-400'
                                      : 'text-slate-200'
                                  }`}
                                />
                              ))}
                              <span className="text-[11px] font-bold text-amber-800 ml-1">
                                {item.rating}.0
                              </span>
                            </div>
                          )}

                          {dateLabel && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium shrink-0 ml-auto">
                              <Calendar className="w-3 h-3" />
                              <span>{dateLabel}</span>
                            </div>
                          )}
                        </div>

                        {/* Optional Title in Bold */}
                        {item.title && (
                          <h4 className="font-bold text-xs sm:text-[13px] text-slate-900 mb-1 leading-snug">
                            {item.title}
                          </h4>
                        )}

                        {/* Review Content */}
                        <p className="text-xs text-slate-700 font-normal leading-relaxed">
                          "{item.content}"
                        </p>
                      </div>

                      {/* Verified authenticity label */}
                      <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Pengalaman Terverifikasi</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              /* Empty State: Only Genuine Data, Strictly No Fake Reviews */
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 border border-emerald-200 text-emerald-800 flex items-center justify-center">
                  {categoryFilter === 'merchant' ? (
                    <Store className="w-6 h-6" />
                  ) : categoryFilter === 'pelanggan' ? (
                    <Users className="w-6 h-6" />
                  ) : (
                    <Sparkles className="w-6 h-6" />
                  )}
                </div>

                <div className="max-w-md">
                  <h3 className="font-display font-black text-sm sm:text-base text-slate-900 leading-snug">
                    Belum ada ulasan pengguna. Jadilah salah satu yang pertama berbagi pengalaman bersama TumpangGo.
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {categoryFilter === 'merchant'
                      ? 'Belum ada ulasan merchant yang dipublikasikan. Ulasan asli dari pemilik usaha kuliner yang telah dimoderasi akan tampil di sini.'
                      : categoryFilter === 'pelanggan'
                      ? 'Belum ada ulasan pelanggan yang dipublikasikan. Bagikan kemudahan memesan kuliner lokal TumpangGo untuk ditampilkan di sini.'
                      : 'Semua ulasan yang tampil merupakan pengalaman nyata dari pemilik warung dan pelanggan yang telah lolos kurasi moderasi admin.'}
                  </p>
                </div>

                {/* Prominent Action Button remains visible in empty state */}
                <button
                  type="button"
                  onClick={handleOpenAddReview}
                  className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  <span>+ Tambahkan Review Sekarang</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

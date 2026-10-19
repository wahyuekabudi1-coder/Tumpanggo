/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Section "Cerita Pengguna TumpangGo"
 * Displays genuine, verified testimonials from local MSME (UMKM) partners and customers.
 * Follows strict authenticity standards: only displays admin-approved testimonials
 * with explicit publication consent.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Testimonial } from '../types.ts';
import { apiFetch as fetch } from '../utils/apiClient.ts';
import { 
  Store, Users, ChevronLeft, ChevronRight, ShieldCheck, 
  Quote, MessageSquarePlus, CheckCircle2, AlertCircle, X, Sparkles, Send
} from 'lucide-react';

interface UserTestimonialsSectionProps {
  className?: string;
}

export default function UserTestimonialsSection({ className = '' }: UserTestimonialsSectionProps) {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'umkm' | 'pelanggan'>('all');
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  
  // Inline submission form state (no modal / popup)
  const [isSubmitOpen, setIsSubmitOpen] = useState<boolean>(false);
  const [formName, setFormName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<'umkm' | 'pelanggan'>('umkm');
  const [formRole, setFormRole] = useState<string>('');
  const [formContent, setFormContent] = useState<string>('');
  const [formConsent, setFormConsent] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const carouselRef = useRef<HTMLDivElement>(null);

  // Fetch approved and published testimonials
  const loadTestimonials = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/testimonials');
      if (res.ok) {
        const data = await res.json();
        setTestimonials(Array.isArray(data) ? data : []);
      } else {
        setTestimonials([]);
      }
    } catch {
      setTestimonials([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTestimonials();
  }, []);

  const filteredTestimonials = testimonials.filter(item => {
    if (activeCategoryFilter === 'all') return true;
    return item.category === activeCategoryFilter;
  });

  // Track active slide based on scroll position
  const handleScroll = () => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    if (clientWidth > 0) {
      const newIndex = Math.round(scrollLeft / (clientWidth * 0.85));
      setActiveSlideIndex(Math.min(Math.max(0, newIndex), Math.max(0, filteredTestimonials.length - 1)));
    }
  };

  const scrollCarousel = (direction: 'prev' | 'next') => {
    if (!carouselRef.current) return;
    const cardWidth = 320;
    const scrollAmount = direction === 'next' ? cardWidth : -cardWidth;
    carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!formName.trim()) {
      setSubmitError('Nama lengkap wajib diisi.');
      return;
    }
    if (!formContent.trim() || formContent.trim().length < 10) {
      setSubmitError('Isi cerita minimal 10 karakter.');
      return;
    }
    if (!formConsent) {
      setSubmitError('Persetujuan publikasi wajib dicentang.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/testimonials/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: formName.trim(),
          category: formCategory,
          roleDetail: formRole.trim() || undefined,
          content: formContent.trim(),
          consentApproved: formConsent
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitSuccess('Terima kasih! Cerita Anda telah terkirim dan akan diverifikasi serta dikurasi oleh tim admin TumpangGo sebelum dipublikasikan.');
        setFormName('');
        setFormRole('');
        setFormContent('');
        setFormConsent(false);
      } else {
        setSubmitError(data.error || 'Gagal mengirim cerita. Silakan coba kembali.');
      }
    } catch {
      setSubmitError('Terjadi kendala jaringan saat mengirim cerita.');
    } finally {
      setSubmitting(false);
    }
  };

  const umkmCount = testimonials.filter(t => t.category === 'umkm').length;
  const pelangganCount = testimonials.filter(t => t.category === 'pelanggan').length;

  return (
    <section 
      aria-labelledby="section-testimonials-title"
      className={`bg-white rounded-3xl border border-slate-100 p-4 sm:p-5 shadow-xs flex flex-col gap-3.5 my-2 ${className}`}
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
            <Quote className="w-4 h-4 text-emerald-800 fill-emerald-800/20" />
          </div>
          <div>
            <h2 id="section-testimonials-title" className="font-display font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
              Cerita Pengguna TumpangGo
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 max-w-xl">
              Dengarkan pengalaman pelaku UMKM dan pelanggan dalam mendukung serta menikmati layanan lokal bersama TumpangGo.
            </p>
          </div>
        </div>

        {/* Carousel Desktop Navigation Arrows */}
        {filteredTestimonials.length > 1 && (
          <div className="hidden sm:flex items-center gap-1.5 self-end sm:self-center">
            <button
              type="button"
              onClick={() => scrollCarousel('prev')}
              aria-label="Geser ke testimoni sebelumnya"
              className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-2xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollCarousel('next')}
              aria-label="Geser ke testimoni berikutnya"
              className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-2xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Category Filter Pills (Visible when data exists) */}
      {testimonials.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Filter kategori testimoni">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategoryFilter === 'all'}
            onClick={() => setActiveCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeCategoryFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <span>Semua Cerita</span>
            <span className="text-[10px] opacity-75 font-semibold">({testimonials.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeCategoryFilter === 'umkm'}
            onClick={() => setActiveCategoryFilter('umkm')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeCategoryFilter === 'umkm'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
            }`}
          >
            <Store className="w-3 h-3" />
            <span>Pelaku UMKM</span>
            {umkmCount > 0 && <span className="text-[10px] opacity-75 font-semibold">({umkmCount})</span>}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeCategoryFilter === 'pelanggan'}
            onClick={() => setActiveCategoryFilter('pelanggan')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeCategoryFilter === 'pelanggan'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-800'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>Pelanggan</span>
            {pelangganCount > 0 && <span className="text-[10px] opacity-75 font-semibold">({pelangganCount})</span>}
          </button>
        </div>
      )}

      {/* Main Content: Testimonials Carousel OR Empty State */}
      {loading ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          Memuat cerita pengguna...
        </div>
      ) : filteredTestimonials.length > 0 ? (
        <div className="flex flex-col gap-2">
          {/* Horizontal Carousel Container */}
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            role="region"
            aria-roledescription="carousel"
            aria-label="Daftar testimoni pengguna"
            className="flex gap-3 overflow-x-auto pb-2 pt-1 -mx-1 px-1 snap-x snap-mandatory scroll-smooth scrollbar-none"
          >
            {filteredTestimonials.map((item, idx) => (
              <article
                key={item.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`Testimoni ${idx + 1} dari ${filteredTestimonials.length}`}
                className="w-[280px] sm:w-[340px] shrink-0 bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-all snap-start flex flex-col justify-between"
              >
                <div>
                  {/* Top Header: Category Tag & Verified Consent Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    {item.category === 'umkm' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200/60">
                        <Store className="w-3 h-3 text-emerald-700" />
                        <span>Pelaku UMKM</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200/60">
                        <Users className="w-3 h-3 text-blue-700" />
                        <span>Pelanggan</span>
                      </span>
                    )}

                    {item.consentApproved && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700" title="Persetujuan publikasi terverifikasi">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden xs:inline">Terverifikasi</span>
                      </span>
                    )}
                  </div>

                  {/* Testimonial Quote */}
                  <p className="text-xs text-slate-700 font-normal leading-relaxed italic line-clamp-4">
                    "{item.content}"
                  </p>
                </div>

                {/* User Info Footer */}
                <div className="flex items-center gap-2.5 pt-3 mt-3 border-t border-slate-200/60">
                  {item.avatarUrl ? (
                    <img
                      src={item.avatarUrl}
                      alt={`Foto ${item.userName}`}
                      className="w-8 h-8 rounded-full object-cover border border-slate-200 bg-slate-100"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      {item.userName.substring(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h3 className="font-extrabold text-xs text-slate-900 truncate">
                      {item.userName}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-medium truncate">
                      {item.roleDetail || (item.category === 'umkm' ? 'Pemilik Usaha' : 'Pelanggan Tumpang')}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Dots Indicator for Mobile */}
          {filteredTestimonials.length > 1 && (
            <div className="flex justify-center items-center gap-1 pt-1">
              {filteredTestimonials.map((_, i) => (
                <div
                  key={`dot-${i}`}
                  className={`h-1.5 rounded-full transition-all ${
                    activeSlideIndex === i ? 'w-4 bg-emerald-700' : 'w-1.5 bg-slate-200'
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Empty State (when no testimonials are published yet) */
        <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center mb-0.5">
            <Sparkles className="w-5 h-5 text-emerald-700" />
          </div>
          <h3 className="font-display font-extrabold text-xs sm:text-sm text-slate-900">
            Ruang Cerita Pelaku UMKM &amp; Pelanggan
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-500 max-w-md leading-relaxed">
            Dengarkan pengalaman pelaku UMKM dan pelanggan dalam mendukung serta menikmati layanan lokal bersama TumpangGo. Cerita yang telah diverifikasi dan disetujui untuk publikasi akan tampil di bagian ini.
          </p>
        </div>
      )}

      {/* Inline Submission Trigger & Expander (Zero modal, zero popup) */}
      <div className="pt-1">
        {!isSubmitOpen ? (
          <button
            type="button"
            onClick={() => setIsSubmitOpen(true)}
            className="w-full sm:w-auto self-start text-[11px] font-bold text-emerald-800 hover:text-emerald-900 hover:underline flex items-center gap-1.5 cursor-pointer py-1"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-emerald-700" />
            <span>Punya cerita pengalaman bersama TumpangGo? Bagikan di sini</span>
          </button>
        ) : (
          <div className="bg-slate-50 border border-emerald-100/80 rounded-2xl p-3.5 sm:p-4 mt-1 transition-all">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 mb-3">
              <div className="flex items-center gap-1.5">
                <MessageSquarePlus className="w-4 h-4 text-emerald-700" />
                <h4 className="font-bold text-xs text-slate-800">
                  Formulir Berbagi Cerita Pengalaman
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSubmitOpen(false);
                  setSubmitError(null);
                  setSubmitSuccess(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Tutup formulir"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">{submitSuccess}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccess(null);
                      setIsSubmitOpen(false);
                    }}
                    className="mt-2 text-[10px] font-bold text-emerald-800 underline"
                  >
                    Tutup formulir
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="flex flex-col gap-2.5">
                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-2.5 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama Lengkap <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Kategori Pengguna <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <label className={`flex-1 flex items-center justify-center gap-1.5 border rounded-xl py-2 px-2.5 text-xs font-semibold cursor-pointer transition-all ${
                        formCategory === 'umkm'
                          ? 'border-emerald-600 bg-emerald-50/70 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="category"
                          value="umkm"
                          checked={formCategory === 'umkm'}
                          onChange={() => setFormCategory('umkm')}
                          className="sr-only"
                        />
                        <Store className="w-3.5 h-3.5" />
                        <span>Pelaku UMKM</span>
                      </label>

                      <label className={`flex-1 flex items-center justify-center gap-1.5 border rounded-xl py-2 px-2.5 text-xs font-semibold cursor-pointer transition-all ${
                        formCategory === 'pelanggan'
                          ? 'border-blue-600 bg-blue-50/70 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="category"
                          value="pelanggan"
                          checked={formCategory === 'pelanggan'}
                          onChange={() => setFormCategory('pelanggan')}
                          className="sr-only"
                        />
                        <Users className="w-3.5 h-3.5" />
                        <span>Pelanggan</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {formCategory === 'umkm' ? 'Nama Usaha / Toko (Opsional)' : 'Keterangan Singkat (Opsional)'}
                  </label>
                  <input
                    type="text"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    placeholder={formCategory === 'umkm' ? 'Contoh: Pemilik Warung Bakso Barokah' : 'Contoh: Warga Tumpang'}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Cerita Pengalaman <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={350}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder={formCategory === 'umkm'
                      ? 'Ceritakan bagaimana TumpangGo membantu usaha Anda berkembang dan menjangkau pelanggan...'
                      : 'Ceritakan kemudahan menemukan kuliner lokal atau memesan layanan di TumpangGo...'}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600 resize-none"
                  />
                  <span className="text-[10px] text-slate-400 block text-right">
                    {formContent.length}/350 karakter
                  </span>
                </div>

                <div className="flex items-start gap-2 bg-white border border-slate-200 rounded-xl p-2.5">
                  <input
                    type="checkbox"
                    id="consent-check"
                    required
                    checked={formConsent}
                    onChange={(e) => setFormConsent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                  />
                  <label htmlFor="consent-check" className="text-[11px] text-slate-600 leading-snug cursor-pointer">
                    Saya menyatakan cerita di atas adalah pengalaman asli dan memberikan persetujuan kepada TumpangGo untuk memverifikasi serta menampilkannya di homepage.
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsSubmitOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submitting ? 'Mengirim...' : 'Kirim Cerita'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

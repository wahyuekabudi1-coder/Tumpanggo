/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HelpCenterCTA Component
 * 
 * Provides the official Call to Action:
 * - Title: "Pusat Bantuan TumpangGo"
 * - Description: "Punya pertanyaan atau membutuhkan bantuan? Temukan informasi dan panduan menggunakan TumpangGo di sini."
 * - Primary Action Button: "Kunjungi Pusat Bantuan"
 * - Social Media Channels: Exactly TikTok, Instagram, and Facebook.
 */

import React from 'react';
import { HelpCircle, ArrowRight, ShieldCheck, BookOpen } from 'lucide-react';
import { SocialMediaButtons } from './SocialMediaButtons';

interface HelpCenterCTAProps {
  onOpenHelp: () => void;
  className?: string;
  variant?: 'card' | 'banner' | 'footer';
}

export const HelpCenterCTA: React.FC<HelpCenterCTAProps> = ({
  onOpenHelp,
  className = '',
  variant = 'card',
}) => {
  if (variant === 'footer') {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center gap-2 text-emerald-400">
          <HelpCircle className="w-5 h-5" />
          <h4 className="text-base font-bold text-white tracking-wide">
            Pusat Bantuan TumpangGo
          </h4>
        </div>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md">
          Punya pertanyaan atau membutuhkan bantuan? Temukan informasi dan panduan menggunakan TumpangGo di sini.
        </p>
        <div>
          <button
            type="button"
            onClick={onOpenHelp}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold rounded-xl text-xs sm:text-sm shadow-md transition-all duration-150 group"
          >
            <span>Kunjungi Pusat Bantuan</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2">
            Kanal Media Sosial Resmi:
          </p>
          <SocialMediaButtons variant="footer" />
        </div>
      </div>
    );
  }

  // Standard card variant (Hero / Mid-page CTA)
  return (
    <section 
      aria-labelledby="help-center-cta-heading"
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white p-6 sm:p-8 md:p-10 shadow-xl border border-emerald-700/40 ${className}`}
    >
      {/* Decorative background glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto text-center flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-semibold mb-4 backdrop-blur-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-300" />
          <span>Layanan Informasi & Dukungan Terpadu</span>
        </div>

        {/* Heading */}
        <h2 
          id="help-center-cta-heading"
          className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-3"
        >
          Pusat Bantuan TumpangGo
        </h2>

        {/* Description */}
        <p className="text-sm sm:text-base md:text-lg text-emerald-100/90 max-w-2xl leading-relaxed mb-6 font-normal">
          Punya pertanyaan atau membutuhkan bantuan? Temukan informasi dan panduan menggunakan TumpangGo di sini.
        </p>

        {/* Primary Action Button */}
        <div className="mb-8">
          <button
            type="button"
            onClick={onOpenHelp}
            className="inline-flex items-center gap-2.5 px-6 py-3.5 sm:px-8 sm:py-4 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 text-slate-950 font-bold rounded-2xl text-sm sm:text-base shadow-lg shadow-emerald-950/40 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 group focus:outline-none focus:ring-4 focus:ring-emerald-400/40"
          >
            <BookOpen className="w-5 h-5 text-slate-900" />
            <span>Kunjungi Pusat Bantuan</span>
            <ArrowRight className="w-5 h-5 text-slate-900 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-full max-w-md border-t border-emerald-800/60 my-2" />

        {/* 3 Dedicated Social Media Buttons */}
        <div className="w-full pt-4">
          <p className="text-xs font-medium text-emerald-200/80 mb-3 tracking-wide">
            Ikuti informasi terbaru di kanal resmi kami:
          </p>
          <SocialMediaButtons variant="default" />
        </div>
      </div>
    </section>
  );
};

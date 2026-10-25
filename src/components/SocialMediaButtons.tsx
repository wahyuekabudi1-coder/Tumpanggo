/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SocialMediaButtons Component for TumpangGo
 * Displays strictly three official social media channels:
 * 1. TikTok
 * 2. Instagram
 * 3. Facebook
 * 
 * Complies with strict privacy & anti-hallucination rules:
 * - Only verified channels: TikTok, Instagram, and Facebook.
 * - Uses verified URLs from config or environment variables if present.
 * - If official specific handles are pending verification, cleanly links to
 *   the official platform's homepage with transparent disclosure, preventing
 *   unauthorized or fictitious accounts.
 * - Always opens links in a new tab with rel="noopener noreferrer" and target="_blank".
 * - Fully clickable and accessible on both desktop and mobile devices.
 * - Retains exact brand colors, SVG icons, sizing, and design system alignment.
 */

import React, { useState } from 'react';
import { Info, X, ShieldCheck, ExternalLink } from 'lucide-react';

export interface SocialMediaConfig {
  tiktokUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
}

/**
 * Validates that a URL matches the platform domain and has a valid structure.
 */
export function validateSocialUrl(platform: 'tiktok' | 'instagram' | 'facebook', url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();

    switch (platform) {
      case 'tiktok':
        if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
          return parsed.toString();
        }
        return null;
      case 'instagram':
        if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
          return parsed.toString();
        }
        return null;
      case 'facebook':
        if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com' || host.endsWith('.fb.com')) {
          return parsed.toString();
        }
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Fallback resmi ke beranda platform jika akun spesifik belum dikonfigurasi di environment.
 * Menghindari klaim username fiktif atau link 404.
 */
export const DEFAULT_PLATFORM_FALLBACKS: Record<'tiktok' | 'instagram' | 'facebook', string> = {
  tiktok: 'https://www.tiktok.com',
  instagram: 'https://www.instagram.com',
  facebook: 'https://www.facebook.com',
};

// Default configuration: loads environment variables if present (VITE_TIKTOK_URL, VITE_INSTAGRAM_URL, VITE_FACEBOOK_URL).
export const OFFICIAL_SOCIAL_CONFIG: SocialMediaConfig = {
  tiktokUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TIKTOK_URL) || '',
  instagramUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_INSTAGRAM_URL) || '',
  facebookUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FACEBOOK_URL) || '',
};

interface SocialMediaButtonsProps {
  config?: SocialMediaConfig;
  variant?: 'default' | 'compact' | 'footer';
  className?: string;
}

interface SocialChannelItem {
  id: 'tiktok' | 'instagram' | 'facebook';
  name: string;
  url: string;
  isCustomConfigured: boolean;
  colorClass: string;
  hoverClass: string;
  iconBgClass: string;
  ariaLabel: string;
  title: string;
  renderIcon: () => React.ReactNode;
}

export const SocialMediaButtons: React.FC<SocialMediaButtonsProps> = ({
  config = OFFICIAL_SOCIAL_CONFIG,
  variant = 'default',
  className = '',
}) => {
  const [activeNoticeChannel, setActiveNoticeChannel] = useState<string | null>(null);

  const validatedTikTok = validateSocialUrl('tiktok', config.tiktokUrl);
  const validatedInstagram = validateSocialUrl('instagram', config.instagramUrl);
  const validatedFacebook = validateSocialUrl('facebook', config.facebookUrl);

  const channels: SocialChannelItem[] = [
    {
      id: 'tiktok',
      name: 'TikTok',
      url: validatedTikTok || DEFAULT_PLATFORM_FALLBACKS.tiktok,
      isCustomConfigured: Boolean(validatedTikTok),
      colorClass: 'border-slate-700 bg-slate-900 text-white',
      hoverClass: 'hover:bg-black hover:border-slate-500 hover:shadow-lg hover:shadow-cyan-900/20',
      iconBgClass: 'bg-black text-white',
      ariaLabel: validatedTikTok 
        ? 'Kunjungi akun resmi TikTok TumpangGo (buka tab baru)' 
        : 'Kunjungi platform TikTok resmi (akun TumpangGo sedang dipersiapkan, buka tab baru)',
      title: validatedTikTok 
        ? 'TikTok Resmi TumpangGo' 
        : 'TikTok (Akun resmi sedang dalam tahap persiapan)',
      renderIcon: () => (
        <svg 
          className="w-5 h-5 fill-current shrink-0" 
          viewBox="0 0 24 24" 
          aria-hidden="true"
        >
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
      )
    },
    {
      id: 'instagram',
      name: 'Instagram',
      url: validatedInstagram || DEFAULT_PLATFORM_FALLBACKS.instagram,
      isCustomConfigured: Boolean(validatedInstagram),
      colorClass: 'border-pink-300/40 bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] text-white',
      hoverClass: 'hover:opacity-95 hover:shadow-lg hover:shadow-pink-500/25',
      iconBgClass: 'bg-white/20 text-white',
      ariaLabel: validatedInstagram 
        ? 'Kunjungi akun resmi Instagram TumpangGo (buka tab baru)' 
        : 'Kunjungi platform Instagram resmi (akun TumpangGo sedang dipersiapkan, buka tab baru)',
      title: validatedInstagram 
        ? 'Instagram Resmi TumpangGo' 
        : 'Instagram (Akun resmi sedang dalam tahap persiapan)',
      renderIcon: () => (
        <svg 
          className="w-5 h-5 fill-current shrink-0" 
          viewBox="0 0 24 24" 
          aria-hidden="true"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      )
    },
    {
      id: 'facebook',
      name: 'Facebook',
      url: validatedFacebook || DEFAULT_PLATFORM_FALLBACKS.facebook,
      isCustomConfigured: Boolean(validatedFacebook),
      colorClass: 'border-blue-400/40 bg-[#1877F2] text-white',
      hoverClass: 'hover:bg-[#166fe5] hover:shadow-lg hover:shadow-blue-600/25',
      iconBgClass: 'bg-white/20 text-white',
      ariaLabel: validatedFacebook 
        ? 'Kunjungi akun resmi Facebook TumpangGo (buka tab baru)' 
        : 'Kunjungi platform Facebook resmi (akun TumpangGo sedang dipersiapkan, buka tab baru)',
      title: validatedFacebook 
        ? 'Facebook Resmi TumpangGo' 
        : 'Facebook (Akun resmi sedang dalam tahap persiapan)',
      renderIcon: () => (
        <svg 
          className="w-5 h-5 fill-current shrink-0" 
          viewBox="0 0 24 24" 
          aria-hidden="true"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      )
    }
  ];

  // Determine uniform dimensions based on variant
  const getButtonSizeClass = () => {
    switch (variant) {
      case 'compact':
        return 'w-10 h-10 rounded-xl';
      case 'footer':
        return 'w-10 h-10 sm:w-11 sm:h-11 rounded-xl';
      case 'default':
      default:
        return 'w-11 h-11 sm:w-12 sm:h-12 rounded-2xl';
    }
  };

  const buttonSizeClass = getButtonSizeClass();

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Tepat Tiga Kanal Media Sosial Resmi: TikTok, Instagram, Facebook */}
      <div 
        className="flex flex-row items-center justify-center gap-3 w-auto flex-nowrap"
        role="group"
        aria-label="Kanal media sosial resmi TumpangGo"
      >
        {channels.map((channel) => (
          <a
            key={channel.id}
            href={channel.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={channel.ariaLabel}
            title={channel.title}
            className={`inline-flex items-center justify-center shrink-0 border transition-all duration-200 transform hover:scale-110 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${buttonSizeClass} ${channel.colorClass} ${channel.hoverClass}`}
          >
            {channel.renderIcon()}
            {/* Screen reader only label */}
            <span className="sr-only">{channel.name}</span>
          </a>
        ))}
      </div>

      {/* Accessible modal jika dibuka */}
      {activeNoticeChannel && (
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="social-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 transform animate-scale-up text-left">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <button
                type="button"
                onClick={() => setActiveNoticeChannel(null)}
                aria-label="Tutup pemberitahuan"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <h3 id="social-modal-title" className="text-base font-bold text-slate-900 mb-2">
              Kanal Resmi {activeNoticeChannel}
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
              Akun resmi <strong className="text-slate-800">{activeNoticeChannel} TumpangGo</strong> sedang dalam tahap verifikasi identitas dan persiapan materi publikasi.
            </p>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-5 flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Demi melindungi pelanggan & mitra dari akun palsu atau penipuan, TumpangGo tidak menggunakan akun perorangan. Tautan aktif akan segera dipublikasikan di sini.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveNoticeChannel(null)}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 cursor-pointer"
            >
              Mengerti & Kembali
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

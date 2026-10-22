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
 * - Clear platform names and official brand SVG icons.
 * - If official URLs are not yet configured, shows an accessible modal informing
 *   the user that the channel is under preparation/verification, instead of
 *   redirecting to fictitious usernames or 404 pages.
 * - Accessible screen reader labels and full responsive keyboard navigation.
 */

import React, { useState } from 'react';
import { Info, X, ExternalLink, ShieldCheck } from 'lucide-react';

export interface SocialMediaConfig {
  tiktokUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
}

// Default configuration: empty strings signify pending official handle verification.
// Replace with verified official account URLs when verified by administration.
export const OFFICIAL_SOCIAL_CONFIG: SocialMediaConfig = {
  tiktokUrl: '',     // e.g. 'https://www.tiktok.com/@tumpanggo.official'
  instagramUrl: '',  // e.g. 'https://www.instagram.com/tumpanggo.official'
  facebookUrl: '',   // e.g. 'https://www.facebook.com/tumpanggo.official'
};

interface SocialMediaButtonsProps {
  config?: SocialMediaConfig;
  variant?: 'default' | 'compact' | 'footer';
  className?: string;
}

interface SocialChannelItem {
  id: 'tiktok' | 'instagram' | 'facebook';
  name: string;
  url?: string;
  colorClass: string;
  hoverClass: string;
  iconBgClass: string;
  ariaLabel: string;
  renderIcon: () => React.ReactNode;
}

export const SocialMediaButtons: React.FC<SocialMediaButtonsProps> = ({
  config = OFFICIAL_SOCIAL_CONFIG,
  variant = 'default',
  className = '',
}) => {
  const [activeNoticeChannel, setActiveNoticeChannel] = useState<string | null>(null);

  const channels: SocialChannelItem[] = [
    {
      id: 'tiktok',
      name: 'TikTok',
      url: config.tiktokUrl,
      colorClass: 'border-slate-700 bg-slate-900 text-white',
      hoverClass: 'hover:bg-black hover:border-slate-500 hover:shadow-md hover:shadow-cyan-900/20',
      iconBgClass: 'bg-black text-white',
      ariaLabel: 'Kunjungi akun resmi TikTok TumpangGo',
      renderIcon: () => (
        <svg 
          className="w-4 h-4 fill-current" 
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
      url: config.instagramUrl,
      colorClass: 'border-pink-200/50 bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white',
      hoverClass: 'hover:opacity-95 hover:shadow-md hover:shadow-pink-500/20',
      iconBgClass: 'bg-white/20 text-white',
      ariaLabel: 'Kunjungi akun resmi Instagram TumpangGo',
      renderIcon: () => (
        <svg 
          className="w-4 h-4 fill-current" 
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
      url: config.facebookUrl,
      colorClass: 'border-blue-600 bg-blue-600 text-white',
      hoverClass: 'hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/20',
      iconBgClass: 'bg-white/20 text-white',
      ariaLabel: 'Kunjungi akun resmi Facebook TumpangGo',
      renderIcon: () => (
        <svg 
          className="w-4 h-4 fill-current" 
          viewBox="0 0 24 24" 
          aria-hidden="true"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      )
    }
  ];

  const handleChannelClick = (e: React.MouseEvent, channel: SocialChannelItem) => {
    if (!channel.url || channel.url.trim() === '') {
      e.preventDefault();
      setActiveNoticeChannel(channel.name);
    }
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* 3 Dedicated Social Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full">
        {channels.map((channel) => {
          const isConfigured = Boolean(channel.url && channel.url.trim() !== '');

          if (variant === 'compact') {
            return (
              <a
                key={channel.id}
                href={isConfigured ? channel.url : '#'}
                onClick={(e) => handleChannelClick(e, channel)}
                target={isConfigured ? '_blank' : undefined}
                rel={isConfigured ? 'noopener noreferrer' : undefined}
                aria-label={channel.ariaLabel}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${channel.colorClass} ${channel.hoverClass}`}
              >
                {channel.renderIcon()}
                <span>{channel.name}</span>
                {!isConfigured && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-black/30 font-mono">resmi</span>
                )}
              </a>
            );
          }

          if (variant === 'footer') {
            return (
              <a
                key={channel.id}
                href={isConfigured ? channel.url : '#'}
                onClick={(e) => handleChannelClick(e, channel)}
                target={isConfigured ? '_blank' : undefined}
                rel={isConfigured ? 'noopener noreferrer' : undefined}
                aria-label={channel.ariaLabel}
                className="group relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 hover:border-slate-600 text-slate-200 transition-all duration-200 text-xs sm:text-sm font-medium shadow-sm hover:shadow"
              >
                <span className={`p-1.5 rounded-lg ${channel.iconBgClass} transition-transform group-hover:scale-105`}>
                  {channel.renderIcon()}
                </span>
                <span className="font-semibold text-slate-100">{channel.name}</span>
                {isConfigured ? (
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors ml-0.5" />
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60 ml-0.5">
                    Segera
                  </span>
                )}
              </a>
            );
          }

          // Default full variant (for CTA card)
          return (
            <a
              key={channel.id}
              href={isConfigured ? channel.url : '#'}
              onClick={(e) => handleChannelClick(e, channel)}
              target={isConfigured ? '_blank' : undefined}
              rel={isConfigured ? 'noopener noreferrer' : undefined}
              aria-label={channel.ariaLabel}
              className={`flex-1 min-w-[120px] max-w-[170px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-all duration-200 shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${channel.colorClass} ${channel.hoverClass}`}
            >
              {channel.renderIcon()}
              <span className="font-semibold">{channel.name}</span>
              {!isConfigured && (
                <span className="text-[10px] font-normal opacity-85 px-1 py-0.5 rounded bg-black/20">
                  resmi
                </span>
              )}
            </a>
          );
        })}
      </div>

      {/* Accessible Modal when official link is pending verification */}
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
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Mengerti & Kembali
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

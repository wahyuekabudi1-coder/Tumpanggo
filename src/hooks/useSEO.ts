/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Dynamic SEO & Metadata Manager Hook for TumpangGo.
 * Synchronizes document title, meta description, canonical, and robots indexing directives
 * across different views, portals, and educational resources.
 */

import { useEffect } from 'react';

export interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalPath?: string;
  isNoIndex?: boolean;
  ogType?: string;
  ogImage?: string;
}

const DEFAULT_TITLE = 'TumpangGo – Saatnya Usaha Lokal Naik Kelas | Kuliner & Layanan Digital Tumpang Malang';
const DEFAULT_DESC = 'TumpangGo hadir mendukung usaha lokal naik kelas di era digital. Pesan kuliner lokal Tumpang Malang dengan ongkir hemat flat Rp 5.000 dan pembayaran QRIS praktis.';
const DEFAULT_KEYWORDS = 'TumpangGo, TumpangGo Malang, saatnya usaha lokal naik kelas, kuliner Tumpang Malang, pesan makanan Tumpang, UMKM Tumpang, digitalisasi UMKM';
const BASE_URL = 'https://tumpanggo.com';

export function useSEO({
  title,
  description,
  keywords,
  canonicalPath = '',
  isNoIndex = false,
  ogType = 'website',
  ogImage = '/logo44.png',
}: SEOProps) {
  useEffect(() => {
    // 1. Title
    const finalTitle = title || DEFAULT_TITLE;
    document.title = finalTitle;

    // 2. Meta Description
    const finalDesc = description || DEFAULT_DESC;
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', finalDesc);

    // 3. Meta Keywords
    const finalKeywords = keywords || DEFAULT_KEYWORDS;
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta');
      metaKeywords.setAttribute('name', 'keywords');
      document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute('content', finalKeywords);

    // 4. Meta Robots (Crucial: noindex, nofollow for Admin and Driver portals)
    let metaRobots = document.querySelector('meta[name="robots"]');
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.setAttribute('name', 'robots');
      document.head.appendChild(metaRobots);
    }
    if (isNoIndex) {
      metaRobots.setAttribute('content', 'noindex, nofollow, noarchive');
    } else {
      metaRobots.setAttribute('content', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    }

    // 5. Canonical Link
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : BASE_URL;
    const finalCanonical = canonicalPath ? `${origin}${canonicalPath.startsWith('/') ? canonicalPath : '/' + canonicalPath}` : `${origin}${window.location.pathname}`;
    let linkCanonical = document.querySelector('link[rel="canonical"]');
    if (!linkCanonical) {
      linkCanonical = document.createElement('link');
      linkCanonical.setAttribute('rel', 'canonical');
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.setAttribute('href', finalCanonical);

    // 6. OpenGraph tags
    const setMetaProperty = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    setMetaProperty('og:title', finalTitle);
    setMetaProperty('og:description', finalDesc);
    setMetaProperty('og:type', ogType);
    setMetaProperty('og:url', finalCanonical);
    setMetaProperty('og:image', ogImage.startsWith('http') ? ogImage : `${origin}${ogImage.startsWith('/') ? ogImage : '/' + ogImage}`);

    // 7. Twitter tags
    const setMetaName = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    setMetaName('twitter:title', finalTitle);
    setMetaName('twitter:description', finalDesc);
    setMetaName('twitter:image', ogImage.startsWith('http') ? ogImage : `${origin}${ogImage.startsWith('/') ? ogImage : '/' + ogImage}`);

  }, [title, description, keywords, canonicalPath, isNoIndex, ogType, ogImage]);
}

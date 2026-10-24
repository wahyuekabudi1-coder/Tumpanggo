/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Post-build PWA Static Fallback Generator
 * Generates physical entry points in dist for /merchant, /driver, and /admin.
 * Pre-bakes role-specific manifests so Vercel and all static hosts serve 200 OK immediately.
 */

import fs from 'fs';
import path from 'path';

export function generatePwaFallbacks() {
  const distDir = path.resolve(process.cwd(), 'dist');
  const rootIndex = path.join(distDir, 'index.html');

  if (!fs.existsSync(rootIndex)) {
    console.warn('[Postbuild PWA] dist/index.html not found, skipping fallback generation.');
    return;
  }

  const baseHtml = fs.readFileSync(rootIndex, 'utf-8');

  const portals = [
    {
      dir: 'merchant',
      manifest: '/manifest-merchant.json',
      title: 'TumpangGo Merchant – Portal Mitra Toko & Dapur',
      appTitle: 'TG Merchant',
      appleTouchIcon: '/apple-touch-icon-merchant.png',
      themeColor: '#047857'
    },
    {
      dir: 'driver',
      manifest: '/manifest-driver.json',
      title: 'TumpangGo Driver – Portal Operasional Kurir',
      appTitle: 'TG Driver',
      appleTouchIcon: '/apple-touch-icon-driver.png',
      themeColor: '#0F172A'
    },
    {
      dir: 'admin',
      manifest: '/manifest-admin.json',
      title: 'TumpangGo Admin – Dashboard Manajemen',
      appTitle: 'TG Admin',
      appleTouchIcon: '/apple-touch-icon.png',
      themeColor: '#0F172A'
    }
  ];

  for (const portal of portals) {
    const portalDir = path.join(distDir, portal.dir);
    if (!fs.existsSync(portalDir)) {
      fs.mkdirSync(portalDir, { recursive: true });
    }

    // Replace manifest link with the specific portal manifest while preserving the id
    let portalHtml = baseHtml.replace(
      /<link rel="manifest"[^>]*>/i,
      `<link rel="manifest" id="pwa-manifest-link" href="${portal.manifest}" />`
    );

    // Replace title if present
    portalHtml = portalHtml.replace(
      /<title>[^<]*<\/title>/i,
      `<title>${portal.title}</title>`
    );

    // Replace apple-touch-icon
    if (portal.appleTouchIcon) {
      portalHtml = portalHtml.replace(
        /<link rel="apple-touch-icon"[^>]*>/gi,
        `<link rel="apple-touch-icon" href="${portal.appleTouchIcon}" />`
      );
    }

    // Replace apple-mobile-web-app-title
    if (portal.appTitle) {
      portalHtml = portalHtml.replace(
        /<meta name="apple-mobile-web-app-title"[^>]*>/i,
        `<meta name="apple-mobile-web-app-title" content="${portal.appTitle}" />`
      );
    }

    // Replace theme-color
    if (portal.themeColor) {
      portalHtml = portalHtml.replace(
        /<meta name="theme-color"[^>]*>/i,
        `<meta name="theme-color" content="${portal.themeColor}" />`
      );
    }

    // Write folder-based fallback (dist/merchant/index.html)
    const outPath = path.join(portalDir, 'index.html');
    fs.writeFileSync(outPath, portalHtml, 'utf-8');

    // Write flat-based fallback (dist/merchant.html) so Vercel cleanUrls serves /merchant directly with 200 OK
    const flatPath = path.join(distDir, `${portal.dir}.html`);
    fs.writeFileSync(flatPath, portalHtml, 'utf-8');

    console.log(`[Postbuild PWA] Generated physical fallback: dist/${portal.dir}/index.html & dist/${portal.dir}.html -> ${portal.manifest}`);
  }
}

// Execute directly if run as main script
generatePwaFallbacks();

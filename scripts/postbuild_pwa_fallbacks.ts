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
      title: 'TumpangGo Merchant – Portal Mitra Toko & Dapur'
    },
    {
      dir: 'driver',
      manifest: '/manifest-driver.json',
      title: 'TumpangGo Driver – Portal Operasional Kurir'
    },
    {
      dir: 'admin',
      manifest: '/manifest-admin.json',
      title: 'TumpangGo Admin – Dashboard Manajemen'
    }
  ];

  for (const portal of portals) {
    const portalDir = path.join(distDir, portal.dir);
    if (!fs.existsSync(portalDir)) {
      fs.mkdirSync(portalDir, { recursive: true });
    }

    // Replace manifest link with the specific portal manifest
    let portalHtml = baseHtml.replace(
      /<link rel="manifest"[^>]*>/i,
      `<link rel="manifest" href="${portal.manifest}">`
    );

    // Replace title if present
    portalHtml = portalHtml.replace(
      /<title>[^<]*<\/title>/i,
      `<title>${portal.title}</title>`
    );

    const outPath = path.join(portalDir, 'index.html');
    fs.writeFileSync(outPath, portalHtml, 'utf-8');
    console.log(`[Postbuild PWA] Generated physical fallback: dist/${portal.dir}/index.html -> ${portal.manifest}`);
  }
}

// Execute directly if run as main script
generatePwaFallbacks();

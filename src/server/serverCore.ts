/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Server Core
 * Encapsulates Express server setup, Vite dev middleware, static file serving, and runtime injection.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables early (.env and .env.local)
dotenv.config();
const localEnv = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv, override: true });
}

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './app';
import { foodDb } from './db';
import { foodConfig, reloadEnv, validateProductionEnvironment } from './config';

export { app };

export async function startServer() {
  // Strict production validation: Halt startup immediately on invalid configuration
  if (foodConfig.isProduction) {
    const check = validateProductionEnvironment();
    if (!check.isValid) {
      const errMsg = `[TumpangFood Server] Cannot start in production with invalid configuration:\n- ${check.errors.join('\n- ')}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }
  }

  const PORT = foodConfig.port;

  // Initialize and synchronize isolated Tumpang Food database
  try {
    await foodDb.init();
  } catch (err: any) {
    if (foodConfig.isProduction) {
      console.error('[TumpangFood Server] FATAL: Production database failed to initialize:', err.message);
      throw err;
    }
    console.error('[TumpangFood Server] Failed to synchronize Firestore on boot:', err);
  }

  // Vite development middleware vs production static distribution
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !hasDist) {
    console.log('[TumpangFood Server] Starting Vite development server middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
    });
    
    // Serve public static assets (including qris-merchant.png) before Vite middlewares
    const publicPath = path.resolve(process.cwd(), 'public');
    app.use(express.static(publicPath));

    // Mount Vite dev server middlewares
    app.use(vite.middlewares);

    // Explicit fallback handler for all client-side navigation routes
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }

      // Check if this request is for a static file that exists on disk
      const cleanPath = url.split('?')[0].replace(/^\//, '');
      const localFile = path.resolve(publicPath, cleanPath);
      if (cleanPath && fs.existsSync(localFile) && fs.statSync(localFile).isFile()) {
        return res.sendFile(localFile);
      }

      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        
        reloadEnv();

        const cleanUrl = url.toLowerCase();
        const isMerchant = cleanUrl.startsWith('/merchant') || cleanUrl.includes('role=merchant');
        const isDriver = cleanUrl.startsWith('/driver') || cleanUrl.includes('role=driver');
        const isAdmin = cleanUrl.startsWith('/admin') || cleanUrl.includes('role=admin');
        const manifestHref = isMerchant 
          ? '/manifest-merchant.json' 
          : isDriver 
            ? '/manifest-driver.json' 
            : isAdmin 
              ? '/manifest-admin.json' 
              : '/manifest.json';
        const roleTitle = isMerchant
          ? 'TumpangGo Merchant – Portal Mitra Toko & Dapur'
          : isDriver
            ? 'TumpangGo Driver – Portal Operasional Kurir'
            : isAdmin
              ? 'TumpangGo Admin – Dashboard Manajemen'
              : 'TumpangGo – Saatnya Usaha Lokal Naik Kelas | Kuliner & Layanan Digital Tumpang Malang';
        const appleIcon = isMerchant
          ? '/apple-touch-icon-merchant.png'
          : isDriver
            ? '/apple-touch-icon-driver.png'
            : '/apple-touch-icon.png';
        const appTitle = isMerchant ? 'TG Merchant' : isDriver ? 'TG Driver' : isAdmin ? 'TG Admin' : 'TumpangGo';
        const themeColor = isMerchant ? '#047857' : isDriver ? '#0F172A' : '#15803D';

        template = template.replace(/<link\s+rel="manifest"[^>]*>/i, `<link rel="manifest" id="pwa-manifest-link" href="${manifestHref}" />`);
        template = template.replace(/<title>[^<]*<\/title>/i, `<title>${roleTitle}</title>`);
        template = template.replace(/<link\s+rel="apple-touch-icon"[^>]*>/gi, `<link rel="apple-touch-icon" href="${appleIcon}" />`);
        template = template.replace(/<meta\s+name="apple-mobile-web-app-title"[^>]*>/i, `<meta name="apple-mobile-web-app-title" content="${appTitle}" />`);
        template = template.replace(/<meta\s+name="theme-color"[^>]*>/i, `<meta name="theme-color" content="${themeColor}" />`);

        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    console.log('[TumpangFood Server] Serving production static files from dist...');
    app.use(express.static(distPath));
    app.use(express.static(path.resolve(process.cwd(), 'public')));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        res.status(404).json({ error: 'Endpoint API tidak ditemukan' });
        return;
      }
      const cleanPath = req.originalUrl.split('?')[0].replace(/^\//, '');
      const pubFile = path.resolve(process.cwd(), 'public', cleanPath);
      if (cleanPath && fs.existsSync(pubFile) && fs.statSync(pubFile).isFile()) {
        return res.sendFile(pubFile);
      }
      try {
        const prodIndexPath = path.join(distPath, 'index.html');
        let template = fs.readFileSync(prodIndexPath, 'utf-8');
        reloadEnv();

        const cleanUrl = req.originalUrl.toLowerCase();
        const isMerchant = cleanUrl.startsWith('/merchant') || cleanUrl.includes('role=merchant');
        const isDriver = cleanUrl.startsWith('/driver') || cleanUrl.includes('role=driver');
        const isAdmin = cleanUrl.startsWith('/admin') || cleanUrl.includes('role=admin');
        const manifestHref = isMerchant 
          ? '/manifest-merchant.json' 
          : isDriver 
            ? '/manifest-driver.json' 
            : isAdmin 
              ? '/manifest-admin.json' 
              : '/manifest.json';
        const roleTitle = isMerchant
          ? 'TumpangGo Merchant – Portal Mitra Toko & Dapur'
          : isDriver
            ? 'TumpangGo Driver – Portal Operasional Kurir'
            : isAdmin
              ? 'TumpangGo Admin – Dashboard Manajemen'
              : 'TumpangGo – Saatnya Usaha Lokal Naik Kelas | Kuliner & Layanan Digital Tumpang Malang';
        const appleIcon = isMerchant
          ? '/apple-touch-icon-merchant.png'
          : isDriver
            ? '/apple-touch-icon-driver.png'
            : '/apple-touch-icon.png';
        const appTitle = isMerchant ? 'TG Merchant' : isDriver ? 'TG Driver' : isAdmin ? 'TG Admin' : 'TumpangGo';
        const themeColor = isMerchant ? '#047857' : isDriver ? '#0F172A' : '#15803D';

        template = template.replace(/<link\s+rel="manifest"[^>]*>/i, `<link rel="manifest" id="pwa-manifest-link" href="${manifestHref}" />`);
        template = template.replace(/<title>[^<]*<\/title>/i, `<title>${roleTitle}</title>`);
        template = template.replace(/<link\s+rel="apple-touch-icon"[^>]*>/gi, `<link rel="apple-touch-icon" href="${appleIcon}" />`);
        template = template.replace(/<meta\s+name="apple-mobile-web-app-title"[^>]*>/i, `<meta name="apple-mobile-web-app-title" content="${appTitle}" />`);
        template = template.replace(/<meta\s+name="theme-color"[^>]*>/i, `<meta name="theme-color" content="${themeColor}" />`);

        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(template);
      } catch {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }

  app.listen(PORT, foodConfig.host, () => {
    console.log(`[TumpangFood Server] Tumpang Food Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

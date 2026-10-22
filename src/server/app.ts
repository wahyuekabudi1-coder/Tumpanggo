/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Express Application
 * Decoupled and modular backend application assembly.
 */

import express from 'express';
import { foodDb } from './db';
import { foodConfig } from './config';
import { shopApp } from '../services/shop/api/shopApp';
import { shopApiClient } from '../services/shop/client/shopApiClient';
import { isFirestoreAdminConfigured, isUsingServiceAccount, testFirestoreConnection, getFirestoreDiagnosticStatus, getAdminDb } from './firebaseAdmin';
import { authenticateToken } from './auth';
import { authRouter } from './routes/authRoutes';
import { merchantRouter } from './routes/merchantRoutes';
import { driverRouter } from './routes/driverRoutes';
import { orderRouter } from './routes/orderRoutes';
import { adminRouter } from './routes/adminRoutes';
import { artopayRouter } from './routes/artopayRoutes';
import { pushRouter } from './routes/pushRoutes';

export const app = express();

// Safe CORS & Preflight Handling for Production & Development
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, x-auth-email, x-request-id, x-requested-with, accept, origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Answer preflight immediately
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Vercel / Proxy URL Normalization Middleware
app.use((req, res, next) => {
  const matchedPath = (req.headers['x-matched-path'] as string) || 
                      (req.headers['x-original-url'] as string) || 
                      (req.headers['x-forwarded-uri'] as string);
  
  if (matchedPath && matchedPath.startsWith('/api') && req.url.startsWith('/api/index')) {
    req.url = matchedPath;
  }

  // Handle case where query parameter __path was appended in rewrite
  if (req.url.startsWith('/api/index?') || req.url === '/api/index') {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const customPath = urlObj.searchParams.get('__path') || urlObj.searchParams.get('path');
      if (customPath) {
        urlObj.searchParams.delete('__path');
        urlObj.searchParams.delete('path');
        const remainingQuery = urlObj.searchParams.toString();
        const basePath = customPath.startsWith('/') ? customPath : `/api/${customPath}`;
        req.url = basePath + (remainingQuery ? `?${remainingQuery}` : '');
      }
    } catch {}
  }
  next();
});

// Safe Request Diagnostics & Tracking Middleware
app.use((req: any, res, next) => {
  const reqId = req.headers['x-request-id'] || 'req_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  req.id = String(reqId);
  res.setHeader('X-Request-Id', req.id);

  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const logFn = status >= 500 ? console.error : (status >= 400 ? console.warn : console.log);
      logFn(`[API] [${req.id}] ${req.method} ${req.path} -> ${status} (${duration}ms)`);
    });
  }
  next();
});

// Pre-parsed body middleware for Vercel Serverless Functions
// If the body was already parsed by @vercel/node or an upstream serverless wrapper,
// preserve it and mark req._body = true to prevent raw-body from throwing "stream is not readable".
app.use((req: any, _res, next) => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch {}
    }
    req._body = true;
  }
  next();
});

// Global body parsers (limit 15mb for base64 image uploads)
app.use(express.json({
  limit: '15mb',
  verify: (req: any, _res, buf) => {
    try {
      req.rawBody = buf.toString('utf-8');
    } catch {}
  }
}));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Gracefully handle any stream read errors (such as stream already ended by serverless gateway)
app.use((err: any, req: any, _res: any, next: any) => {
  if (err?.message?.includes('stream is not readable') || err?.type === 'stream.not.readable') {
    return next();
  }
  next(err);
});

// Lazy asynchronous database synchronization middleware for Serverless & Cold-Starts
app.use(async (req, res, next) => {
  try {
    await foodDb.ensureInitialized();
  } catch (err: any) {
    console.warn('[TumpangFood Database Sync Warning]', err?.message || err);
  }
  next();
});

// Attach user authentication from tokens or headers
app.use(authenticateToken);

// Health check endpoint - Distinguishes server process vitality from database readiness
app.get('/api/health', async (req, res) => {
  try {
    const [foodStorageStatus, shopStorageStatus] = await Promise.all([
      foodDb.getStorageStatus(),
      shopApiClient.getHealth()
    ]);
    const isHealthy = foodStorageStatus.liveCloudConnected;
    const isProd = foodConfig.isProduction;

    res.status(isProd && !isHealthy ? 503 : 200).json({
      status: isHealthy ? 'healthy' : (isProd ? 'database_disconnected' : 'ok_development_resilient_mode'),
      server: 'online',
      database: isHealthy ? 'connected' : 'disconnected',
      system: 'tumpang-go-ecosystem',
      environment: process.env.NODE_ENV || 'development',
      diagnosticReason: foodStorageStatus.diagnosticReason,
      diagnosticDetail: foodStorageStatus.diagnosticDetail,
      remediationStep: foodStorageStatus.remediationStep,
      foodDatabase: foodStorageStatus,
      shopDatabase: shopStorageStatus,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[TumpangFood Health Check Error]', err);
    res.status(500).json({
      status: 'error',
      server: 'online',
      database: 'error',
      system: 'tumpang-food',
      error: 'Health check diagnostic encountered an internal error.',
      timestamp: new Date().toISOString()
    });
  }
});

// Dedicated Firestore Connection Probe endpoint for on-demand validation
app.get('/api/health/firestore-probe', async (req, res) => {
  try {
    const probe = await testFirestoreConnection();
    res.status(probe.connected ? 200 : 503).json({
      system: 'tumpang-food',
      probeOrigin: 'Dedicated Admin SDK Diagnostic Probe',
      result: probe,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[TumpangFood Probe Error]', err);
    res.status(500).json({
      system: 'tumpang-food',
      error: err.message || 'Diagnostic probe error',
      timestamp: new Date().toISOString()
    });
  }
});

// Safe diagnostic endpoint to verify live Firestore document counts without exposing secrets
app.get('/api/health/catalog-status', async (req, res) => {
  try {
    const probe = await testFirestoreConnection();
    const adminDb = getAdminDb();

    let merchantsCount = 0;
    let categoriesCount = 0;
    let menuItemsCount = 0;
    let merchantRegistrationsCount = 0;
    let driversCount = 0;
    let ordersCount = 0;
    let settlementsCount = 0;

    if (probe.connected && adminDb) {
      const [mSnap, cSnap, iSnap, mrSnap, dSnap, oSnap, sSnap] = await Promise.all([
        adminDb.collection('merchants').get(),
        adminDb.collection('categories').get(),
        adminDb.collection('menuItems').get(),
        adminDb.collection('partnerRegistrations').where('type', '==', 'MERCHANT').get(),
        adminDb.collection('drivers').get(),
        adminDb.collection('orders').get(),
        adminDb.collection('settlements').get()
      ]);
      merchantsCount = mSnap.size;
      categoriesCount = cSnap.size;
      menuItemsCount = iSnap.size;
      merchantRegistrationsCount = mrSnap.size;
      driversCount = dSnap.size;
      ordersCount = oSnap.size;
      settlementsCount = sSnap.size;
    } else {
      const rawData = (foodDb as any).data;
      merchantsCount = rawData?.merchants?.length || 0;
      categoriesCount = rawData?.categories?.length || 0;
      menuItemsCount = rawData?.menuItems?.length || 0;
      merchantRegistrationsCount = rawData?.partnerRegistrations?.filter((r: any) => r.type === 'MERCHANT').length || 0;
      driversCount = rawData?.drivers?.length || 0;
      ordersCount = rawData?.orders?.length || 0;
      settlementsCount = rawData?.settlements?.length || 0;
    }

    res.status(probe.connected ? 200 : (foodConfig.isProduction ? 503 : 200)).json({
      system: 'tumpang-food',
      projectId: probe.projectId || foodConfig.projectId || 'tumpanggo-70479',
      databaseId: probe.databaseId || foodConfig.databaseId || '(default)',
      storageMode: probe.connected ? 'cloud_firestore_verified' : 'local_snapshot',
      liveCloudConnected: probe.connected,
      isProduction: foodConfig.isProduction,
      liveFirestoreCounts: {
        merchantsCount,
        categoriesCount,
        menuItemsCount,
        merchantRegistrationsCount,
        driversCount,
        ordersCount,
        settlementsCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Diagnostic catalog count error' });
  }
});

// Mount decoupled routers
app.use('/api', authRouter);
app.use('/api/merchants', merchantRouter);
app.use('/api/drivers', driverRouter);
app.use('/api/orders', orderRouter);
app.use('/api', adminRouter);
app.use('/api/shop', shopApp);
app.use('/api/artopay', artopayRouter);
app.use('/api/push', pushRouter);

// 404 handler for unhandled API routes
app.all(['/api', '/api/*'], (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.path} tidak ditemukan.` });
});

// Global Error Handler with Safe Internal Diagnostics
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqId = (req as any).id || 'req_unknown';
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  
  // Log internal diagnostic details safely to server console only (never to browser)
  console.error(`[TumpangFood Server Error] [ReqID: ${reqId}] ${req.method} ${req.originalUrl} -> HTTP ${status}`);
  if (err.stack) {
    console.error(`[TumpangFood StackTrace] [ReqID: ${reqId}]:\n${err.stack}`);
  } else {
    console.error(`[TumpangFood ErrorDetails] [ReqID: ${reqId}]:`, err);
  }

  // Provide safe, user-friendly frontend message without exposing sensitive internals
  let safeMessage = 'Terjadi kesalahan internal pada server Tumpang Food.';
  if (status === 404) {
    safeMessage = err.message || 'Data atau endpoint tidak ditemukan.';
  } else if (status === 400 || status === 422) {
    safeMessage = err.message || 'Permintaan tidak valid.';
  } else if (status === 401 || status === 403) {
    safeMessage = err.message || 'Akses tidak diizinkan.';
  } else if (req.path === '/api/merchants' || req.path.startsWith('/api/merchants')) {
    safeMessage = 'Gagal memuat daftar toko kuliner dari database server.';
  }

  res.status(status).json({
    error: safeMessage,
    code: err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    requestId: reqId
  });
});

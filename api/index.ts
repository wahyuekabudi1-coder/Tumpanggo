/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food - Vercel Serverless Function Universal Entry Point
 * Designed for reliable execution in Vercel Serverless / AWS Lambda runtime.
 * Exclusively loads pre-bundled backend (_app.cjs) to avoid extensionless ESM resolution errors,
 * normalizes serverless rewrite paths, and ensures full response lifecycle completion.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

// Safely obtain a require function compatible with both ESM and CJS on Vercel
const _currentFile = typeof import.meta !== 'undefined' && import.meta?.url 
  ? new URL(import.meta.url).pathname 
  : path.resolve(process.cwd(), 'api', 'index.js');
const _require = createRequire(_currentFile);

let appInstance: any = null;

/**
 * Resolves the Express application instance exclusively from the pre-bundled _app.cjs.
 * Never attempts to load raw unbundled TypeScript files from src/.
 */
export function getApp(): any {
  if (appInstance) return appInstance;

  // Candidate paths for pre-bundled _app.cjs on Vercel serverless runtime
  const candidateCjsPaths = [
    path.resolve(path.dirname(_currentFile), '_app.cjs'),
    path.resolve(process.cwd(), 'api', '_app.cjs'),
    path.resolve('/var/task', 'api', '_app.cjs'),
    path.resolve('/var/task', '_app.cjs'),
    path.resolve(process.cwd(), '_app.cjs'),
    './_app.cjs'
  ];

  for (const cPath of candidateCjsPaths) {
    try {
      if (cPath.startsWith('.') || fs.existsSync(cPath)) {
        const mod = _require(cPath);
        const resolved = mod.app || mod.default || mod;
        if (resolved && typeof resolved === 'function') {
          appInstance = resolved;
          return appInstance;
        }
      }
    } catch (e: any) {
      console.warn(`[Vercel Serverless Function] Lookup at ${cPath} failed:`, e?.message || e);
    }
  }

  // Relative require fallback
  try {
    const mod = _require('./_app.cjs');
    const resolved = mod.app || mod.default || mod;
    if (resolved && typeof resolved === 'function') {
      appInstance = resolved;
      return appInstance;
    }
  } catch (err: any) {
    console.error('[Vercel Serverless Function Fatal] Direct require("./_app.cjs") failed:', err?.message || err);
  }

  throw new Error('Gagal memuat bundle backend Express TumpangGo (_app.cjs) pada lingkungan serverless.');
}

/**
 * Universal Vercel Serverless Request Handler
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // 1. Preserve pre-parsed body from Vercel Serverless gateway
    const vReq = req as any;
    if (vReq.body !== undefined && vReq.body !== null) {
      if (typeof vReq.body === 'string') {
        try {
          vReq.body = JSON.parse(vReq.body);
        } catch {}
      }
      vReq._body = true;
    }

    // 2. Normalize and restore original URL path if rewritten by Vercel
    const matchedPath = (req.headers['x-matched-path'] as string) || 
                        (req.headers['x-original-url'] as string) || 
                        (req.headers['x-forwarded-uri'] as string);
    if (matchedPath && matchedPath.startsWith('/api') && req.url?.startsWith('/api/index')) {
      req.url = matchedPath;
    } else if (req.url?.includes('__path=')) {
      try {
        const parsed = new URL(req.url, 'http://localhost');
        const custom = parsed.searchParams.get('__path') || parsed.searchParams.get('path');
        if (custom) {
          parsed.searchParams.delete('__path');
          parsed.searchParams.delete('path');
          const remainingQuery = parsed.searchParams.toString();
          const basePath = custom.startsWith('/') ? custom : `/api/${custom}`;
          req.url = basePath + (remainingQuery ? `?${remainingQuery}` : '');
        }
      } catch {}
    }

    // 3. Resolve the backend Express app from bundled _app.cjs and dispatch request
    const targetApp = getApp();

    // Call Express app with an explicit error handler to prevent unhandled process exit
    return targetApp(req, res, (err: any) => {
      if (err) {
        console.error('[Vercel Serverless Function FinalHandler Error]', err?.message || err);
        if (!res.headersSent) {
          res.statusCode = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: err.message || 'Terjadi kesalahan internal pada server.',
            code: err.code || 'INTERNAL_SERVER_ERROR'
          }));
        }
      }
    });

  } catch (err: any) {
    console.error('[Vercel Serverless Function TopLevel Error]', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Terjadi kesalahan fatal saat menginisialisasi serverless handler.', 
        code: 'FUNCTION_INVOCATION_ERROR',
        details: err?.message || String(err)
      }));
    }
  }
}

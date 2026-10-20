import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../src/server/app';

let appInstance: any = app;
if (!appInstance) {
  try {
    const bundled = require('./_app.cjs');
    appInstance = bundled.app || bundled.default || bundled;
  } catch {}
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // 1. Preserve pre-parsed body from Vercel Serverless environment
    const vReq = req as any;
    if (vReq.body !== undefined && vReq.body !== null) {
      if (typeof vReq.body === 'string') {
        try {
          vReq.body = JSON.parse(vReq.body);
        } catch {}
      }
      vReq._body = true;
    }

    // 2. Restore original path if rewritten by Vercel serverless functions
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

    const targetApp = appInstance || app;
    return targetApp(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless Function Unhandled Error]', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Terjadi kesalahan internal pada serverless handler.', 
        code: 'SERVERLESS_HANDLER_ERROR' 
      }));
    }
  }
}

export { app };



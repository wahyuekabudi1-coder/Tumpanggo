import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../src/server/app';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // Restore original path if rewritten by Vercel serverless functions
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

    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless Function Unhandled Error]', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Terjadi kesalahan pada serverless handler.', code: 'SERVERLESS_HANDLER_ERROR' }));
    }
  }
}

export { app };



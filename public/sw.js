/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Service Worker
 * Secure static asset caching & offline shell for Customer, Merchant, Driver & Admin PWA.
 * Includes Web Push notification handling when dashboard/app is in background.
 * Strictly bypasses API requests, authentication, and QRIS endpoints to prevent stale data.
 */

const CACHE_NAME = 'tumpanggo-pwa-v15';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/merchant',
  '/driver',
  '/admin',
  '/manifest.json',
  '/manifest-merchant.json',
  '/manifest-driver.json',
  '/manifest-admin.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.svg'
];

// Helper to asynchronously resolve cached app shell for navigation requests
async function resolveNavigationShell(request, url) {
  // 1. Try exact matched request from cache (ignoring search params like ?id=... or ?source=pwa)
  const exact = await caches.match(request, { ignoreSearch: true });
  if (exact) return exact;

  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = String(url || '').toLowerCase();
  }

  // 2. Try role-specific entry points if available in cache
  if (path === '/merchant' || path.startsWith('/merchant/')) {
    const merchantCached = await caches.match('/merchant', { ignoreSearch: true });
    if (merchantCached) return merchantCached;
    const merchantFlat = await caches.match('/merchant.html', { ignoreSearch: true });
    if (merchantFlat) return merchantFlat;
  } else if (path === '/driver' || path.startsWith('/driver/')) {
    const driverCached = await caches.match('/driver', { ignoreSearch: true });
    if (driverCached) return driverCached;
    const driverFlat = await caches.match('/driver.html', { ignoreSearch: true });
    if (driverFlat) return driverFlat;
  } else if (path === '/admin' || path.startsWith('/admin/')) {
    const adminCached = await caches.match('/admin', { ignoreSearch: true });
    if (adminCached) return adminCached;
    const adminFlat = await caches.match('/admin.html', { ignoreSearch: true });
    if (adminFlat) return adminFlat;
  }

  // 3. Guaranteed universal SPA shell fallback
  const indexCached = await caches.match('/index.html', { ignoreSearch: true });
  if (indexCached) return indexCached;

  const rootCached = await caches.match('/', { ignoreSearch: true });
  if (rootCached) return rootCached;

  // 4. Resilient inline offline HTML fallback: never return undefined for HTML navigation
  return new Response(
    '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TumpangGo Offline</title><style>body{font-family:sans-serif;background:#F4F7F5;color:#1e293b;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center}h2{color:#15803d;margin-bottom:8px}button{margin-top:16px;padding:10px 24px;background:#15803d;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer}</style></head><body><h2>Koneksi Terputus</h2><p>Halaman TumpangGo belum dapat dimuat karena tidak ada koneksi internet aktif.</p><button onclick="window.location.reload()">Muat Ulang</button></body></html>',
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

// Install Event - Precache static app shell with resilient individual caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[SW] Static asset precache notice for ' + asset + ':', err?.message || err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old cache versions immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First with offline app-shell fallback
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Immediately bypass non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Bypass cross-origin requests
  if (!url.startsWith(self.location.origin)) {
    return;
  }

  let pathname = '';
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = String(url || '').toLowerCase();
  }

  // CRITICAL SECURITY & CONSISTENCY:
  // Strictly bypass API endpoints, authentication, QRIS assets, payment proofs, and dev-server files.
  // Never intercept, cache, or replace API responses with HTML fallback.
  if (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname.includes('qris') ||
    pathname.includes('payment') ||
    pathname.includes('delivery-proof') ||
    pathname.startsWith('/@') ||
    pathname.startsWith('/src/') ||
    pathname.endsWith('.tsx') ||
    pathname.endsWith('.ts') ||
    pathname.includes('node_modules') ||
    self.location.hostname.includes('run.app') ||
    self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async (networkResponse) => {
        const isNavigation = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html');
        // If server unexpectedly returns 404 or error for an HTML navigation route, fallback gracefully to cached app shell
        if (networkResponse && networkResponse.status >= 400 && isNavigation) {
          return await resolveNavigationShell(event.request, url);
        }

        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const isNavigation = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html');
        if (isNavigation) {
          return await resolveNavigationShell(event.request, url);
        }
        const cachedAsset = await caches.match(event.request, { ignoreSearch: true });
        return cachedAsset || new Response('', { status: 504, statusText: 'Gateway Timeout (Offline)' });
      })
  );
});

// =========================================================================
// WEB PUSH NOTIFICATION LISTENERS (Merchant & Driver Background Alerts)
// =========================================================================

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'TumpangGo', body: event.data.text() };
    }
  }

  const title = data.title || 'Pesanan Baru TumpangGo!';
  const options = {
    body: data.body || 'Ada pesanan baru yang siap diproses di dapur Anda.',
    icon: '/pwa-192x192.png',
    badge: '/favicon.svg',
    tag: data.tag || 'tumpanggo-order-' + Date.now(),
    vibrate: [300, 150, 300, 150, 450],
    requireInteraction: true,
    data: {
      url: data.url || (data.role === 'DRIVER' ? '/?role=DRIVER' : '/?role=MERCHANT'),
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: 'Buka Pesanan' },
      { action: 'dismiss', title: 'Tutup' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find matching portal window (merchant, driver, or customer)
      for (const client of clientList) {
        if (!client.url || !('focus' in client)) continue;
        const cUrl = client.url.toLowerCase();
        if (targetUrl.includes('merchant') && (cUrl.includes('/merchant') || cUrl.includes('role=merchant'))) {
          return client.focus();
        }
        if (targetUrl.includes('driver') && (cUrl.includes('/driver') || cUrl.includes('role=driver'))) {
          return client.focus();
        }
        if (!targetUrl.includes('merchant') && !targetUrl.includes('driver') && !cUrl.includes('/merchant') && !cUrl.includes('/driver')) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

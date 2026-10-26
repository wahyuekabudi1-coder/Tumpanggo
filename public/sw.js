/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TumpangGo Service Worker
 * Secure static asset caching & offline shell for Customer, Merchant, Driver & Admin PWA.
 * Includes Web Push notification handling when browser/PWA is in background.
 * Strictly bypasses API requests, authentication, and QRIS endpoints to prevent stale data.
 */

const CACHE_NAME = 'tumpanggo-pwa-v20';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/merchant',
  '/merchant.html',
  '/driver',
  '/driver.html',
  '/admin',
  '/admin.html',
  '/manifest.json',
  '/manifest-merchant.json',
  '/manifest-driver.json',
  '/manifest-admin.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/pwa-merchant-192x192.png',
  '/pwa-merchant-512x512.png',
  '/pwa-merchant-maskable-512x512.png',
  '/apple-touch-icon-merchant.png',
  '/pwa-driver-192x192.png',
  '/pwa-driver-512x512.png',
  '/pwa-driver-maskable-512x512.png',
  '/apple-touch-icon-driver.png',
  '/favicon.svg'
];

async function resolveNavigationShell(request, url) {
  const exact = await caches.match(request, { ignoreSearch: true });
  if (exact) return exact;

  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = String(url || '').toLowerCase();
  }

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

  const indexCached = await caches.match('/index.html', { ignoreSearch: true });
  if (indexCached) return indexCached;

  const rootCached = await caches.match('/', { ignoreSearch: true });
  if (rootCached) return rootCached;

  return new Response(
    '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TumpangGo Offline</title><style>body{font-family:sans-serif;background:#F4F7F5;color:#1e293b;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center}h2{color:#15803d;margin-bottom:8px}button{margin-top:16px;padding:10px 24px;background:#15803d;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer}</style></head><body><h2>Koneksi Terputus</h2><p>Halaman TumpangGo belum dapat dimuat karena tidak ada koneksi internet aktif.</p><button onclick="window.location.reload()">Muat Ulang</button></body></html>',
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

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

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (event.request.method !== 'GET') {
    return;
  }

  if (!url.startsWith(self.location.origin)) {
    return;
  }

  let pathname = '';
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = String(url || '').toLowerCase();
  }

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
// WEB PUSH NOTIFICATION LISTENERS (Browser & PWA Only — Separate from Android FCM)
// =========================================================================

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'TumpangGo', body: event.data.text() };
    }
  }

  const nestedData = payload.data || {};
  const orderId = nestedData.orderId || '';
  const role = nestedData.role || payload.role || 'MERCHANT';
  const defaultPath = role === 'DRIVER' ? '/driver' : '/merchant';
  const targetUrl = payload.url || (orderId ? `${defaultPath}?orderId=${encodeURIComponent(orderId)}` : defaultPath);

  const title = payload.title || '1 Pesanan Baru';
  const options = {
    body: payload.body || 'Ada pesanan baru yang perlu diperiksa untuk toko Anda.',
    icon: role === 'MERCHANT' ? '/pwa-merchant-192x192.png' : '/pwa-192x192.png',
    badge: '/favicon.svg',
    tag: payload.tag || (orderId ? `order-${orderId}` : 'tumpanggo-order-' + Date.now()),
    renotify: true,
    vibrate: [300, 150, 300, 150, 450],
    requireInteraction: true,
    data: {
      url: targetUrl,
      orderId,
      eventId: payload.eventId || nestedData.eventId || '',
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: 'Periksa Pesanan' },
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

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/merchant';
  const orderId = notifData.orderId || '';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (!client.url || !('focus' in client)) continue;
        const cUrl = client.url.toLowerCase();
        const isMerchantTarget = targetUrl.includes('merchant');
        const isDriverTarget = targetUrl.includes('driver');

        if (
          (isMerchantTarget && (cUrl.includes('/merchant') || cUrl.includes('role=merchant'))) ||
          (isDriverTarget && (cUrl.includes('/driver') || cUrl.includes('role=driver')))
        ) {
          if (orderId) {
            try {
              client.postMessage({
                type: 'TUMPANG_OPEN_ORDER',
                orderId,
                url: targetUrl
              });
            } catch {}
          } else if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch {}
          }
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

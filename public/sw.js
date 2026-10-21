/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Service Worker
 * Secure static asset caching & offline shell for Driver & Customer PWA.
 * Strictly bypasses API requests, authentication, and QRIS endpoints to prevent stale data.
 */

const CACHE_NAME = 'tumpanggo-pwa-v10';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.svg'
];

// Install Event - Precache static app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Static cache pre-population warning:', err);
      });
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

  // CRITICAL SECURITY & CONSISTENCY:
  // Never cache API endpoints, authentication, QRIS assets, payment proofs, or dev-server files
  if (
    url.includes('/api/') ||
    url.includes('/auth') ||
    url.includes('qris') ||
    url.includes('payment') ||
    url.includes('delivery-proof') ||
    url.includes('/@vite') ||
    url.includes('/@fs') ||
    url.includes('/__vite') ||
    url.includes('/src/') ||
    url.includes('.tsx') ||
    url.includes('.ts') ||
    url.includes('node_modules') ||
    self.location.hostname.includes('run.app') ||
    self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/') || caches.match('/index.html');
          }
        });
      })
  );
});

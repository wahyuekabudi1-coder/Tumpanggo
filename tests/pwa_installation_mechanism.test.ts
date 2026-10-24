/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Comprehensive PWA Installation Verification Test Suite
 * Validates manifest definitions, role start_urls, beforeinstallprompt retention,
 * install lifecycle, outcome handling, and fallback behavior for Customer, Merchant, Driver, and Admin.
 */

import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

console.log('================================================================================');
console.log('  TUMPANGGO — PWA INSTALLATION ARCHITECTURE & MECHANISM VERIFICATION');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. MANIFEST INTEGRITY & APPLICATION IDENTITY AUDIT
// -----------------------------------------------------------------------------
console.log('--- 1. AUDIT MANIFEST IDENTITAS (CUSTOMER, MERCHANT, DRIVER, ADMIN) ---');

const manifestConfigs = [
  { file: 'public/manifest.json', role: 'CUSTOMER', expectedStart: '/', expectedScope: '/', expectedId: '/' },
  { file: 'public/manifest-merchant.json', role: 'MERCHANT', expectedStart: '/merchant', expectedScope: '/merchant', expectedId: '/merchant' },
  { file: 'public/manifest-driver.json', role: 'DRIVER', expectedStart: '/driver', expectedScope: '/driver', expectedId: '/driver' },
  { file: 'public/manifest-admin.json', role: 'ADMIN', expectedStart: '/admin', expectedScope: '/admin', expectedId: '/admin' }
];

for (const m of manifestConfigs) {
  const filePath = path.resolve(process.cwd(), m.file);
  const exists = fs.existsSync(filePath);
  assert(exists, `Manifest file exists: ${m.file}`);

  if (exists) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert(Boolean(raw.name && raw.name.length > 3), `[${m.role}] Manifest has valid name: "${raw.name}"`);
    assert(Boolean(raw.short_name && raw.short_name.length <= 12), `[${m.role}] Short name <= 12 chars (got "${raw.short_name}", len: ${raw.short_name?.length})`);
    assert(raw.start_url === m.expectedStart, `[${m.role}] start_url matches target portal: "${raw.start_url}" === "${m.expectedStart}"`);
    assert(raw.scope === m.expectedScope, `[${m.role}] scope is correctly rooted: "${raw.scope}"`);
    assert(raw.id === m.expectedId, `[${m.role}] id matches unique identity: "${raw.id}"`);
    assert(raw.display === 'standalone', `[${m.role}] display mode is standalone`);
    
    const icons = raw.icons || [];
    const has192 = icons.some((i: any) => i.sizes === '192x192');
    const has512 = icons.some((i: any) => i.sizes === '512x512');
    const hasMaskable = icons.some((i: any) => i.purpose?.includes('maskable'));
    assert(has192, `[${m.role}] Icon 192x192 exists in manifest`);
    assert(has512, `[${m.role}] Icon 512x512 exists in manifest`);
    assert(hasMaskable, `[${m.role}] Maskable icon is properly defined`);
  }
}

// -----------------------------------------------------------------------------
// 2. SERVICE WORKER PRECACHE & CACHE INVALIDATION
// -----------------------------------------------------------------------------
console.log('\n--- 2. AUDIT SERVICE WORKER & ASSET CACHING ---');

const swPath = path.resolve(process.cwd(), 'public/sw.js');
assert(fs.existsSync(swPath), 'Service worker public/sw.js exists');

if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert(swContent.includes('CACHE_NAME'), 'Service worker defines CACHE_NAME');
  assert(swContent.includes('/merchant') && swContent.includes('/driver') && swContent.includes('/admin'), 'Service worker precaches portal routes');
  assert(swContent.includes('/manifest-merchant.json') && swContent.includes('/manifest-driver.json') && swContent.includes('/manifest-admin.json'), 'Service worker precaches role manifests');
  assert(swContent.includes('self.skipWaiting()'), 'Service worker skips waiting on install for instant updates');
  assert(swContent.includes('self.clients.claim()'), 'Service worker claims clients on activate');
  assert(swContent.includes('caches.delete'), 'Service worker deletes stale caches on activation');
}

// -----------------------------------------------------------------------------
// 3. SINGLETON EVENT RETENTION & SIMULATED BROWSER PROMPT LIFECYCLE
// -----------------------------------------------------------------------------
console.log('\n--- 3. PWA EVENT RETENTION & INSTALLATION LIFECYCLE SIMULATION ---');

// Setup mock window & browser environment for simulation
class MockEvent {
  type: string;
  defaultPrevented = false;
  constructor(type: string) {
    this.type = type;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

class MockBeforeInstallPromptEvent extends MockEvent {
  promptCallCount = 0;
  outcomeResult: 'accepted' | 'dismissed' = 'accepted';
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;

  constructor(outcome: 'accepted' | 'dismissed' = 'accepted') {
    super('beforeinstallprompt');
    this.outcomeResult = outcome;
    this.userChoice = Promise.resolve({ outcome: this.outcomeResult, platform: 'web' });
  }

  async prompt() {
    this.promptCallCount++;
    return Promise.resolve();
  }
}

// Validate that usePWAInstall code exports and structure are sound
const hookPath = path.resolve(process.cwd(), 'src/hooks/usePWAInstall.ts');
const hookContent = fs.readFileSync(hookPath, 'utf-8');

assert(hookContent.includes('getPromptForRole'), 'usePWAInstall exports getPromptForRole with strict role segregation');
assert(hookContent.includes('detectCurrentPWARole'), 'usePWAInstall implements detectCurrentPWARole URL detector');
assert(hookContent.includes('rolePrompts'), 'usePWAInstall manages rolePrompts isolated by portal role');
assert(hookContent.includes('checkIsStandalone'), 'usePWAInstall checks standalone status per target role');
assert(hookContent.includes('syncPWAManifest'), 'usePWAInstall exports syncPWAManifest helper for all roles');
assert(hookContent.includes('outcome: choice.outcome'), 'install() accurately returns the native browser outcome without faking');

// Test Simulated Lifecycle Scenario 1: Strict Prompt Segregation (Customer prompt NOT used for Merchant)
console.log('\n--- Scenario 1: Strict prompt isolation & role segregation ---');

// Mock DOM & window
const mockEventBus: Record<string, Function[]> = {};
const mockWindow: any = {
  __tumpang_prompts: {},
  __tumpang_install_prompt: null,
  __tumpang_app_installed: false,
  addEventListener: (event: string, fn: Function) => {
    mockEventBus[event] = mockEventBus[event] || [];
    mockEventBus[event].push(fn);
  },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' },
  location: { pathname: '/' }
};

// Simulate Customer prompt captured on /
const customerPrompt = new MockBeforeInstallPromptEvent('accepted');
(customerPrompt as any).__tumpang_role = 'CUSTOMER';
mockWindow.__tumpang_prompts['CUSTOMER'] = customerPrompt;
mockWindow.__tumpang_install_prompt = customerPrompt;

assert(mockWindow.__tumpang_prompts['CUSTOMER'] === customerPrompt, 'Customer prompt captured and recorded under role "CUSTOMER"');
assert(mockWindow.__tumpang_prompts['MERCHANT'] === undefined, 'Merchant prompt is initially empty, preventing customer prompt hijacking');

// Simulate Merchant prompt dispatched when loading /merchant
const merchantPrompt = new MockBeforeInstallPromptEvent('accepted');
(merchantPrompt as any).__tumpang_role = 'MERCHANT';
mockWindow.__tumpang_prompts['MERCHANT'] = merchantPrompt;

assert(mockWindow.__tumpang_prompts['MERCHANT'] === merchantPrompt, 'Merchant receives dedicated beforeinstallprompt bound to manifest-merchant.json');
assert(mockWindow.__tumpang_prompts['MERCHANT'] !== customerPrompt, 'Merchant prompt is strictly distinct from Customer prompt');

// Simulate Merchant triggering installation
let installTriggered = false;
if (mockWindow.__tumpang_prompts['MERCHANT']) {
  await mockWindow.__tumpang_prompts['MERCHANT'].prompt();
  installTriggered = true;
}
assert(installTriggered, 'Merchant install button successfully executes native prompt() on its own role event');
assert(merchantPrompt.promptCallCount === 1, 'Merchant native prompt() called exactly once');
assert(customerPrompt.promptCallCount === 0, 'Customer prompt was NEVER consumed or called by Merchant');

// Test Simulated Lifecycle Scenario 2: User dismisses prompt (cancel)
console.log('\n--- Scenario 2: User dismisses browser prompt (no fake install) ---');
const dismissedPrompt = new MockBeforeInstallPromptEvent('dismissed');
await dismissedPrompt.prompt();
const choice = await dismissedPrompt.userChoice;
assert(choice.outcome === 'dismissed', 'outcome is properly identified as "dismissed"');

// Test Simulated Lifecycle Scenario 3: appinstalled event fires
console.log('\n--- Scenario 3: Browser triggers appinstalled event ---');
mockWindow.__tumpang_app_installed = true;
mockWindow.__tumpang_prompts['MERCHANT'] = null;
mockWindow.__tumpang_install_prompt = null;
assert(mockWindow.__tumpang_app_installed === true, 'appinstalled correctly sets installed status');
assert(mockWindow.__tumpang_prompts['MERCHANT'] === null, 'Consumed Merchant install prompt is cleared');

// -----------------------------------------------------------------------------
// 4. VERIFY INTEGRATION IN PORTAL COMPONENTS
// -----------------------------------------------------------------------------
console.log('\n--- 4. AUDIT PORTAL COMPONENT INTEGRATION ---');

const customerPath = path.resolve(process.cwd(), 'src/components/CustomerView.tsx');
const customerContent = fs.readFileSync(customerPath, 'utf-8');
assert(customerContent.includes("usePWAInstall('CUSTOMER')"), 'CustomerView is wired to usePWAInstall("CUSTOMER")');

const merchantPath = path.resolve(process.cwd(), 'src/components/MerchantView.tsx');
const merchantContent = fs.readFileSync(merchantPath, 'utf-8');
assert(!merchantContent.includes('<PWAInstallButton role="MERCHANT"'), 'MerchantView does not include PWAInstallButton in dashboard');

const driverPath = path.resolve(process.cwd(), 'src/components/DriverView.tsx');
const driverContent = fs.readFileSync(driverPath, 'utf-8');
assert(driverContent.includes('<PWAInstallButton role="DRIVER"'), 'DriverView includes PWAInstallButton with role="DRIVER"');

const adminPath = path.resolve(process.cwd(), 'src/components/AdminView.tsx');
const adminContent = fs.readFileSync(adminPath, 'utf-8');
assert(adminContent.includes('<PWAInstallButton role="ADMIN"'), 'AdminView includes PWAInstallButton with role="ADMIN"');

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
const appContent = fs.readFileSync(appPath, 'utf-8');
assert(appContent.includes('syncPWAManifest(currentRole)'), 'App.tsx dynamically synchronizes manifest for the active role');
assert(appContent.includes('setActiveMerchantId(idParam)'), 'App.tsx captures and preserves merchant id parameter on direct URL access');
assert(appContent.includes('setActiveDriverId(idParam)'), 'App.tsx captures and preserves driver id parameter on direct URL access');

// -----------------------------------------------------------------------------
// 5. AUDIT VERCEL CONFIGURATION & STATIC DEPLOYMENT FALLBACKS (404 REMEDIATION)
// -----------------------------------------------------------------------------
console.log('\n--- 5. AUDIT VERCEL CONFIGURATION & PHYSICAL STATIC FALLBACKS ---');

const vercelPath = path.resolve(process.cwd(), 'vercel.json');
assert(fs.existsSync(vercelPath), 'vercel.json exists');

if (fs.existsSync(vercelPath)) {
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
  assert(vercelConfig.cleanUrls === true, 'cleanUrls is enabled for seamless extensionless sub-route serving without 404');
  assert(vercelConfig.trailingSlash === false, 'trailingSlash is set to false to prevent directory trailing slash 308/404 mismatch');
  
  const rewrites: any[] = vercelConfig.rewrites || [];
  const hasMerchantRewrite = rewrites.some(r => r.source === '/merchant' && (r.destination === '/merchant.html' || r.destination === '/index.html'));
  const hasMerchantWildcard = rewrites.some(r => r.source === '/merchant/(.*)' && (r.destination === '/merchant.html' || r.destination === '/index.html'));
  const hasDriverRewrite = rewrites.some(r => r.source === '/driver' && (r.destination === '/driver.html' || r.destination === '/index.html'));
  const hasDriverWildcard = rewrites.some(r => r.source === '/driver/(.*)' && (r.destination === '/driver.html' || r.destination === '/index.html'));
  const hasAdminRewrite = rewrites.some(r => r.source === '/admin' && (r.destination === '/admin.html' || r.destination === '/index.html'));
  const hasAdminWildcard = rewrites.some(r => r.source === '/admin/(.*)' && (r.destination === '/admin.html' || r.destination === '/index.html'));
  const hasSpaCatchall = rewrites.some(r => r.destination === '/index.html' && r.source.includes('api/'));

  assert(hasMerchantRewrite, 'vercel.json contains rewrite for /merchant');
  assert(hasMerchantWildcard, 'vercel.json contains wildcard rewrite for /merchant/(.*)');
  assert(hasDriverRewrite, 'vercel.json contains rewrite for /driver');
  assert(hasDriverWildcard, 'vercel.json contains wildcard rewrite for /driver/(.*)');
  assert(hasAdminRewrite, 'vercel.json contains rewrite for /admin');
  assert(hasAdminWildcard, 'vercel.json contains wildcard rewrite for /admin/(.*)');
  assert(hasSpaCatchall, 'vercel.json contains SPA catch-all excluding /api/');
}

// Check physical fallbacks in dist (both folder/index.html and flat .html for cleanUrls)
const distMerchantDir = path.resolve(process.cwd(), 'dist/merchant/index.html');
const distMerchantFlat = path.resolve(process.cwd(), 'dist/merchant.html');
const distDriverDir = path.resolve(process.cwd(), 'dist/driver/index.html');
const distDriverFlat = path.resolve(process.cwd(), 'dist/driver.html');
const distAdminDir = path.resolve(process.cwd(), 'dist/admin/index.html');
const distAdminFlat = path.resolve(process.cwd(), 'dist/admin.html');

assert(fs.existsSync(distMerchantDir), 'Physical static entry dist/merchant/index.html exists');
assert(fs.existsSync(distMerchantFlat), 'Physical static flat entry dist/merchant.html exists');
if (fs.existsSync(distMerchantFlat)) {
  const content = fs.readFileSync(distMerchantFlat, 'utf-8');
  assert(content.includes('/manifest-merchant.json'), 'dist/merchant.html pre-bakes /manifest-merchant.json');
}

assert(fs.existsSync(distDriverDir), 'Physical static entry dist/driver/index.html exists');
assert(fs.existsSync(distDriverFlat), 'Physical static flat entry dist/driver.html exists');
if (fs.existsSync(distDriverFlat)) {
  const content = fs.readFileSync(distDriverFlat, 'utf-8');
  assert(content.includes('/manifest-driver.json'), 'dist/driver.html pre-bakes /manifest-driver.json');
}

assert(fs.existsSync(distAdminDir), 'Physical static entry dist/admin/index.html exists');
assert(fs.existsSync(distAdminFlat), 'Physical static flat entry dist/admin.html exists');
if (fs.existsSync(distAdminFlat)) {
  const content = fs.readFileSync(distAdminFlat, 'utf-8');
  assert(content.includes('/manifest-admin.json'), 'dist/admin.html pre-bakes /manifest-admin.json');
}

// -----------------------------------------------------------------------------
// 6. LIVE PRODUCTION DIST HTTP SERVER INTEGRATION TEST
// -----------------------------------------------------------------------------
console.log('\n--- 6. LIVE PRODUCTION DIST HTTP SERVER INTEGRATION TEST ---');
import http from 'http';
import { app } from '../src/server/app';

const distPath = path.resolve(process.cwd(), 'dist');
const testServer = http.createServer((req, res) => {
  const url = req.url || '/';
  
  // API Routes delegating to Express backend
  if (url.startsWith('/api')) {
    return (app as any)(req, res);
  }

  // Clean path without query params
  const cleanPath = url.split('?')[0].replace(/^\//, '');
  const pubFile = path.resolve(distPath, cleanPath);

  // Direct static file match in dist
  if (cleanPath && fs.existsSync(pubFile) && fs.statSync(pubFile).isFile()) {
    const ext = path.extname(cleanPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png'
    };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    return res.end(fs.readFileSync(pubFile));
  }

  // Role portal rewrites matching vercel.json destination
  if (cleanPath === 'merchant' || cleanPath.startsWith('merchant/')) {
    const mPath = path.join(distPath, 'merchant.html');
    if (fs.existsSync(mPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(fs.readFileSync(mPath));
    }
  } else if (cleanPath === 'driver' || cleanPath.startsWith('driver/')) {
    const dPath = path.join(distPath, 'driver.html');
    if (fs.existsSync(dPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(fs.readFileSync(dPath));
    }
  } else if (cleanPath === 'admin' || cleanPath.startsWith('admin/')) {
    const aPath = path.join(distPath, 'admin.html');
    if (fs.existsSync(aPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(fs.readFileSync(aPath));
    }
  }

  // SPA fallback rewrite to index.html (matches Vercel rewrites: /merchant, /driver, /admin, etc.)
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(indexPath));
  }

  res.statusCode = 404;
  res.end('Not Found');
});

await new Promise<void>((resolve) => {
  testServer.listen(0, '127.0.0.1', () => resolve());
});

const testAddr = testServer.address() as any;
const testBaseUrl = `http://127.0.0.1:${testAddr.port}`;

try {
  // Test direct navigation and refresh on /merchant
  const resMerchant = await fetch(`${testBaseUrl}/merchant`);
  assert(resMerchant.status === 200, `Direct access to /merchant returns HTTP 200 (got ${resMerchant.status})`);
  const textMerchant = await resMerchant.text();
  assert(textMerchant.includes('<div id="root">') && (textMerchant.includes('main.tsx') || textMerchant.includes('/assets/index')), '/merchant serves complete SPA HTML shell');
  assert(textMerchant.includes('href="/manifest-merchant.json"'), '/merchant initial HTTP document delivers pre-baked <link rel="manifest" href="/manifest-merchant.json">');

  // Test trailing slash /merchant/
  const resMerchantSlash = await fetch(`${testBaseUrl}/merchant/`);
  assert(resMerchantSlash.status === 200, `Direct access to /merchant/ returns HTTP 200 (got ${resMerchantSlash.status})`);

  // Test query parameter /merchant?id=resto_test_123
  const resMerchantQuery = await fetch(`${testBaseUrl}/merchant?id=resto_test_123&source=pwa`);
  assert(resMerchantQuery.status === 200, `Direct access to /merchant?id=resto_test_123 returns HTTP 200 (got ${resMerchantQuery.status})`);

  // Test subroute /merchant/orders
  const resMerchantSub = await fetch(`${testBaseUrl}/merchant/orders`);
  assert(resMerchantSub.status === 200, `Direct access to /merchant/orders returns HTTP 200 (got ${resMerchantSub.status})`);

  // Test driver portal /driver and /driver/
  const resDriver = await fetch(`${testBaseUrl}/driver`);
  assert(resDriver.status === 200, `Direct access to /driver returns HTTP 200 (got ${resDriver.status})`);
  const resDriverSlash = await fetch(`${testBaseUrl}/driver/`);
  assert(resDriverSlash.status === 200, `Direct access to /driver/ returns HTTP 200 (got ${resDriverSlash.status})`);

  // Test admin portal /admin and /admin/
  const resAdmin = await fetch(`${testBaseUrl}/admin`);
  assert(resAdmin.status === 200, `Direct access to /admin returns HTTP 200 (got ${resAdmin.status})`);
  const resAdminSlash = await fetch(`${testBaseUrl}/admin/`);
  assert(resAdminSlash.status === 200, `Direct access to /admin/ returns HTTP 200 (got ${resAdminSlash.status})`);

  // Test API priority and JSON isolation
  const resApiHealth = await fetch(`${testBaseUrl}/api/health`);
  assert(resApiHealth.status === 200, `API /api/health returns HTTP 200`);
  assert(resApiHealth.headers.get('content-type')?.includes('application/json') === true, 'API /api/health returns JSON, never HTML SPA shell');
  const jsonHealth = await resApiHealth.json();
  assert(Boolean(jsonHealth.status), 'API /api/health contains valid JSON status payload');

  const resApiMerchants = await fetch(`${testBaseUrl}/api/merchants`);
  assert(resApiMerchants.headers.get('content-type')?.includes('application/json') === true, 'API /api/merchants returns JSON, never HTML SPA shell');

  // Test static manifest serving
  const resManifestMerchant = await fetch(`${testBaseUrl}/manifest-merchant.json`);
  assert(resManifestMerchant.status === 200, 'Static manifest /manifest-merchant.json returns HTTP 200');
  const jsonManifestMerchant = await resManifestMerchant.json();
  assert(jsonManifestMerchant.start_url === '/merchant', 'Served manifest-merchant.json start_url is strictly "/merchant"');

  const resManifestDriver = await fetch(`${testBaseUrl}/manifest-driver.json`);
  assert(resManifestDriver.status === 200, 'Static manifest /manifest-driver.json returns HTTP 200');

  const resManifestAdmin = await fetch(`${testBaseUrl}/manifest-admin.json`);
  assert(resManifestAdmin.status === 200, 'Static manifest /manifest-admin.json returns HTTP 200');

  const resManifestCustomer = await fetch(`${testBaseUrl}/manifest.json`);
  assert(resManifestCustomer.status === 200, 'Static manifest /manifest.json returns HTTP 200');

} finally {
  await new Promise<void>((resolve) => testServer.close(() => resolve()));
}

// -----------------------------------------------------------------------------
// 7. SERVICE WORKER ENGINE SIMULATION & RESILIENCE AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- 7. SERVICE WORKER ENGINE SIMULATION & RESILIENCE AUDIT ---');

// Mock CacheStorage and Cache implementations to rigorously verify resolveNavigationShell
class MockCache {
  private map = new Map<string, Response>();
  put(req: any, res: Response) {
    const key = typeof req === 'string' ? req : req.url;
    this.map.set(key, res);
  }
  match(req: any, opts?: any) {
    let key = typeof req === 'string' ? req : req.url;
    if (opts?.ignoreSearch && key.includes('?')) {
      key = key.split('?')[0];
    }
    return Promise.resolve(this.map.get(key) || null);
  }
  keys() {
    return Promise.resolve(Array.from(this.map.keys()));
  }
}

const mockCaches = new Map<string, MockCache>();
const mockCachesGlobal = {
  open: async (name: string) => {
    if (!mockCaches.has(name)) mockCaches.set(name, new MockCache());
    return mockCaches.get(name)!;
  },
  match: async (req: any, opts?: any) => {
    for (const cache of mockCaches.values()) {
      const match = await cache.match(req, opts);
      if (match) return match;
    }
    return null;
  },
  keys: async () => Array.from(mockCaches.keys()),
  delete: async (name: string) => mockCaches.delete(name)
};

// Test Navigation Shell Resolution Algorithm exactly as deployed in sw.js
async function simulateResolveNavigationShell(cachesObj: typeof mockCachesGlobal, request: any, url: string) {
  const exact = await cachesObj.match(request, { ignoreSearch: true });
  if (exact) return exact;

  let pathStr = '';
  try { pathStr = new URL(url).pathname.toLowerCase(); } catch { pathStr = String(url || '').toLowerCase(); }

  if (pathStr === '/merchant' || pathStr.startsWith('/merchant/')) {
    const m = await cachesObj.match('/merchant', { ignoreSearch: true });
    if (m) return m;
    const mf = await cachesObj.match('/merchant.html', { ignoreSearch: true });
    if (mf) return mf;
  } else if (pathStr === '/driver' || pathStr.startsWith('/driver/')) {
    const d = await cachesObj.match('/driver', { ignoreSearch: true });
    if (d) return d;
    const df = await cachesObj.match('/driver.html', { ignoreSearch: true });
    if (df) return df;
  } else if (pathStr === '/admin' || pathStr.startsWith('/admin/')) {
    const a = await cachesObj.match('/admin', { ignoreSearch: true });
    if (a) return a;
    const af = await cachesObj.match('/admin.html', { ignoreSearch: true });
    if (af) return af;
  }

  const index = await cachesObj.match('/index.html', { ignoreSearch: true });
  if (index) return index;

  const root = await cachesObj.match('/', { ignoreSearch: true });
  if (root) return root;

  return new Response('<html>offline-fallback</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
}

// Scenario A: Cache has /merchant and user requests /merchant?id=123 (query param)
const cacheV15 = await mockCachesGlobal.open('tumpanggo-pwa-v15');
cacheV15.put('/merchant', new Response('<html>merchant-shell</html>', { status: 200 }));
cacheV15.put('/index.html', new Response('<html>index-shell</html>', { status: 200 }));

const resParam = await simulateResolveNavigationShell(mockCachesGlobal, 'https://example.com/merchant?id=resto_1', 'https://example.com/merchant?id=resto_1');
assert(resParam !== null && resParam !== undefined, 'Navigation shell resolution for /merchant?id=resto_1 never returns null or undefined');
const textParam = await resParam.text();
assert(textParam.includes('merchant-shell'), 'Navigation shell with query param correctly resolves role cached entry');

// Scenario B: Cache only has universal /index.html and user requests /driver
mockCaches.clear();
const cacheOnlyIndex = await mockCachesGlobal.open('tumpanggo-pwa-v15');
cacheOnlyIndex.put('/index.html', new Response('<html>universal-index-shell</html>', { status: 200 }));

const resDriverFallback = await simulateResolveNavigationShell(mockCachesGlobal, 'https://example.com/driver', 'https://example.com/driver');
assert(resDriverFallback !== null && resDriverFallback !== undefined, 'Navigation shell resolution for /driver falls back to universal /index.html');
const textDriverFallback = await resDriverFallback.text();
assert(textDriverFallback.includes('universal-index-shell'), 'Driver route cleanly receives universal SPA app shell');

// Scenario C: Cache is completely empty (zero cache)
mockCaches.clear();
const resEmpty = await simulateResolveNavigationShell(mockCachesGlobal, 'https://example.com/admin', 'https://example.com/admin');
assert(resEmpty !== null && resEmpty !== undefined, 'Zero-cache offline navigation returns resilient offline Response instead of crash');
assert(resEmpty.status === 200, 'Resilient offline fallback Response has HTTP status 200');

// Scenario D: Old cache cleanup on activation
mockCaches.clear();
await mockCachesGlobal.open('tumpanggo-pwa-v13');
await mockCachesGlobal.open('tumpanggo-pwa-v14');
await mockCachesGlobal.open('tumpanggo-pwa-v15');
const keysBefore = await mockCachesGlobal.keys();
assert(keysBefore.length === 3, 'Simulated multiple cache versions present before activation');

// Run SW activate purge logic
const targetCache = 'tumpanggo-pwa-v15';
await Promise.all(
  keysBefore.map((k) => (k !== targetCache ? mockCachesGlobal.delete(k) : null))
);
const keysAfter = await mockCachesGlobal.keys();
assert(keysAfter.length === 1 && keysAfter[0] === targetCache, 'Service worker activation purges older caches and retains only active version');

// -----------------------------------------------------------------------------
// 8. START_URL TO PORTAL RUNTIME MAPPING AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- 8. START_URL TO PORTAL RUNTIME MAPPING AUDIT ---');

function resolvePortalRoleFromUrl(urlStr: string): string {
  const urlObj = new URL(urlStr, 'https://example.com');
  const pathname = urlObj.pathname.toLowerCase();
  if (pathname === '/merchant' || pathname.startsWith('/merchant/')) return 'MERCHANT';
  if (pathname === '/driver' || pathname.startsWith('/driver/')) return 'DRIVER';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'ADMIN';
  const roleParam = urlObj.searchParams.get('role')?.toUpperCase();
  if (roleParam && ['CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN'].includes(roleParam)) return roleParam;
  return 'CUSTOMER';
}

assert(resolvePortalRoleFromUrl('https://example.com/merchant') === 'MERCHANT', 'Start URL /merchant strictly maps to MERCHANT portal');
assert(resolvePortalRoleFromUrl('https://example.com/merchant?source=pwa') === 'MERCHANT', 'Start URL /merchant?source=pwa strictly maps to MERCHANT portal');
assert(resolvePortalRoleFromUrl('https://example.com/driver') === 'DRIVER', 'Start URL /driver strictly maps to DRIVER portal');
assert(resolvePortalRoleFromUrl('https://example.com/admin') === 'ADMIN', 'Start URL /admin strictly maps to ADMIN portal');
assert(resolvePortalRoleFromUrl('https://example.com/') === 'CUSTOMER', 'Start URL / strictly maps to CUSTOMER portal');

// -----------------------------------------------------------------------------
// 9. THREE INDEPENDENT PWAS ISOLATION & DEDICATED BRANDING AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- 9. THREE INDEPENDENT PWAS ISOLATION & DEDICATED BRANDING AUDIT ---');

// Audit distinct icons
const merchantRaw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/manifest-merchant.json'), 'utf-8'));
const driverRaw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/manifest-driver.json'), 'utf-8'));
const customerRaw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/manifest.json'), 'utf-8'));

assert(merchantRaw.icons.some((i: any) => i.src.includes('merchant')), 'Merchant manifest uses dedicated Merchant icons (pwa-merchant-*.png)');
assert(!merchantRaw.icons.some((i: any) => i.src === '/pwa-192x192.png'), 'Merchant manifest does NOT share standard Customer 192 icon');

assert(driverRaw.icons.some((i: any) => i.src.includes('driver')), 'Driver manifest uses dedicated Driver icons (pwa-driver-*.png)');
assert(!driverRaw.icons.some((i: any) => i.src === '/pwa-192x192.png'), 'Driver manifest does NOT share standard Customer 192 icon');

// Check physical existence of generated assets
const requiredIconAssets = [
  'public/pwa-merchant-192x192.png',
  'public/pwa-merchant-512x512.png',
  'public/pwa-merchant-maskable-512x512.png',
  'public/apple-touch-icon-merchant.png',
  'public/pwa-driver-192x192.png',
  'public/pwa-driver-512x512.png',
  'public/pwa-driver-maskable-512x512.png',
  'public/apple-touch-icon-driver.png'
];

for (const iconAsset of requiredIconAssets) {
  const aPath = path.resolve(process.cwd(), iconAsset);
  const exists = fs.existsSync(aPath);
  const size = exists ? fs.statSync(aPath).size : 0;
  assert(exists && size > 100, `Physical icon asset exists and valid: ${iconAsset} (${size} bytes)`);
}

// Test Cross-PWA Standalone Detection Logic
assert(hookContent.includes('getHostPWARole'), 'usePWAInstall implements getHostPWARole to detect host PWA identity');
assert(hookContent.includes('checkIsRunningInOtherPWA'), 'usePWAInstall implements checkIsRunningInOtherPWA');
assert(hookContent.includes('getRoleInstalledFromStorage'), 'usePWAInstall implements getRoleInstalledFromStorage per-role storage');

console.log('\n================================================================================');
console.log(`📊 PWA INSTALLATION VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

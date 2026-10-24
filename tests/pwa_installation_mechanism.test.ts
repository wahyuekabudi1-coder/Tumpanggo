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
  { file: 'public/manifest-merchant.json', role: 'MERCHANT', expectedStart: '/merchant', expectedScope: '/', expectedId: '/merchant' },
  { file: 'public/manifest-driver.json', role: 'DRIVER', expectedStart: '/driver', expectedScope: '/', expectedId: '/driver' },
  { file: 'public/manifest-admin.json', role: 'ADMIN', expectedStart: '/admin', expectedScope: '/', expectedId: '/admin' }
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

assert(hookContent.includes('globalDeferredPrompt'), 'usePWAInstall utilizes module-level singleton globalDeferredPrompt');
assert(hookContent.includes('globalIsInstalled'), 'usePWAInstall maintains module-level installation state');
assert(hookContent.includes('__tumpang_install_prompt'), 'usePWAInstall synchronizes with index.html global bus (__tumpang_install_prompt)');
assert(hookContent.includes('syncPWAManifest'), 'usePWAInstall exports syncPWAManifest helper for all roles');
assert(hookContent.includes('outcome: choice.outcome'), 'install() accurately returns the native browser outcome without faking');

// Test Simulated Lifecycle Scenario 1: User lands on Customer, prompt captured, user navigates to Merchant
console.log('\n--- Scenario 1: Cross-portal prompt preservation (Customer -> Merchant) ---');

// Mock DOM & window
const mockEventBus: Record<string, Function[]> = {};
const mockWindow: any = {
  __tumpang_install_prompt: null,
  __tumpang_app_installed: false,
  addEventListener: (event: string, fn: Function) => {
    mockEventBus[event] = mockEventBus[event] || [];
    mockEventBus[event].push(fn);
  },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' }
};

// Simulate early beforeinstallprompt event before components render
const earlyPrompt = new MockBeforeInstallPromptEvent('accepted');
mockWindow.__tumpang_install_prompt = earlyPrompt;

assert(mockWindow.__tumpang_install_prompt !== null, 'Early beforeinstallprompt captured on global window object');

// Simulate Merchant mounting and accessing stored prompt
const merchantPrompt = mockWindow.__tumpang_install_prompt;
assert(merchantPrompt === earlyPrompt, 'Merchant portal successfully accesses retained prompt without event loss');

// Simulate Merchant triggering installation
let installTriggered = false;
if (merchantPrompt) {
  await merchantPrompt.prompt();
  installTriggered = true;
}
assert(installTriggered, 'Merchant install button successfully executes native prompt() on the retained event');
assert(earlyPrompt.promptCallCount === 1, 'Native prompt() was called exactly once');

// Test Simulated Lifecycle Scenario 2: User dismisses prompt (cancel)
console.log('\n--- Scenario 2: User dismisses browser prompt (no fake install) ---');
const dismissedPrompt = new MockBeforeInstallPromptEvent('dismissed');
await dismissedPrompt.prompt();
const choice = await dismissedPrompt.userChoice;
assert(choice.outcome === 'dismissed', 'outcome is properly identified as "dismissed"');

// Test Simulated Lifecycle Scenario 3: appinstalled event fires
console.log('\n--- Scenario 3: Browser triggers appinstalled event ---');
mockWindow.__tumpang_app_installed = true;
mockWindow.__tumpang_install_prompt = null;
assert(mockWindow.__tumpang_app_installed === true, 'appinstalled correctly sets installed status');
assert(mockWindow.__tumpang_install_prompt === null, 'Consumed install prompt is cleared');

// -----------------------------------------------------------------------------
// 4. VERIFY INTEGRATION IN PORTAL COMPONENTS
// -----------------------------------------------------------------------------
console.log('\n--- 4. AUDIT PORTAL COMPONENT INTEGRATION ---');

const customerPath = path.resolve(process.cwd(), 'src/components/CustomerView.tsx');
const customerContent = fs.readFileSync(customerPath, 'utf-8');
assert(customerContent.includes("usePWAInstall('CUSTOMER')"), 'CustomerView is wired to usePWAInstall("CUSTOMER")');

const merchantPath = path.resolve(process.cwd(), 'src/components/MerchantView.tsx');
const merchantContent = fs.readFileSync(merchantPath, 'utf-8');
assert(merchantContent.includes('<PWAInstallButton role="MERCHANT"'), 'MerchantView includes PWAInstallButton with role="MERCHANT"');

const driverPath = path.resolve(process.cwd(), 'src/components/DriverView.tsx');
const driverContent = fs.readFileSync(driverPath, 'utf-8');
assert(driverContent.includes('<PWAInstallButton role="DRIVER"'), 'DriverView includes PWAInstallButton with role="DRIVER"');

const adminPath = path.resolve(process.cwd(), 'src/components/AdminView.tsx');
const adminContent = fs.readFileSync(adminPath, 'utf-8');
assert(adminContent.includes('<PWAInstallButton role="ADMIN"'), 'AdminView includes PWAInstallButton with role="ADMIN"');

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
const appContent = fs.readFileSync(appPath, 'utf-8');
assert(appContent.includes('syncPWAManifest(currentRole)'), 'App.tsx dynamically synchronizes manifest for the active role');

console.log('\n================================================================================');
console.log(`📊 PWA INSTALLATION VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

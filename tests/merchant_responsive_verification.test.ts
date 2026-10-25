/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Verification Test Suite for TumpangGo Merchant Dashboard Responsiveness:
 * - Mobile Viewport (320px – 430px)
 * - Tablet Portrait & Landscape (600px – 1024px)
 * - Desktop Viewport (1366px+)
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
console.log('  TUMPANGGO — MERCHANT DASHBOARD RESPONSIVE VERIFICATION');
console.log('================================================================================\n');

const merchantViewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/MerchantView.tsx'), 'utf-8');

// -----------------------------------------------------------------------------
// 1. MOBILE HEADER & NAVIGATION (320px – 430px)
// -----------------------------------------------------------------------------
console.log('--- 1. AUDITING MOBILE HEADER & SAFE NAVIGATION ---');

assert(merchantViewSrc.includes('md:hidden bg-white border-b border-slate-200/90'), 'Mobile header specifically styled for < md');
assert(merchantViewSrc.includes('min-h-[56px]'), 'Mobile header maintains minimum height for comfortable touch area');
assert(merchantViewSrc.includes('flex items-center gap-2 min-w-0 flex-1'), 'Store title wrapper flexes with min-w-0 to prevent 320px horizontal overflow');
assert(merchantViewSrc.includes('truncate') && merchantViewSrc.includes('Portal Toko'), 'Store title has truncation escape hatch');
assert(merchantViewSrc.includes('w-10 h-10 min-w-[40px]'), 'Hamburger and Audio buttons have >= 40px touch targets');

// Safe Area & Bottom Nav
assert(merchantViewSrc.includes('env(safe-area-inset-bottom'), 'Bottom navigation bar incorporates device safe area insets');
assert(merchantViewSrc.includes('pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]'), 'Main content body includes safe bottom clearance for mobile bar');

// 5 Core Tabs in Bottom Nav
assert(merchantViewSrc.includes("setActiveTab('dashboard')"), 'Bottom nav has 1-tap access to Dashboard');
assert(merchantViewSrc.includes("setActiveTab('incoming')"), 'Bottom nav has 1-tap access to Pesanan Masuk');
assert(merchantViewSrc.includes("setActiveTab('menu')"), 'Bottom nav has 1-tap access to Katalog Menu');
assert(merchantViewSrc.includes("setActiveTab('history')"), 'Bottom nav has 1-tap access to Riwayat Pesanan');
assert(merchantViewSrc.includes("setActiveTab('profile')"), 'Bottom nav has 1-tap access to Profil');

// -----------------------------------------------------------------------------
// 2. DASHBOARD RECAP & STAT CARDS
// -----------------------------------------------------------------------------
console.log('\n--- 2. AUDITING DASHBOARD RECAP & STAT CARDS ---');

assert(merchantViewSrc.includes('w-full sm:w-auto flex items-center justify-between sm:justify-start gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto'), 'Dashboard period filter is full-width on mobile without pushing width');
assert(merchantViewSrc.includes('grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4'), 'Stat cards use 2 cols on mobile/tablet portrait and 4 cols on desktop');
assert(merchantViewSrc.includes('text-base sm:text-xl lg:text-2xl text-emerald-800 block font-mono truncate'), 'Omset currency number has responsive typography to prevent overflow');
assert(merchantViewSrc.includes('flex flex-col sm:flex-row sm:items-center justify-between gap-3'), 'Action banner stacks vertically on mobile and horizontally on tablet/desktop');

// -----------------------------------------------------------------------------
// 3. PESANAN MASUK & OPERASIONAL DAPUR
// -----------------------------------------------------------------------------
console.log('\n--- 3. AUDITING PESANAN MASUK & KITCHEN OPERATIONAL ---');

assert(merchantViewSrc.includes('min-w-[95px] min-h-[40px]'), 'Kitchen sub-tabs (Perlu Dimasak, Sedang Dimasak, Siap) have >= 40px touch targets');
assert(merchantViewSrc.includes('grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-5'), 'Incoming, cooking, and ready orders use spacious 1 col on mobile & tablet portrait, 2 cols on landscape, 3 cols on desktop');
assert(merchantViewSrc.includes('min-h-[44px] py-2 px-3 rounded-xl bg-emerald-700'), 'Konfirmasi Masak action button meets 44px touch target');
assert(merchantViewSrc.includes('min-h-[44px] py-2.5 px-3 rounded-xl bg-emerald-600'), 'Makanan Siap Diambil action button meets 44px touch target');
assert(merchantViewSrc.includes('timer.formattedRemaining'), 'Countdown ticker display is preserved');

// -----------------------------------------------------------------------------
// 4. KATALOG MENU & MODAL FORM KEYBOARD COMPLIANCE
// -----------------------------------------------------------------------------
console.log('\n--- 4. AUDITING MENU CATALOG & MODAL KEYBOARD COMPLIANCE ---');

assert(merchantViewSrc.includes('max-h-[90dvh] sm:max-h-[92vh] overflow-hidden'), 'Item modal uses dvh/vh viewport constraint to handle mobile virtual keyboard');
assert(merchantViewSrc.includes('sticky bottom-0 bg-white'), 'Modal submit buttons are sticky at bottom of modal body');
assert(merchantViewSrc.includes('min-h-[44px] py-2.5 rounded-xl bg-emerald-700'), 'Modal submit button has 44px touch target');
assert(merchantViewSrc.includes('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4'), 'Product cards adapt to 1 col on mobile, 2 cols on tablet, 3 cols on desktop');
assert(merchantViewSrc.includes('min-h-[40px] min-w-[40px] p-2 rounded-xl'), 'Menu card edit/delete action buttons have >= 40px touch targets');

// -----------------------------------------------------------------------------
// 5. RIWAYAT PESANAN & PROFIL
// -----------------------------------------------------------------------------
console.log('\n--- 5. AUDITING ORDER HISTORY & PROFILE FORM ---');

assert(merchantViewSrc.includes('grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4'), 'Order history cards use clean responsive grid');
assert(merchantViewSrc.includes('min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-50'), 'E-Receipt button has touch-friendly hitbox');
assert(merchantViewSrc.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'), 'Profile form uses single column on mobile, 2 columns on tablet/desktop');
assert(merchantViewSrc.includes('grid grid-cols-1 sm:grid-cols-3 gap-3'), 'Bank details form adapts cleanly on mobile');
assert(merchantViewSrc.includes('min-h-[44px] py-2.5 px-4 bg-emerald-700'), 'Save profile button has 44px touch target');

// -----------------------------------------------------------------------------
// 6. TABLET & DESKTOP SIDEBAR INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n--- 6. AUDITING TABLET & DESKTOP SIDEBAR INTEGRITY ---');

assert(merchantViewSrc.includes('hidden md:flex flex-col w-56 lg:w-64 xl:w-72'), 'Desktop/tablet sidebar width adapts gracefully (w-56 on tablet md, w-64 on lg, w-72 on xl)');
assert(merchantViewSrc.includes('hidden md:flex bg-white border-b border-slate-200/80 px-6 lg:px-8 py-3.5 items-center justify-between sticky top-0'), 'Desktop top header remains completely intact');

console.log('\n================================================================================');
console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
}

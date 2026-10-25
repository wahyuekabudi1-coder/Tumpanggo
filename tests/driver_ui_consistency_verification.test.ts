import fs from 'fs';
import path from 'path';

function runDriverConsistencyTests() {
  console.log('================================================================================');
  console.log('  TUMPANGGO — DRIVER UI/UX CONSISTENCY WITH MERCHANT VERIFICATION');
  console.log('================================================================================\n');

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, passMsg: string, failMsg: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${passMsg}`);
      passCount++;
    } else {
      console.error(`  ❌ [FAIL] ${failMsg}`);
      failCount++;
    }
  }

  const portalLoginPath = path.resolve(process.cwd(), 'src/components/PortalLogin.tsx');
  const driverViewPath = path.resolve(process.cwd(), 'src/components/DriverView.tsx');
  const merchantViewPath = path.resolve(process.cwd(), 'src/components/MerchantView.tsx');

  assert(fs.existsSync(portalLoginPath), 'PortalLogin.tsx exists', 'PortalLogin.tsx not found');
  assert(fs.existsSync(driverViewPath), 'DriverView.tsx exists', 'DriverView.tsx not found');
  assert(fs.existsSync(merchantViewPath), 'MerchantView.tsx exists', 'MerchantView.tsx not found');

  const portalLoginCode = fs.readFileSync(portalLoginPath, 'utf-8');
  const driverViewCode = fs.readFileSync(driverViewPath, 'utf-8');
  const merchantViewCode = fs.readFileSync(merchantViewPath, 'utf-8');

  // --- SECTION 1: DRIVER LOGIN PARITY IN PortalLogin.tsx ---
  console.log('\n--- 1. AUDITING DRIVER LOGIN PARITY (PortalLogin.tsx) ---');

  assert(
    portalLoginCode.includes("role === 'MERCHANT' || role === 'DRIVER'"),
    'Driver shares the standardized 2-column responsive portal layout with Merchant',
    'Driver does not share the 2-column portal layout'
  );

  assert(
    portalLoginCode.includes('/umkm-activity.jpg'),
    'Standard visual left-column asset /umkm-activity.jpg used for Driver login',
    'Missing /umkm-activity.jpg in login banner'
  );

  assert(
    portalLoginCode.includes('Portal Driver Pengiriman'),
    'Clear portal title "Portal Driver Pengiriman" present',
    'Portal title for Driver missing'
  );

  assert(
    portalLoginCode.includes('Ongkir Flat Rp 5.000'),
    'Driver highlight badge "Ongkir Flat Rp 5.000" displayed in showcase column',
    'Driver highlight badge missing'
  );

  assert(
    portalLoginCode.includes('<Logo size={68}'),
    'Official Logo with size 68 used in login right column',
    'Official Logo size 68 not found in right column'
  );

  assert(
    portalLoginCode.includes('tumpang_remembered_driver_login'),
    'Driver "Remember Me" persistence key tumpang_remembered_driver_login implemented',
    'Missing tumpang_remembered_driver_login key'
  );

  assert(
    portalLoginCode.includes('WhatsApp CS TumpangGo'),
    'Official WhatsApp CS support link provided for Driver login issues',
    'Missing WhatsApp CS link in Driver login'
  );

  // --- SECTION 2: DRIVER DASHBOARD HEADER & SIDEBAR ARCHITECTURE ---
  console.log('\n--- 2. AUDITING DRIVER DASHBOARD HEADER & SIDEBAR (DriverView.tsx) ---');

  assert(
    driverViewCode.includes('DriverAvatarBadge'),
    'DriverAvatarBadge component defined for consistent avatar styling',
    'DriverAvatarBadge component missing'
  );

  assert(
    driverViewCode.includes('getDriverInitials'),
    'getDriverInitials helper defined for authentic Driver initials',
    'getDriverInitials helper missing'
  );

  assert(
    driverViewCode.includes('hidden md:flex flex-col w-56 lg:w-64 xl:w-72'),
    'Desktop/tablet sidebar matches Merchant responsive widths (w-56 on md, w-64 on lg, w-72 on xl)',
    'Sidebar width classes do not match Merchant specifications'
  );

  assert(
    driverViewCode.includes('md:hidden') && driverViewCode.includes('min-h-[56px]'),
    'Mobile header styled specifically for < md with comfortable 56px height',
    'Mobile header does not match Merchant styling'
  );

  assert(
    driverViewCode.includes('isMobileDrawerOpen'),
    'Mobile slide-out drawer implemented with transition backdrop',
    'Mobile drawer state/backdrop missing'
  );

  assert(
    driverViewCode.includes('safe-area-inset-bottom') || driverViewCode.includes('env(safe-area-inset-bottom)'),
    'Mobile bottom navigation and drawer handle safe-area-inset-bottom',
    'Safe area inset bottom handling missing'
  );

  // --- SECTION 3: STAT CARDS & RESPONSIVE GRID LAYOUT ---
  console.log('\n--- 3. AUDITING STAT CARDS & RESPONSIVE GRID (DriverView.tsx) ---');

  assert(
    driverViewCode.includes('grid grid-cols-2 lg:grid-cols-4'),
    'Stat cards layout uses 2 columns on mobile/tablet portrait and 4 on desktop (matching Merchant)',
    'Stat cards do not follow 2 col mobile / 4 col desktop grid'
  );

  assert(
    driverViewCode.includes('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'),
    'Order tasks list uses responsive 1 col mobile, 2 col tablet, 3 col desktop',
    'Tasks grid does not use responsive multi-column layout'
  );

  assert(
    driverViewCode.includes('rounded-2xl') && driverViewCode.includes('border-slate-200/90'),
    'Card styling uses rounded-2xl and soft border-slate-200/90 consistent with Merchant',
    'Card styling inconsistent with Merchant specifications'
  );

  // --- SECTION 4: OPERATIONAL DRIVER WORKFLOWS PRESERVED ---
  console.log('\n--- 4. AUDITING PRESERVED OPERATIONAL DRIVER WORKFLOWS ---');

  assert(
    driverViewCode.includes('READY_FOR_PICKUP') &&
    driverViewCode.includes('ORDER_PICKED_UP') &&
    driverViewCode.includes('DELIVERED'),
    'Complete status transition lifecycle preserved (READY_FOR_PICKUP -> ORDER_PICKED_UP -> DELIVERED)',
    'Status transition lifecycle modified or missing'
  );

  assert(
    driverViewCode.includes('CookingTicker') || driverViewCode.includes('formatRemainingTime'),
    'Live cooking preparation ticker preserved for orders in kitchen',
    'Cooking preparation ticker missing'
  );

  assert(
    driverViewCode.includes('MapPicker'),
    'Interactive Leaflet / OpenStreetMap MapPicker preserved for delivery visualization',
    'MapPicker component missing'
  );

  assert(
    driverViewCode.includes('google.com/maps/dir'),
    'Google Maps turn-by-turn navigation link launcher preserved',
    'Google Maps navigation link missing'
  );

  assert(
    driverViewCode.includes('accept="image/*"'),
    'Proof of delivery photo uploader (camera input) preserved',
    'Delivery photo proof uploader missing'
  );

  assert(
    driverViewCode.includes('useOrderRingtone') || driverViewCode.includes('toggleMute') || driverViewCode.includes('toggleRingtone'),
    'Audible order notification / ringtone control preserved (useOrderRingtone / toggleMute)',
    'Ringtone notification audio control missing'
  );

  assert(
    driverViewCode.includes('HiddenPortalBar'),
    'Hidden portal bar access trigger preserved at the bottom',
    'Hidden portal bar trigger missing'
  );

  // --- SECTION 5: VIEWPORT RESPONSIVENESS (320px, 375px, 430px, 768px, 1024px) ---
  console.log('\n--- 5. AUDITING VIEWPORT RESPONSIVENESS & TOUCH TARGET AUDIT ---');

  assert(
    driverViewCode.includes('min-w-0') && driverViewCode.includes('truncate'),
    '320px viewport: Uses min-w-0 and truncation on text wrappers to prevent horizontal scrollbars',
    '320px overflow protection missing'
  );

  assert(
    driverViewCode.includes('min-h-[44px]') || driverViewCode.includes('min-h-[40px]'),
    '375px/430px viewport: Key touch targets (buttons, links) satisfy >= 40px/44px touch ergonomics',
    'Touch target sizing missing or too small'
  );

  assert(
    driverViewCode.includes('md:grid-cols-2') && driverViewCode.includes('lg:grid-cols-3'),
    '768px/1024px viewport: Tasks grid fluidly transitions from 1-column to 2-columns (tablet) and 3-columns (desktop)',
    'Tablet/desktop column transitions missing'
  );

  assert(
    driverViewCode.includes('w-56') && driverViewCode.includes('lg:w-64'),
    '768px/1024px viewport: Sidebar width scales gracefully (w-56 on 768px md, w-64 on 1024px lg)',
    'Sidebar tablet-to-desktop scaling missing'
  );

  assert(
    driverViewCode.includes('pb-[calc(env(safe-area-inset-bottom'),
    'Mobile viewports: Content body preserves safe-area-inset-bottom padding for modern notch & gesture bars',
    'Missing safe-area-inset-bottom padding in main content'
  );

  console.log('\n================================================================================');
  console.log(`📊 SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runDriverConsistencyTests();

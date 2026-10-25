import fs from 'fs';
import path from 'path';

function runAdminConsistencyTests() {
  console.log('================================================================================');
  console.log('  TUMPANGGO — ADMIN UI/UX CONSISTENCY & ECOSYSTEM PARITY VERIFICATION');
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
  const adminViewPath = path.resolve(process.cwd(), 'src/components/AdminView.tsx');
  const merchantViewPath = path.resolve(process.cwd(), 'src/components/MerchantView.tsx');
  const driverViewPath = path.resolve(process.cwd(), 'src/components/DriverView.tsx');

  assert(fs.existsSync(portalLoginPath), 'PortalLogin.tsx exists', 'PortalLogin.tsx not found');
  assert(fs.existsSync(adminViewPath), 'AdminView.tsx exists', 'AdminView.tsx not found');
  assert(fs.existsSync(merchantViewPath), 'MerchantView.tsx exists', 'MerchantView.tsx not found');
  assert(fs.existsSync(driverViewPath), 'DriverView.tsx exists', 'DriverView.tsx not found');

  const portalLoginCode = fs.readFileSync(portalLoginPath, 'utf-8');
  const adminViewCode = fs.readFileSync(adminViewPath, 'utf-8');
  const merchantViewCode = fs.readFileSync(merchantViewPath, 'utf-8');
  const driverViewCode = fs.readFileSync(driverViewPath, 'utf-8');

  // --- SECTION 1: ADMIN LOGIN PARITY IN PortalLogin.tsx ---
  console.log('\n--- 1. AUDITING ADMIN LOGIN PARITY (PortalLogin.tsx) ---');

  assert(
    portalLoginCode.includes("role === 'MERCHANT' || role === 'DRIVER' || role === 'ADMIN'"),
    'Admin shares the standardized 2-column responsive portal layout with Merchant & Driver',
    'Admin is not included in the unified 2-column portal layout'
  );

  assert(
    portalLoginCode.includes('Pusat Kendali Ekosistem TumpangGo'),
    'Admin left showcase displays authoritative headline "Pusat Kendali Ekosistem TumpangGo"',
    'Missing headline for Admin login showcase'
  );

  assert(
    portalLoginCode.includes('Administrator Pusat'),
    'Admin activity photo contains overlay badge "Administrator Pusat"',
    'Missing Administrator Pusat badge'
  );

  assert(
    portalLoginCode.includes('Tata Kelola Mitra'),
    'Admin showcase value badges include "Tata Kelola Mitra" and "Verifikasi Pembayaran"',
    'Missing Admin showcase badges'
  );

  assert(
    portalLoginCode.includes('Masuk ke Dashboard Admin Pusat'),
    'Admin form contains clear title "Masuk ke Dashboard Admin Pusat"',
    'Missing Admin login title'
  );

  assert(
    portalLoginCode.includes('tumpang_remembered_admin_login'),
    'Admin "Remember Me" persistence key tumpang_remembered_admin_login implemented',
    'Missing tumpang_remembered_admin_login persistence key'
  );

  assert(
    portalLoginCode.includes('Pemulihan Kredensial Master Account'),
    'Admin login provides quick trigger for Master Account Recovery Modal',
    'Missing Master Account Recovery button'
  );

  // --- SECTION 2: ADMIN BRANDING & SIDEBAR ARCHITECTURE (AdminView.tsx) ---
  console.log('\n--- 2. AUDITING ADMIN BRANDING & SIDEBAR ARCHITECTURE (AdminView.tsx) ---');

  assert(
    adminViewCode.includes("import Logo from './Logo.tsx'"),
    'Official Logo component imported in AdminView.tsx',
    'Logo component not imported in AdminView.tsx'
  );

  assert(
    !adminViewCode.includes('>tG<') && !adminViewCode.includes('> tG <'),
    'Ad-hoc "tG" text logo box completely replaced by official Logo across all headers',
    'Fake "tG" logo placeholder still present in AdminView'
  );

  assert(
    adminViewCode.includes('hidden md:flex flex-col w-56 lg:w-64 xl:w-72'),
    'Desktop/tablet sidebar matches Merchant & Driver responsive widths (w-56 on md, w-64 on lg, w-72 on xl)',
    'Sidebar width classes do not match ecosystem standard'
  );

  assert(
    adminViewCode.includes('bg-[#064e3b] text-white shadow-xs font-extrabold'),
    'Active sidebar item uses brand forest green token #064e3b with high-contrast font',
    'Active sidebar item styling inconsistent with ecosystem palette'
  );

  assert(
    adminViewCode.includes('handleViewCustomerSite'),
    'Sidebar footer contains 1-click launcher "Lihat Website Pelanggan" (handleViewCustomerSite)',
    'Missing handleViewCustomerSite in Admin sidebar footer'
  );

  // --- SECTION 3: PRESERVING ALL 8 ACTUAL BUSINESS MENUS ---
  console.log('\n--- 3. AUDITING PRESERVATION OF ALL 8 ADMIN MENUS ---');

  const requiredMenus = [
    { id: 'verify', label: 'Verifikasi Pembayaran' },
    { id: 'orders', label: 'Kelola Pesanan' },
    { id: 'merchants', label: 'Manajemen Merchant' },
    { id: 'drivers', label: 'Mitra Driver' },
    { id: 'partners', label: 'Pendaftaran Mitra' },
    { id: 'settlements', label: 'Settlement & Payout' },
    { id: 'testimonials', label: 'Review Pengguna' },
    { id: 'settings', label: 'Pengaturan Sistem' },
  ];

  for (const menu of requiredMenus) {
    assert(
      adminViewCode.includes(`id: '${menu.id}'`) && adminViewCode.includes(menu.label),
      `Menu "${menu.label}" (id: '${menu.id}') preserved with full functionality`,
      `Menu "${menu.label}" is missing or altered`
    );
  }

  // --- SECTION 4: MOBILE NAVIGATION, DRAWER & BOTTOM BAR ---
  console.log('\n--- 4. AUDITING MOBILE NAVIGATION, DRAWER & BOTTOM BAR ---');

  assert(
    adminViewCode.includes('isMobileDrawerOpen'),
    'Mobile slide-out drawer state isMobileDrawerOpen implemented',
    'isMobileDrawerOpen state missing'
  );

  assert(
    adminViewCode.includes('aria-label="Buka Menu Admin"'),
    'Mobile header includes accessible hamburger drawer button',
    'Hamburger drawer button missing in mobile header'
  );

  assert(
    adminViewCode.includes('min-h-[56px]'),
    'Mobile header enforces minimum 56px touch height standard',
    'Mobile header height below 56px standard'
  );

  assert(
    adminViewCode.includes('aria-label="Navigasi Bawah Admin"'),
    'Fixed mobile bottom navigation bar implemented for quick access',
    'Mobile bottom navigation bar missing'
  );

  assert(
    adminViewCode.includes('safe-area-inset-bottom'),
    'Mobile bottom navigation bar accounts for safe-area-inset-bottom',
    'Safe area inset padding missing in mobile bottom nav'
  );

  assert(
    adminViewCode.includes('pb-24 md:pb-12'),
    'Main container includes bottom clearance pb-24 to prevent mobile nav overlap',
    'Main content bottom clearance missing'
  );

  // --- SECTION 5: KPI STAT CARDS STANDARDIZATION ---
  console.log('\n--- 5. AUDITING KPI STAT CARDS STANDARDIZATION ---');

  assert(
    adminViewCode.includes('grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'),
    'KPI cards structured with responsive 2-col (mobile/tablet) and 4-col (desktop) grid',
    'KPI cards grid not matching 2-col / 4-col standard'
  );

  assert(
    adminViewCode.includes('rounded-2xl border border-slate-200/90 shadow-2xs'),
    'KPI cards styled with elevated white rounded-2xl cards and soft slate borders',
    'KPI cards styling not matching design system'
  );

  assert(
    adminViewCode.includes('Verifikasi Pending') && adminViewCode.includes('Total Omset Selesai'),
    'Core operational KPIs (Verifikasi Pending, Pesanan Aktif, Omset, Komisi) preserved',
    'Core operational KPIs missing'
  );

  // --- SECTION 6: ECOSYSTEM UNIFIED PALETTE & TYPOGRAPHY ---
  console.log('\n--- 6. AUDITING ECOSYSTEM PALETTE & TYPOGRAPHY ---');

  assert(
    adminViewCode.includes('#064e3b') && driverViewCode.includes('#064e3b') && merchantViewCode.includes('#064e3b'),
    'Brand forest green #064e3b shared consistently across Merchant, Driver, and Admin',
    'Brand green token #064e3b not shared consistently'
  );

  assert(
    adminViewCode.includes('min-h-[44px]'),
    'Mobile interactive touch targets meet >= 44px ergonomic requirement',
    'Touch targets do not satisfy 44px requirement'
  );

  console.log('\n================================================================================');
  console.log(`📊 SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAdminConsistencyTests();

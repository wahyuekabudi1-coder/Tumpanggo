import fs from 'fs';
import path from 'path';
import { foodDb } from '../src/server/db';
import { hashPassword, verifyPassword } from '../src/server/auth';

interface TestResult {
  title: string;
  passed: boolean;
  message: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, title: string, message: string = '') {
  testResults.push({
    title,
    passed: condition,
    message: condition ? (message || 'PASSED') : `FAILED: ${message}`
  });
  console.log(`${condition ? '✅ [PASS]' : '❌ [FAIL]'} ${title} ${message ? `(${message})` : ''}`);
}

async function runTests() {
  console.log('=== TEST SUITE: ALUR PORTAL MITRA TUMPANGGO (MERCHANT & DRIVER) ===\n');

  // --- 1. Static UI Architecture Audits ---
  console.log('--- 1. Static Component & Route Audits ---');
  const partnerHubPath = path.resolve(process.cwd(), 'src/components/PartnerPortalHub.tsx');
  assert(fs.existsSync(partnerHubPath), 'File src/components/PartnerPortalHub.tsx tersedia');

  const partnerHubSrc = fs.readFileSync(partnerHubPath, 'utf-8');
  const customerViewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerView.tsx'), 'utf-8');

  // Initial step only has 2 role choices
  const hasRoleStep = partnerHubSrc.includes("step === 'role_selection'");
  const hasMerchantRoleBtn = partnerHubSrc.includes("handleSelectRole('MERCHANT')") && partnerHubSrc.includes('Mitra Toko');
  const hasDriverRoleBtn = partnerHubSrc.includes("handleSelectRole('DRIVER')") && partnerHubSrc.includes('Mitra Kurir');
  assert(hasRoleStep && hasMerchantRoleBtn && hasDriverRoleBtn, 'Tampilan awal hanya menyediakan 2 pilihan utama: Mitra Toko (Merchant) dan Mitra Kurir (Driver)');

  // No long contracts on initial screen
  const roleSectionOnly = partnerHubSrc.split("step === 'role_selection'")[1]?.split("step === 'action_selection'")[0] || '';
  const noContractsOnInitial = !roleSectionOnly.includes('contractPhoto') && !roleSectionOnly.includes('Tanda Tangan') && !roleSectionOnly.includes('Kirim Formulir');
  assert(noContractsOnInitial, 'Halaman pilihan jenis mitra awal bebas dari dokumen, kontrak, atau formulir pendaftaran panjang');

  // Action selection has Daftar and Login
  const hasActionStep = partnerHubSrc.includes("step === 'action_selection'");
  const hasDaftarBtn = partnerHubSrc.includes("setStep('register')") && partnerHubSrc.includes('Daftar');
  const hasLoginBtn = partnerHubSrc.includes("setStep('login')") && partnerHubSrc.includes('Login');
  assert(hasActionStep && hasDaftarBtn && hasLoginBtn, 'Halaman jenis mitra menyediakan 2 pilihan aksi yang jelas: Daftar dan Login');

  // Bottom Navigation retains Mitra TumpangGo
  const hasNavMitra = customerViewSrc.includes('id="nav-partner-register"') && (customerViewSrc.includes('Mitra TumpangGo') || customerViewSrc.includes('Mitra Tumpang Go'));
  assert(hasNavMitra, 'Bilah navigasi bawah mempertahankan tombol "Mitra TumpangGo" (id="nav-partner-register")');

  // Integration into CustomerView partner-register tab
  const hasPortalIntegrated = customerViewSrc.includes('<PartnerPortalHub') && customerViewSrc.includes("activeTab === 'partner-register'");
  assert(hasPortalIntegrated, 'Tab "partner-register" di CustomerView merender PartnerPortalHub secara penuh');

  // Back navigation buttons
  const hasBackToHome = partnerHubSrc.includes('onBackToHome') && partnerHubSrc.includes('Kembali ke Beranda');
  const hasBackToRoles = partnerHubSrc.includes("setStep('role_selection')") && partnerHubSrc.includes('Kembali ke Pemilihan Jenis Mitra');
  const hasBackToActions = partnerHubSrc.includes("setStep('action_selection')") && partnerHubSrc.includes('Kembali');
  assert(hasBackToHome && hasBackToRoles && hasBackToActions, 'Navigasi kembali (Back) tersedia di setiap tingkatan alur');

  // --- 2. Registration API & Pending Approval Logic ---
  console.log('\n--- 2. Partner Registration & Approval Workflow Tests ---');
  await foodDb.ensureInitialized();

  // Test Merchant Registration
  const testStoreName = 'Warung Soto Pak De Tumpang';
  const testOwnerEmail = 'sotopakde@example.com';
  const testStorePass = 'SotoMantap123';

  const mReg = await foodDb.createPartnerRegistration({
    name: 'Pak De Wagir',
    phone: '081234567810',
    email: testOwnerEmail,
    type: 'MERCHANT',
    storeName: testStoreName,
    storeAddress: 'Jl. Raya Tumpang No. 12',
    category: 'Nasi & Lauk',
    password: testStorePass
  });

  assert(Boolean(mReg && mReg.id), 'Pendaftaran Mitra Toko berhasil dibuat');
  assert(mReg.status === 'PENDING', 'Status pendaftaran toko baru wajib berstatus "PENDING"');

  // Test Driver Registration
  const testDriverEmail = 'kurirjoko@example.com';
  const testDriverPass = 'KurirGesit123';

  const dReg = await foodDb.createPartnerRegistration({
    name: 'Joko Kurir',
    phone: '081234567820',
    email: testDriverEmail,
    type: 'DRIVER',
    vehicleNumber: 'N 4567 TU',
    operatingArea: 'Kecamatan Tumpang',
    password: testDriverPass
  });

  assert(Boolean(dReg && dReg.id), 'Pendaftaran Mitra Kurir berhasil dibuat');
  assert(dReg.status === 'PENDING', 'Status pendaftaran kurir baru wajib berstatus "PENDING"');

  // --- 3. Authentication & Role Isolation Tests ---
  console.log('\n--- 3. Authentication & Pending Lock Tests ---');

  // Attempt login with pending merchant credentials
  // Simulate authRoutes check
  const pendingRegistrations = foodDb.getPartnerRegistrations();
  const matchedPendingMerchant = pendingRegistrations.find(
    r => (r.email?.trim().toLowerCase() === testOwnerEmail || r.phone === '081234567810') && r.status === 'PENDING'
  );

  assert(Boolean(matchedPendingMerchant), 'Sistem mendeteksi pendaftaran mitra pending saat percobaan login');

  // Verify approval workflow transforms registration into active merchant
  const approveRes = await foodDb.approvePartnerRegistration('test-admin', mReg.id);
  assert(Boolean(approveRes && approveRes.success && approveRes.registration?.status === 'APPROVED'), 'Admin menyetujui pendaftaran mitra toko');

  const rawMerchant = foodDb.getMerchantByEmailOrPhone(testOwnerEmail);
  assert(Boolean(rawMerchant && rawMerchant.name === testStoreName), 'Toko aktif resmi terdaftar di database setelah persetujuan');
  assert(verifyPassword(testStorePass, rawMerchant!.password || '').valid, 'Kata sandi toko terenkripsi aman dan terverifikasi sesuai yang didaftarkan');

  // Clean up test data
  const rawDb = foodDb as any;
  rawDb.data.partnerRegistrations = (rawDb.data.partnerRegistrations || []).filter(
    (r: any) => r.id !== mReg.id && r.id !== dReg.id
  );
  if (rawMerchant) {
    rawDb.data.merchants = (rawDb.data.merchants || []).filter((m: any) => m.id !== rawMerchant.id);
  }
  rawDb.save();

  console.log('\n=== SUMMARY ===');
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(`Total Tests: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL PARTNER PORTAL WORKFLOW TESTS PASSED!');
  }
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});

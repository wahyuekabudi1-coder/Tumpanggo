/**
 * Test Suite: Verifikasi Revisi Navigasi Menu Utama TumpangGo
 * 
 * Menguji:
 * 1. Halaman utama TumpangGo (Menu Utama) TIDAK merender 4 tombol navigasi bawah
 * 2. Layanan Tumpang Food MERENDER 4 tombol navigasi bawah:
 *    - 1. Beranda (menuju Beranda Food)
 *    - 2. Lacak Order (menuju tracking)
 *    - 3. Mitra TumpangGo (menuju partner-register)
 *    - 4. Bantuan (menuju help)
 * 3. Pemisahan layout bersih (kondisi isTumpangFoodFlow, bukan hanya sembunyikan CSS)
 * 4. Footer utama tetap utuh (Logo, Copyright, Sosial Media)
 * 5. Padding container adaptif (pb-3 saat di menu utama, pb-20 saat di Tumpang Food)
 * 6. Tidak ada duplikasi navigasi / tombol bantuan ganda yang menutupi konten
 */

import fs from 'fs';
import path from 'path';

let totalPass = 0;
let totalFail = 0;

function assert(condition: boolean, title: string, detail: string = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${title} ${detail ? `(${detail})` : ''}`);
    totalPass++;
  } else {
    console.error(`  ❌ [FAIL] ${title} ${detail ? `(${detail})` : ''}`);
    totalFail++;
  }
}

function runTests() {
  console.log('======================================================================');
  console.log('🚀 PENGUJIAN REVISI NAVIGASI MENU UTAMA TUMPANGGO');
  console.log('======================================================================\n');

  const customerViewPath = path.resolve(process.cwd(), 'src/components/CustomerView.tsx');
  assert(fs.existsSync(customerViewPath), 'File CustomerView.tsx tersedia');

  const code = fs.readFileSync(customerViewPath, 'utf-8');

  // --- 1. Audit Kondisi isTumpangFoodFlow ---
  console.log('\n📦 1. AUDIT PEMISAHAN LAYOUT LAYANAN TUMPANG FOOD');
  const hasFoodFlowDefinition = code.includes('const isTumpangFoodFlow =') &&
    code.includes("homeSubView === 'food'") &&
    code.includes("activeTab === 'merchant-detail'") &&
    code.includes("activeTab === 'cart'") &&
    code.includes("activeTab === 'checkout'") &&
    code.includes("activeTab === 'payment'");
  assert(hasFoodFlowDefinition, 'isTumpangFoodFlow mengidentifikasi alur layanan Tumpang Food secara akurat');

  // --- 2. Audit Navigasi Bawah Tidak Dirender di Menu Utama ---
  console.log('\n📦 2. AUDIT NAVIGASI BAWAH PADA HALAMAN UTAMA');
  const hasConditionalNav = code.includes('{isTumpangFoodFlow && (') && code.includes('id="tumpang-food-bottom-nav"');
  assert(hasConditionalNav, 'Bilah navigasi bawah dibungkus kondisi isTumpangFoodFlow (tidak dirender di menu utama)');

  // Verifikasi bahwa menu utama tidak menampilkan 4 tombol navigasi
  // Di menu utama: homeSubView === 'main' && activeTab === 'home' => isTumpangFoodFlow === false => nav TIDAK dirender!
  const isNavHiddenOnMainMenu = !code.includes('<nav className="fixed bottom-0') || code.includes('{isTumpangFoodFlow && (');
  assert(isNavHiddenOnMainMenu, 'Navigasi 4 tombol tidak dirender secara global di seluruh aplikasi');

  // --- 3. Audit 4 Tombol Navigasi Layanan Tumpang Food ---
  console.log('\n📦 3. AUDIT 4 TOMBOL NAVIGASI PADA LAYANAN TUMPANG FOOD');
  const hasNavHome = code.includes('id="nav-home"') && code.includes('Beranda');
  assert(hasNavHome, 'Tombol 1: Beranda tersedia dengan target Beranda Food');

  const hasNavTracking = code.includes('id="nav-track-order"') && code.includes('Lacak Order');
  assert(hasNavTracking, 'Tombol 2: Lacak Order tersedia dengan target tracking');

  const hasNavPartner = code.includes('id="nav-partner-register"') && (code.includes('Mitra tumpangGo') || code.includes('Mitra TumpangGo'));
  assert(hasNavPartner, 'Tombol 3: Mitra tumpangGo tersedia dengan target partner-register');

  const hasNavHelp = code.includes('id="nav-help-center"') && code.includes('Bantuan');
  assert(hasNavHelp, 'Tombol 4: Bantuan tersedia dengan target help');

  // --- 4. Audit Aksi dan Target Tombol Navigasi ---
  console.log('\n📦 4. AUDIT AKSI PERPINDAHAN MENU & TARGET');
  const homeBtnCorrect = code.includes("setHomeSubView('food')") && code.includes("setActiveTab('home')");
  assert(homeBtnCorrect, 'Tombol Beranda mengarahkan ke Beranda Tumpang Food');

  const trackingBtnCorrect = code.includes("setActiveTab('tracking')");
  assert(trackingBtnCorrect, 'Tombol Lacak Order mengarahkan ke halaman pelacakan pesanan');

  const partnerBtnCorrect = code.includes("setActiveTab('partner-register')");
  assert(partnerBtnCorrect, 'Tombol Mitra TumpangGo mengarahkan ke portal mitra');

  const helpBtnCorrect = code.includes("setActiveTab('help')");
  assert(helpBtnCorrect, 'Tombol Bantuan mengarahkan ke pusat bantuan');

  // --- 5. Audit Padding Container Adaptif ---
  console.log('\n📦 5. AUDIT PADDING KONTAINER UTAMA');
  const hasAdaptivePadding = code.includes("isTumpangFoodFlow ? 'pb-20' : 'pb-3'");
  assert(hasAdaptivePadding, 'Padding bawah kontainer adaptif (pb-3 di menu utama, pb-20 di Tumpang Food)');

  // --- 6. Audit Footer Utama Tetap Utuh ---
  console.log('\n📦 6. AUDIT INTEGRITAS FOOTER UTAMA');
  const hasLogoInFooter = code.includes('<Logo size={96} />');
  assert(hasLogoInFooter, 'Logo TumpangGo tetap tampil di footer');

  const hasCopyright = code.includes('© 2026 tumpangGo. All rights reserved.') || code.includes('© 2026 TumpangGo. All rights reserved.');
  assert(hasCopyright, 'Copyright tumpangGo tetap tampil di footer');

  const hasSocialButtons = code.includes('<SocialMediaButtons');
  assert(hasSocialButtons, 'Ikon media sosial tetap tampil di footer');

  const hasFooterRender = code.includes('renderFooter()');
  assert(hasFooterRender, 'Fungsi renderFooter() tetap dipanggil pada layout halaman utama');

  // --- 7. Audit Pencegahan Duplikasi Navigasi & Tumpukan Elemen ---
  console.log('\n📦 7. AUDIT PENCEGAHAN ELEMEN GANDA');
  const noDuplicateHelpWhenFood = code.includes('!isTumpangFoodFlow && activeTab !== \'help\'');
  assert(noDuplicateHelpWhenFood, 'Tombol bantuan mengambang tidak bertumpuk ganda dengan navigasi Tumpang Food');

  console.log('\n======================================================================');
  console.log(`🏁 HASIL VERIFIKASI: ${totalPass} PASS, ${totalFail} FAIL (Total: ${totalPass + totalFail})`);
  console.log('======================================================================');

  if (totalFail > 0) {
    process.exit(1);
  }
}

runTests();

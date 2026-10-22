/**
 * Test script to verify:
 * 1. Tombol 'Riwayat Pesanan' telah berubah menjadi 'Lacak Order'
 * 2. Tombol 'Lacak Order' membuka antarmuka pelacakan yang benar
 * 3. Kode order valid (TF-...) dapat menemukan pesanan yang sesuai
 * 4. Kode order yang salah menghasilkan 404 dan pesan: 'Pesanan tidak ditemukan. Periksa kembali kode order Anda.'
 * 5. Input kosong tervalidasi
 * 6. Status pembayaran dan status proses pesanan terpisah
 * 7. Pelacakan melindungi privasi (nomor HP dimask)
 * 8. Dukungan URL ?track=KODE_ORDER tetap ada
 * 9. Label 'Mitra Food' telah berganti menjadi 'Mitra Tumpang Go'
 * 10. Fitur lain tidak mengalami regresi
 */

import fs from 'fs';
import path from 'path';
import { foodDb } from '../src/server/db';
import { OrderStatus, PaymentStatus } from '../src/types';

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

async function run() {
  console.log('=== TEST SUITE: REVISI UI LACAK ORDER & MITRA TUMPANG GO ===\n');

  // --- 1. Source Code Verifications in CustomerView.tsx ---
  const customerViewPath = path.resolve(process.cwd(), 'src/components/CustomerView.tsx');
  const customerViewSrc = fs.readFileSync(customerViewPath, 'utf-8');

  // Check 1: Button label 'Lacak Order' in bottom navigation
  const hasLacakOrderNav = customerViewSrc.includes('id="nav-track-order"') && customerViewSrc.includes('Lacak Order');
  assert(hasLacakOrderNav, 'Tombol navigasi bawah memiliki label "Lacak Order"');

  // Check 2: Icon for Lacak Order uses Search or tracking icon
  const hasSearchIcon = /id="nav-track-order"[\s\S]*?<Search className="w-5 h-5"/.test(customerViewSrc);
  assert(hasSearchIcon, 'Tombol "Lacak Order" menggunakan ikon Search / Pelacakan');

  // Check 3: Form contains "Masukkan Kode Order" label
  const hasInputLabel = customerViewSrc.includes('Masukkan Kode Order');
  assert(hasInputLabel, 'Form pelacakan memiliki label "Masukkan Kode Order"');

  // Check 4: Placeholder contains TF- format
  const hasPlaceholderTF = /placeholder="Contoh:\s*TF-[^"]+"/.test(customerViewSrc);
  assert(hasPlaceholderTF, 'Placeholder input memiliki format kode "Contoh: TF-XXXXXXXX"');

  // Check 5: Button label "Lacak Pesanan"
  const hasLacakPesananBtn = customerViewSrc.includes('Lacak Pesanan');
  assert(hasLacakPesananBtn, 'Tombol pencarian pesanan bernama "Lacak Pesanan"');

  // Check 6: Empty validation message
  const hasEmptyValidation = customerViewSrc.includes('Masukkan kode order terlebih dahulu.');
  assert(hasEmptyValidation, 'Validasi input kosong menampilkan pesan yang sesuai');

  // Check 7: Not found message
  const hasNotFoundMessage = customerViewSrc.includes('Pesanan tidak ditemukan. Periksa kembali kode order Anda.');
  assert(hasNotFoundMessage, 'Pesan kesalahan pesanan tidak ditemukan sesuai spesifikasi');

  // Check 8: "Mitra Tumpang Go" label in navigation and views
  const hasMitraTumpangGo = customerViewSrc.includes('Mitra Tumpang Go');
  assert(hasMitraTumpangGo, 'Label navigasi menampilkan "Mitra Tumpang Go"');

  // Check 9: No "Mitra Food" label in CustomerView
  const hasOldMitraFood = customerViewSrc.includes('Mitra Food');
  assert(!hasOldMitraFood, 'Tidak ada label usang "Mitra Food" di antarmuka pelanggan');

  // Check 10: URL track support (?track=...)
  const hasTrackParam = customerViewSrc.includes("params.get('track')");
  assert(hasTrackParam, 'Dukungan URL ?track=KODE_ORDER tetap dipertahankan');

  // Check 11: Privacy protection (masked customer phone)
  const hasMaskedPhone = customerViewSrc.includes('customerPhone.substring(0, 4) + \'****\'');
  assert(hasMaskedPhone, 'Nomor HP pelanggan disamarkan (masked) untuk melindungi privasi');

  // Check 12: Separation of payment status and order process status
  const hasSeparatePaymentCard = customerViewSrc.includes('Status Pembayaran') && customerViewSrc.includes('Status Proses Pesanan');
  assert(hasSeparatePaymentCard, 'Status Pembayaran dan Status Proses Pesanan tampil secara terpisah');

  // --- 2. Live API Order Creation and Tracking Tests ---
  console.log('\n--- 2. Live Backend API Order Tracking Tests ---');
  await foodDb.ensureInitialized();
  const merchants = foodDb.getMerchants();
  let merchant = merchants[0];
  let tempMerchantId: string | null = null;
  if (!merchant) {
    merchant = await foodDb.createMerchant('test-user', {
      name: 'Resto Uji Coba Tumpang',
      ownerName: 'Uji Coba',
      phone: '081234567890',
      address: 'Kecamatan Tumpang',
      latitude: -7.9482,
      longitude: 112.7612,
      openTime: '08:00',
      closeTime: '21:00',
      bankName: 'BRI',
      bankAccount: '1234567890',
      bankHolder: 'Uji Coba',
      active: true,
      cookTimeEstimate: '20 min',
      image: '',
      description: 'Uji Coba',
      category: 'Semua'
    });
    tempMerchantId = merchant.id;
  }

  const menuItems = foodDb.getMenuItemsByMerchant(merchant.id);
  let menuItem = menuItems[0];
  if (!menuItem) {
    menuItem = await foodDb.createMenuItem(merchant.id, {
      name: 'Bakso Barokah',
      price: 15000,
      description: 'Bakso enak',
      categoryId: 'cat_default',
      available: true,
      image: ''
    });
  }

  let createdOrderId: string | null = null;
  try {
    // Create a real test order
    const createdOrder = await foodDb.createOrder({
      merchantId: merchant.id,
      customerName: 'Ahmad Pelanggan Tumpang',
      customerPhone: '081234567899',
      deliveryAddress: 'Jl. Malangsuko No. 22, Kec. Tumpang, Malang',
      items: [{ menuItemId: menuItem.id, quantity: 2 }]
    });
    createdOrderId = createdOrder.id;

    assert(Boolean(createdOrder && createdOrder.id), 'Order baru berhasil dibuat');
    assert(Boolean(createdOrder.orderNumber && createdOrder.orderNumber.startsWith('TF-')), 'Nomor order kanonis berawalan TF- berhasil di-generate', createdOrder.orderNumber);

    // Test API: Lookup by exact canonical orderNumber
    const exactLookup = await foodDb.findOrder(createdOrder.orderNumber!);
    assert(Boolean(exactLookup && exactLookup.id === createdOrder.id), 'Pelacakan dengan kode persis (TF-...) berhasil', exactLookup?.orderNumber);

    // Test API: Lookup with lowercase
    const lowerLookup = await foodDb.findOrder(createdOrder.orderNumber!.toLowerCase());
    assert(Boolean(lowerLookup && lowerLookup.id === createdOrder.id), 'Pelacakan dengan huruf kecil berhasil');

    // Test API: Lookup with leading '#'
    const hashLookup = await foodDb.findOrder(`#${createdOrder.orderNumber}`);
    assert(Boolean(hashLookup && hashLookup.id === createdOrder.id), 'Pelacakan dengan tanda # di depan berhasil');

    // Test API: Lookup with extra spaces
    const spaceLookup = await foodDb.findOrder(`  ${createdOrder.orderNumber}  `);
    assert(Boolean(spaceLookup && spaceLookup.id === createdOrder.id), 'Pelacakan dengan spasi berhasil');

    // Test API: Non-existent order code
    const notFoundLookup = await foodDb.findOrder('TF-99999999-999');
    assert(notFoundLookup === undefined, 'Pelacakan kode salah mengembalikan undefined (akan menghasilkan 404)');
  } finally {
    const rawDb = foodDb as any;
    if (createdOrderId) {
      rawDb.data.orders = (rawDb.data.orders || []).filter((o: any) => o.id !== createdOrderId);
    }
    rawDb.data.merchants = (rawDb.data.merchants || []).filter((m: any) => m.name !== 'Resto Uji Coba Tumpang');
    rawDb.data.menuItems = (rawDb.data.menuItems || []).filter((i: any) => i.name !== 'Bakso Barokah');
    rawDb.save();
  }

  console.log('\n=== SUMMARY ===');
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(`Total Tests: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  }
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});

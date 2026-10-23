/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * End-to-End Automated Verification for Merchant Management & Safety Lifecycle
 */

import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import { OrderStatus, PaymentStatus } from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string, errDetail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${desc}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${desc} ${errDetail ? `-> ${errDetail}` : ''}`);
  }
}

async function runVerification() {
  console.log('\n======================================================');
  console.log('🚀 TESTING MANAJEMEN MERCHANT & TRANSACTION SAFETY LIFECYCLE');
  console.log('======================================================\n');

  await foodDb.ensureInitialized();

  // --- 1. VERIFY SYSTEM CONFIGS INTACT ---
  console.log('--- STEP 1: VERIFY SYSTEM CONFIGURATIONS & MASTER ACCOUNT ---');
  const initialConfig = foodDb.getConfig();
  assert(initialConfig.defaultDeliveryFee === 5000, 'Ongkir flat Tumpang Rp 5.000 terjaga');
  assert(initialConfig.serviceFee === 2000, 'Biaya layanan dasar Rp 2.000 terjaga');
  assert(initialConfig.commissionPercent === 10, 'Komisi platform 10% terjaga');
  assert(foodConfig.masterAccount.email === 'tumpanggo@gmail.com', 'Akun Master Admin tumpanggo@gmail.com terjaga');

  // --- 2. VALIDATION HANDLING ON CREATE ---
  console.log('\n--- STEP 2: VALIDATION ON CREATING MERCHANT ---');
  let validationCaught = false;
  try {
    await foodDb.createMerchant('admin', { name: '', ownerName: 'Budi' });
  } catch (e: any) {
    validationCaught = true;
    assert(e.message.includes('Nama toko') || e.message.includes('wajib'), 'Validasi field kosong ditolak dengan aman');
  }
  assert(validationCaught, 'Pendaftaran tanpa nama toko berhasil dicegah');

  // Clean any prior test merchants
  (foodDb as any).data.merchants = (foodDb as any).data.merchants.filter((m: any) => !m.email?.includes('bakso.remaja'));
  (foodDb as any).save();

  // --- 3. CREATE NEW REAL MERCHANT ---
  console.log('\n--- STEP 3: CREATE NEW REAL MERCHANT ---');
  const testStoreName = 'Warung Bakso Remaja Asli Tumpang';
  const newMerchant = await foodDb.createMerchant('admin', {
    name: testStoreName,
    ownerName: 'Budi Santoso',
    phone: '081234567890',
    email: `bakso.remaja.${Date.now()}@tumpang.id`,
    address: 'Jl. Pandanajeng No. 12, Kec. Tumpang, Malang',
    category: 'Aneka Mie & Bakso',
    openTime: '09:00',
    closeTime: '21:00',
    cookTimeEstimate: '10-20 min',
    bankName: 'Bank BRI',
    bankAccount: '123401009876543',
    bankHolder: 'Budi Santoso',
    active: true,
    description: 'Bakso urat dan tetelan sapi asli khas Tumpang'
  });

  assert(Boolean(newMerchant.id), `Merchant berhasil dibuat dengan ID: ${newMerchant.id}`);
  assert(newMerchant.name === testStoreName, 'Nama merchant tersimpan sesuai input');
  assert(newMerchant.rating === 5.0, 'Rating awal 5.0 tersetting otomatis');

  // Verify appears in list
  const allMerchants = foodDb.getMerchants();
  const found = allMerchants.find(m => m.id === newMerchant.id);
  assert(Boolean(found), 'Merchant baru langsung muncul di getMerchants()');
  assert(found?.ownerName === 'Budi Santoso', 'Data pemilik terdaftar tepat');

  // --- 4. UPDATE MERCHANT ---
  console.log('\n--- STEP 4: UPDATE MERCHANT DATA ---');
  const updatedAddress = 'Jl. Pandanajeng No. 88 (Ruko Baru), Kec. Tumpang';
  const updated = await foodDb.updateMerchant('admin', newMerchant.id, {
    address: updatedAddress,
    cookTimeEstimate: '15-25 min',
    phone: '081299887766'
  }, 'ADMIN');

  assert(updated.address === updatedAddress, 'Alamat merchant berhasil diperbarui');
  assert(updated.phone === '081299887766', 'Nomor telepon berhasil diperbarui');
  const verifyUpdated = foodDb.getMerchantById(newMerchant.id);
  assert(verifyUpdated?.address === updatedAddress, 'Pembaruan tersimpan persisten di database');

  // --- 5. MENU MANAGEMENT ---
  console.log('\n--- STEP 5: MANAJEMEN MENU MAKANAN TOKO ---');
  const categories = foodDb.getCategories(newMerchant.id);
  assert(categories.length > 0, `Kategori awal tersedia: ${categories[0]?.name}`);
  const catId = categories[0].id;

  const menuItem1 = await foodDb.createMenuItem(newMerchant.id, {
    categoryId: catId,
    category: categories[0].name,
    name: 'Bakso Campur Urat Tetelan',
    description: 'Bakso halus, bakso urat, pangsit goreng, dan tetelan',
    price: 18000,
    available: true,
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400'
  });

  assert(Boolean(menuItem1.id), `Menu item berhasil ditambahkan ID: ${menuItem1.id}`);
  const menusAfterAdd = foodDb.getMenuItemsByMerchant(newMerchant.id);
  assert(menusAfterAdd.length === 1, 'Katalog menu bertambah menjadi 1 item');
  assert(menusAfterAdd[0].price === 18000, 'Harga menu tertera Rp 18.000');

  // Update menu item
  const updatedMenu = await foodDb.updateMenuItem(newMerchant.id, menuItem1.id, {
    price: 20000,
    available: false
  });
  assert(updatedMenu.price === 20000, 'Harga menu berhasil diupdate ke Rp 20.000');
  assert(updatedMenu.available === false, 'Ketersediaan menu diubah menjadi Habis (false)');

  // Check merchant menuCount
  const merchantWithMenuCount = foodDb.getMerchantById(newMerchant.id);
  assert(merchantWithMenuCount?.menuCount === 1, 'menuCount merchant terhitung tepat 1');

  // --- 6. SAFETY GUARD: PREVENT DELETION WITH HISTORICAL TRANSACTIONS ---
  console.log('\n--- STEP 6: TRANSACTION SAFETY GUARD ON DELETION ---');
  // Re-enable availability so order can be placed
  await foodDb.updateMenuItem(newMerchant.id, menuItem1.id, {
    available: true
  });

  // Create an order for this merchant
  const mockOrder = await foodDb.createOrder({
    orderNumber: 'TGO-TEST-' + Math.floor(1000 + Math.random() * 9000),
    merchantId: newMerchant.id,
    merchantName: newMerchant.name,
    customerName: 'Ahmad Pelanggan',
    customerPhone: '0855667788',
    deliveryAddress: 'Jl. Malangsuko RT 02 RW 01, Tumpang',
    latitude: -7.9942,
    longitude: 112.7667,
    items: [{
      menuItemId: menuItem1.id,
      name: menuItem1.name,
      price: 20000,
      quantity: 2
    }],
    subtotal: 40000,
    deliveryFee: 5000,
    serviceFee: 2000,
    total: 47000,
    status: OrderStatus.COMPLETED,
    paymentStatus: PaymentStatus.PAID
  });

  assert(Boolean(mockOrder.id), `Pesanan historis berhasil tercatat untuk toko ID: ${mockOrder.id}`);

  // Attempt to delete merchant with historical transaction -> MUST BE REJECTED
  let deleteBlocked = false;
  let blockReason = '';
  try {
    await foodDb.deleteMerchant('admin', newMerchant.id);
  } catch (err: any) {
    deleteBlocked = true;
    blockReason = err.message;
  }

  assert(deleteBlocked, 'Penghapusan merchant dengan riwayat transaksi BERHASIL DIBLOKIR');
  assert(
    blockReason.toLowerCase().includes('pesanan') && blockReason.toLowerCase().includes('nonaktif'),
    `Pesan penolakan jelas: "${blockReason}"`
  );

  // Verify merchant still exists in DB
  const stillExists = foodDb.getMerchantById(newMerchant.id);
  assert(Boolean(stillExists), 'Merchant tetap utuh di database setelah proteksi berjalan');

  // Deactivate merchant instead (safe alternative)
  const deactivated = await foodDb.updateMerchant('admin', newMerchant.id, { active: false }, 'ADMIN');
  assert(deactivated.active === false, 'Penonaktifan merchant berhasil (status Nonaktif)');
  const checkDeactivated = foodDb.getMerchantById(newMerchant.id);
  assert(checkDeactivated?.active === false, 'Status Nonaktif tersimpan persisten');

  // --- 7. CLEAN DELETION FOR NEW UNUSED MERCHANT ---
  console.log('\n--- STEP 7: PERMANENT DELETION FOR STORE WITHOUT TRANSACTIONS ---');
  const tempMerchant = await foodDb.createMerchant('admin', {
    name: 'Toko Sementara Tanpa Transaksi',
    ownerName: 'Tester',
    phone: '089999999999',
    address: 'Jl. Tes Tumpang',
    active: true
  });

  assert(Boolean(tempMerchant.id), 'Toko sementara tanpa transaksi berhasil dibuat');
  const tempDeleted = await foodDb.deleteMerchant('admin', tempMerchant.id);
  assert(tempDeleted === true, 'Toko tanpa transaksi berhasil dihapus permanen');
  const verifyTempDeleted = foodDb.getMerchantById(tempMerchant.id);
  assert(verifyTempDeleted === undefined, 'Toko sementara benar-benar terhapus dari database');

  // Cleanup test order and test merchant for clean state
  (foodDb as any).data.orders = (foodDb as any).data.orders.filter((o: any) => o.id !== mockOrder.id);
  (foodDb as any).data.menuItems = (foodDb as any).data.menuItems.filter((i: any) => i.merchantId !== newMerchant.id);
  (foodDb as any).data.categories = (foodDb as any).data.categories.filter((c: any) => c.merchantId !== newMerchant.id);
  (foodDb as any).data.merchants = (foodDb as any).data.merchants.filter((m: any) => m.id !== newMerchant.id);
  (foodDb as any).save();

  console.log('\n======================================================');
  console.log(`📊 HASIL VERIFIKASI: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});

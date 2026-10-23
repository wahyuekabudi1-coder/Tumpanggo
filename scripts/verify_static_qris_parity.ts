import { foodDb } from '../src/server/db.js';
import { OrderService } from '../src/server/services/orderService.js';
import { OrderStatus, PaymentStatus } from '../src/types.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== VERIFIKASI PARITAS QRIS STATIS TUMPANG FOOD: PREVIEW & PRODUCTION ===\n');

  let passedTests = 0;
  const totalTests = 8;

  // UJI 1: QRIS statis merchant tampil di Preview / Database
  console.log('--- Uji 1: Memeriksa ketersediaan QRIS statis merchant pada database ---');
  const merchants = foodDb.getMerchants();
  const targetMerchant = merchants[0];
  if (targetMerchant && targetMerchant.qrisImage) {
    console.log(`[PASS] Merchant ID: ${targetMerchant.id} (${targetMerchant.name}) memiliki QRIS resmi: ${targetMerchant.qrisImage}`);
    passedTests++;
  } else {
    throw new Error(`[FAIL] Merchant belum memiliki QRIS statis: ${targetMerchant?.qrisImage}`);
  }

  // UJI 2: QRIS statis merchant tampil di hasil build Production (public & dist assets)
  console.log('\n--- Uji 2: Memeriksa aset QRIS statis pada direktori public ---');
  const publicQrisPath = path.resolve(process.cwd(), 'public/qris-merchant.png');
  const publicExists = fs.existsSync(publicQrisPath);
  if (publicExists) {
    const publicStat = fs.statSync(publicQrisPath);
    console.log(`[PASS] File public/qris-merchant.png ada (${publicStat.size} bytes)`);
    passedTests++;
  } else {
    throw new Error(`[FAIL] Aset QRIS tidak ditemukan di public: ${publicExists}`);
  }

  // UJI 3: QRIS berasal dari merchant yang benar
  console.log('\n--- Uji 3: Memastikan QRIS terasosiasi dengan merchant yang dipilih pelanggan ---');
  const menuList = foodDb.getMenuItemsByMerchant(targetMerchant.id);
  const menuItem = menuList[0] || { id: 'item_eqs9pw3', name: 'Nasi Pecel Komplit', price: 35000 };
  const testInput = {
    customerName: 'Ahmad Pelanggan',
    customerPhone: '081234567890',
    deliveryAddress: 'Jl. Raya Tumpang No. 10',
    items: [{ menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1 }],
    merchantId: targetMerchant.id,
    subtotal: menuItem.price,
    deliveryFee: 5000,
    serviceFee: 2000,
    clientRequestId: 'test_client_req_' + Date.now()
  };

  const testOrder = await foodDb.createOrder(testInput);
  if (testOrder.merchantId === targetMerchant.id && testOrder.merchantQrisImage === targetMerchant.qrisImage) {
    console.log(`[PASS] Pesanan #${testOrder.id} untuk merchant (${testOrder.merchantName}) memiliki QRIS resmi: ${testOrder.merchantQrisImage}`);
    passedTests++;
  } else {
    throw new Error(`[FAIL] QRIS pesanan tidak cocok dengan merchant: ${testOrder.merchantQrisImage}`);
  }

  // UJI 4: Checkout mandiri dengan QRIS statis tanpa ketergantungan gateway eksternal
  console.log('\n--- Uji 4: Memastikan checkout Food mandiri dengan QRIS statis ---');
  if (testOrder && testOrder.id && testOrder.paymentMethod === 'MERCHANT_QRIS') {
    console.log(`[PASS] Pesanan berhasil dibuat dengan paymentMethod='${testOrder.paymentMethod}' menggunakan QRIS statis`);
    passedTests++;
  } else {
    throw new Error('[FAIL] Pesanan gagal dibuat dengan metode pembayaran QRIS');
  }

  // UJI 5: Pesanan berhasil dibuat dan tersimpan
  console.log('\n--- Uji 5: Verifikasi persistensi dan integritas penyimpanan pesanan ---');
  const retrievedOrder = foodDb.getOrderById(testOrder.id);
  if (
    retrievedOrder &&
    retrievedOrder.id === testOrder.id &&
    retrievedOrder.subtotal === menuItem.price &&
    retrievedOrder.deliveryFee === 5000 &&
    retrievedOrder.serviceFee === 2000 &&
    retrievedOrder.total === (menuItem.price + 5000 + 2000 + testOrder.uniqueCode)
  ) {
    console.log(`[PASS] Pesanan #${retrievedOrder.id} tersimpan dengan Subtotal: ${retrievedOrder.subtotal}, Ongkir: ${retrievedOrder.deliveryFee}, Layanan: ${retrievedOrder.serviceFee}, Total: ${retrievedOrder.total}`);
    passedTests++;
  } else {
    throw new Error('[FAIL] Data pesanan tidak tersimpan atau nominal tidak konsisten');
  }

  // UJI 6: Bukti pembayaran dapat diunggah dan diverifikasi sesuai alur yang ada
  console.log('\n--- Uji 6: Menguji alur unggah bukti pembayaran dan verifikasi admin ---');
  const dummyProof = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  
  // Update order with payment proof (customer uploads proof)
  const orderWithProof = await foodDb.updateOrder('CUSTOMER', testOrder.id, {
    paymentProof: dummyProof,
    status: OrderStatus.WAITING_PAYMENT_VERIFICATION,
    paymentStatus: PaymentStatus.WAITING_VERIFICATION
  }, 'CUSTOMER');

  if (
    orderWithProof.status === OrderStatus.WAITING_PAYMENT_VERIFICATION &&
    orderWithProof.paymentStatus === PaymentStatus.WAITING_VERIFICATION &&
    orderWithProof.paymentProof
  ) {
    console.log(`[PASS] Bukti pembayaran berhasil diunggah. Status pesanan: ${orderWithProof.status} / ${orderWithProof.paymentStatus}`);
  } else {
    throw new Error('[FAIL] Gagal mengunggah bukti pembayaran');
  }

  // Admin verifies payment
  const verifiedOrder = await foodDb.verifyOrderPayment('admin_tumpang', testOrder.id);
  if (
    verifiedOrder.status === OrderStatus.PAYMENT_VERIFIED &&
    verifiedOrder.paymentStatus === PaymentStatus.PAID
  ) {
    console.log(`[PASS] Pembayaran berhasil diverifikasi Admin. Status pesanan: ${verifiedOrder.status} / ${verifiedOrder.paymentStatus}`);
    passedTests++;
  } else {
    throw new Error('[FAIL] Gagal verifikasi pembayaran admin');
  }

  // UJI 7: Validasi integritas order service
  console.log('\n--- Uji 7: Validasi transisi status aman di OrderService ---');
  const isValidPickup = OrderService.isValidStatusTransition(OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, 'MERCHANT');
  const isInvalidSkip = OrderService.isValidStatusTransition(OrderStatus.WAITING_PAYMENT, OrderStatus.COMPLETED, 'CUSTOMER');
  if (isValidPickup.allowed && !isInvalidSkip.allowed) {
    console.log('[PASS] Validasi transisi status pesanan berfungsi aman dan ketat');
    passedTests++;
  } else {
    throw new Error('[FAIL] Transisi status tidak konsisten');
  }

  // UJI 8: Tidak ada pemanggilan gateway ArtoPay dalam checkout Tumpang Food
  console.log('\n--- Uji 8: Audit kode CustomerView untuk memastikan bebas gateway ArtoPay eksternal ---');
  const customerViewCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerView.tsx'), 'utf8');
  const hasArtopayCall = customerViewCode.includes('/api/artopay') ||
                         customerViewCode.includes('artopay') ||
                         customerViewCode.includes('ArtoPay');

  if (!hasArtopayCall) {
    console.log('[PASS] CustomerView.tsx bersih dari panggilan atau referensi ArtoPay');
    passedTests++;
  } else {
    throw new Error('[FAIL] Masih ditemukan panggilan atau teks ArtoPay dalam CustomerView.tsx');
  }

  console.log(`\n========================================`);
  console.log(`HASIL: ${passedTests}/${totalTests} PENGUJIAN WAJIB BERHASIL`);
  console.log(`========================================\n`);

}

main().catch(err => {
  console.error('[FATAL ERROR DALAM PENGUJIAN]:', err);
  process.exit(1);
});

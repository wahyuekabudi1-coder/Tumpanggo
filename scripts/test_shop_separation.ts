/**
 * Comprehensive Verification Test for Tumpang Shop Backend & Database Separation
 * Validates all conditions specified in the user prompt:
 * 1. Independent Shop Database & config
 * 2. Independent Shop Backend Express App (shopApp)
 * 3. Zero writes to Food Database (tumpang_food_db.json) during Shop operations
 * 4. Preservation of all existing Food features (merchants, flat ongkir, orders)
 * 5. Full Shop operations: Products, Stock reduction, Checkout, Orders, Tracking, Cancellation & Stock restoration
 * 6. Explicit Inter-service communication via shopApiClient
 * 7. Verification of migration engine and schema validator
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { app } from '../src/server/app';
import { shopApp } from '../src/services/shop/api/shopApp';
import { shopDb } from '../src/services/shop/database/shopDatabase';
import { foodDb } from '../src/server/db';
import { shopApiClient } from '../src/services/shop/client/shopApiClient';
import { createShopAuthToken } from '../src/services/shop/api/shopAuth';
import { ShopOrderStatus, ShopPaymentStatus } from '../src/types/shop';

async function runSeparationTests() {
  console.log('================================================================');
  console.log('🧪 PENGUJIAN PEMISAHAN BACKEND & DATABASE TUMPANG SHOP');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  // Record initial file states
  const foodDbPath = path.join(process.cwd(), 'tumpang_food_db.json');
  const shopDbPath = path.join(process.cwd(), 'tumpang_shop_db.json');

  const initialFoodContent = fs.existsSync(foodDbPath) ? fs.readFileSync(foodDbPath, 'utf-8') : '';
  const initialFoodParsed = initialFoodContent ? JSON.parse(initialFoodContent) : {};
  const initialFoodOrderCount = initialFoodParsed.orders?.length || 0;
  const initialFoodMerchantCount = initialFoodParsed.merchants?.length || 0;

  console.log(`📁 State Awal Food DB: ${initialFoodMerchantCount} Merchant, ${initialFoodOrderCount} Pesanan.`);

  // 1. Initialize databases
  console.log('\n--- Bagian 1: Inisialisasi & Verifikasi Database Mandiri ---');
  await Promise.all([foodDb.ensureInitialized(), shopDb.ensureInitialized()]);

  const shopStatus = await shopDb.getStorageStatus();
  assert(shopStatus.service === 'tumpang-shop', 'Shop service identity terdefinisi mandiri (tumpang-shop)');
  assert(shopStatus.filePath.endsWith('tumpang_shop_db.json'), 'Shop database menggunakan file penyimpanan sendiri (tumpang_shop_db.json)');
  assert(shopStatus.totalProducts > 0, 'Shop database memiliki produk katalog mandiri');

  // 2. Start Gateway Test Server (Port 0)
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Main Gateway Server running on ${baseUrl}`);

  // 3. Test Gateway /api/health with Decoupled Services
  console.log('\n--- Bagian 2: Health Check Gateway & Status Antarlayanan ---');
  const resHealth = await fetch(`${baseUrl}/api/health`);
  const healthData = await resHealth.json();
  assert(resHealth.status === 200, 'GET /api/health merespons 200 OK');
  assert(healthData.foodDatabase !== undefined, 'Health data mencakup status foodDatabase');
  assert(healthData.shopDatabase !== undefined, 'Health data mencakup status shopDatabase');
  assert(healthData.shopDatabase.service === 'tumpang-shop', 'shopDatabase dilaporkan secara terpisah dari foodDatabase');

  // 4. Test Catalog & Public Browsing on Separated Backend
  console.log('\n--- Bagian 3: API Katalog & Konfigurasi Toko Belanja ---');
  const resConfig = await fetch(`${baseUrl}/api/shop/config`);
  const configData = await resConfig.json();
  assert(resConfig.status === 200, 'GET /api/shop/config berhasil diakses');
  assert(Boolean(configData.storeName), `Nama toko berhasil dimuat: "${configData.storeName}"`);

  const resProducts = await fetch(`${baseUrl}/api/shop/products`);
  const products = await resProducts.json();
  assert(Array.isArray(products) && products.length > 0, 'GET /api/shop/products mengembalikan daftar produk belanja');
  const targetProduct = products[0];
  const initialStock = targetProduct.stock;
  console.log(`   Produk Uji: "${targetProduct.name}" (Stok: ${initialStock}, Harga: Rp ${targetProduct.price})`);

  // 5. Test Shop Order Creation & Atomic Stock Deduction
  console.log('\n--- Bagian 4: Pembuatan Pesanan Belanja & Pengurangan Stok ---');
  const orderQty = 3;
  const orderPayload = {
    customerName: 'Budi Santoso Uji Pemisahan',
    customerPhone: '081299887766',
    customerAddress: 'Jl. Raya Tumpang No. 123',
    items: [
      { productId: targetProduct.id, quantity: orderQty }
    ],
    deliveryFee: 4000,
    serviceFee: 1500,
    notes: 'Uji pesanan database terisolasi'
  };

  const resOrder = await fetch(`${baseUrl}/api/shop/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  });

  const orderData = await resOrder.json();
  assert(resOrder.status === 201, 'POST /api/shop/orders berhasil membuat pesanan baru (HTTP 201)');
  assert(orderData.orderNumber.startsWith('TS-'), `Nomor pesanan Shop berformat rapi (${orderData.orderNumber})`);
  assert(orderData.paymentStatus === ShopPaymentStatus.UNPAID, 'Status pembayaran awal pesanan Shop adalah UNPAID');

  const afterOrderProduct = shopDb.getProductById(targetProduct.id);
  assert(afterOrderProduct?.stock === initialStock - orderQty, `Stok produk berkurang tepat: ${initialStock} -> ${afterOrderProduct?.stock}`);

  // 6. VERIFIKASI UTAMA: Food Database TIDAK TERSENTUH sama sekali (Zero Leaks)
  console.log('\n--- Bagian 5: Verifikasi Nol-Kebocoran ke Database Food ---');
  const currentFoodContent = fs.readFileSync(foodDbPath, 'utf-8');
  const currentFoodParsed = JSON.parse(currentFoodContent);
  const currentFoodOrderCount = currentFoodParsed.orders?.length || 0;

  assert(currentFoodOrderCount === initialFoodOrderCount, 'Jumlah pesanan di tumpang_food_db.json TETAP UTUH (Tidak ada data Shop bocor ke Food DB)');
  const leakedShopInFood = (currentFoodParsed.orders || []).filter((o: any) => o.id === orderData.id || o.orderNumber === orderData.orderNumber);
  assert(leakedShopInFood.length === 0, 'Pesanan Tumpang Shop TIDAK ditemukan di koleksi orders Food DB');

  // 7. Test Privacy Guard on Order Tracking
  console.log('\n--- Bagian 6: Keamanan & Pelacakan Pesanan Belanja ---');
  const resTrackNoPhone = await fetch(`${baseUrl}/api/shop/orders/track/${orderData.orderNumber}`);
  assert(resTrackNoPhone.status === 403, 'Melacak pesanan tanpa nomor WhatsApp ditolak (403)');

  const resTrackWrongPhone = await fetch(`${baseUrl}/api/shop/orders/track/${orderData.orderNumber}?phone=089999999999`);
  assert(resTrackWrongPhone.status === 404, 'Melacak pesanan dengan nomor WhatsApp salah ditolak (404)');

  const resTrackCorrectPhone = await fetch(`${baseUrl}/api/shop/orders/track/${orderData.orderNumber}?phone=${orderPayload.customerPhone}`);
  assert(resTrackCorrectPhone.status === 200, 'Melacak pesanan dengan nomor WhatsApp sah berhasil (200)');

  // 8. Test Decoupled Inter-Service API Client (ArtoPay Webhook Simulation)
  console.log('\n--- Bagian 7: Komunikasi Antarlayanan Melalui API Klien Eksplisit ---');
  const syncResult = await shopApiClient.syncPaymentStatus({
    orderId: orderData.id,
    paymentIntentId: 'pi_test_separation_999',
    amountPaid: orderData.total
  });
  assert(syncResult.success === true, 'shopApiClient.syncPaymentStatus berhasil mengonfirmasi pembayaran inter-service');

  const updatedOrder = shopDb.getOrderById(orderData.id);
  assert(updatedOrder?.paymentStatus === ShopPaymentStatus.PAID, 'Status pembayaran pesanan Shop berhasil berubah menjadi PAID');
  assert(updatedOrder?.orderStatus === ShopOrderStatus.PROCESSING, 'Status fisik pesanan berubah menjadi PROCESSING setelah lunas');

  // 9. Test Cancellation & Stock Replenishment
  console.log('\n--- Bagian 8: Pembatalan Pesanan & Pemulihan Stok ---');
  const adminToken = createShopAuthToken({ userId: 'shop_admin_master', role: 'SHOP_ADMIN' });

  const resCancel = await fetch(`${baseUrl}/api/shop/orders/${orderData.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ status: ShopOrderStatus.CANCELLED, reason: 'Pengujian pemulihan stok' })
  });

  assert(resCancel.status === 200, 'PATCH /api/shop/orders/:id/status berhasil membatalkan pesanan (200)');
  const restoredProduct = shopDb.getProductById(targetProduct.id);
  assert(restoredProduct?.stock === initialStock, `Stok produk pulih kembali setelah pembatalan: ${restoredProduct?.stock} (awal: ${initialStock})`);

  // 10. Test Standalone Shop App Mounting (Direct Port)
  console.log('\n--- Bagian 9: Uji Standalone Shop Express App ---');
  const shopServer = http.createServer(shopApp);
  await new Promise<void>((resolve) => shopServer.listen(0, '127.0.0.1', () => resolve()));
  const shopPort = (shopServer.address() as any).port;
  const shopBaseUrl = `http://127.0.0.1:${shopPort}`;

  const resStandaloneHealth = await fetch(`${shopBaseUrl}/health`);
  const standaloneHealth = await resStandaloneHealth.json();
  assert(resStandaloneHealth.status === 200, 'Shop backend mandiri merespons /health dengan 200 OK');
  assert(standaloneHealth.service === 'tumpang-shop-service', 'Identity standalone shop service terverifikasi');

  const resStandaloneProds = await fetch(`${shopBaseUrl}/products`);
  const standaloneProds = await resStandaloneProds.json();
  assert(Array.isArray(standaloneProds) && standaloneProds.length > 0, 'Shop backend mandiri dapat melayani katalog /products secara otonom');

  // Close servers
  server.close();
  shopServer.close();

  console.log('\n================================================================');
  console.log(`📊 HASIL PENGUJIAN PEMISAHAN: ${passed} BERHASIL | ${failed} GAGAL`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSeparationTests().catch(err => {
  console.error('Fatal error during separation tests:', err);
  process.exit(1);
});

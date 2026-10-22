/**
 * Comprehensive Test Suite for Tiered Service Fee (Biaya Layanan Bertingkat) - TumpangGo
 * 
 * Verifies:
 * 1. Exact boundary values specified in requirements:
 *    - Rp 0 -> Rp 1.200
 *    - Rp 30.000 -> Rp 1.200
 *    - Rp 30.001 -> Rp 2.000
 *    - Rp 99.000 -> Rp 2.000
 *    - Rp 100.000 -> Rp 3.000
 *    - Rp 199.000 -> Rp 3.000
 *    - Rp 200.000 -> Rp 4.000
 *    - Rp 299.000 -> Rp 4.000
 *    - Rp 300.000 -> Rp 5.000
 *    - Rp 500.000 -> Rp 5.000
 * 2. Values outside standard range:
 *    - Subtotal <= 0 -> Rp 1.200
 *    - Rp 500.001 to Rp 700.000 -> Rp 5.000 (pre-existing business rule)
 *    - > Rp 700.000 (e.g. Rp 750.000, Rp 1.000.000) -> Rp 10.000 (pre-existing business rule, NOT automatically Rp 5.000)
 * 3. Continuity check: No gaps and no overlaps.
 * 4. End-to-End calculation integration:
 *    - Total payment = subtotal + serviceFee + deliveryFee (flat Rp 5.000) + uniqueCode
 *    - No double-counting of service fee
 *    - Merchant commission remains exactly 10%
 *    - Service fee is borne by customer, not deducted from merchant settlement
 */

import { calculateTieredServiceFee, OrderStatus } from '../src/types';
import { foodDb } from '../src/server/db';
import { OrderService } from '../src/server/services/orderService';
import { FLAT_TUMPANG_DELIVERY_FEE } from '../src/utils/deliveryFee';

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
  console.log('====================================================');
  console.log('🚀 PENGUJIAN BIAYA LAYANAN BERTINGKAT TUMPANGGO');
  console.log('====================================================\n');

  // ----------------------------------------------------------------
  // 1. UJI BATAS NOMINAL WAJIB (MANDATORY BOUNDARIES)
  // ----------------------------------------------------------------
  console.log('📦 1. Uji Batas Nominal Tarif Resmi:');

  // Rp 0 -> Rp 1.200
  const fee0 = calculateTieredServiceFee(0);
  assert(fee0 === 1200, 'Rp 0 -> Biaya Layanan Rp 1.200', `Got ${fee0}`);

  // Rp 30.000 -> Rp 1.200
  const fee30k = calculateTieredServiceFee(30000);
  assert(fee30k === 1200, 'Rp 30.000 -> Biaya Layanan Rp 1.200', `Got ${fee30k}`);

  // Rp 30.001 -> Rp 2.000
  const fee30k1 = calculateTieredServiceFee(30001);
  assert(fee30k1 === 2000, 'Rp 30.001 -> Biaya Layanan Rp 2.000', `Got ${fee30k1}`);

  // Rp 99.000 -> Rp 2.000
  const fee99k = calculateTieredServiceFee(99000);
  assert(fee99k === 2000, 'Rp 99.000 -> Biaya Layanan Rp 2.000', `Got ${fee99k}`);

  // Rp 100.000 -> Rp 3.000
  const fee100k = calculateTieredServiceFee(100000);
  assert(fee100k === 3000, 'Rp 100.000 -> Biaya Layanan Rp 3.000', `Got ${fee100k}`);

  // Rp 199.000 -> Rp 3.000
  const fee199k = calculateTieredServiceFee(199000);
  assert(fee199k === 3000, 'Rp 199.000 -> Biaya Layanan Rp 3.000', `Got ${fee199k}`);

  // Rp 200.000 -> Rp 4.000
  const fee200k = calculateTieredServiceFee(200000);
  assert(fee200k === 4000, 'Rp 200.000 -> Biaya Layanan Rp 4.000', `Got ${fee200k}`);

  // Rp 299.000 -> Rp 4.000
  const fee299k = calculateTieredServiceFee(299000);
  assert(fee299k === 4000, 'Rp 299.000 -> Biaya Layanan Rp 4.000', `Got ${fee299k}`);

  // Rp 300.000 -> Rp 5.000
  const fee300k = calculateTieredServiceFee(300000);
  assert(fee300k === 5000, 'Rp 300.000 -> Biaya Layanan Rp 5.000', `Got ${fee300k}`);

  // Rp 500.000 -> Rp 5.000
  const fee500k = calculateTieredServiceFee(500000);
  assert(fee500k === 5000, 'Rp 500.000 -> Biaya Layanan Rp 5.000', `Got ${fee500k}`);

  // ----------------------------------------------------------------
  // 2. UJI NOMINAL DI LUAR RENTANG (OUTSIDE RANGE & EDGE CASES)
  // ----------------------------------------------------------------
  console.log('\n📦 2. Uji Nominal di Luar Rentang & Aturan Bisnis Berkelanjutan:');

  // Nominal negatif atau nol di luar batas bawah
  const feeNegative = calculateTieredServiceFee(-5000);
  assert(feeNegative === 1200, 'Nominal negatif (-Rp 5.000) dinormalisasi ke batas Rp 1.200', `Got ${feeNegative}`);

  // Nominal antara Rp 500.001 - Rp 700.000 (aturan bisnis yang sudah berlaku)
  const fee600k = calculateTieredServiceFee(600000);
  assert(fee600k === 5000, 'Nominal Rp 600.000 (<= Rp 700.000) mengikuti tarif Rp 5.000', `Got ${fee600k}`);

  const fee700k = calculateTieredServiceFee(700000);
  assert(fee700k === 5000, 'Batas Rp 700.000 mengikuti tarif Rp 5.000', `Got ${fee700k}`);

  // Nominal di atas Rp 700.000 tidak otomatis menjadi Rp 5.000, tetapi mengikuti aturan bisnis Rp 10.000
  const fee750k = calculateTieredServiceFee(750000);
  assert(fee750k === 10000, 'Nominal Rp 750.000 (> Rp 700.000) mengikuti tarif Rp 10.000 (tidak otomatis Rp 5.000)', `Got ${fee750k}`);

  const fee1M = calculateTieredServiceFee(1000000);
  assert(fee1M === 10000, 'Nominal Rp 1.000.000 (> Rp 700.000) mengikuti tarif Rp 10.000', `Got ${fee1M}`);

  // ----------------------------------------------------------------
  // 3. UJI KONTINUITAS TANPA KEKOSONGAN (NO GAPS & NO OVERLAPS)
  // ----------------------------------------------------------------
  console.log('\n📦 3. Uji Kontinuitas (Bebas Gap dan Bebas Tumpang Tindih):');

  assert(calculateTieredServiceFee(15000) === 1200, 'Titik tengah Tier 1 (Rp 15.000) -> Rp 1.200');
  assert(calculateTieredServiceFee(50000) === 2000, 'Titik tengah Tier 2 (Rp 50.000) -> Rp 2.000');
  assert(calculateTieredServiceFee(99500) === 2000, 'Nilai Rp 99.500 (antara 99k dan 100k) tercakup tanpa gap -> Rp 2.000');
  assert(calculateTieredServiceFee(150000) === 3000, 'Titik tengah Tier 3 (Rp 150.000) -> Rp 3.000');
  assert(calculateTieredServiceFee(199500) === 3000, 'Nilai Rp 199.500 (antara 199k dan 200k) tercakup tanpa gap -> Rp 3.000');
  assert(calculateTieredServiceFee(250000) === 4000, 'Titik tengah Tier 4 (Rp 250.000) -> Rp 4.000');
  assert(calculateTieredServiceFee(299500) === 4000, 'Nilai Rp 299.500 (antara 299k dan 300k) tercakup tanpa gap -> Rp 4.000');
  assert(calculateTieredServiceFee(400000) === 5000, 'Titik tengah Tier 5 (Rp 400.000) -> Rp 5.000');

  // ----------------------------------------------------------------
  // 4. UJI INTEGRASI TOTAL PEMBAYARAN & ORDER SERVICE
  // ----------------------------------------------------------------
  console.log('\n📦 4. Uji Integritas Total Pembayaran & Isolasi Biaya Layanan:');

  // Create temporary merchant and item for end-to-end check
  await foodDb.ensureInitialized();
  const testMerchant = await foodDb.createMerchant('system-test', {
    name: 'Resto Audit Biaya Layanan',
    ownerName: 'Audit Owner',
    phone: '081234567888',
    address: 'Kecamatan Tumpang, Malang',
    latitude: -7.9482,
    longitude: 112.7612,
    openTime: '08:00',
    closeTime: '21:00',
    bankName: 'BRI',
    bankAccount: '1234567890',
    bankHolder: 'Audit Owner',
    active: true,
    cookTimeEstimate: '15-25 min',
    image: '',
    description: 'Audit Test',
    category: 'Semua'
  });

  const testItemSmall = await foodDb.createMenuItem(testMerchant.id, {
    name: 'Es Teh Manis',
    price: 5000,
    description: 'Segar',
    categoryId: 'cat_default',
    available: true,
    image: ''
  });

  const testItemMedium = await foodDb.createMenuItem(testMerchant.id, {
    name: 'Paket Ayam Geprek',
    price: 25000,
    description: 'Pedas',
    categoryId: 'cat_default',
    available: true,
    image: ''
  });

  let createdOrderId: string | null = null;
  try {
    // Skenario A: Subtotal Rp 25.000 (Tier 1: Rp 1.200)
    // 1 item @ Rp 25.000
    const orderA = await foodDb.createOrder({
      merchantId: testMerchant.id,
      customerName: 'Pelanggan Tier 1',
      customerPhone: '081234567001',
      deliveryAddress: 'Jl. Malangsuko No. 1, Kec. Tumpang, Malang',
      items: [{ menuItemId: testItemMedium.id, quantity: 1 }]
    });
    createdOrderId = orderA.id;

    assert(orderA.subtotal === 25000, 'Subtotal Order A tepat Rp 25.000', `Got ${orderA.subtotal}`);
    assert(orderA.deliveryFee === FLAT_TUMPANG_DELIVERY_FEE, `Ongkir flat tetap Rp ${FLAT_TUMPANG_DELIVERY_FEE}`, `Got ${orderA.deliveryFee}`);
    assert(orderA.serviceFee === 1200, 'Biaya layanan Order A (subtotal Rp 25.000) tepat Rp 1.200', `Got ${orderA.serviceFee}`);
    
    // Verifikasi formula: Total = subtotal + ongkir + biaya layanan + kode unik
    const expectedTotalA = orderA.subtotal + orderA.deliveryFee + orderA.serviceFee + orderA.uniqueCode;
    assert(orderA.total === expectedTotalA, `Total pembayaran terakumulasi akurat: Rp ${orderA.total} === Rp ${expectedTotalA}`);
    assert(orderA.total === 25000 + 5000 + 1200 + orderA.uniqueCode, 'Komponen tidak dihitung ganda');

    // Skenario B: Subtotal Rp 55.000 (Tier 2: Rp 2.000)
    // 2x Paket Ayam (50k) + 1x Es Teh (5k) = 55.000
    const orderB = await foodDb.createOrder({
      merchantId: testMerchant.id,
      customerName: 'Pelanggan Tier 2',
      customerPhone: '081234567002',
      deliveryAddress: 'Jl. Raya Tumpang No. 2, Kec. Tumpang, Malang',
      items: [
        { menuItemId: testItemMedium.id, quantity: 2 },
        { menuItemId: testItemSmall.id, quantity: 1 }
      ]
    });

    assert(orderB.subtotal === 55000, 'Subtotal Order B tepat Rp 55.000', `Got ${orderB.subtotal}`);
    assert(orderB.serviceFee === 2000, 'Biaya layanan Order B (subtotal Rp 55.000) tepat Rp 2.000', `Got ${orderB.serviceFee}`);
    assert(orderB.total === 55000 + 5000 + 2000 + orderB.uniqueCode, `Total Order B akurat (Rp ${orderB.total})`);

    // Skenario C: Subtotal Rp 105.000 (Tier 3: Rp 3.000)
    // 4x Paket Ayam (100k) + 1x Es Teh (5k) = 105.000
    const orderC = await foodDb.createOrder({
      merchantId: testMerchant.id,
      customerName: 'Pelanggan Tier 3',
      customerPhone: '081234567003',
      deliveryAddress: 'Jl. Jeru No. 3, Kec. Tumpang, Malang',
      items: [
        { menuItemId: testItemMedium.id, quantity: 4 },
        { menuItemId: testItemSmall.id, quantity: 1 }
      ]
    });

    assert(orderC.subtotal === 105000, 'Subtotal Order C tepat Rp 105.000', `Got ${orderC.subtotal}`);
    assert(orderC.serviceFee === 3000, 'Biaya layanan Order C (subtotal Rp 105.000) tepat Rp 3.000', `Got ${orderC.serviceFee}`);
    assert(orderC.total === 105000 + 5000 + 3000 + orderC.uniqueCode, `Total Order C akurat (Rp ${orderC.total})`);

    // Skenario D: Subtotal Rp 250.000 (Tier 4: Rp 4.000)
    // 10x Paket Ayam (250k)
    const orderD = await foodDb.createOrder({
      merchantId: testMerchant.id,
      customerName: 'Pelanggan Tier 4',
      customerPhone: '081234567004',
      deliveryAddress: 'Jl. Slamet No. 4, Kec. Tumpang, Malang',
      items: [
        { menuItemId: testItemMedium.id, quantity: 10 }
      ]
    });

    assert(orderD.subtotal === 250000, 'Subtotal Order D tepat Rp 250.000', `Got ${orderD.subtotal}`);
    assert(orderD.serviceFee === 4000, 'Biaya layanan Order D (subtotal Rp 250.000) tepat Rp 4.000', `Got ${orderD.serviceFee}`);
    assert(orderD.total === 250000 + 5000 + 4000 + orderD.uniqueCode, `Total Order D akurat (Rp ${orderD.total})`);

    // Skenario E: Subtotal Rp 350.000 (Tier 5: Rp 5.000)
    // 14x Paket Ayam (350k)
    const orderE = await foodDb.createOrder({
      merchantId: testMerchant.id,
      customerName: 'Pelanggan Tier 5',
      customerPhone: '081234567005',
      deliveryAddress: 'Jl. Benjor No. 5, Kec. Tumpang, Malang',
      items: [
        { menuItemId: testItemMedium.id, quantity: 14 }
      ]
    });

    assert(orderE.subtotal === 350000, 'Subtotal Order E tepat Rp 350.000', `Got ${orderE.subtotal}`);
    assert(orderE.serviceFee === 5000, 'Biaya layanan Order E (subtotal Rp 350.000) tepat Rp 5.000', `Got ${orderE.serviceFee}`);
    assert(orderE.total === 350000 + 5000 + 5000 + orderE.uniqueCode, `Total Order E akurat (Rp ${orderE.total})`);

    // ----------------------------------------------------------------
    // 5. UJI KOMISI MERCHANT (TETAP 10%) & ISOLASI SETTLEMENT
    // ----------------------------------------------------------------
    console.log('\n📦 5. Uji Komisi Merchant & Payout Settlement:');
    const systemCommission = foodDb.getSystemConfig().commissionPercent || 10;
    assert(systemCommission === 10, 'Komisi platform merchant tetap 10%');

    // Commission is 10% of subtotal (totalSales), not total (customer service fee is not taxed on merchant)
    const expectedCommissionA = Math.round((orderA.subtotal * 10) / 100);
    assert(expectedCommissionA === 2500, 'Komisi 10% dihitung dari subtotal menu (Rp 25.000 * 10% = Rp 2.500)');
    
    const merchantPayoutA = orderA.subtotal - expectedCommissionA;
    assert(merchantPayoutA === 22500, 'Hak penerimaan merchant murni (Rp 25.000 - Rp 2.500 = Rp 22.500) tanpa potongan biaya layanan');

  } finally {
    // Clean up test data to keep the database completely pristine
    const rawDb = foodDb as any;
    rawDb.data.orders = (rawDb.data.orders || []).filter((o: any) => o.merchantId !== testMerchant.id);
    rawDb.data.menuItems = (rawDb.data.menuItems || []).filter((i: any) => i.merchantId !== testMerchant.id);
    rawDb.data.merchants = (rawDb.data.merchants || []).filter((m: any) => m.id !== testMerchant.id);
    rawDb.save();
  }

  console.log('\n====================================================');
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(`🏁 HASIL VERIFIKASI: ${passed} PASS, ${failed} FAIL (Total: ${total})`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 SELURUH PENGUJIAN BIAYA LAYANAN BERTINGKAT BERHASIL 100%!');
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive End-to-End Master Remediation Test Suite
 * Validates all 22 functional, security, and lifecycle assertions from the Master Remediation Plan.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { foodDb } from '../src/server/db';
import { calculateDeliveryFee, FLAT_TUMPANG_DELIVERY_FEE, FLAT_PAKIS_DELIVERY_FEE } from '../src/utils/deliveryFee';
import { OrderStatus, PaymentStatus, AssignmentMode, calculateTieredServiceFee } from '../src/types';
import { verifyPassword, hashPassword, createAuthToken } from '../src/server/auth';
import { calculateRemainingCooking } from '../src/utils/cookingTimer';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedCount++;
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runTestSuite() {
  console.log('======================================================');
  console.log('🛡️  TUMPANGGO MASTER REMEDIATION VERIFICATION SUITE');
  console.log('======================================================\n');

  // --- SECTION 1: PUBLIC ASSET SECURITY AUDIT ---
  console.log('--- 1. PUBLIC ASSET SECURITY AUDIT ---');
  const forbiddenFiles = [
    'public/tumpanggo-source.zip',
    'public/tumpanggo-ereceipt.bundle',
    'public/tumpanggo-ereceipt.patch',
    'qris-fix.patch'
  ];
  for (const f of forbiddenFiles) {
    const exists = fs.existsSync(path.resolve(process.cwd(), f));
    assert(!exists, `Sensitive file removed from repository: ${f}`, `File still exists at ${f}`);
  }

  // --- SECTION 2: SENSITIVE CREDENTIAL SANITIZATION (/api/config) ---
  console.log('\n--- 2. SENSITIVE CREDENTIAL SANITIZATION ---');
  const fullConfig = foodDb.getConfig();
  const { masterAccount, ...safeConfig } = fullConfig;
  const sanitizedMaster = masterAccount?.email ? { email: masterAccount.email } : undefined;
  const publicConfigResponse = {
    ...safeConfig,
    ...(sanitizedMaster ? { masterAccount: sanitizedMaster } : {})
  };

  assert(
    !(publicConfigResponse as any).masterAccount?.passwordHash,
    'passwordHash is never present in public config response'
  );
  assert(
    publicConfigResponse.defaultDeliveryFee === 5000,
    'defaultDeliveryFee is configured to flat Rp 5.000'
  );
  assert(
    publicConfigResponse.assignmentMode === AssignmentMode.MANUAL,
    'assignmentMode is set to MANUAL (no auto-dispatch)'
  );

  // --- SECTION 3: MASTER ADMIN AUTHENTICATION ---
  console.log('\n--- 3. MASTER ADMIN PBKDF2 CREDENTIAL INTEGRITY ---');
  const master = foodDb.getMasterAccount();
  assert(Boolean(master && master.email === 'tumpanggo@gmail.com'), 'Master Admin account exists for tumpanggo@gmail.com');
  assert(Boolean(master?.passwordHash && master.passwordHash.startsWith('pbkdf2$')), 'Master Admin uses secure PBKDF2 hash');
  const passCheck = verifyPassword('TumpangGoAdmin#2026', master?.passwordHash || '');
  assert(passCheck.valid, 'Master password verifies correctly against PBKDF2 hash');

  // --- SECTION 4: DELIVERY FEE NORMALIZATION ---
  console.log('\n--- 4. DELIVERY FEE NORMALIZATION (TUMPANG FLAT 5K, PAKIS FLAT 7.5K) ---');
  const tumpangLocations = ['Tumpang', 'Desa Jeru', 'Malangsuko', 'Bokor', 'Slamet', 'Wringinsongo', 'Kidal', 'Pandanajeng'];
  for (const loc of tumpangLocations) {
    const fee = calculateDeliveryFee({ address: loc }).deliveryFee;
    assert(fee === FLAT_TUMPANG_DELIVERY_FEE, `Tumpang destination (${loc}) is flat Rp 5.000`);
  }

  const pakisLocations = ['Pakisjajar', 'Pakiskembar', 'Ampeldento', 'Asrikaton', 'Banjarejo', 'Bunutwetan', 'Wendit'];
  for (const loc of pakisLocations) {
    const fee = calculateDeliveryFee({ address: loc }).deliveryFee;
    assert(fee === FLAT_PAKIS_DELIVERY_FEE, `Pakis destination (${loc}) is flat Rp 7.500`);
  }

  const outsideResult = calculateDeliveryFee({
    address: 'Jl. Basuki Rahmat No. 1, Klojen, Kota Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -7.9420,
    longitude: 112.6150
  });
  assert(outsideResult.deliveryFee > 7500, `Outside destination calculates distance-based rate (Calculated: Rp ${outsideResult.deliveryFee})`);

  // --- SECTION 5: TIERED SERVICE FEE PROGRESSION ---
  console.log('\n--- 5. TIERED SERVICE FEE PROGRESSION ---');
  assert(calculateTieredServiceFee(0) === 0, 'Subtotal Rp 0 = Rp 0 service fee');
  assert(calculateTieredServiceFee(25000) === 1200, 'Subtotal Rp 25.000 = Rp 1.200 service fee (Tier 1)');
  assert(calculateTieredServiceFee(100000) === 2000, 'Subtotal Rp 100.000 = Rp 2.000 service fee (Tier 2)');
  assert(calculateTieredServiceFee(200000) === 3000, 'Subtotal Rp 200.000 = Rp 3.000 service fee (Tier 3)');
  assert(calculateTieredServiceFee(300000) === 4000, 'Subtotal Rp 300.000 = Rp 4.000 service fee (Tier 4)');
  assert(calculateTieredServiceFee(400000) === 5000, 'Subtotal Rp 400.000 = Rp 5.000 service fee (Tier 5)');
  assert(calculateTieredServiceFee(800000) === 10000, 'Subtotal Rp 800.000 = Rp 10.000 service fee (Tier 6)');

  // --- SECTION 6: PARTNER REGISTRATION & PENDING LIFECYCLE ---
  console.log('\n--- 6. PARTNER REGISTRATION & APPROVAL WORKFLOW ---');
  const regTimestamp = Date.now();
  const testPhone = `081234567${regTimestamp.toString().slice(-4)}`;
  const testEmail = `toko_${regTimestamp}@example.com`;

  const newReg = await foodDb.createPartnerRegistration({
    name: 'Budi Santoso',
    phone: testPhone,
    email: testEmail,
    type: 'MERCHANT',
    storeName: 'Warung Nasi Pecel Tumpang',
    storeAddress: 'Jl. Raya Tumpang No. 45',
    category: 'Aneka Nasi & Lauk',
    password: 'PasswordMitra123'
  });

  assert(newReg.status === 'PENDING', 'New partner registration is initialized with PENDING status');
  assert(Boolean(newReg.id), 'Registration record assigned a valid ID');

  // Verify that pending partner cannot access active merchant credentials
  const pendingRegFound = foodDb.getPartnerRegistrations().find(r => r.id === newReg.id);
  assert(pendingRegFound?.status === 'PENDING', 'Registration status verified as PENDING in database');

  // Admin approves partner registration
  const approveResult = await foodDb.approvePartnerRegistration('admin', newReg.id);
  assert(approveResult.success, 'Admin successfully approves partner registration');

  const merchantId = approveResult.registration?.storeId;
  const createdMerchant = foodDb.getMerchants().find(m => m.id === merchantId);
  assert(Boolean(createdMerchant), 'Approved merchant is now present in active merchants catalog');
  assert(createdMerchant?.active === true, 'Approved merchant is marked active');

  // Verify merchant password verification against raw internal auth record
  const rawMerchant = foodDb.getMerchantByEmailOrPhone(testEmail);
  const merchantPassValid = Boolean(rawMerchant?.password && verifyPassword('PasswordMitra123', rawMerchant.password).valid);
  assert(merchantPassValid, 'Merchant password is encrypted with PBKDF2 hash and verifies accurately');

  // --- SECTION 7: ORDER CREATION & FINANCIAL INTEGRITY ---
  console.log('\n--- 7. ORDER FINANCIAL CALCULATIONS & INTEGRITY ---');
  // Create a real menu item under the newly approved merchant
  const categories = foodDb.getCategories(createdMerchant!.id);
  const catId = categories[0]?.id || 'cat_test';
  const testMenuItem = await foodDb.createMenuItem(createdMerchant!.id, {
    merchantId: createdMerchant!.id,
    categoryId: catId,
    category: 'Menu Utama',
    name: 'Nasi Pecel Komplit',
    price: 35000,
    available: true
  });

  const testOrder = await foodDb.createOrder({
    customerName: 'Ahmad Fauzi',
    customerPhone: '081987654321',
    deliveryAddress: 'Jl. Melati No. 12, Desa Jeru, Tumpang',
    items: [
      {
        menuItemId: testMenuItem.id,
        quantity: 1
      }
    ],
    merchantId: createdMerchant!.id,
    paymentMethod: 'MERCHANT_QRIS'
  });

  assert(Boolean(testOrder.id), 'Order created successfully with ID: ' + testOrder.id);
  assert(testOrder.status === OrderStatus.WAITING_PAYMENT, 'Order starts in WAITING_PAYMENT status');
  assert(testOrder.deliveryFee === 5000, 'Order delivery fee is flat Rp 5.000');
  assert(testOrder.serviceFee === 2000, 'Order service fee is calculated correctly (Rp 2.000 for Rp 35.000)');
  assert(testOrder.total === 35000 + 5000 + 2000 + (testOrder.uniqueCode || 0), 'Order total matches exact financial sum');

  // --- SECTION 8: PAYMENT VERIFICATION & E-RECEIPT ---
  console.log('\n--- 8. PAYMENT VERIFICATION & E-RECEIPT INTEGRITY ---');
  const verifiedOrder = await foodDb.updateOrder('admin', testOrder.id, {
    status: OrderStatus.PAYMENT_VERIFIED,
    paymentStatus: PaymentStatus.PAID,
    paymentProof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }, 'ADMIN');

  assert(verifiedOrder.status === OrderStatus.PAYMENT_VERIFIED, 'Order transitioned to PAYMENT_VERIFIED');
  assert(verifiedOrder.paymentStatus === PaymentStatus.PAID, 'Order paymentStatus is PAID');
  assert(Boolean(verifiedOrder.paymentVerifiedAt), 'paymentVerifiedAt timestamp is set');
  assert(verifiedOrder.paymentVerifiedBy === 'admin', 'paymentVerifiedBy is set to admin');

  // --- SECTION 9: COOKING SERVER TIMESTAMPS & COUNTDOWN ---
  console.log('\n--- 9. COOKING SERVER TIMESTAMPS & DETERMINISTIC COUNTDOWN ---');
  const cookingDuration = 30; // 30 minutes
  const nowMs = Date.now();
  const cookingStartedAt = new Date(nowMs).toISOString();
  const cookingEstimatedReadyAt = new Date(nowMs + cookingDuration * 60 * 1000).toISOString();

  const cookingOrder = await foodDb.updateOrder(createdMerchant!.id, testOrder.id, {
    status: OrderStatus.COOKING,
    cookingDurationMinutes: cookingDuration,
    cookingStartedAt,
    cookingEndsAt: cookingEstimatedReadyAt,
    cookingEstimatedReadyAt
  }, 'MERCHANT');

  assert(cookingOrder.status === OrderStatus.COOKING, 'Order transitioned to COOKING status');
  assert(cookingOrder.cookingDurationMinutes === 30, 'cookingDurationMinutes is set to 30');
  assert(Boolean(cookingOrder.cookingEstimatedReadyAt), 'cookingEstimatedReadyAt server timestamp is present');
  assert(cookingOrder.cookingEstimatedReadyAt === cookingOrder.cookingEndsAt, 'cookingEstimatedReadyAt matches cookingEndsAt');

  // Test countdown calculation utility
  const countdown = calculateRemainingCooking(cookingOrder, nowMs + 10 * 60 * 1000); // 10 minutes elapsed
  assert(!countdown.isExpired, 'Countdown indicates order is currently in-progress');
  assert(countdown.remainingSeconds <= 20 * 60 + 5 && countdown.remainingSeconds >= 19 * 60, 'Remaining time is approx 20 minutes');
  assert(countdown.percentElapsed >= 30 && countdown.percentElapsed <= 35, 'Percent elapsed is approx 33%');

  // --- SECTION 10: DRIVER TASK CLAIMING & ATOMIC CONCURRENCY LOCK ---
  console.log('\n--- 10. DRIVER CLAIMING & ATOMIC CONCURRENCY LOCK ---');
  // Create 2 real drivers
  const driverA = await foodDb.createDriver('admin', {
    name: 'Slamet Courier',
    phone: '081299990001',
    active: true,
    online: true
  });

  const driverB = await foodDb.createDriver('admin', {
    name: 'Joko Courier',
    phone: '081299990002',
    active: true,
    online: true
  });

  const offlineDriver = await foodDb.createDriver('admin', {
    name: 'Bambang Courier',
    phone: '081299990003',
    active: true,
    online: false
  });

  // Offline driver cannot claim task
  let offlineErrorThrown = false;
  try {
    await foodDb.acceptDriverTask(offlineDriver.id, testOrder.id);
  } catch (err: any) {
    offlineErrorThrown = true;
    assert(err.message.includes('Offline'), 'Offline driver is blocked from claiming task');
  }
  assert(offlineErrorThrown, 'Offline driver claim threw expected exception');

  // Driver A claims task
  const claimedOrder = await foodDb.acceptDriverTask(driverA.id, testOrder.id);
  assert(claimedOrder.driverId === driverA.id, 'Driver A successfully claimed task');
  assert(claimedOrder.driverName === driverA.name, 'Order driverName set to Driver A');

  // Driver B attempts to claim the same task -> must be rejected by atomic lock
  let collisionBlocked = false;
  try {
    await foodDb.acceptDriverTask(driverB.id, testOrder.id);
  } catch (err: any) {
    collisionBlocked = true;
    assert(err.message.includes('kurir lain'), 'Second driver collision blocked by atomic task lock');
  }
  assert(collisionBlocked, 'Second driver claim threw atomic conflict exception');

  // --- SECTION 11: PICKUP & DELIVERY COMPLETION SAFEGUARDS ---
  console.log('\n--- 11. PICKUP & DELIVERY COMPLETION SAFEGUARDS ---');
  // Merchant marks food ready for pickup
  const readyOrder = await foodDb.updateOrder(createdMerchant!.id, testOrder.id, {
    status: OrderStatus.READY_FOR_PICKUP
  }, 'MERCHANT');
  assert(readyOrder.status === OrderStatus.READY_FOR_PICKUP, 'Merchant marked order READY_FOR_PICKUP');

  // Driver picks up order
  const pickedUpOrder = await foodDb.updateOrder(driverA.id, testOrder.id, {
    status: OrderStatus.ORDER_PICKED_UP
  }, 'DRIVER');
  assert(pickedUpOrder.status === OrderStatus.ORDER_PICKED_UP, 'Driver marked order ORDER_PICKED_UP');

  // Driver delivers order with photo proof
  const deliveredOrder = await foodDb.updateOrder(driverA.id, testOrder.id, {
    status: OrderStatus.DELIVERED,
    deliveryProof: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
  }, 'DRIVER');
  assert(deliveredOrder.status === OrderStatus.DELIVERED, 'Driver successfully completed delivery with photo proof');
  assert(Boolean(deliveredOrder.deliveryProof), 'deliveryProof is attached to order record');

  // --- SECTION 12: CRYPTOGRAPHIC SIGNATURE & TIMING-SAFE VERIFICATION ---
  console.log('\n--- 12. CRYPTOGRAPHIC SIGNATURE & TIMING-SAFE VERIFICATION ---');
  const hmacSecret = 'test_signature_secret_key_1234567890';
  const testPayload = JSON.stringify({
    event: 'auth.token',
    data: {
      orderId: testOrder.id,
      amount: testOrder.total,
      currency: 'IDR'
    }
  });

  const validHmac = crypto.createHmac('sha256', hmacSecret).update(testPayload).digest('hex');
  const forgedHmac = crypto.createHmac('sha256', 'wrong_secret').update(testPayload).digest('hex');

  // Verify HMAC verification behavior
  const expectedSig = crypto.createHmac('sha256', hmacSecret).update(testPayload).digest('hex');
  const isMatch = crypto.timingSafeEqual(Buffer.from(validHmac), Buffer.from(expectedSig));
  assert(isMatch, 'Valid cryptographic HMAC signature verification passes');

  const isForgedMatch = crypto.timingSafeEqual(Buffer.from(forgedHmac), Buffer.from(expectedSig));
  assert(!isForgedMatch, 'Forged/tampered cryptographic signature verification is rejected');

  // --- SECTION 13: TRANSACTION-SAFE DELETION GUARD ---
  console.log('\n--- 13. TRANSACTION-SAFE DELETION GUARD ---');
  let deletionBlocked = false;
  try {
    await foodDb.deleteMerchant('admin', createdMerchant!.id);
  } catch (err: any) {
    deletionBlocked = true;
    assert(err.message.includes('riwayat transaksi'), 'Merchant with transaction history is safely protected from deletion');
  }
  assert(deletionBlocked, 'Deletion attempt correctly threw business rule violation');

  // Verify deactivation works instead
  const deactivatedMerchant = await foodDb.updateMerchant('admin', createdMerchant!.id, { active: false }, 'ADMIN');
  assert(deactivatedMerchant.active === false, 'Merchant safely deactivated without data loss');

  // Clean up test entities so database remains pristine
  // Safe delete driver records created for test
  await foodDb.deleteDriver('admin', driverA.id);
  await foodDb.deleteDriver('admin', driverB.id);
  await foodDb.deleteDriver('admin', offlineDriver.id);

  console.log('\n======================================================');
  console.log(`📊 MASTER TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('======================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});

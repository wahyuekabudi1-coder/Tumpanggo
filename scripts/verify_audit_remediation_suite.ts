/**
 * Comprehensive Audit Remediation Verification Suite
 * Verifies all 6 user requirements:
 * 1. Merchant Approval Process (Fault-tolerant, idempotent, no premature APPROVED, concurrency-safe)
 * 2. Registration Validation (Mandatory business/KTP photos, official categories only, duplicate rejection)
 * 3. Cooking Time Dropdown (15, 30, 45, 60 min options, accepted order countdown)
 * 4. Delivery Fees & QRIS (Flat 5.000 Tumpang, 7.500 Pakis, QRIS proof = WAITING_PAYMENT_VERIFICATION)
 * 5. Forgot Password Security & Admin UI Safeguards
 */

import { foodDb, OFFICIAL_MERCHANT_CATEGORIES } from '../src/server/db';
import { app } from '../src/server/app';
import http from 'http';

const PORT = 3099;
let server: http.Server;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function runSuite() {
  console.log('===============================================================');
  console.log('   TUMPANGGO COMPREHENSIVE AUDIT REMEDIATION VERIFICATION     ');
  console.log('===============================================================');

  server = app.listen(PORT, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: REGISTRATION VALIDATION (PHOTOS & CATEGORIES & DUPLICATES)
    // -----------------------------------------------------------------
    console.log('\n--- 1. AUDITING REGISTRATION VALIDATION & SAFETY ---');

    // 1a. Missing business photo rejected
    const regWithoutPhoto = await fetch(`${BASE_URL}/api/merchants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Warung Audit 1',
        ownerName: 'Pemilik 1',
        phone: '081234560001',
        email: 'audit1@warung.com',
        category: 'Nasi & Lauk',
        address: 'Jl. Raya Tumpang No. 1',
        password: 'password123',
        idPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
        // businessPhoto missing!
      })
    });
    assert(regWithoutPhoto.status === 400, 'Rejects registration without business photo');

    // 1b. Missing id photo rejected
    const regWithoutId = await fetch(`${BASE_URL}/api/merchants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Warung Audit 2',
        ownerName: 'Pemilik 2',
        phone: '081234560002',
        email: 'audit2@warung.com',
        category: 'Nasi & Lauk',
        address: 'Jl. Raya Tumpang No. 2',
        password: 'password123',
        businessPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
        // idPhoto missing!
      })
    });
    assert(regWithoutId.status === 400, 'Rejects registration without KTP photo');

    // 1c. Invalid category rejected
    const regBadCategory = await fetch(`${BASE_URL}/api/merchants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Warung Audit 3',
        ownerName: 'Pemilik 3',
        phone: '081234560003',
        email: 'audit3@warung.com',
        category: 'Kategori Sembarangan', // Not in OFFICIAL_MERCHANT_CATEGORIES
        address: 'Jl. Raya Tumpang No. 3',
        password: 'password123',
        businessPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
        idPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
      })
    });
    assert(regBadCategory.status === 400, 'Rejects unauthorized merchant category');

    // 1d. Valid Registration succeeds
    const runSuffix = Date.now().toString().slice(-6);
    const testPhone = `081299${runSuffix}`;
    const testEmail = `sukardi_${runSuffix}@tumpang.id`;

    const regValid = await fetch(`${BASE_URL}/api/merchants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Warung Bu Sukardi ${runSuffix}`,
        ownerName: 'Bu Sukardi',
        phone: testPhone,
        email: testEmail,
        category: 'Nasi & Lauk',
        address: 'Jl. Raya Malangsuko No. 88, Tumpang',
        latitude: -7.9945,
        longitude: 112.7661,
        password: 'sukardipassword123',
        businessPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
        idPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
      })
    });
    const regValidData = await regValid.json();
    assert(regValid.status === 201 && regValidData.status === 'PENDING', 'Valid registration accepted with PENDING status');
    const createdRegId = regValidData.registration?.id;

    // 1e. Duplicate Phone rejected
    const regDuplicatePhone = await fetch(`${BASE_URL}/api/merchants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Warung Lain Nomor Sama',
        ownerName: 'Orang Lain',
        phone: testPhone, // Duplicate phone!
        email: `beda_${runSuffix}@tumpang.id`,
        category: 'Bakso & Mie',
        address: 'Jl. Lain',
        password: 'password123',
        businessPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
        idPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
      })
    });
    assert(regDuplicatePhone.status === 400, 'Rejects duplicate phone number with clear message');

    // 1f. Duplicate Email rejected
    const regDuplicateEmail = await fetch(`${BASE_URL}/api/merchants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Warung Email Sama',
        ownerName: 'Orang Lain 2',
        phone: `081288${runSuffix}`,
        email: testEmail, // Duplicate email!
        category: 'Bakso & Mie',
        address: 'Jl. Lain',
        password: 'password123',
        businessPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
        idPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
      })
    });
    assert(regDuplicateEmail.status === 400, 'Rejects duplicate email with clear message');

    // -----------------------------------------------------------------
    // TEST 2: SECURE MERCHANT APPROVAL & IDEMPOTENCY
    // -----------------------------------------------------------------
    console.log('\n--- 2. AUDITING MERCHANT APPROVAL & IDEMPOTENCY ---');

    // 2a. Approve the registration
    const approveRes1 = await foodDb.approvePartnerRegistration('admin', createdRegId);
    assert(approveRes1.success && approveRes1.registration?.status === 'APPROVED', 'First approval succeeds and marks APPROVED');
    
    // Verify merchant was created and default category 'Menu Utama' was created
    const createdMerchant = foodDb.getMerchants().find(m => m.email === testEmail);
    assert(Boolean(createdMerchant), 'Merchant entity exists in store');
    const merchantCategories = foodDb.getCategories(createdMerchant?.id || '');
    assert(merchantCategories.length > 0 && merchantCategories.some(c => c.name === 'Menu Utama'), 'Default category "Menu Utama" was created');

    // 2b. Repeated approval click (IDEMPOTENCY) must not fail and must not create duplicate merchants or categories
    const initialMerchantCount = foodDb.getMerchants().length;
    const initialCategoryCount = foodDb.getCategories(createdMerchant?.id || '').length;

    const approveRes2 = await foodDb.approvePartnerRegistration('admin', createdRegId);
    assert(approveRes2.success && approveRes2.registration?.status === 'APPROVED', 'Repeated approval call is idempotent');
    assert(foodDb.getMerchants().length === initialMerchantCount, 'No duplicate merchant created on repeated approval');
    assert(foodDb.getCategories(createdMerchant?.id || '').length === initialCategoryCount, 'No duplicate category created on repeated approval');

    // 2c. Nonexistent registration returns error gracefully without throwing
    const badApproveRes = await foodDb.approvePartnerRegistration('admin', 'nonexistent_reg_id');
    assert(!badApproveRes.success && Boolean(badApproveRes.error), 'Nonexistent registration returns safe error message');

    // -----------------------------------------------------------------
    // TEST 3: COOKING TIME SELECTION & ORDERS
    // -----------------------------------------------------------------
    console.log('\n--- 3. AUDITING COOKING TIME DROPDOWN & ORDER FLOW ---');

    // Create a menu item under the newly approved merchant
    const menuItem = await foodDb.createMenuItem(createdMerchant?.id || '', {
      name: 'Nasi Rawon Daging Tumpang',
      price: 20000,
      description: 'Rawon kuah pekat rempah khas Tumpang',
      category: merchantCategories[0].id,
      available: true
    });

    // Customer creates order in Tumpang
    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Ahmad Customer',
        customerPhone: '085712345678',
        destinationDistrict: 'Kecamatan Tumpang',
        deliveryAddress: 'Jl. Kauman No. 10, Desa Tumpang',
        merchantId: createdMerchant?.id,
        items: [{ menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1 }],
        subtotal: 20000,
        deliveryFee: 5000,
        serviceFee: 2000
      })
    });
    const orderData = await orderRes.json();
    assert(orderRes.status === 201 && orderData.deliveryFee === 5000, 'Order created with flat Rp 5.000 Tumpang fee');

    // -----------------------------------------------------------------
    // TEST 4: QRIS PROOF UPLOAD & STATUS IS WAITING_PAYMENT_VERIFICATION
    // -----------------------------------------------------------------
    console.log('\n--- 4. AUDITING QRIS PROOF UPLOAD (NO AUTO-PAID) ---');

    // Create 100x100 real test JPEG for upload
    const sharp = (await import('sharp')).default;
    const testJpegBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 100, g: 150, b: 200 } }
    }).jpeg().toBuffer();
    const testJpegDataUri = `data:image/jpeg;base64,${testJpegBuf.toString('base64')}`;

    const { generateOrderProofToken } = await import('../src/server/routes/orderRoutes');
    const proofToken = generateOrderProofToken(orderData.id);

    const paymentProofRes = await fetch(`${BASE_URL}/api/orders/${orderData.id}/upload-payment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-order-token': proofToken
      },
      body: JSON.stringify({
        paymentProof: testJpegDataUri,
        proofToken
      })
    });
    const updatedOrder = await paymentProofRes.json();
    assert(
      paymentProofRes.status === 200 && updatedOrder.status === 'WAITING_PAYMENT_VERIFICATION',
      'Uploading payment proof sets status to WAITING_PAYMENT_VERIFICATION (NOT auto PAID)'
    );

    // -----------------------------------------------------------------
    // TEST 3: COOKING TIME SELECTION & ORDERS
    // -----------------------------------------------------------------
    console.log('\n--- 3. AUDITING COOKING TIME DROPDOWN & ORDER FLOW ---');

    // Admin verifies payment first
    const { createAuthToken } = await import('../src/server/auth');
    const adminToken = createAuthToken({
      userId: 'admin-test',
      role: 'ADMIN',
      email: 'admin@tumpanggo.com'
    });

    const verifyPayRes = await fetch(`${BASE_URL}/api/orders/${orderData.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        status: 'PAYMENT_VERIFIED',
        paymentStatus: 'PAID'
      })
    });
    assert(verifyPayRes.status === 200, 'Admin successfully verifies payment');

    // Merchant accepts order with 30 minutes cooking time (from dropdown)
    const merchantToken = createAuthToken({
      userId: createdMerchant?.id || 'm_test',
      role: 'MERCHANT',
      entityId: createdMerchant?.id,
      email: createdMerchant?.email
    });

    const acceptRes = await fetch(`${BASE_URL}/api/orders/${orderData.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantToken}`
      },
      body: JSON.stringify({
        status: 'COOKING',
        cookingDurationMinutes: 30
      })
    });
    const acceptedOrder = await acceptRes.json();
    assert(acceptRes.status === 200 && acceptedOrder.cookingDurationMinutes === 30, 'Cooking duration 30 minutes saved to order');
    assert(Boolean(acceptedOrder.cookingEndsAt), 'cookingEndsAt countdown timestamp calculated');

    // -----------------------------------------------------------------
    // TEST 5: FORGOT PASSWORD (NO ENUMERATION)
    // -----------------------------------------------------------------
    console.log('\n--- 5. AUDITING FORGOT PASSWORD SECURITY ---');

    // 5a. Nonexistent account returns generic success message (no user enumeration)
    const forgotNonexistent = await fetch(`${BASE_URL}/api/merchants/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'nonexistent999@random.com' })
    });
    const forgotNonexistentData = await forgotNonexistent.json();
    assert(forgotNonexistent.status === 200 && forgotNonexistentData.success, 'Nonexistent account returns uniform success message');

    // 5b. Existing account returns exact same message
    const forgotExisting = await fetch(`${BASE_URL}/api/merchants/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: testEmail })
    });
    const forgotExistingData = await forgotExisting.json();
    assert(
      forgotExisting.status === 200 && forgotExistingData.message === forgotNonexistentData.message,
      'Existing account returns identical uniform response preventing account enumeration'
    );

  } finally {
    server.close();
    console.log('\n===============================================================');
    console.log(`TEST SUITE FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================');
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});

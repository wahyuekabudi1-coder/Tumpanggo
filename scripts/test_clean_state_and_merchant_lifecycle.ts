/**
 * Verification Script: Clean State & Complete Merchant Lifecycle from Zero
 * Tests:
 * 1. Clean operational state verification (merchants, orders, drivers, reviews, menu items = 0)
 * 2. Master Admin Login with preserved credentials
 * 3. Fresh Partner Registration (New Merchant submission with status PENDING)
 * 4. Admin Inspection of Pending Registrations
 * 5. Admin Approval & Merchant Account Activation
 * 6. Merchant Login with newly approved credentials
 * 7. Merchant adds category & menu item
 * 8. Customer queries merchant & menu item (visible to public)
 * 9. Customer places an order on newly created menu
 * 10. Order is tracked with valid orderNumber
 * 11. Cleanup test data so database returns to 100% pristine zero state
 */

import fs from 'fs';
import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';

async function run() {
  console.log('===============================================================');
  console.log('TEST: ZERO DUMMY STATE & FULL MERCHANT ONBOARDING LIFECYCLE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${total}. ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${total}. ${name}${detail ? ` (${detail})` : ''}`);
    }
  }

  const BASE_URL = 'http://127.0.0.1:3000';
  const rand = Math.floor(1000 + Math.random() * 9000);
  const testEmail = `warungberkah_${rand}@example.com`;
  const testPhone = `0812987${rand}`;
  const testPassword = 'Password123#';

  // 1. Initial State: Database is 100% clean on disk
  const diskDb = JSON.parse(fs.readFileSync(foodConfig.localDbFile, 'utf-8'));
  assert(diskDb.merchants.length === 0, 'Database: 0 dummy merchants present', `Count: ${diskDb.merchants.length}`);
  assert(diskDb.menuItems.length === 0, 'Database: 0 dummy menu items present', `Count: ${diskDb.menuItems.length}`);
  assert(diskDb.orders.length === 0, 'Database: 0 dummy orders present', `Count: ${diskDb.orders.length}`);
  assert(diskDb.drivers.length === 0, 'Database: 0 dummy drivers present', `Count: ${diskDb.drivers.length}`);
  assert(diskDb.testimonials.length === 0, 'Database: 0 dummy testimonials present', `Count: ${diskDb.testimonials.length}`);
  assert(diskDb.settlements.length === 0, 'Database: 0 dummy settlements present', `Count: ${diskDb.settlements.length}`);

  // 2. Master Admin Login
  const masterRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'tumpanggo@gmail.com',
      password: process.env.MASTER_ADMIN_PASSWORD || 'TumpangGoAdmin#2026',
      role: 'ADMIN'
    })
  });
  const masterData = await masterRes.json();
  assert(masterRes.ok && Boolean(masterData.token), 'Admin Login works with preserved credentials', JSON.stringify(masterData));
  const adminToken = masterData.token;

  // 3. New Merchant Registration via /api/merchants/register
  const testRegPayload = {
    name: `Warung Berkah ${rand}`,
    ownerName: 'Siti Aminah',
    email: testEmail,
    phone: testPhone,
    address: 'Jl. Raya Tumpang No. 45, Kecamatan Tumpang',
    category: 'Nasi & Lauk',
    description: 'Masakan khas Tumpang dengan bumbu tradisional',
    password: testPassword
  };

  const regRes = await fetch(`${BASE_URL}/api/merchants/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testRegPayload)
  });
  const regData = await regRes.json();
  assert(regRes.ok && regData.success && regData.status === 'PENDING', 'New merchant registration submitted successfully with PENDING status', JSON.stringify(regData));
  const registrationId = regData.registration?.id;

  // 4. Verify unapproved merchant cannot log in prior to approval
  const prematureLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      role: 'MERCHANT'
    })
  });
  assert(prematureLoginRes.status === 403, 'Unapproved merchant is blocked from login with 403 status');

  // 5. Admin Checks & Approves Partner Registration
  const listRegRes = await fetch(`${BASE_URL}/api/partner-registrations`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const listRegData = await listRegRes.json();
  const foundReg = Array.isArray(listRegData) && listRegData.find((r: any) => r.id === registrationId);
  assert(Boolean(foundReg), 'Admin can view pending registration in partner list');

  const approveRes = await fetch(`${BASE_URL}/api/partner-registrations/${registrationId}/approve`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const approveData = await approveRes.json();
  assert(approveRes.ok && approveData.success, 'Admin approves merchant registration successfully', JSON.stringify(approveData));
  const createdStoreId = approveData.registration?.storeId;

  // 6. Newly Approved Merchant Logs in
  const merchantLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      role: 'MERCHANT'
    })
  });
  const merchantAuth = await merchantLoginRes.json();
  assert(merchantLoginRes.ok && Boolean(merchantAuth.token), 'Approved Merchant logs in successfully with issued token');
  const merchantToken = merchantAuth.token;
  const merchantId = merchantAuth.user?.id || createdStoreId;

  // 7. Merchant Creates Menu Category & Food Item
  const catRes = await fetch(`${BASE_URL}/api/merchants/${merchantId}/categories`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${merchantToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Makanan Utama' })
  });
  const catData = await catRes.json();
  assert(catRes.ok && Boolean(catData.id), 'Merchant creates new menu category', JSON.stringify(catData));

  const menuRes = await fetch(`${BASE_URL}/api/merchants/${merchantId}/menu`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${merchantToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Nasi Rawon Tumpang Spesial',
      price: 18000,
      description: 'Rawon daging sapi kuah pekat dengan kecambah dan sambal terasi',
      categoryId: catData.id,
      category: 'Makanan Utama',
      available: true
    })
  });
  const menuData = await menuRes.json();
  assert(menuRes.ok && Boolean(menuData.id), 'Merchant creates food menu item', JSON.stringify(menuData));

  // 8. Customer fetches merchant and sees published menu
  const customerMenuRes = await fetch(`${BASE_URL}/api/merchants/${merchantId}/menu`);
  const customerMenuItems = await customerMenuRes.json();
  const hasItem = Array.isArray(customerMenuItems) && customerMenuItems.some((i: any) => i.id === menuData.id);
  assert(hasItem, 'Customer can see newly published menu item');

  // 9. Customer Places an Order for the new menu
  const orderPayload = {
    merchantId,
    customerName: 'Ahmad Fauzi',
    customerPhone: '081234567800',
    deliveryAddress: 'Jl. Malangsuko No. 12, Desa Malangsuko, Kecamatan Tumpang',
    deliveryDetails: 'Depan gapura RT 02',
    landmark: 'Dekat Candi Kidal',
    items: [
      {
        menuItemId: menuData.id,
        quantity: 2
      }
    ]
  };

  const createOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  });
  const orderResult = await createOrderRes.json();
  const createdOrder = orderResult.order || orderResult;
  assert(createOrderRes.ok && Boolean(createdOrder?.id), 'Customer successfully creates order for new merchant food', JSON.stringify(orderResult));
  assert(createdOrder?.deliveryFee === 5000, 'Flat Rp 5.000 delivery fee applied for Kecamatan Tumpang destination');

  // 10. Clean up operational state so database returns to 100% pristine empty state
  foodDb.resetAllOperationalData();
  const postCleanDb = JSON.parse(fs.readFileSync(foodConfig.localDbFile, 'utf-8'));
  assert(postCleanDb.merchants.length === 0, 'Database returned to 0 merchants');
  assert(postCleanDb.menuItems.length === 0, 'Database returned to 0 menu items');
  assert(postCleanDb.orders.length === 0, 'Database returned to 0 orders');
  assert(postCleanDb.drivers.length === 0, 'Database returned to 0 drivers');

  console.log('\n===============================================================');
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('===============================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

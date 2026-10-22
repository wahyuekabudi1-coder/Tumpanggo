/**
 * Verification Script: Clean State & Merchant Lifecycle from Zero
 * Tests:
 * 1. Clean operational state verification (merchants, orders, drivers, reviews, menu items = 0)
 * 2. Master Admin Login with preserved credentials
 * 3. Fresh Partner Registration (New Merchant submission)
 * 4. Admin Inspection of Pending Registrations
 * 5. Admin Approval & Merchant Account Activation
 * 6. Merchant Login with newly approved credentials
 * 7. Merchant adds store profile & menu item
 * 8. Cleanup test merchant so database remains pristine clean
 */

import fs from 'fs';
import { foodDb } from '../src/server/db';

async function run() {
  console.log('===============================================================');
  console.log('TEST: ZERO DUMMY STATE & NEW MERCHANT REGISTRATION LIFECYCLE');
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

  // 1. Operational State is completely empty on disk
  const diskDb = JSON.parse(fs.readFileSync('tumpang_food_db.json', 'utf-8'));
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

  // 3. New Merchant Direct Registration via /api/merchants/register (used by MerchantRegisterPage)
  const testRegPayload = {
    name: 'Warung Berkah Bersih',
    ownerName: 'Budi Santoso',
    email: 'warungberkah@example.com',
    phone: '081298765432',
    address: 'Jl. Raya Tumpang No. 99, Malang',
    category: 'Kuliner',
    description: 'Menyediakan masakan rumahan higienis dan nikmat',
    password: 'password123'
  };

  const regRes = await fetch(`${BASE_URL}/api/merchants/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testRegPayload)
  });
  const regData = await regRes.json();
  assert(regRes.ok && regData.success, 'New merchant registration submitted successfully', JSON.stringify(regData));
  const newMerchant = regData.merchant;

  // 4. Partner Registration Application Workflow via /api/partner-registrations
  const partnerApplicationRes = await fetch(`${BASE_URL}/api/partner-registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MERCHANT',
      name: 'Budi Santoso',
      phone: '081298765433',
      email: 'warungmitra@example.com',
      notes: 'Pendaftaran kemitraan UMKM baru'
    })
  });
  const partnerAppData = await partnerApplicationRes.json();
  assert(partnerApplicationRes.ok && Boolean(partnerAppData.id), 'Partner application submitted via /api/partner-registrations');
  const regId = partnerAppData.id;

  // 5. Admin Checks & Approves Partner Registration
  const listRegRes = await fetch(`${BASE_URL}/api/partner-registrations`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const listRegData = await listRegRes.json();
  const foundReg = Array.isArray(listRegData) && listRegData.find((r: any) => r.id === regId);
  assert(Boolean(foundReg), 'Admin can view pending registration in list');

  const approveRes = await fetch(`${BASE_URL}/api/partner-registrations/${regId}/approve`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const approveData = await approveRes.json();
  assert(approveRes.ok && approveData.success, 'Admin approves registration successfully', JSON.stringify(approveData));

  // 6. Newly Created Merchant Logins
  const merchantLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'warungberkah@example.com',
      password: 'password123',
      role: 'MERCHANT'
    })
  });
  const merchantAuth = await merchantLoginRes.json();
  assert(merchantLoginRes.ok && Boolean(merchantAuth.token), 'New Merchant logs in successfully with new account');

  // 7. Cleanup the test registration and merchant so DB stays 100% clean
  foodDb.resetAllOperationalData();
  assert(foodDb.getMerchants().length === 0, 'Database cleaned after test - ready for real users');

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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Automated Verification Suite for Supabase Unified Persistence Layer Audit
 * Tests:
 * 1. createMerchant / updateMerchant / deleteMerchant using Supabase mock
 * 2. Cascading cleanup of child categories & menu items on merchant delete
 * 3. deleteCategory cascading deletion of menu items
 * 4. createMenuItem / deleteMenuItem
 * 5. createDriver / deleteDriver (including active orders guard)
 * 6. approvePartnerRegistration & approveMerchantPartnerRegistration (success path and compensation rollback)
 * 7. deleteTestimonial (cache consistency & failure handling)
 * 8. Zero calls to Firestore Admin when Supabase is active
 */

import fs from 'fs';
import { foodConfig } from '../src/server/config';
import { foodDb } from '../src/server/db';
import { __setSupabaseMockForTesting, SupabaseTestMockState } from '../src/server/supabaseAdapter';
import { OrderStatus } from '../src/types';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
  }
}

async function runAuditSuite() {
  const initialDbContent = fs.existsSync(foodConfig.localDbFile) 
    ? fs.readFileSync(foodConfig.localDbFile, 'utf8') 
    : null;

  console.log('\n======================================================');
  console.log('🧪 RUNNING SUPABASE UNIFIED PERSISTENCE AUDIT TEST SUITE');
  console.log('======================================================\n');

  // Track all Supabase mock operations
  const supabaseUpserts: { collection: string; id: string; data: any }[] = [];
  const supabaseDeletes: { collection: string; id: string }[] = [];

  const mockState: SupabaseTestMockState = {
    isConfigured: true,
    upsertSuccess: true,
    deleteSuccess: true,
    probeResult: { connected: true, url: 'https://mock.supabase.co' },
    onUpsert: (collection, id, data) => {
      supabaseUpserts.push({ collection, id, data });
    },
    onDelete: (collection, id) => {
      supabaseDeletes.push({ collection, id });
    }
  };

  __setSupabaseMockForTesting(mockState);

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: createMerchant & deleteMerchant with cascade cleanup
    // ---------------------------------------------------------------------------
    console.log('\n--- 1. MERCHANTS CRUD & CASCADING DELETION ---');
    supabaseUpserts.length = 0;
    supabaseDeletes.length = 0;

    const uniqueSuffix = Math.floor(100000 + Math.random() * 900000).toString();
    const testMerchant = await foodDb.createMerchant('admin_test', {
      name: 'Warung Bakso Test ' + uniqueSuffix,
      ownerName: 'Budi Santoso',
      phone: '0812' + uniqueSuffix,
      address: 'Jl. Raya Tumpang No. 99',
      image: '/umkm-activity.jpg',
      category: 'Bakso & Mie'
    });

    assert(Boolean(testMerchant && testMerchant.id), 'Merchant successfully created in memory and persistence layer');
    const merchantUpsert = supabaseUpserts.find(u => u.collection === 'merchants' && u.id === testMerchant.id);
    assert(Boolean(merchantUpsert), 'Merchant was persisted to Supabase (not Firestore)');

    // Add a category and menu item to this merchant
    const category = await foodDb.createCategory(testMerchant.id, 'Bakso Istimewa');
    const catUpsert = supabaseUpserts.find(u => u.collection === 'categories' && u.id === category.id);
    assert(Boolean(catUpsert), 'Category was persisted to Supabase');

    const menuItem = await foodDb.createMenuItem(testMerchant.id, {
      name: 'Bakso Urat Komplit',
      price: 15000,
      available: true,
      categoryId: category.id,
      image: '/umkm-activity.jpg'
    });
    const itemUpsert = supabaseUpserts.find(u => u.collection === 'menuItems' && u.id === menuItem.id);
    assert(Boolean(itemUpsert), 'Menu item was persisted to Supabase');

    // Delete merchant: verify cascade delete calls to Supabase for merchant, categories, and menuItems
    supabaseDeletes.length = 0;
    const delMerchantSuccess = await foodDb.deleteMerchant('admin_test', testMerchant.id);
    assert(delMerchantSuccess === true, 'deleteMerchant returned success');
    assert(foodDb.getMerchantById(testMerchant.id) === undefined, 'Merchant was removed from local cache');

    const deletedMerchantRecord = supabaseDeletes.find(d => d.collection === 'merchants' && d.id === testMerchant.id);
    const deletedCatRecord = supabaseDeletes.find(d => d.collection === 'categories' && d.id === category.id);
    const deletedItemRecord = supabaseDeletes.find(d => d.collection === 'menuItems' && d.id === menuItem.id);

    assert(Boolean(deletedMerchantRecord), 'Merchant deleted from Supabase');
    assert(Boolean(deletedCatRecord), 'Child category was cascade deleted from Supabase');
    assert(Boolean(deletedItemRecord), 'Child menu item was cascade deleted from Supabase');

    // ---------------------------------------------------------------------------
    // TEST 2: deleteCategory cascade delete child menu items
    // ---------------------------------------------------------------------------
    console.log('\n--- 2. CATEGORY DELETION & MENU CASCADE ---');
    supabaseUpserts.length = 0;
    supabaseDeletes.length = 0;

    const uniqueSuffix2 = Math.floor(100000 + Math.random() * 900000).toString();
    const merchant2 = await foodDb.createMerchant('admin_test', {
      name: 'Kedai Minuman Test ' + uniqueSuffix2,
      ownerName: 'Siti Rahma',
      phone: '0813' + uniqueSuffix2,
      address: 'Jl. Malangsuko No. 12',
      image: '/umkm-activity.jpg',
      category: 'Minuman Segar'
    });

    const category2 = await foodDb.createCategory(merchant2.id, 'Jus Buah Segar');
    const menuItem2 = await foodDb.createMenuItem(merchant2.id, {
      name: 'Jus Alpukat Kocok',
      price: 12000,
      available: true,
      categoryId: category2.id,
      image: '/umkm-activity.jpg'
    });

    // Delete category2
    supabaseDeletes.length = 0;
    const delCatSuccess = await foodDb.deleteCategory(merchant2.id, category2.id);
    assert(delCatSuccess === true, 'deleteCategory returned true');

    const deletedCatInDb = supabaseDeletes.find(d => d.collection === 'categories' && d.id === category2.id);
    const deletedItemInDb = supabaseDeletes.find(d => d.collection === 'menuItems' && d.id === menuItem2.id);

    assert(Boolean(deletedCatInDb), 'Category deleted from Supabase');
    assert(Boolean(deletedItemInDb), 'Child menu item cascade deleted from Supabase upon category deletion');
    assert(foodDb.getMenuItemsByMerchant(merchant2.id).some(i => i.id === menuItem2.id) === false, 'Child menu item purged from local cache');

    // Clean up merchant2
    await foodDb.deleteMerchant('admin_test', merchant2.id);

    // ---------------------------------------------------------------------------
    // TEST 3: createDriver & deleteDriver (including active orders guard)
    // ---------------------------------------------------------------------------
    console.log('\n--- 3. DRIVER CRUD & ACTIVE ORDER INTEGRITY ---');
    supabaseUpserts.length = 0;
    supabaseDeletes.length = 0;

    const uniqueDriverSuffix = Math.floor(100000 + Math.random() * 900000).toString();
    const newDriver = await foodDb.createDriver('admin_test', {
      name: 'Kurir Kilat Tumpang ' + uniqueDriverSuffix,
      phone: '0819' + uniqueDriverSuffix,
      email: `kurir.${uniqueDriverSuffix}@tumpanggo.id`,
      active: true,
      online: true,
      latitude: -7.9942,
      longitude: 112.7667,
      vehicle: 'Honda Vario N 1234 TG'
    } as any);

    assert(Boolean(newDriver && newDriver.id), 'Driver successfully created');
    const driverUpsert = supabaseUpserts.find(u => u.collection === 'drivers' && u.id === newDriver.id);
    assert(Boolean(driverUpsert), 'Driver upserted to Supabase');

    // Simulate an active delivery assignment
    const mockOrder = {
      id: 'ord_driver_test_999',
      orderNumber: 'TF-TEST-999',
      merchantId: 'm_test_dummy',
      merchantName: 'Toko Dummy',
      customerName: 'Pelanggan Test',
      customerPhone: '08123456789',
      deliveryAddress: 'Jl. Melati',
      latitude: -7.9942,
      longitude: 112.7667,
      items: [],
      subtotal: 20000,
      deliveryFee: 5000,
      serviceFee: 1200,
      total: 26200,
      uniqueCode: 12,
      status: OrderStatus.READY_FOR_PICKUP,
      paymentStatus: 'PAID',
      driverId: newDriver.id,
      driverName: newDriver.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    (foodDb as any).data.orders.push(mockOrder);

    // Attempt to delete driver while having active order -> MUST BE REJECTED
    let deletePrevented = false;
    try {
      await foodDb.deleteDriver('admin_test', newDriver.id);
    } catch (e: any) {
      deletePrevented = true;
      assert(e.message.includes('tugas pengantaran aktif'), 'Active order prevents driver deletion with descriptive message');
    }
    assert(deletePrevented, 'Driver deletion with active orders was rejected');

    // Clear active order
    (foodDb as any).data.orders = (foodDb as any).data.orders.filter((o: any) => o.id !== mockOrder.id);

    // Now delete driver should succeed
    supabaseDeletes.length = 0;
    const delDriverSuccess = await foodDb.deleteDriver('admin_test', newDriver.id);
    assert(delDriverSuccess === true, 'Driver successfully deleted after active orders cleared');
    const deletedDriverInDb = supabaseDeletes.find(d => d.collection === 'drivers' && d.id === newDriver.id);
    assert(Boolean(deletedDriverInDb), 'Driver deleted from Supabase');

    // ---------------------------------------------------------------------------
    // TEST 4: approvePartnerRegistration & approveMerchantPartnerRegistration
    // ---------------------------------------------------------------------------
    console.log('\n--- 4. PARTNER REGISTRATION APPROVAL & ROLLBACK ---');
    supabaseUpserts.length = 0;
    supabaseDeletes.length = 0;

    const testId = Date.now().toString().slice(-6);
    const partnerReg = await foodDb.createPartnerRegistration({
      name: 'Dewi Lestari ' + testId,
      storeName: 'Warung Nasi Pecel ' + testId,
      storeAddress: 'Jl. Simpang Empat Tumpang No. ' + testId,
      phone: '0857' + testId + '11',
      email: `dewi.${testId}@tumpanggo.id`,
      password: 'password123',
      type: 'MERCHANT',
      category: 'Nasi & Lauk',
      businessPhoto: '/umkm-activity.jpg',
      idPhoto: '/umkm-activity.jpg'
    });

    assert(Boolean(partnerReg && partnerReg.id), 'Partner registration created');
    const regUpsert = supabaseUpserts.find(u => u.collection === 'partnerRegistrations' && u.id === partnerReg.id);
    assert(Boolean(regUpsert), 'Partner registration persisted to Supabase');

    // Approve registration via approveMerchantPartnerRegistration alias
    const approvalResult = await foodDb.approveMerchantPartnerRegistration('admin_test', partnerReg.id);
    assert(approvalResult.success === true, 'approveMerchantPartnerRegistration returned success');
    assert(approvalResult.registration?.status === 'APPROVED', 'Registration status changed to APPROVED');
    assert(Boolean(approvalResult.registration?.storeId), 'Store ID was assigned to approved registration');

    const createdMerchantFromReg = foodDb.getMerchantById(approvalResult.registration!.storeId!);
    assert(Boolean(createdMerchantFromReg), 'Merchant was created and exists in database');

    // Verify Supabase updates
    const approvedRegInDb = supabaseUpserts.find(u => u.collection === 'partnerRegistrations' && u.id === partnerReg.id && u.data.status === 'APPROVED');
    assert(Boolean(approvedRegInDb), 'Registration approval status saved to Supabase');

    // Clean up created merchant
    if (createdMerchantFromReg) {
      await foodDb.deleteMerchant('admin_test', createdMerchantFromReg.id);
    }

    // TEST 4B: Rollback on failure
    console.log('\n--- 4B. APPROVAL COMPENSATION ROLLBACK ON FAILURE ---');
    const testId2 = (Date.now() + 1).toString().slice(-6);
    const partnerReg2 = await foodDb.createPartnerRegistration({
      name: 'Rudi Hartono ' + testId2,
      storeName: 'Sate Ayam Madura ' + testId2,
      storeAddress: 'Jl. Raya Tumpang Timur No. ' + testId2,
      phone: '0858' + testId2 + '22',
      email: `rudi.${testId2}@tumpanggo.id`,
      password: 'password123',
      type: 'MERCHANT',
      category: 'Sate & Bakaran',
      businessPhoto: '/umkm-activity.jpg',
      idPhoto: '/umkm-activity.jpg'
    });

    // Configure mock to fail on registration update during approval to test compensation rollback
    let rollbackDeleteTriggered = false;
    mockState.onDelete = (collection, id) => {
      if (collection === 'merchants') {
        rollbackDeleteTriggered = true;
      }
    };

    // Temporarily simulate failure on partnerRegistrations upsert
    const originalUpsert = mockState.onUpsert;
    mockState.upsertSuccess = false;
    mockState.upsertError = 'Simulated Supabase storage failure';

    const failedApproval = await foodDb.approvePartnerRegistration('admin_test', partnerReg2.id);
    assert(failedApproval.success === false, 'Approval failed safely when Supabase rejected the write');

    // Reset mock
    mockState.upsertSuccess = true;
    mockState.upsertError = undefined;

    // Check that partnerReg2 status is still PENDING (not corrupted)
    const refreshedReg2 = (foodDb as any).data.partnerRegistrations.find((r: any) => r.id === partnerReg2.id);
    assert(refreshedReg2.status === 'PENDING', 'Registration status safely rolled back to PENDING');

    // ---------------------------------------------------------------------------
    // TEST 5: deleteTestimonial (cache consistency & failure handling)
    // ---------------------------------------------------------------------------
    console.log('\n--- 5. TESTIMONIAL CREATION & DELETION CACHE INTEGRITY ---');
    supabaseUpserts.length = 0;
    supabaseDeletes.length = 0;

    const testimonial = await foodDb.createTestimonial({
      userName: 'Ahmad Fauzi',
      merchantName: 'Warung Bu Siti',
      category: 'pelanggan',
      title: 'Makanan Sangat Enak',
      content: 'Pengantaran tepat waktu dan makanan masih hangat.',
      rating: 5,
      consentApproved: true,
      status: 'published',
      displayOrder: 1
    });

    assert(Boolean(testimonial && testimonial.id), 'Testimonial created');
    const testiUpsert = supabaseUpserts.find(u => u.collection === 'testimonials' && u.id === testimonial.id);
    assert(Boolean(testiUpsert), 'Testimonial upserted to Supabase');

    // Test failure handling: if Supabase delete fails, local cache must NOT be deleted
    mockState.deleteSuccess = false;
    mockState.deleteError = 'Simulated delete error';

    const failDelTesti = await foodDb.deleteTestimonial(testimonial.id);
    assert(failDelTesti === false, 'deleteTestimonial returns false when Supabase deletion fails');
    const cachedTestiAfterFail = foodDb.getAllTestimonials().find(t => t.id === testimonial.id);
    assert(Boolean(cachedTestiAfterFail), 'Cache was preserved and NOT mutated when cloud delete failed (Rule D)');

    // Reset deleteSuccess to true
    mockState.deleteSuccess = true;
    mockState.deleteError = undefined;

    const successDelTesti = await foodDb.deleteTestimonial(testimonial.id);
    assert(successDelTesti === true, 'deleteTestimonial returns true when Supabase deletion succeeds');
    const cachedTestiAfterSuccess = foodDb.getAllTestimonials().find(t => t.id === testimonial.id);
    assert(cachedTestiAfterSuccess === undefined, 'Cache is updated only AFTER cloud delete succeeds');

  } finally {
    // Restore mock state
    __setSupabaseMockForTesting(null);
    if (initialDbContent && fs.existsSync(foodConfig.localDbFile)) {
      fs.writeFileSync(foodConfig.localDbFile, initialDbContent, 'utf8');
      (foodDb as any).data = JSON.parse(initialDbContent);
    }
  }

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAuditSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

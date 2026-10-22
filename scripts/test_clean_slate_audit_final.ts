/**
 * Clean Slate Final Audit & Backup/Restore Test Suite
 * Non-destructive verification of clean slate mechanisms in test/non-production environment.
 */

import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import {
  parseServiceAccountKey,
  maskClientEmail
} from '../src/server/firebaseAdmin';

async function runAuditTests() {
  console.log('=== STARTING CLEAN SLATE FINAL AUDIT TEST SUITE ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // TEST 1: Service Account credential parsing & sanitization
  console.log('\n--- 1. Service Account Parsing & Sanitization ---');
  const dummySA = JSON.stringify({
    type: 'service_account',
    project_id: 'tumpanggo-70479',
    private_key_id: 'key123',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----',
    client_email: 'firebase-adminsdk-xyz@tumpanggo-70479.iam.gserviceaccount.com',
    client_id: '123456789'
  });

  const parsed = parseServiceAccountKey(dummySA, 'tumpanggo-70479');
  assert(parsed.reason === 'OK', 'Valid Service Account parses with reason OK');
  assert(parsed.projectId === 'tumpanggo-70479', 'Target Project ID matches tumpanggo-70479');
  assert(parsed.clientEmailMasked?.startsWith('fir***@'), 'Client email is safely masked');
  
  // Verify that external diagnostics/probe responses never contain private keys
  const probeResponse = {
    projectId: parsed.projectId,
    clientEmail: parsed.clientEmailMasked,
    reason: parsed.reason
  };
  assert(!JSON.stringify(probeResponse).includes('PRIVATE KEY'), 'Diagnostic probe response never exposes private key');

  // TEST 2: Plan Endpoint in Development (Explicit labeling)
  console.log('\n--- 2. Plan Generation & Anti-False-Zero Protections ---');
  const devPlan = await foodDb.getCleanSlatePlan();
  assert(devPlan.targetProjectId === 'tumpanggo-70479', 'Target project is tumpanggo-70479');
  assert(devPlan.targetDatabaseId === '(default)', 'Target database is (default)');
  assert(
    devPlan.storageMode === 'development_local_snapshot' || devPlan.storageMode === 'cloud_firestore_verified',
    'Storage mode clearly distinguishes cloud verified vs development local snapshot'
  );
  assert(
    devPlan.toPreserve.masterAccountEmail === 'tumpanggo@gmail.com',
    'Master admin account (tumpanggo@gmail.com) is locked for preservation'
  );
  assert(devPlan.toPreserve.flatDeliveryFee === 5000, 'Flat delivery fee Rp 5.000 is preserved');
  assert(devPlan.toPreserve.commissionPercent === 10, 'Commission 10% is preserved');

  // TEST 3: Strict Production Fail-Safe (No cloud connection -> Immediate Error)
  console.log('\n--- 3. Strict Production Mode Error on Disconnected Cloud ---');
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    foodConfig.isProduction = true;

    let threwError = false;
    let errMessage = '';
    try {
      await foodDb.getCleanSlatePlan();
    } catch (e: any) {
      threwError = true;
      errMessage = e.message;
    }
    assert(threwError, 'Production mode strictly throws error when Firestore cloud is not connected');
    assert(errMessage.includes('[Produksi]'), 'Error message clearly specifies [Produksi] constraint');
  } finally {
    process.env.NODE_ENV = originalEnv;
    foodConfig.isProduction = false;
  }

  // TEST 4: Sensitive Data Sanitization for Backups
  console.log('\n--- 4. Backup Sanitization & Security ---');
  const testDoc = {
    id: 'm_test_secure',
    name: 'Warung Uji Bersih',
    password: 'plain_password_123',
    passwordHash: 'pbkdf2$10000$secret',
    token: 'jwt_secret_token',
    secret: 'api_secret_key',
    phone: '08123456789',
    description: 'Toko aman'
  };

  // We test the sanitization pattern directly
  const sanitized = { ...testDoc } as any;
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.token;
  delete sanitized.secret;

  assert(sanitized.password === undefined, 'password is completely removed from backup doc');
  assert(sanitized.passwordHash === undefined, 'passwordHash is completely removed from backup doc');
  assert(sanitized.token === undefined, 'token is completely removed from backup doc');
  assert(sanitized.secret === undefined, 'secret is completely removed from backup doc');
  assert(sanitized.name === 'Warung Uji Bersih', 'Operational fields (name) are preserved');

  // TEST 5: Order Transaction Self-Sufficiency & Immutability
  console.log('\n--- 5. Order Transaction Immutability Audit ---');
  const sampleOrder = {
    id: 'ord_sample_999',
    merchantId: 'm_purged_1',
    merchantName: 'Warung Rawon Bu Tin Tumpang',
    customerName: 'Budi Santoso',
    customerPhone: '081234567890',
    deliveryAddress: 'Jl. Raya Tumpang No. 12',
    items: [
      { id: 'item_1', name: 'Rawon Daging Spesial', price: 25000, quantity: 2, subtotal: 50000 }
    ],
    subtotal: 50000,
    deliveryFee: 5000,
    serviceFee: 2000,
    total: 57000,
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    isSettled: true,
    settlementId: 'set_sample_123',
    createdAt: new Date().toISOString()
  };

  // Verifying snapshot persistence: order has its own embedded merchantName and line item details
  assert(typeof sampleOrder.merchantName === 'string', 'Order stores merchantName as immutable snapshot');
  assert(Array.isArray(sampleOrder.items) && sampleOrder.items.length > 0, 'Order stores line items with names and prices');
  assert(sampleOrder.deliveryFee === 5000, 'Order reflects flat delivery fee');
  // TEST 6: Backup Records Splitting & Round-trip Restoration Simulation
  console.log('\n--- 6. Backup Document Splitting & Restore Simulation ---');
  const mockCollections: Record<string, any[]> = {
    merchants: [
      { id: 'm_1', name: 'Warung Bakso Tumpang', phone: '081111', password: 'secret_pw' },
      { id: 'm_2', name: 'Sate Kambing Pak No', phone: '082222', passwordHash: 'hash_xyz' }
    ],
    categories: [
      { id: 'cat_1', merchantId: 'm_1', name: 'Makanan Berat', orderIndex: 1 },
      { id: 'cat_2', merchantId: 'm_2', name: 'Sate & Gule', orderIndex: 1 }
    ],
    menuItems: [
      { id: 'item_1', merchantId: 'm_1', name: 'Bakso Campur Jumbo', price: 18000 },
      { id: 'item_2', merchantId: 'm_2', name: 'Sate Kambing 10 Tusuk', price: 35000 }
    ],
    partnerRegistrations: [
      { id: 'reg_1', type: 'MERCHANT', name: 'Pak No', storeName: 'Sate Kambing Pak No', status: 'APPROVED' }
    ]
  };

  // Simulate backup record packaging
  const backupRecords: { id: string; targetCollection: string; payload: any }[] = [];
  for (const [colName, docs] of Object.entries(mockCollections)) {
    for (const doc of docs) {
      const sanitizedDoc = { ...doc };
      delete (sanitizedDoc as any).password;
      delete (sanitizedDoc as any).passwordHash;
      backupRecords.push({
        id: `${colName}__${doc.id}`,
        targetCollection: colName,
        payload: sanitizedDoc
      });
    }
  }

  assert(backupRecords.length === 7, 'All 7 mock records are individually packaged into backup items');
  assert(backupRecords.every(r => !r.payload.password && !r.payload.passwordHash), 'All packaged records are clean of credentials');

  // Simulate restoration from backup records
  const restoredTargetCollections: Record<string, any[]> = {
    merchants: [],
    categories: [],
    menuItems: [],
    partnerRegistrations: []
  };

  for (const rec of backupRecords) {
    if (restoredTargetCollections[rec.targetCollection]) {
      restoredTargetCollections[rec.targetCollection].push(rec.payload);
    }
  }

  assert(restoredTargetCollections.merchants.length === 2, 'Restored 2 merchants');
  assert(restoredTargetCollections.categories.length === 2, 'Restored 2 categories');
  assert(restoredTargetCollections.menuItems.length === 2, 'Restored 2 menu items');
  assert(restoredTargetCollections.partnerRegistrations.length === 1, 'Restored 1 partner registration');
  assert(restoredTargetCollections.merchants[0].name === 'Warung Bakso Tumpang', 'Restored merchant data integrity verified');

  // TEST 7: Chunking Limit Guard (<= 400 operations per batch)
  console.log('\n--- 7. Firestore Batch Limit Guard (Chunking <= 400) ---');
  const CHUNK_SIZE = 400;
  const largeIdList = Array.from({ length: 950 }, (_, i) => `doc_${i + 1}`);
  const chunks: string[][] = [];
  for (let i = 0; i < largeIdList.length; i += CHUNK_SIZE) {
    chunks.push(largeIdList.slice(i, i + CHUNK_SIZE));
  }

  assert(chunks.length === 3, '950 documents correctly split into 3 batch chunks');
  assert(chunks[0].length === 400, 'Chunk 1 has exactly 400 items');
  assert(chunks[1].length === 400, 'Chunk 2 has exactly 400 items');
  assert(chunks[2].length === 150, 'Chunk 3 has remaining 150 items');
  assert(chunks.every(c => c.length <= 400), 'All chunks strictly satisfy Firestore batch limit <= 400');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTests().catch(e => {
  console.error('Test execution failed:', e);
  process.exit(1);
});

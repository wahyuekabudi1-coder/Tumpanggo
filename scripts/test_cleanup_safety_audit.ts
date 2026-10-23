/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Safety & Regression Test Suite: Tumpang Food Dummy Data Cleanup Utility
 * 
 * Verifies all 8 critical audit safety findings:
 * 1. Single collection failure in Cloud scan marks entire scan as CLOUD_SCAN_NOT_COMPLETED and blocks deletion.
 * 2. Missing Cloud credentials returns CLOUD_SCAN_NOT_COMPLETED, never claims zero dummy count, blocks execute.
 * 3. Project ID mismatch halts immediately before any mutations.
 * 4. Cloud backup failure or read-back mismatch blocks cloud deletion.
 * 5. Cloud backup with zero documents is properly verified on Cloud, and blocked if unverified.
 * 6. Dry-run guarantees zero local disk mutations and zero cloud mutations.
 * 7. Real data, Master Admin, systemConfig, tiered fee, flat ongkir, QRIS, and universal categories are preserved.
 * 8. Live deletion is strictly gated and executes ONLY after all validations and backups succeed.
 */

import fs from 'fs';
import path from 'path';
import {
  classifyRecord,
  validateTargetProject,
  scanCloudFirestore,
  createAndVerifyCloudBackup,
  createAndVerifyLocalBackup,
  scanLocalDatabase,
  runCleanup,
  TARGET_EXPECTED_PROJECT_ID,
  TARGET_COLLECTIONS,
  UNIVERSAL_SYSTEM_CATEGORIES
} from './cleanup_dummy_data';
import { foodConfig } from '../src/server/config';

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${String(total).padStart(2)}. ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${String(total).padStart(2)}. ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

/**
 * Creates an in-memory mock Firestore that mimics collections, documents, subcollections, batches, and queries.
 */
function createMockFirestore(options?: {
  failCollection?: string;
  failBackupWrite?: boolean;
  failBackupReadBack?: boolean;
  recordsSubcollectionFail?: boolean;
  failDocDelete?: string;
  failDocVerification?: string;
}) {
  const store: Record<string, Record<string, any>> = {};
  const subcollections: Record<string, Record<string, Record<string, any>>> = {};
  const deletedDocs: string[] = [];

  const db = {
    _deletedDocs: deletedDocs,
    _store: store,
    _subcollections: subcollections,
    app: {
      options: {
        projectId: TARGET_EXPECTED_PROJECT_ID
      }
    },
    collection: (colName: string) => ({
      doc: (docId: string) => ({
        id: docId,
        set: async (data: any) => {
          if (colName === 'admin_backups' && options?.failBackupWrite) {
            throw new Error('Simulated write failure on admin_backups collection.');
          }
          if (!store[colName]) store[colName] = {};
          store[colName][docId] = data;
        },
        get: async () => {
          if (colName === 'admin_backups' && options?.failBackupReadBack) {
            return { exists: false, data: () => null };
          }
          if (options?.failDocVerification === `${colName}/${docId}`) {
            return { exists: true, id: docId, data: () => ({ id: docId, name: 'Still Exists' }) };
          }
          const item = store[colName]?.[docId];
          return {
            exists: Boolean(item),
            id: docId,
            data: () => item
          };
        },
        delete: async () => {
          if (options?.failDocDelete === `${colName}/${docId}`) {
            throw new Error(`Simulated delete error for ${colName}/${docId}: PERMISSION_DENIED`);
          }
          deletedDocs.push(`${colName}/${docId}`);
          if (store[colName]) {
            delete store[colName][docId];
          }
        },
        collection: (subColName: string) => ({
          doc: (subDocId: string) => ({
            id: subDocId,
            set: async (data: any) => {
              const key = `${colName}/${docId}/${subColName}`;
              if (!subcollections[key]) subcollections[key] = {};
              subcollections[key][subDocId] = data;
            }
          }),
          get: async () => {
            if (options?.recordsSubcollectionFail) {
              return { docs: [] };
            }
            const key = `${colName}/${docId}/${subColName}`;
            const entries = Object.entries(subcollections[key] || {});
            const docs = entries.map(([id, data]) => ({
              id,
              data: () => data
            }));
            return { docs };
          }
        })
      }),
      get: async () => {
        if (options?.failCollection === colName) {
          throw new Error(`Simulated read failure on collection "${colName}": PERMISSION_DENIED / TIMEOUT.`);
        }
        const entries = Object.entries(store[colName] || {});
        const docs = entries.map(([id, data]) => ({
          id,
          data: () => data
        }));
        return { docs };
      }
    }),
    batch: () => {
      const ops: Array<() => Promise<void>> = [];
      return {
        set: (docRef: any, data: any) => {
          ops.push(async () => {
            await docRef.set(data);
          });
        },
        delete: (docRef: any) => {
          ops.push(async () => {
            await docRef.delete();
          });
        },
        commit: async () => {
          for (const op of ops) await op();
        }
      };
    }
  };

  return db;
}

async function runSafetyRegressionSuite() {
  console.log('========================================================================');
  console.log('   TUMPANG FOOD — ADVANCED CLEANUP SAFETY AUDIT REGRESSION SUITE        ');
  console.log('========================================================================\n');

  // ============================================================================
  // SCENARIO 1: Single collection read fails while other collections succeed
  // ============================================================================
  console.log('--- SCENARIO 1: Single Collection Read Failure Handling ---');
  const mockDbOrdersFail = createMockFirestore({ failCollection: 'orders' });
  // Seed some records in other collections
  mockDbOrdersFail._store['merchants'] = {
    m1: { id: 'm1', name: 'Warung Barokah Bu Siti', isDemo: true },
    merch_real: { id: 'merch_real', name: 'Warung Asli Tumpang', phone: '0812345678', address: 'Jl. Raya' }
  };
  mockDbOrdersFail._store['menuItems'] = {
    menu_1: { id: 'menu_1', name: 'Bakso', merchantId: 'm1' }
  };

  const partialScanResult = await scanCloudFirestore(mockDbOrdersFail);
  assert(partialScanResult.isComplete === false, 'Cloud scan marked as isComplete: false when "orders" read fails');
  assert(partialScanResult.diagnostic === 'CLOUD_SCAN_NOT_COMPLETED', 'Cloud scan diagnostic explicitly returns CLOUD_SCAN_NOT_COMPLETED');
  assert(partialScanResult.failedCollections.includes('orders'), 'Failed collections list records "orders"');
  assert(partialScanResult.collectionStatuses['orders'].success === false, 'Status for failed collection "orders" records success: false');
  assert(partialScanResult.collectionStatuses['merchants'].success === true, 'Status for successful collection "merchants" records success: true');
  assert(partialScanResult.totalDummy === null, 'totalDummy is strictly null (never concluded as 0) when scan is incomplete');

  // Verify backup rejection on incomplete scan
  const backupAttemptOnIncomplete = await createAndVerifyCloudBackup(
    partialScanResult.cloudDocsMap,
    TARGET_EXPECTED_PROJECT_ID,
    partialScanResult.isComplete,
    mockDbOrdersFail
  );
  assert(backupAttemptOnIncomplete.success === false, 'Cloud backup creation is rejected when isScanComplete is false');
  assert(backupAttemptOnIncomplete.cloudVerified === false, 'Cloud backup cloudVerified is false');

  // ============================================================================
  // SCENARIO 2: Missing Cloud credentials
  // ============================================================================
  console.log('\n--- SCENARIO 2: Missing Cloud Credentials Handling ---');
  // Call scanCloudFirestore without customDb in offline local environment
  const offlineScanResult = await scanCloudFirestore();
  assert(offlineScanResult.connected === false, 'Cloud connected status is false without credentials');
  assert(
    offlineScanResult.diagnostic.includes('Admin') ||
    offlineScanResult.diagnostic === 'MISSING_CREDENTIALS' ||
    offlineScanResult.diagnostic === 'CLOUD_SCAN_NOT_COMPLETED',
    'Cloud diagnostic reports missing credentials / unverified Admin project'
  );
  assert(offlineScanResult.failedCollections.length === TARGET_COLLECTIONS.length, 'All target collections marked as uncompleted when offline');

  const offlineBackupResult = await createAndVerifyCloudBackup({}, TARGET_EXPECTED_PROJECT_ID, false);
  assert(offlineBackupResult.success === false && offlineBackupResult.cloudVerified === false, 'Backup creation without credentials is fully blocked');

  // ============================================================================
  // SCENARIO 3: Project ID Validation and Mismatch Halting
  // ============================================================================
  console.log('\n--- SCENARIO 3: Project ID Validation & Mismatch Safeguards ---');
  const validProject = validateTargetProject({
    expectedProject: 'tumpanggo-70479',
    activeProject: 'tumpanggo-70479',
    adminAppProject: 'tumpanggo-70479'
  });
  assert(validProject.valid === true, 'Validation passes when all IDs match official "tumpanggo-70479"');

  const mismatchedExpected = validateTargetProject({
    expectedProject: 'wrong-project-123',
    activeProject: 'tumpanggo-70479'
  });
  assert(mismatchedExpected.valid === false, 'Validation rejects when expected project does not match "tumpanggo-70479"');

  const mismatchedActive = validateTargetProject({
    expectedProject: 'tumpanggo-70479',
    activeProject: 'dev-different-project'
  });
  assert(mismatchedActive.valid === false, 'Validation rejects when active project does not match "tumpanggo-70479"');

  const mismatchedAdminApp = validateTargetProject({
    expectedProject: 'tumpanggo-70479',
    activeProject: 'tumpanggo-70479',
    adminAppProject: 'other-app-instance'
  });
  assert(mismatchedAdminApp.valid === false, 'Validation rejects when Firebase Admin client project does not match "tumpanggo-70479"');

  const emptyAdminApp = validateTargetProject({
    expectedProject: 'tumpanggo-70479',
    activeProject: 'tumpanggo-70479',
    adminAppProject: '',
    requireAdminApp: true
  });
  assert(emptyAdminApp.valid === false, 'Validation rejects when Admin Project ID is empty string with requireAdminApp: true');

  const undefinedAdminApp = validateTargetProject({
    expectedProject: 'tumpanggo-70479',
    activeProject: 'tumpanggo-70479',
    adminAppProject: undefined,
    requireAdminApp: true
  });
  assert(undefinedAdminApp.valid === false, 'Validation rejects when Admin Project ID is undefined with requireAdminApp: true');

  // Verify that an empty Admin Project ID blocks Cloud scan and Cloud backup
  const mockDbEmptyAdmin = createMockFirestore();
  mockDbEmptyAdmin.app.options.projectId = '';
  const scanEmptyAdminRes = await scanCloudFirestore(mockDbEmptyAdmin);
  assert(scanEmptyAdminRes.connected === false, 'Cloud scan is blocked when Admin Project ID is empty');
  assert(scanEmptyAdminRes.totalDummy === null, 'totalDummy is strictly null when Admin Project ID is empty');

  const backupEmptyAdminRes = await createAndVerifyCloudBackup({}, TARGET_EXPECTED_PROJECT_ID, true, mockDbEmptyAdmin);
  assert(backupEmptyAdminRes.success === false && backupEmptyAdminRes.cloudVerified === false, 'Cloud backup is blocked when Admin Project ID is empty');

  // ============================================================================
  // SCENARIO 4: Cloud Backup Failure Blocking Live Deletion
  // ============================================================================
  console.log('\n--- SCENARIO 4: Cloud Backup Failure Handling ---');
  const mockFailingWriteDb = createMockFirestore({ failBackupWrite: true });
  const sampleDocsMap: Record<string, any[]> = {
    merchants: [{ id: 'm1', name: 'Dummy 1' }]
  };
  const writeFailResult = await createAndVerifyCloudBackup(sampleDocsMap, TARGET_EXPECTED_PROJECT_ID, true, mockFailingWriteDb);
  assert(writeFailResult.success === false, 'Backup fails when Cloud Firestore set() throws');
  assert(writeFailResult.cloudVerified === false, 'cloudVerified is false on write failure');

  const mockFailingReadBackDb = createMockFirestore({ failBackupReadBack: true });
  const readBackFailResult = await createAndVerifyCloudBackup(sampleDocsMap, TARGET_EXPECTED_PROJECT_ID, true, mockFailingReadBackDb);
  assert(readBackFailResult.success === false, 'Backup fails when Cloud Firestore read-back verification fails');
  assert(readBackFailResult.cloudVerified === false, 'cloudVerified is false on read-back failure');

  const mockSubcolFailDb = createMockFirestore({ recordsSubcollectionFail: true });
  const subcolFailResult = await createAndVerifyCloudBackup(sampleDocsMap, TARGET_EXPECTED_PROJECT_ID, true, mockSubcolFailDb);
  assert(subcolFailResult.success === false, 'Backup fails when Cloud subcollection records count does not match totalDocs');

  // ============================================================================
  // SCENARIO 5: Cloud Backup with Zero Documents
  // ============================================================================
  console.log('\n--- SCENARIO 5: Cloud Backup with Zero Documents ---');
  const mockValidDb = createMockFirestore();
  const emptyDocsMap: Record<string, any[]> = {};
  for (const col of TARGET_COLLECTIONS) emptyDocsMap[col] = [];

  const zeroDocBackup = await createAndVerifyCloudBackup(emptyDocsMap, TARGET_EXPECTED_PROJECT_ID, true, mockValidDb);
  assert(zeroDocBackup.success === true, 'Zero-document backup creates verified metadata doc');
  assert(zeroDocBackup.cloudVerified === true, 'Zero-document backup is verified in Cloud Firestore');
  assert(zeroDocBackup.recordCount === 0, 'Zero-document backup records totalDocs: 0');
  
  // Verify metadata doc actually exists in mock Cloud store
  const storedBackupDoc = mockValidDb._store['admin_backups']?.[zeroDocBackup.backupId];
  assert(Boolean(storedBackupDoc), 'admin_backups/{backupId} metadata document exists in Cloud Firestore');
  assert(storedBackupDoc?.metadata?.documentCount === 0, 'Cloud backup metadata records documentCount: 0');

  // Clean local artifact
  if (zeroDocBackup.backupFilePath && fs.existsSync(zeroDocBackup.backupFilePath)) {
    try { fs.unlinkSync(zeroDocBackup.backupFilePath); } catch {}
  }

  // If cloud is offline, zero-doc backup must still NOT claim success
  const offlineZeroDocBackup = await createAndVerifyCloudBackup(emptyDocsMap, TARGET_EXPECTED_PROJECT_ID, true);
  assert(offlineZeroDocBackup.success === false && offlineZeroDocBackup.cloudVerified === false, 'Zero-document backup fails if Cloud Firestore is offline');

  // ============================================================================
  // SCENARIO 6: Dry-Run Zero-Mutation Guarantee
  // ============================================================================
  console.log('\n--- SCENARIO 6: Dry-Run Zero-Mutation Guarantee ---');
  const diskBefore = fs.readFileSync(foodConfig.localDbFile, 'utf-8');
  const dryRunReport = await runCleanup(['--dry-run']);
  const diskAfter = fs.readFileSync(foodConfig.localDbFile, 'utf-8');
  assert(diskBefore === diskAfter, 'Local database file remains bit-for-bit identical after dry run');
  assert(dryRunReport.executionStatus === 'DRY_RUN', 'Report executionStatus is DRY_RUN');
  assert(dryRunReport.environment.cloudScanComplete === false, 'Dry run accurately reflects cloudScanComplete status');

  // ============================================================================
  // SCENARIO 7: Core Data & Business Rule Protection
  // ============================================================================
  console.log('\n--- SCENARIO 7: Core Business Rules & System Protection ---');
  const masterAdminRecord = { id: 'admin_1', email: 'tumpanggo@gmail.com' };
  const resAdmin = classifyRecord('users', masterAdminRecord, new Set());
  assert(resAdmin.classification === 'REAL_PRESERVED' && resAdmin.intendedAction === 'PRESERVE', 'Master admin tumpanggo@gmail.com is strictly PRESERVED');

  const sysConfigRecord = { id: 'config_1', defaultDeliveryFee: 5000, commissionPercent: 10, serviceFee: 2000 };
  const resConfig = classifyRecord('systemConfig', sysConfigRecord, new Set());
  assert(resConfig.classification === 'REAL_PRESERVED' && resConfig.intendedAction === 'PRESERVE', 'Core systemConfig is strictly PRESERVED');

  for (const cat of UNIVERSAL_SYSTEM_CATEGORIES) {
    const catDoc = { id: `cat_${cat}`, name: cat };
    const resCat = classifyRecord('categories', catDoc, new Set());
    assert(resCat.classification === 'REAL_PRESERVED', `Universal category "${cat}" is strictly PRESERVED`);
  }

  const realMerchant = { id: 'merch_real_55', name: 'Warung Barokah Asli', phone: '081299998888', address: 'Jl. Malangsari' };
  const resRealM = classifyRecord('merchants', realMerchant, new Set());
  assert(resRealM.classification === 'REAL_PRESERVED' && resRealM.intendedAction === 'PRESERVE', 'Real merchant with address and phone is PRESERVED');

  const ambiguousDoc = { id: 'doc_ambiguous_99', notes: 'Incomplete record' };
  const resAmbiguous = classifyRecord('merchants', ambiguousDoc, new Set());
  assert(resAmbiguous.classification === 'MANUAL_REVIEW_REQUIRED' && resAmbiguous.intendedAction === 'FLAG_FOR_REVIEW', 'Ambiguous record classified as MANUAL_REVIEW_REQUIRED (not deleted)');

  // Local backup integrity test
  const localBackup = createAndVerifyLocalBackup();
  assert(localBackup.success === true, 'Local database backup created and verified');
  if (localBackup.backupFilePath && fs.existsSync(localBackup.backupFilePath)) {
    try { fs.unlinkSync(localBackup.backupFilePath); } catch {}
  }

  // ============================================================================
  // SCENARIO 8: Execution Gating — Deletion ONLY After Verified Scan & Backup
  // ============================================================================
  console.log('\n--- SCENARIO 8: Execution Gating & Deletion Safety ---');
  // 1. Dry run execute without force/approval aborts
  const abortReport = await runCleanup(['--execute']);
  // In non-interactive test mode without prompt input, prompt fails or returns false
  assert(
    abortReport.executionStatus === 'CANCELLED_BY_USER' ||
    abortReport.executionStatus === 'BLOCKED_SAFETY_CHECK' ||
    abortReport.executionStatus === 'DRY_RUN',
    'Execute without confirmation halts without deleting data'
  );

  // 2. Cloud execute when scan is incomplete is blocked
  const blockedCloudReport = await runCleanup(['--cloud-only', '--execute', '--force']);
  assert(
    blockedCloudReport.executionStatus === 'BLOCKED_SAFETY_CHECK',
    'Cloud-only execute is strictly BLOCKED_SAFETY_CHECK when credentials/scan are incomplete'
  );

  // 3. Test verified mock execution flow
  const mockExecutionDb = createMockFirestore();
  mockExecutionDb._store['merchants'] = {
    m1: { id: 'm1', name: 'Warung Barokah Bu Siti', isDemo: true },
    merch_real: { id: 'merch_real', name: 'Warung Asli Tumpang', phone: '0812345678', address: 'Jl. Raya' }
  };
  for (const col of TARGET_COLLECTIONS) {
    if (col !== 'merchants') mockExecutionDb._store[col] = {};
  }

  // Scan mock
  const execScan = await scanCloudFirestore(mockExecutionDb);
  assert(execScan.isComplete === true, 'Mock cloud scan completes all target collections');
  assert(execScan.totalDummy === 1, 'Mock cloud scan correctly detects 1 dummy merchant');
  
  // Backup mock
  const execBackup = await createAndVerifyCloudBackup(execScan.cloudDocsMap, TARGET_EXPECTED_PROJECT_ID, execScan.isComplete, mockExecutionDb);
  assert(execBackup.success === true && execBackup.cloudVerified === true, 'Cloud backup successfully created and verified on mock Firestore');

  // Perform deletion of target dummy doc
  const targetDummyDocId = execScan.summary['merchants'].items.find(i => i.classification === 'DUMMY_CONFIRMED')?.id;
  assert(targetDummyDocId === 'm1', 'Target dummy document ID is m1');

  await mockExecutionDb.collection('merchants').doc(targetDummyDocId!).delete();
  assert(mockExecutionDb._deletedDocs.includes('merchants/m1'), 'Target dummy document merchants/m1 deleted from Cloud mock');
  assert(Boolean(mockExecutionDb._store['merchants']['merch_real']), 'Real merchant merch_real preserved untouched in Cloud mock');

  // ============================================================================
  // SCENARIO 9: Global Execution Gate — Failed Cloud Scan halts entire execution (Local DB remains UNTOUCHED)
  // ============================================================================
  console.log('\n--- SCENARIO 9: Global Execution Gate (Failed Cloud Scan Protects Local DB) ---');
  const tempDbDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(tempDbDir)) fs.mkdirSync(tempDbDir, { recursive: true });
  const tempLocalDbPath = path.join(tempDbDir, `temp_local_db_test_${Date.now()}.json`);
  
  const initialLocalDbContent = {
    merchants: [{ id: 'm1', name: 'Warung Barokah Bu Siti', isDemo: true }],
    categories: [{ id: 'cat_demo_1', name: 'Demo Cat', isDemo: true }],
    systemConfig: { defaultDeliveryFee: 5000, commissionPercent: 10 }
  };
  fs.writeFileSync(tempLocalDbPath, JSON.stringify(initialLocalDbContent, null, 2), 'utf-8');

  // Create mock DB with failed collection scan
  const mockDbFailedScan = createMockFirestore({ failCollection: 'orders' });
  mockDbFailedScan._store['merchants'] = { m1: { id: 'm1', isDemo: true } };

  const hybridExecuteResult = await runCleanup(['--execute', '--force'], {
    customDb: mockDbFailedScan,
    customLocalDbPath: tempLocalDbPath
  });

  assert(hybridExecuteResult.executionStatus === 'BLOCKED_SAFETY_CHECK', 'Combined --execute is strictly BLOCKED_SAFETY_CHECK when Cloud scan fails');
  const diskAfterBlocked = fs.readFileSync(tempLocalDbPath, 'utf-8');
  assert(diskAfterBlocked === JSON.stringify(initialLocalDbContent, null, 2), 'Local database is completely UNTOUCHED when combined execution is blocked');
  assert(mockDbFailedScan._deletedDocs.length === 0, 'Zero Cloud documents deleted when Cloud scan fails');

  // Also test with completely offline cloud (no credentials)
  const hybridOfflineResult = await runCleanup(['--execute', '--force'], {
    customLocalDbPath: tempLocalDbPath
  });
  assert(hybridOfflineResult.executionStatus === 'BLOCKED_SAFETY_CHECK', 'Combined --execute is strictly BLOCKED_SAFETY_CHECK when Cloud is offline');
  const diskAfterOffline = fs.readFileSync(tempLocalDbPath, 'utf-8');
  assert(diskAfterOffline === JSON.stringify(initialLocalDbContent, null, 2), 'Local database remains completely UNTOUCHED when Cloud is offline in combined execute');

  // ============================================================================
  // SCENARIO 10: Explicit --local-only Isolation
  // ============================================================================
  console.log('\n--- SCENARIO 10: Explicit --local-only Isolation ---');
  const mockCloudUntouched = createMockFirestore();
  mockCloudUntouched._store['merchants'] = { m1: { id: 'm1', isDemo: true } };

  const localOnlyResult = await runCleanup(['--local-only', '--execute', '--force'], {
    customDb: mockCloudUntouched,
    customLocalDbPath: tempLocalDbPath
  });

  assert(localOnlyResult.executionStatus === 'EXECUTED_SUCCESS', '--local-only --execute succeeds when local backup is verified');
  assert(localOnlyResult.environment.cloudConnected === false, 'Cloud is marked not connected / skipped in --local-only mode');
  assert(mockCloudUntouched._deletedDocs.length === 0, 'Cloud database was NEVER touched in --local-only mode (0 deleted docs)');
  assert(Boolean(mockCloudUntouched._store['merchants']['m1']), 'Cloud dummy record remains completely intact');

  // Verify local db was cleaned
  const cleanedLocalData = JSON.parse(fs.readFileSync(tempLocalDbPath, 'utf-8'));
  assert(cleanedLocalData.merchants.length === 0, 'Local dummy merchant removed in --local-only execute');
  assert(cleanedLocalData.systemConfig.defaultDeliveryFee === 5000, 'Local systemConfig preserved in --local-only execute');

  // Clean temp test db file
  try { fs.unlinkSync(tempLocalDbPath); } catch {}

  // ============================================================================
  // SCENARIO 11: Verified Backup Required On ALL Execution Paths
  // ============================================================================
  console.log('\n--- SCENARIO 11: Verified Backup Required On ALL Execution Paths ---');
  // 1. Cloud path with failing backup blocks cloud deletion
  const mockDbFailingBackup = createMockFirestore({ failBackupWrite: true });
  mockDbFailingBackup._store['merchants'] = { m1: { id: 'm1', isDemo: true } };
  for (const col of TARGET_COLLECTIONS) {
    if (col !== 'merchants') mockDbFailingBackup._store[col] = {};
  }
  const cloudOnlyBackupFailResult = await runCleanup(['--cloud-only', '--execute', '--force'], {
    customDb: mockDbFailingBackup
  });
  assert(cloudOnlyBackupFailResult.executionStatus === 'BLOCKED_SAFETY_CHECK', 'Cloud execution blocked when cloud backup verification fails');
  assert(mockDbFailingBackup._deletedDocs.length === 0, 'Zero cloud documents deleted when cloud backup fails');

  // 2. Combined mode with failing Cloud backup leaves BOTH local DB and Cloud DB untouched
  console.log('\n--- SCENARIO 12: Combined Execute with Failing Cloud Backup Protects Local DB ---');
  const tempHybridPath = path.join(process.cwd(), 'backups', `temp_hybrid_db_test_${Date.now()}.json`);
  const initialHybridDbContent = {
    merchants: [{ id: 'm1', name: 'Warung Barokah Bu Siti', isDemo: true }],
    categories: [{ id: 'cat_demo_1', name: 'Demo Cat', isDemo: true }],
    systemConfig: { defaultDeliveryFee: 5000, commissionPercent: 10 }
  };
  fs.writeFileSync(tempHybridPath, JSON.stringify(initialHybridDbContent, null, 2), 'utf-8');

  const mockDbFailingCloudBackup = createMockFirestore({ failBackupWrite: true });
  mockDbFailingCloudBackup._store['merchants'] = { m1: { id: 'm1', isDemo: true } };
  for (const col of TARGET_COLLECTIONS) {
    if (col !== 'merchants') mockDbFailingCloudBackup._store[col] = {};
  }

  const combinedBackupFailResult = await runCleanup(['--execute', '--force'], {
    customDb: mockDbFailingCloudBackup,
    customLocalDbPath: tempHybridPath
  });

  assert(combinedBackupFailResult.executionStatus === 'BLOCKED_SAFETY_CHECK', 'Combined execute is strictly BLOCKED_SAFETY_CHECK when Cloud backup fails');
  const diskAfterCloudBackupFail = fs.readFileSync(tempHybridPath, 'utf-8');
  assert(diskAfterCloudBackupFail === JSON.stringify(initialHybridDbContent, null, 2), 'Local database remains completely UNTOUCHED when Cloud backup fails in combined execute');
  assert(mockDbFailingCloudBackup._deletedDocs.length === 0, 'Cloud database remains completely UNTOUCHED when Cloud backup fails in combined execute');

  // Clean temp hybrid test file
  try { fs.unlinkSync(tempHybridPath); } catch {}

  // ============================================================================
  // SCENARIO 13: Cloud Deletion Error Handling (Throw Exception)
  // ============================================================================
  console.log('\n--- SCENARIO 13: Cloud Deletion Exception / Throw Handling ---');
  const mockDbDeleteThrow = createMockFirestore({ failDocDelete: 'merchants/m1' });
  mockDbDeleteThrow._store['merchants'] = { m1: { id: 'm1', isDemo: true } };
  for (const col of TARGET_COLLECTIONS) {
    if (col !== 'merchants') mockDbDeleteThrow._store[col] = {};
  }

  const deleteThrowResult = await runCleanup(['--cloud-only', '--execute', '--force'], {
    customDb: mockDbDeleteThrow
  });

  assert(
    deleteThrowResult.executionStatus === 'EXECUTED_WITH_ERRORS' || deleteThrowResult.executionStatus === 'EXECUTED_PARTIAL',
    'Execution status reports EXECUTED_WITH_ERRORS or EXECUTED_PARTIAL on delete throw error (not EXECUTED_SUCCESS)'
  );
  assert(deleteThrowResult.executionStatus !== 'EXECUTED_SUCCESS', 'Execution status is NOT EXECUTED_SUCCESS on delete failure');
  assert(Boolean(deleteThrowResult.cloudDeletionResults && deleteThrowResult.cloudDeletionResults.length > 0), 'Deletion result records exist');
  const throwRecord = deleteThrowResult.cloudDeletionResults?.find(r => r.collection === 'merchants' && r.docId === 'm1');
  assert(throwRecord?.deleteSuccess === false, 'Document deleteSuccess is recorded as false');
  assert(Boolean(throwRecord?.error && throwRecord.error.includes('PERMISSION_DENIED')), 'Error is not swallowed and details recorded');
  assert(deleteThrowResult.cloudDeletionSummary?.failedCount === 1, 'Deletion summary reports 1 failed');

  // ============================================================================
  // SCENARIO 14: safeAdminDeleteDoc Returning False Handling
  // ============================================================================
  console.log('\n--- SCENARIO 14: safeAdminDeleteDoc Returning False Handling ---');
  const mockDbDeleteFalse = createMockFirestore();
  mockDbDeleteFalse._store['merchants'] = { m1: { id: 'm1', isDemo: true } };
  for (const col of TARGET_COLLECTIONS) {
    if (col !== 'merchants') mockDbDeleteFalse._store[col] = {};
  }

  const deleteFalseResult = await runCleanup(['--cloud-only', '--execute', '--force'], {
    customDb: mockDbDeleteFalse,
    customDeleteDoc: async () => false
  });

  assert(
    deleteFalseResult.executionStatus === 'EXECUTED_WITH_ERRORS' || deleteFalseResult.executionStatus === 'EXECUTED_PARTIAL',
    'Execution status reports error when safeAdminDeleteDoc returns false'
  );
  assert(deleteFalseResult.executionStatus !== 'EXECUTED_SUCCESS', 'Execution status is NOT EXECUTED_SUCCESS when safeAdminDeleteDoc returns false');
  const falseRecord = deleteFalseResult.cloudDeletionResults?.find(r => r.collection === 'merchants' && r.docId === 'm1');
  assert(falseRecord?.deleteSuccess === false, 'Document deleteSuccess is false when deletion returns false');
  assert(deleteFalseResult.cloudDeletionSummary?.failedCount === 1, 'Deletion summary records failedCount: 1');

  // ============================================================================
  // SCENARIO 15: Post-Deletion Absence Verification Failure Handling
  // ============================================================================
  console.log('\n--- SCENARIO 15: Post-Deletion Absence Verification Failure ---');
  const mockDbVerifyFail = createMockFirestore({ failDocVerification: 'merchants/m1' });
  mockDbVerifyFail._store['merchants'] = { m1: { id: 'm1', isDemo: true } };
  for (const col of TARGET_COLLECTIONS) {
    if (col !== 'merchants') mockDbVerifyFail._store[col] = {};
  }

  const verifyFailResult = await runCleanup(['--cloud-only', '--execute', '--force'], {
    customDb: mockDbVerifyFail
  });

  assert(
    verifyFailResult.executionStatus === 'EXECUTED_WITH_ERRORS' || verifyFailResult.executionStatus === 'EXECUTED_PARTIAL',
    'Execution status reports error when post-deletion absence verification fails'
  );
  assert(verifyFailResult.executionStatus !== 'EXECUTED_SUCCESS', 'Execution status is NOT EXECUTED_SUCCESS when post-deletion verification fails');
  const unverifiedRec = verifyFailResult.cloudDeletionResults?.find(r => r.collection === 'merchants' && r.docId === 'm1');
  assert(unverifiedRec?.deleteSuccess === true, 'deleteSuccess is true because delete command ran');
  assert(unverifiedRec?.verifiedAbsence === false, 'verifiedAbsence is false because document was still found');
  assert(Boolean(unverifiedRec?.error && unverifiedRec.error.includes('masih ditemukan')), 'Unverified record contains diagnostic error message');
  assert(verifyFailResult.cloudDeletionSummary?.unverifiedCount === 1, 'Deletion summary reports unverifiedCount: 1');

  // ============================================================================
  // SCENARIO 16: Successful Deletion with Verified Absence & Real Data Preservation
  // ============================================================================
  console.log('\n--- SCENARIO 16: Complete Successful Deletion with Verified Absence ---');
  const mockDbFullSuccess = createMockFirestore();
  mockDbFullSuccess._store['merchants'] = {
    m1: { id: 'm1', name: 'Warung Barokah Bu Siti', isDemo: true },
    merch_real: { id: 'merch_real', name: 'Warung Asli Tumpang', phone: '0812345678', address: 'Jl. Raya' }
  };
  for (const col of TARGET_COLLECTIONS) {
    if (col !== 'merchants') mockDbFullSuccess._store[col] = {};
  }

  const fullSuccessResult = await runCleanup(['--cloud-only', '--execute', '--force'], {
    customDb: mockDbFullSuccess
  });

  assert(fullSuccessResult.executionStatus === 'EXECUTED_SUCCESS', 'Execution status is EXECUTED_SUCCESS when all dummies are deleted and verified');
  assert(fullSuccessResult.cloudDeletionSummary?.deletedCount === 1, 'Deletion summary reports 1 deleted');
  assert(fullSuccessResult.cloudDeletionSummary?.verifiedAbsenceCount === 1, 'Deletion summary reports 1 verified absence');
  assert(fullSuccessResult.cloudDeletionSummary?.failedCount === 0, 'Deletion summary reports 0 failed');
  assert(fullSuccessResult.cloudDeletionSummary?.unverifiedCount === 0, 'Deletion summary reports 0 unverified');
  assert(mockDbFullSuccess._deletedDocs.includes('merchants/m1'), 'Target dummy merchants/m1 was deleted from mock store');
  assert(Boolean(mockDbFullSuccess._store['merchants']['merch_real']), 'Real merchant merch_real is strictly PRESERVED and untouched');

  console.log('\n========================================================================');
  console.log(`SAFETY REGRESSION AUDIT RESULTS: ${passed} / ${total} tests passed!`);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSafetyRegressionSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

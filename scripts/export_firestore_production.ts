/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Production Cloud Firestore Export Script
 * Project: tumpanggo-70479
 * 
 * Usage:
 *   npx tsx scripts/export_firestore_production.ts
 * 
 * Safety & Security:
 * - Pure READ-ONLY extraction (zero deletes, zero updates, zero data mutations).
 * - Paginated cursor queries via FieldPath.documentId().
 * - Does NOT import to Supabase automatically.
 * - Masks credentials; NEVER logs private keys.
 */

import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { initFirebaseAdmin, isUsingServiceAccount, getExpectedProjectId } from '../src/server/firebaseAdmin';
import { executeProductionFirestoreExport } from '../src/server/services/firestoreProductionExportService';

async function main() {
  console.log('=====================================================================');
  console.log('   TUMPANGGO PRODUCTION CLOUD FIRESTORE EXPORT PIPELINE');
  console.log('   Target Project: tumpanggo-70479');
  console.log('   Mode: Pure READ-ONLY Cursor-Paginated Extraction');
  console.log('=====================================================================\n');

  // Verify credentials configuration
  const targetProject = getExpectedProjectId();
  const initResult = initFirebaseAdmin();

  if (!initResult.success || !isUsingServiceAccount()) {
    console.error('❌ [Security & Operational Guard] Kredensial Service Account belum terkonfigurasi.');
    console.error('Detail:', initResult.error || 'FIREBASE_SERVICE_ACCOUNT_KEY tidak ditemukan.');
    console.error('\nPanduan Penyiapan Aman (Tanpa Mengekspos Kunci di Chat atau Git):');
    console.error('1. Buka Firebase Console -> Project Settings -> Service Accounts pada project "' + targetProject + '".');
    console.error('2. Unduh file kunci privat (service-account.json) ke komputer lokal Anda.');
    console.error('3. Jalankan perintah berikut di terminal Anda sebelum menjalankan ekspor:');
    console.error('   export FIREBASE_SERVICE_ACCOUNT_KEY="/lokasi/aman/service-account.json"');
    console.error('   npm run export:firestore:prod');
    console.error('\n⚠️  PERINGATAN KEAMANAN:');
    console.error('- Jangan pernah menempelkan private key ke chat AI atau memasukkannya ke git/frontend.');
    console.error('- File kredensial disimpan hanya di environment lokal yang aman.\n');
    process.exit(1);
  }

  console.log(`✓ Kredensial Service Account berhasil dimuat untuk proyek "${targetProject}".`);
  console.log('✓ Memulai ekstraksi bertahap dengan pagination kursor...\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = path.resolve(process.cwd(), 'exports', `production_firestore_dump_${timestamp}`);

  try {
    const result = await executeProductionFirestoreExport({
      projectId: targetProject,
      batchSize: 100,
      outputDir,
      onProgress: (collection, batchNumber, count, preEst) => {
        const estText = preEst > 0 ? ` / ~${preEst} est` : '';
        console.log(`  [${collection}] Batch #${batchNumber}: ${count} dokumen diproses${estText}`);
      }
    });

    if (!result.success) {
      console.error('\n❌ Ekspor gagal:', result.error);
      process.exit(1);
    }

    const { manifest } = result;

    console.log('\n=====================================================================');
    console.log('               LAPORAN HASIL EKSPOR FIRESTORE PRODUKSI');
    console.log('=====================================================================');
    console.log(`Proyek Target     : ${manifest.targetProjectId}`);
    console.log(`Waktu Pelaksanaan : ${manifest.exportStartedAt} -> ${manifest.exportCompletedAt}`);
    console.log(`Durasi            : ${(manifest.durationMs / 1000).toFixed(2)} detik`);
    console.log(`Folder Output     : ${manifest.outputDirectory}`);
    console.log('---------------------------------------------------------------------');
    console.log('Koleksi                | Pre-Count | Terbaca | Batch | Konkuren | Status');
    console.log('---------------------------------------------------------------------');

    for (const [col, stats] of Object.entries(manifest.collections)) {
      const colPad = col.padEnd(22, ' ');
      const prePad = String(stats.preCount).padStart(9, ' ');
      const expPad = String(stats.exportedCount).padStart(7, ' ');
      const batPad = String(stats.batchesProcessed).padStart(5, ' ');
      const conPad = String(stats.concurrentChangesDetected).padStart(8, ' ');
      console.log(`${colPad} | ${prePad} | ${expPad} | ${batPad} | ${conPad} | ${stats.status}`);
    }

    console.log('---------------------------------------------------------------------');
    console.log(`TOTAL DOKUMEN DIEKSPOR : ${manifest.totalDocumentsExported}`);
    console.log(`VALIDASI RELASI & FK   : ${manifest.validation.isValid ? '✓ SEMUA VALID' : '⚠️ PERLU PERHATIAN'}`);
    console.log(`  - Dokumen Valid      : ${manifest.validation.totalValid}`);
    console.log(`  - Error              : ${manifest.validation.totalErrors}`);
    console.log(`  - Peringatan         : ${manifest.validation.totalWarnings}`);
    console.log('---------------------------------------------------------------------');
    console.log('Berkas yang Dihasilkan:');
    for (const file of manifest.filesGenerated) {
      console.log(`  - ${file}`);
    }
    console.log('\n✓ Berkas ekspor tersimpan terpisah dari data pengujian lokal.');
    console.log('✓ File SQL dump dan JSON siap untuk diinspeksi sebelum migrasi ke Supabase.');
    console.log('=====================================================================\n');

  } catch (err: any) {
    console.error('Fatal error during production export:', err);
    process.exit(1);
  }
}

main();

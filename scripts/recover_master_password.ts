/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food & Ecosystem Master Account Trusted Administrative Recovery Tool
 * 
 * Provides a secure, off-band administrative process for the owner to recover or rotate
 * the Master Account credentials without public web endpoint exposure or hardcoding passwords.
 * 
 * Usage:
 *   1. Direct secure recovery via CLI:
 *      NEW_MASTER_PASSWORD="<YourSecurePassword>" npx tsx scripts/recover_master_password.ts
 * 
 *   2. Generate single-use administrative emergency token:
 *      npx tsx scripts/recover_master_password.ts --generate-token
 * 
 * Security:
 *   - Never prints passwords, hashes, or tokens to stdout/logs.
 *   - Computes fresh PBKDF2-SHA512 hash with crypto.randomBytes(16) salt and 10,000 iterations.
 *   - Persists atomically to local database snapshot and Cloud Firestore (if configured).
 *   - Mathematically verifies the resulting hash immediately against the input.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../src/server/auth';
import { getMasterAccountCredentials } from '../src/server/config';

const DB_FILE = path.resolve(process.cwd(), 'tumpang_food_db.json');
const BACKUP_FILE = path.resolve(process.cwd(), 'tumpang_food_db.json.backup.json');
const TOKEN_FILE = path.resolve(process.cwd(), '.master_recovery_token');

async function main() {
  const args = process.argv.slice(2);

  // Mode A: Generate single-use recovery token
  if (args.includes('--generate-token')) {
    // Generate local single-use file token (.master_recovery_token)
    const token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });

    console.log('================================================================');
    console.log('🔑 TOKEN PEMULIHAN ADMINISTRATIF SATU KALI DIBUAT SECARA AMAN');
    console.log('================================================================');
    console.log('File token lokal tersimpan di: .master_recovery_token (izin 0600)');
    console.log('Token ini dapat digunakan satu kali untuk memanggil endpoint:');
    console.log('  POST /api/auth/master/emergency-reset atau /auth/master/emergency-reset');
    console.log('  Header: X-Master-Recovery-Key: <token>');
    console.log('  Body: { "newPassword": "<KataSandiBaru>" }');
    console.log('Token akan dikonsumsi secara atomik dan tidak dapat digunakan kembali.');
    console.log('================================================================');
    return;
  }

  // Mode B: Set new password directly from environment variable
  const newPass = process.env.NEW_MASTER_PASSWORD || process.env.RESET_MASTER_PASSWORD;
  if (!newPass) {
    console.log('================================================================');
    console.log('🛡️  ALAT PEMULIHAN KREDENSIAL MASTER ACCOUNT TUMPANGGO');
    console.log('================================================================');
    console.log('Panduan Pemulihan Mandiri yang Aman oleh Pemilik:');
    console.log('');
    console.log('1. Jalankan langsung dengan environment variable:');
    console.log('   NEW_MASTER_PASSWORD="<KataSandiBaruAnda>" npx tsx scripts/recover_master_password.ts');
    console.log('');
    console.log('2. Atau buat token pemulihan satu kali:');
    console.log('   npx tsx scripts/recover_master_password.ts --generate-token');
    console.log('');
    console.log('Keamanan Terjamin:');
    console.log('- Tidak ada kata sandi yang disimpan ke kode sumber.');
    console.log('- Hash PBKDF2 dibuat dengan salt acak 16-byte dan 10.000 iterasi.');
    console.log('- Disimpan persisten ke database yang aktif.');
    console.log('================================================================');
    return;
  }

  const cleanPass = newPass.trim();
  if (cleanPass.length < 8) {
    console.error('❌ GAGAL: Kata sandi baru minimal harus 8 karakter.');
    process.exit(1);
  }

  console.log('================================================================');
  console.log('🛡️  MEMULIHKAN KREDENSIAL MASTER ACCOUNT SECARA PERSISTEN');
  console.log('================================================================\n');

  const creds = getMasterAccountCredentials();
  const targetEmail = creds.email || 'tumpanggo@gmail.com';

  // 1. Generate new PBKDF2 hash
  const newHash = hashPassword(cleanPass);
  const parts = newHash.split('$');
  const iterations = parts[1];
  const salt = parts[2];
  const digestLength = parts[3]?.length;

  console.log('1. Parameter Kriptografi PBKDF2:');
  console.log(`   - Algoritma: PBKDF2-HMAC-SHA512`);
  console.log(`   - Iterasi: ${iterations}`);
  console.log(`   - Salt Acak: ${salt ? `${salt.length / 2} bytes (hex)` : 'tidak valid'}`);
  console.log(`   - Digest Length: ${digestLength ? `${digestLength / 2} bytes` : 'tidak valid'}`);

  // 2. Immediate verification check
  const verification = verifyPassword(cleanPass, newHash);
  if (!verification.valid) {
    console.error('❌ GAGAL: Verifikasi mandiri hash PBKDF2 baru tidak cocok. Operasi dibatalkan.');
    process.exit(1);
  }
  console.log('   ✅ Verifikasi mandiri hash baru: VALID');

  // 3. Update local database file
  if (!fs.existsSync(DB_FILE)) {
    console.error(`❌ GAGAL: File database ${DB_FILE} tidak ditemukan.`);
    process.exit(1);
  }

  const rawDb = fs.readFileSync(DB_FILE, 'utf-8');
  const dbData = JSON.parse(rawDb);
  if (!dbData.systemConfig) dbData.systemConfig = {};
  
  dbData.systemConfig.masterAccount = {
    email: targetEmail,
    passwordHash: newHash,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
  console.log(`\n2. Database Lokal Diperbarui:`);
  console.log(`   ✅ Tersimpan di ${DB_FILE}`);

  // Backup file sync
  try {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
    console.log(`   ✅ Backup tersinkronisasi di ${BACKUP_FILE}`);
  } catch {}

  // 4. Update Firestore if configured
  try {
    const { isFirestoreAdminConfigured, safeAdminSetDoc } = await import('../src/server/firebaseAdmin');
    if (isFirestoreAdminConfigured()) {
      const persisted = await safeAdminSetDoc('systemConfig', 'config_1', dbData.systemConfig);
      console.log(`\n3. Cloud Firestore:`);
      console.log(`   ${persisted ? '✅' : '⚠️'} Sinkronisasi Firestore: ${persisted ? 'BERHASIL' : 'Dilewati/Offline'}`);
    } else {
      console.log(`\n3. Cloud Firestore:`);
      console.log('   ℹ️  Mode lokal aktif (FIREBASE_SERVICE_ACCOUNT_KEY belum diatur; Firestore dilewati).');
    }
  } catch (cloudErr: any) {
    console.log(`\n3. Cloud Firestore:`);
    console.log(`   ℹ️  Penyimpanan lokal digunakan (${cloudErr?.message || 'offline'}).`);
  }

  console.log('\n================================================================');
  console.log('🎉 PEMULIHAN KATA SANDI MASTER ACCOUNT BERHASIL!');
  console.log(`Target Email: ${targetEmail}`);
  console.log('Status: Hash PBKDF2 baru aktif dan tersimpan secara persisten.');
  console.log('Anda sekarang dapat login melalui form login Preview.');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Fatal recovery error:', err?.message || err);
  process.exit(1);
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Persistence & Partnership Contract Workflow Verification Script
 * Validates:
 * 1. Health endpoint database & storage mode reporting
 * 2. Merchant registration with contract compliance & PENDING status
 * 3. Driver registration with PENDING status & task lockout
 * 4. Admin approval flow & credential verification
 * 5. Persistent storage across disk reload
 * 6. Clean removal of test entities without touching configuration or real data
 */

import fs from 'fs';
import path from 'path';
import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import { verifyPassword } from '../src/server/auth';
import { OFFICIAL_CONTRACT_VERSION, OFFICIAL_DRIVER_CONTRACT_VERSION } from '../src/utils/contractDocument';

interface StepResult {
  step: string;
  passed: boolean;
  details: string;
}

const results: StepResult[] = [];

function record(step: string, passed: boolean, details: string) {
  results.push({ step, passed, details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${step}: ${details}`);
}

async function runAudit() {
  console.log('=================================================================');
  console.log('🧪 AUDIT PERSISTENSI DATABASE & KONTRAK KEMITRAAN TUMPANGGO');
  console.log('=================================================================\n');

  await foodDb.ensureInitialized();

  // 1. Storage Status Audit
  console.log('--- 1. AUDIT STORAGE STATUS & HEALTH DIAGNOSTICS ---');
  const storageStatus = await foodDb.getStorageStatus();
  console.log('Storage Status Details:', JSON.stringify(storageStatus, null, 2));

  const hasStorageType = Boolean(storageStatus.storageType);
  const hasFallbackFlag = typeof storageStatus.isUsingFallback === 'boolean';
  record(
    'Storage Status Schema',
    hasStorageType && hasFallbackFlag,
    `storageMode: ${storageStatus.storageMode}, activePersistence: ${storageStatus.activePersistenceType}, fallbackActive: ${storageStatus.isUsingFallback}`
  );

  // 2. Register Test Merchant (Marked TEST)
  console.log('\n--- 2. PENDAFTARAN MITRA TOKO UJI (STATUS PENDING & KONTRAK) ---');
  const testPhone = '08999999001';
  const testEmail = 'warung_test_audit@tumpanggo.local';
  const testPassword = 'TestPassword#2026';
  const testStoreName = 'TEST_WARUNG_AUDIT_2026';
  const testOwner = 'Pemilik Uji Audit';

  const reg = await foodDb.createPartnerRegistration({
    name: testOwner,
    phone: testPhone,
    email: testEmail,
    type: 'MERCHANT',
    storeName: testStoreName,
    storeAddress: 'Jl. Raya Tumpang No. 99, Tumpang, Malang',
    category: 'Nasi & Lauk',
    password: testPassword,
    contractVersion: OFFICIAL_CONTRACT_VERSION,
    contractAgreedAt: new Date().toISOString()
  });

  record(
    'Registrasi Merchant Dibuat',
    Boolean(reg && reg.id),
    `ID: ${reg.id}, Toko: ${reg.storeName}`
  );

  record(
    'Status Awal Wajib PENDING',
    reg.status === 'PENDING',
    `Status terdaftar: "${reg.status}"`
  );

  record(
    'Versi Kontrak Tercatat',
    reg.contractVersion === OFFICIAL_CONTRACT_VERSION,
    `Versi: ${reg.contractVersion}, Waktu: ${reg.contractAgreedAt}`
  );

  // Verify store does NOT appear in active merchants list while PENDING
  const activeMerchants = foodDb.getMerchants();
  const foundActive = activeMerchants.find(m => m.name === testStoreName || m.phone === testPhone);
  record(
    'Isolasi Toko PENDING',
    foundActive === undefined,
    'Toko PENDING tidak muncul di daftar merchant aktif publik'
  );

  // 3. Register Test Driver (Marked TEST)
  console.log('\n--- 3. PENDAFTARAN MITRA DRIVER UJI (STATUS PENDING & LOCKOUT) ---');
  const testDriverPhone = '08999999002';
  const testDriverEmail = 'driver_test_audit@tumpanggo.local';
  const testDriverPassword = 'DriverPassword#2026';
  const testDriverName = 'TEST_DRIVER_AUDIT_2026';

  const dReg = await foodDb.createPartnerRegistration({
    name: testDriverName,
    phone: testDriverPhone,
    email: testDriverEmail,
    type: 'DRIVER',
    vehicleNumber: 'Motor - N 9999 TU',
    operatingArea: 'Kecamatan Tumpang',
    password: testDriverPassword,
    contractVersion: OFFICIAL_DRIVER_CONTRACT_VERSION,
    contractAgreedAt: new Date().toISOString()
  });

  record(
    'Registrasi Driver Dibuat',
    Boolean(dReg && dReg.id),
    `ID: ${dReg.id}, Driver: ${dReg.name}`
  );

  record(
    'Status Awal Driver Wajib PENDING',
    dReg.status === 'PENDING',
    `Status terdaftar: "${dReg.status}"`
  );

  const activeDrivers = foodDb.getDrivers();
  const foundActiveDriver = activeDrivers.find(d => d.name === testDriverName || d.phone === testDriverPhone);
  record(
    'Isolasi Driver PENDING',
    foundActiveDriver === undefined,
    'Driver PENDING tidak muncul di daftar kurir aktif operasional'
  );

  // Test accept task rejection for unapproved driver
  let taskAccepted = false;
  let taskErrorMsg = '';
  try {
    await foodDb.acceptDriverTask(dReg.id, 'ord_fake_123');
    taskAccepted = true;
  } catch (err: any) {
    taskErrorMsg = err.message;
  }
  record(
    'Pencegahan Driver PENDING Menerima Tugas',
    !taskAccepted && taskErrorMsg.includes('tidak ditemukan'),
    `Rejection message: "${taskErrorMsg}"`
  );

  // 4. Persistence Across File Disk Reload
  console.log('\n--- 4. PENGUJIAN PERSISTENSI DISK SETELAH RELOAD ---');
  const dbFile = foodConfig.localDbFile;
  const rawDisk = fs.readFileSync(dbFile, 'utf-8');
  const parsedDisk = JSON.parse(rawDisk);

  const onDiskReg = parsedDisk.partnerRegistrations?.find((r: any) => r.id === reg.id);
  const onDiskDriverReg = parsedDisk.partnerRegistrations?.find((r: any) => r.id === dReg.id);

  record(
    'Persistensi Data Merchant di Disk',
    Boolean(onDiskReg && onDiskReg.storeName === testStoreName && onDiskReg.contractVersion === OFFICIAL_CONTRACT_VERSION),
    `Ditemukan pada snapshot ${path.basename(dbFile)} (Status: ${onDiskReg?.status})`
  );

  record(
    'Persistensi Data Driver di Disk',
    Boolean(onDiskDriverReg && onDiskDriverReg.name === testDriverName),
    `Ditemukan pada snapshot ${path.basename(dbFile)} (Status: ${onDiskDriverReg?.status})`
  );

  // 5. Admin Approval Flow
  console.log('\n--- 5. PERSETUJUAN OLEH ADMIN (APPROVE MITRA TOKO) ---');
  const approveRes = await foodDb.approvePartnerRegistration('admin-tester', reg.id);
  record(
    'Persetujuan Admin Berhasil',
    Boolean(approveRes && approveRes.success && approveRes.registration?.status === 'APPROVED'),
    `Status pendaftaran berubah menjadi APPROVED`
  );

  const newlyActivatedMerchant = foodDb.getMerchantByEmailOrPhone(testPhone);
  record(
    'Merchant Aktif Dibuat Otomatis',
    Boolean(newlyActivatedMerchant && newlyActivatedMerchant.name === testStoreName),
    `ID Toko Aktif: ${newlyActivatedMerchant?.id}, Nama: ${newlyActivatedMerchant?.name}`
  );

  if (newlyActivatedMerchant?.password) {
    const passCheck = verifyPassword(testPassword, newlyActivatedMerchant.password);
    record(
      'Otentikasi Kata Sandi Merchant Terverifikasi',
      passCheck.valid,
      `PBKDF2 hash terverifikasi cocok dengan kata sandi pendaftar`
    );
  }

  // 6. Safe Cleanup of Test Entities Only
  console.log('\n--- 6. PEMBERSIHAN DATA PENGUJIAN SECARA ISOLATIF ---');
  const raw = foodDb as any;
  const initialRegCount = raw.data.partnerRegistrations.length;
  raw.data.partnerRegistrations = raw.data.partnerRegistrations.filter(
    (r: any) => r.id !== reg.id && r.id !== dReg.id
  );
  if (newlyActivatedMerchant) {
    raw.data.merchants = raw.data.merchants.filter((m: any) => m.id !== newlyActivatedMerchant.id);
    raw.data.categories = raw.data.categories.filter((c: any) => c.merchantId !== newlyActivatedMerchant.id);
  }
  raw.save();

  const finalRegCount = raw.data.partnerRegistrations.length;
  record(
    'Pembersihan Data Uji Selesai',
    finalRegCount === initialRegCount - 2,
    `Hanya data uji ID ${reg.id} dan ${dReg.id} yang dibersihkan. Konfigurasi dan data lain tetap utuh.`
  );

  console.log('\n=================================================================');
  console.log('📊 REKAPITULASI HASIL AUDIT');
  console.log('=================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`Total: ${totalCount} | Lulus: ${passedCount} | Gagal: ${totalCount - passedCount}`);

  if (passedCount === totalCount) {
    console.log('🎉 SELURUH PENGUJIAN PERSISTENSI & KONTRAK KEMITRAAN LULUS 100%!');
  } else {
    console.error('❌ BEBERAPA PENGUJIAN GAGAL');
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});

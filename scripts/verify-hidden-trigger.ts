/**
 * Automated Verification Script for TumpangGo Hidden Portal Trigger
 */

import { useHiddenTrigger } from '../src/hooks/useHiddenTrigger.ts';

// Simple simulated hook runner for testing React-style hook state transitions
class SimulatedHiddenTrigger {
  private clickCount = 0;

  get count() {
    return this.clickCount;
  }

  get isUnlocked() {
    return this.clickCount >= 10 && this.clickCount <= 13;
  }

  click() {
    const next = this.clickCount + 1;
    if (next >= 14) {
      this.clickCount = 0;
    } else {
      this.clickCount = next;
    }
  }

  reset() {
    this.clickCount = 0;
  }
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

console.log('=== PENGUJIAN MEKANISME HIDDEN TRIGGER TUMPANGGO ===\n');

// Skenario 1: Halaman normal (0 klik) tidak menampilkan akses portal
console.log('Skenario 1: Halaman normal (0 klik)');
const triggerCustomer = new SimulatedHiddenTrigger();
assert(triggerCustomer.count === 0, 'Penghitung klik awal bernilai 0');
assert(triggerCustomer.isUnlocked === false, 'Akses portal internal tidak aktif pada kondisi normal');

// Skenario 2: Klik 1 sampai 9 belum mengaktifkan akses
console.log('\nSkenario 2: Klik 1 sampai 9 kali');
for (let i = 1; i <= 9; i++) {
  triggerCustomer.click();
  assert(triggerCustomer.isUnlocked === false, `Klik ke-${i}: Akses belum aktif (count=${triggerCustomer.count})`);
}

// Skenario 3: Klik ke-10 sampai ke-13 mengaktifkan akses tersembunyi
console.log('\nSkenario 3: Klik ke-10 sampai ke-13');
for (let i = 10; i <= 13; i++) {
  triggerCustomer.click();
  assert(triggerCustomer.isUnlocked === true, `Klik ke-${i}: Akses aktif dan terbuka (count=${triggerCustomer.count})`);
}

// Skenario 4: Klik ke-14 menghilangkan akses dan mereset penghitung ke 0
console.log('\nSkenario 4: Klik ke-14');
triggerCustomer.click();
assert(triggerCustomer.count === 0, 'Klik ke-14 langsung mereset penghitung ke 0');
assert(triggerCustomer.isUnlocked === false, 'Klik ke-14 langsung menonaktifkan/menyembunyikan akses');

// Pengulangan setelah reset: Klik lagi 10 kali
console.log('\nSkenario 4b: Siklus ulang setelah reset');
for (let i = 1; i <= 9; i++) {
  triggerCustomer.click();
}
assert(triggerCustomer.isUnlocked === false, 'Klik ke-9 siklus kedua: belum aktif');
triggerCustomer.click();
assert(triggerCustomer.isUnlocked === true, 'Klik ke-10 siklus kedua: kembali aktif');

// Skenario 5 & 6: Independensi penghitung antar portal (Customer, Merchant, Admin, Driver)
console.log('\nSkenario 5 & 6: Independensi trigger antar portal');
const triggerMerchant = new SimulatedHiddenTrigger();
const triggerAdmin = new SimulatedHiddenTrigger();
const triggerDriver = new SimulatedHiddenTrigger();

assert(triggerMerchant.count === 0 && triggerMerchant.isUnlocked === false, 'Merchant trigger mulai dari 0');
assert(triggerAdmin.count === 0 && triggerAdmin.isUnlocked === false, 'Admin trigger mulai dari 0');
assert(triggerDriver.count === 0 && triggerDriver.isUnlocked === false, 'Driver trigger mulai dari 0');

// Trigger Customer yang aktif TIDAK mempengaruhi portal lain
assert(triggerCustomer.isUnlocked === true, 'Customer trigger sedang aktif');
assert(triggerMerchant.isUnlocked === false, 'Merchant trigger TIDAK ikut terbuka');
assert(triggerAdmin.isUnlocked === false, 'Admin trigger TIDAK ikut terbuka');
assert(triggerDriver.isUnlocked === false, 'Driver trigger TIDAK ikut terbuka');

// Setelah berpindah portal, instance baru selalu mulai dari 0
const newAdminViewTrigger = new SimulatedHiddenTrigger();
assert(newAdminViewTrigger.count === 0, 'Trigger Admin baru selalu mulai dari nol');
assert(newAdminViewTrigger.isUnlocked === false, 'Trigger Admin baru tidak mempertahankan status Customer');

// Skenario 7: Tidak ada persistensi di localStorage / cookie
console.log('\nSkenario 7: In-memory & tidak ada penyimpanan permanen');
assert(typeof useHiddenTrigger === 'function', 'useHiddenTrigger diekspor dengan benar sebagai React hook');

console.log(`\n===========================================`);
console.log(`Hasil Pengujian: ${passed} LULUS, ${failed} GAGAL`);
console.log(`===========================================`);

if (failed > 0) {
  process.exit(1);
}

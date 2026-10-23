/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Test Suite for Hierarchical Authorization & Master Account
 * Validates:
 * 1. Global Master Account (tumpanggo@gmail.com) across 4 portals (Customer, Merchant, Driver, Admin) + Shop
 * 2. Unregistered login recognition (backend recognizes master before checking partner tables)
 * 3. Contextual access for merchant/driver QA without fake accounts
 * 4. Master password verification & wrong password rejection
 * 5. Staff Merchant boundary isolation (cannot access other stores, admin, or drivers)
 * 6. Driver boundary isolation (cannot access other drivers, merchants, or admin)
 * 7. Regular Admin boundary isolation (cannot access shop)
 * 8. Cryptographic tamper resistance & no privilege escalation
 */

import { foodConfig } from '../src/server/config';
import { foodDb } from '../src/server/db';

const BASE_URL = `http://127.0.0.1:${foodConfig.port || 3000}`;

interface TestResult {
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  details: string;
}

const results: TestResult[] = [];

function record(category: string, name: string, passed: boolean, details: string) {
  const status = passed ? 'PASSED' : 'FAILED';
  results.push({ name, category, status, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${category}] ${name}: ${details}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('   TUMPANGGO HIERARCHICAL AUTHORIZATION & MASTER SUITE TEST');
  console.log('================================================================\n');

  const masterEmail = 'tumpanggo@gmail.com';
  const masterPass = foodConfig.masterAccount.password || 'TumpangGoAdmin#2026';

  // -------------------------------------------------------------
  // 1. MASTER ACCOUNT — CROSS-PORTAL LOGIN
  // -------------------------------------------------------------
  console.log('--- 1. MASTER ACCOUNT: CROSS-PORTAL LOGIN ---');

  // 1a. Login via Admin Portal
  let masterAdminToken = '';
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: masterEmail, password: masterPass, role: 'ADMIN' })
    });
    const data = await res.json();
    masterAdminToken = data.token;
    record(
      'Master Account',
      'Login melalui Portal Admin',
      res.status === 200 && data.role === 'MASTER_ADMIN' && Boolean(data.isMasterAdmin),
      `HTTP ${res.status}, role: ${data.role}, isMasterAdmin: ${data.isMasterAdmin}`
    );
  } catch (e: any) {
    record('Master Account', 'Login melalui Portal Admin', false, e.message);
  }

  // 1b. Login via Merchant Portal (Unregistered on Merchant table)
  let masterMerchantToken = '';
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: masterEmail, password: masterPass, role: 'MERCHANT' })
    });
    const data = await res.json();
    masterMerchantToken = data.token;
    record(
      'Master Account',
      'Login melalui Portal Merchant (Tanpa Registrasi Toko)',
      res.status === 200 && data.role === 'MASTER_ADMIN' && Boolean(data.user?.activeMerchantId),
      `HTTP ${res.status}, role: ${data.role}, context store: ${data.user?.activeMerchantId}`
    );
  } catch (e: any) {
    record('Master Account', 'Login melalui Portal Merchant', false, e.message);
  }

  // 1c. Login via Driver Portal (Unregistered on Driver table)
  let masterDriverToken = '';
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: masterEmail, password: masterPass, role: 'DRIVER' })
    });
    const data = await res.json();
    masterDriverToken = data.token;
    record(
      'Master Account',
      'Login melalui Portal Driver (Tanpa Registrasi Kurir)',
      res.status === 200 && data.role === 'MASTER_ADMIN' && Boolean(data.user?.activeDriverId),
      `HTTP ${res.status}, role: ${data.role}, context driver: ${data.user?.activeDriverId}`
    );
  } catch (e: any) {
    record('Master Account', 'Login melalui Portal Driver', false, e.message);
  }

  // 1d. Login via Customer Portal (or without role)
  let masterCustomerToken = '';
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: masterEmail, password: masterPass, role: 'CUSTOMER' })
    });
    const data = await res.json();
    masterCustomerToken = data.token;
    record(
      'Master Account',
      'Login melalui Portal Customer (Pembeli)',
      res.status === 200 && data.role === 'MASTER_ADMIN' && Boolean(data.token),
      `HTTP ${res.status}, role: ${data.role}, availablePortals: ${data.availablePortals?.join(', ')}`
    );
  } catch (e: any) {
    record('Master Account', 'Login melalui Portal Customer', false, e.message);
  }

  // 1e. Master Account Wrong Password Guard
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: masterEmail, password: 'WrongPassword#999', role: 'ADMIN' })
    });
    record(
      'Master Account',
      'Password Salah Ditolak',
      res.status === 401,
      `HTTP ${res.status} (Unauthorized ditolak dengan benar)`
    );
  } catch (e: any) {
    record('Master Account', 'Password Salah Ditolak', false, e.message);
  }

  // 1f. Verify /api/auth/me Identity Check
  if (masterAdminToken) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${masterAdminToken}` }
      });
      const data = await res.json();
      record(
        'Master Account',
        'Verifikasi Sesi Backend (/api/auth/me)',
        res.status === 200 && data.authenticated && data.user?.isMasterAdmin,
        `Status ${res.status}, isMasterAdmin: ${data.user?.isMasterAdmin}, availablePortals: ${data.availablePortals?.length}`
      );
    } catch (e: any) {
      record('Master Account', 'Verifikasi Sesi Backend', false, e.message);
    }
  }

  // -------------------------------------------------------------
  // 2. MASTER ACCOUNT — GLOBAL ADMINISTRATIVE PRIVILEGES
  // -------------------------------------------------------------
  console.log('\n--- 2. MASTER ACCOUNT: GLOBAL AUTHORITY ---');

  if (masterAdminToken) {
    // 2a. Can access Admin Settlements
    try {
      const res = await fetch(`${BASE_URL}/api/settlements`, {
        headers: { 'Authorization': `Bearer ${masterAdminToken}` }
      });
      record(
        'Master Authority',
        'Akses Admin Settlements',
        res.status === 200,
        `HTTP ${res.status} (Akses penuh diberikan)`
      );
    } catch (e: any) {
      record('Master Authority', 'Akses Admin Settlements', false, e.message);
    }

    // 2b. Can access & inspect any Merchant Store (e.g. m1)
    try {
      const res = await fetch(`${BASE_URL}/api/merchants/m1/orders`, {
        headers: { 'Authorization': `Bearer ${masterAdminToken}` }
      });
      record(
        'Master Authority',
        'Akses Inspeksi Pesanan Merchant',
        res.status === 200,
        `HTTP ${res.status} (Akses lintas toko diberikan)`
      );
    } catch (e: any) {
      record('Master Authority', 'Akses Inspeksi Pesanan Merchant', false, e.message);
    }

    // 2c. Can access & inspect any Driver (e.g. d1)
    try {
      const res = await fetch(`${BASE_URL}/api/drivers/d1/orders`, {
        headers: { 'Authorization': `Bearer ${masterAdminToken}` }
      });
      record(
        'Master Authority',
        'Akses Inspeksi Tugas Driver',
        res.status === 200,
        `HTTP ${res.status} (Akses lintas kurir diberikan)`
      );
    } catch (e: any) {
      record('Master Authority', 'Akses Inspeksi Tugas Driver', false, e.message);
    }

    // 2d. Verify Shop endpoints are inaccessible / decommissioned
    try {
      const res = await fetch(`${BASE_URL}/api/shop/orders`, {
        headers: { 'Authorization': `Bearer ${masterAdminToken}` }
      });
      record(
        'Modul Shop Decommissioned',
        'Rute Shop dinonaktifkan (HTTP 404)',
        res.status === 404,
        `HTTP ${res.status} (Modul Shop tidak lagi aktif)`
      );
    } catch (e: any) {
      record('Modul Shop Decommissioned', 'Rute Shop dinonaktifkan', false, e.message);
    }
  }

  // -------------------------------------------------------------
  // 3. STAFF & AKUN BIASA — RESTRICTED ACCESS & BOUNDARY TESTS
  // -------------------------------------------------------------
  console.log('\n--- 3. STAFF & AKUN BIASA: BOUNDARY ISOLATION ---');

  // 3a. Staff Merchant Login & Boundaries
  const merchants = foodDb.getMerchants();
  const m1 = merchants[0];
  const m2 = merchants[1] || { id: 'm2' };

  let m1Token = '';
  if (m1) {
    try {
      const res = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: m1.phone || m1.email,
          password: m1.id + '123',
          role: 'MERCHANT'
        })
      });
      const data = await res.json();
      m1Token = data.token;
      record(
        'Staff Merchant',
        'Login Mitra Toko Resmi',
        res.status === 200 && data.role === 'MERCHANT',
        `HTTP ${res.status}, entityId: ${m1.id}`
      );
    } catch (e: any) {
      record('Staff Merchant', 'Login Mitra Toko', false, e.message);
    }
  }

  if (m1Token) {
    // 3b. Staff Merchant cannot access Admin Settlements
    try {
      const res = await fetch(`${BASE_URL}/api/settlements`, {
        headers: { 'Authorization': `Bearer ${m1Token}` }
      });
      record(
        'Staff Merchant Guard',
        'Merchant Ditolak Mengakses Admin Settlements',
        res.status === 403,
        `HTTP ${res.status} (Forbidden sebagaimana mestinya)`
      );
    } catch (e: any) {
      record('Staff Merchant Guard', 'Merchant Ditolak Mengakses Admin Settlements', false, e.message);
    }

    // 3c. Staff Merchant cannot access other merchant store (m2)
    try {
      const res = await fetch(`${BASE_URL}/api/merchants/${m2.id}/orders`, {
        headers: { 'Authorization': `Bearer ${m1Token}` }
      });
      record(
        'Staff Merchant Guard',
        'Merchant Ditolak Mengakses Toko Lain',
        res.status === 403,
        `HTTP ${res.status} (Akses toko lain ditolak)`
      );
    } catch (e: any) {
      record('Staff Merchant Guard', 'Merchant Ditolak Mengakses Toko Lain', false, e.message);
    }
  }

  // 3d. Driver Login & Boundaries
  const drivers = foodDb.getDrivers();
  const d1 = drivers[0];
  const d2 = drivers[1] || { id: 'd2' };

  let d1Token = '';
  if (d1) {
    try {
      const res = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: d1.phone || d1.email,
          password: d1.id + '123',
          role: 'DRIVER'
        })
      });
      const data = await res.json();
      d1Token = data.token;
      record(
        'Driver',
        'Login Driver Resmi',
        res.status === 200 && data.role === 'DRIVER',
        `HTTP ${res.status}, entityId: ${d1.id}`
      );
    } catch (e: any) {
      record('Driver', 'Login Driver Resmi', false, e.message);
    }
  }

  if (d1Token) {
    // 3e. Driver cannot access Admin Settlements
    try {
      const res = await fetch(`${BASE_URL}/api/settlements`, {
        headers: { 'Authorization': `Bearer ${d1Token}` }
      });
      record(
        'Driver Guard',
        'Driver Ditolak Mengakses Admin Settlements',
        res.status === 403,
        `HTTP ${res.status} (Forbidden sebagaimana mestinya)`
      );
    } catch (e: any) {
      record('Driver Guard', 'Driver Ditolak Mengakses Admin Settlements', false, e.message);
    }

    // 3f. Driver cannot access Merchant private store orders
    try {
      const res = await fetch(`${BASE_URL}/api/merchants/m1/orders`, {
        headers: { 'Authorization': `Bearer ${d1Token}` }
      });
      record(
        'Driver Guard',
        'Driver Ditolak Mengakses Data Internal Merchant',
        res.status === 403,
        `HTTP ${res.status} (Akses merchant ditolak)`
      );
    } catch (e: any) {
      record('Driver Guard', 'Driver Ditolak Mengakses Data Internal Merchant', false, e.message);
    }

    // 3g. Driver cannot access another driver's tasks
    try {
      const res = await fetch(`${BASE_URL}/api/drivers/${d2.id}/orders`, {
        headers: { 'Authorization': `Bearer ${d1Token}` }
      });
      record(
        'Driver Guard',
        'Driver Ditolak Mengakses Tugas Driver Lain',
        res.status === 403,
        `HTTP ${res.status} (Akses driver lain ditolak)`
      );
    } catch (e: any) {
      record('Driver Guard', 'Driver Ditolak Mengakses Tugas Driver Lain', false, e.message);
    }
  }

  // 3h. Regular Admin (Admin Biasa) cannot access Shop
  let regularAdminToken = '';
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin@tumpanggo.com',
        password: 'TumpangGoAdmin#2026',
        role: 'ADMIN'
      })
    });
    const data = await res.json();
    regularAdminToken = data.token;
    record(
      'Admin Biasa',
      'Login Admin Biasa (Food Admin)',
      res.status === 200 && data.role === 'ADMIN',
      `HTTP ${res.status}, role: ${data.role}`
    );
  } catch (e: any) {
    record('Admin Biasa', 'Login Admin Biasa', false, e.message);
  }

  if (regularAdminToken) {
    try {
      const res = await fetch(`${BASE_URL}/api/shop/orders`, {
        headers: { 'Authorization': `Bearer ${regularAdminToken}` }
      });
      record(
        'Admin Biasa Guard',
        'Rute Shop dinonaktifkan untuk semua pengguna (HTTP 404)',
        res.status === 404,
        `HTTP ${res.status} (Modul Shop sepenuhnya tidak dapat diakses)`
      );
    } catch (e: any) {
      record('Admin Biasa Guard', 'Rute Shop dinonaktifkan', false, e.message);
    }
  }

  // -------------------------------------------------------------
  // 4. UNATHENTICATED & FORGED TOKEN ATTACK TESTS
  // -------------------------------------------------------------
  console.log('\n--- 4. KEAMANAN & PENCEGAHAN ESKALASI AKSES ---');

  // 4a. No token request to protected route
  try {
    const res = await fetch(`${BASE_URL}/api/settlements`);
    record(
      'Security Hardening',
      'Akses Tanpa Token Ditolak',
      res.status === 401,
      `HTTP ${res.status} (Unauthorized)`
    );
  } catch (e: any) {
    record('Security Hardening', 'Akses Tanpa Token Ditolak', false, e.message);
  }

  // 4b. Forged Token with manipulated payload
  try {
    const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJtYXN0ZXItYWRtaW4iLCJyb2xlIjoiTUFTVEVSX0FETUlOIiwiaXNNYXN0ZXJBZG1pbiI6dHJ1ZX0.FakeInvalidSignature0000000000000000000000';
    const res = await fetch(`${BASE_URL}/api/settlements`, {
      headers: { 'Authorization': `Bearer ${forgedToken}` }
    });
    record(
      'Security Hardening',
      'Token Palsu / Dipalsukan Ditolak',
      res.status === 401,
      `HTTP ${res.status} (Signature mismatch ditolak)`
    );
  } catch (e: any) {
    record('Security Hardening', 'Token Palsu Ditolak', false, e.message);
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  console.log(`TOTAL PENGUJIAN: ${total} | BERHASIL: ${passed} | GAGAL: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

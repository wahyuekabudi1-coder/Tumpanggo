/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Direct Preview Form Login Simulation Test
 * Simulates EXACT payload, headers, normalization, and session restore
 * performed by PortalLogin.tsx and App.tsx in the Google AI Studio Preview.
 */

import { foodConfig } from '../src/server/config';

const BASE_URL = `http://127.0.0.1:${foodConfig.port || 3000}`;

async function testPreviewFormLogin() {
  console.log('================================================================');
  console.log('🔍 SIMULASI FORM LOGIN ASLI PREVIEW GOOGLE AI STUDIO (PORTALLOGIN)');
  console.log('================================================================\n');

  let passedAll = true;

  // 1. Simulating PortalLogin.tsx form submit for Master Account on ADMIN portal
  console.log('1. Menguji Form Login Portal ADMIN:');
  const adminRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'tumpanggo@gmail.com',
      email: 'tumpanggo@gmail.com',
      password: 'TumpangGoAdmin#2026',
      role: 'ADMIN'
    })
  });
  const adminData = await adminRes.json();
  if (adminRes.status === 200 && adminData.token && adminData.isMasterAdmin) {
    console.log('   ✅ Form login ADMIN berhasil diterbitkan token (Role: MASTER_ADMIN, isMasterAdmin: true)');
  } else {
    console.error('   ❌ Form login ADMIN gagal:', adminRes.status, adminData);
    passedAll = false;
  }

  // 2. Simulating PortalLogin.tsx form submit on MERCHANT portal (unregistered merchant email)
  console.log('\n2. Menguji Form Login Portal MERCHANT (Konstruksi Context QA):');
  const merchantRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'tumpanggo@gmail.com',
      email: 'tumpanggo@gmail.com',
      password: 'TumpangGoAdmin#2026',
      role: 'MERCHANT'
    })
  });
  const merchantData = await merchantRes.json();
  if (merchantRes.status === 200 && merchantData.token && merchantData.user?.activeMerchantId) {
    console.log(`   ✅ Form login MERCHANT berhasil, auto-context toko: ${merchantData.user.activeMerchantId}`);
  } else {
    console.error('   ❌ Form login MERCHANT gagal:', merchantRes.status, merchantData);
    passedAll = false;
  }

  // 3. Simulating PortalLogin.tsx form submit on DRIVER portal (unregistered driver email)
  console.log('\n3. Menguji Form Login Portal DRIVER (Konstruksi Context QA):');
  const driverRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'tumpanggo@gmail.com',
      email: 'tumpanggo@gmail.com',
      password: 'TumpangGoAdmin#2026',
      role: 'DRIVER'
    })
  });
  const driverData = await driverRes.json();
  if (driverRes.status === 200 && driverData.token && driverData.user?.activeDriverId) {
    console.log(`   ✅ Form login DRIVER berhasil, auto-context kurir: ${driverData.user.activeDriverId}`);
  } else {
    console.error('   ❌ Form login DRIVER gagal:', driverRes.status, driverData);
    passedAll = false;
  }

  // 4. Testing input normalization (whitespace and uppercase email from mobile/browser)
  console.log('\n4. Menguji Normalisasi Input Email Form (Spasi & Huruf Kapital):');
  const normRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: '  TUMPANGGO@GMAIL.COM  ',
      email: '  TUMPANGGO@GMAIL.COM  ',
      password: 'TumpangGoAdmin#2026',
      role: 'ADMIN'
    })
  });
  const normData = await normRes.json();
  if (normRes.status === 200 && normData.isMasterAdmin) {
    console.log('   ✅ Normalisasi berhasil: email trim & lowercase dikenali sebagai Master Account');
  } else {
    console.error('   ❌ Normalisasi gagal:', normRes.status, normData);
    passedAll = false;
  }

  // 5. Testing wrong password rejection
  console.log('\n5. Menguji Penolakan Kata Sandi Salah:');
  const wrongRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'tumpanggo@gmail.com',
      email: 'tumpanggo@gmail.com',
      password: 'KataSandiSalah#123',
      role: 'ADMIN'
    })
  });
  const wrongData = await wrongRes.json();
  if (wrongRes.status === 401 && wrongData.error === 'Email atau kata sandi tidak valid. Silakan periksa kembali.') {
    console.log(`   ✅ Kata sandi salah ditolak HTTP 401: "${wrongData.error}"`);
  } else {
    console.error('   ❌ Penolakan kata sandi salah tidak sesuai:', wrongRes.status, wrongData);
    passedAll = false;
  }

  // 6. Testing session restore (/api/auth/me) as performed by App.tsx on mount
  console.log('\n6. Menguji Pemulihan Sesi (/api/auth/me) Saat Reload Preview:');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminData.token}`
    }
  });
  const meData = await meRes.json();
  if (meRes.status === 200 && meData.authenticated && meData.user?.isMasterAdmin && meData.user?.role === 'MASTER_ADMIN') {
    console.log('   ✅ Sesi pulih sempurna: authenticated=true, isMasterAdmin=true, role=MASTER_ADMIN');
    console.log(`   ✅ Portal yang dapat diakses: ${meData.availablePortals.join(', ')}`);
  } else {
    console.error('   ❌ Pemulihan sesi gagal:', meRes.status, meData);
    passedAll = false;
  }

  console.log('\n================================================================');
  if (passedAll) {
    console.log('🎉 SEMUA VERIFIKASI FORM LOGIN PREVIEW BERHASIL (100% PASS)');
  } else {
    console.log('⚠️ TERDAPAT KEGAGALAN DALAM PENGUJIAN');
  }
  console.log('================================================================');
}

testPreviewFormLogin().catch(console.error);

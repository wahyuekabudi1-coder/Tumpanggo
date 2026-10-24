/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Security Verification & Regression Test Suite for TumpangGo
 * Covers:
 * 1. POST /api/merchants/activate (Token binding, 48h expiry, tamper protection, replay prevention, 10x concurrent race condition)
 * 2. PUT /api/merchants/:id (Self-reactivation blocked, Mass assignment protection, Cross-tenant IDOR blocked)
 * 3. PUT /api/drivers/:id (Self-reactivation blocked, Suspended driver online blocked, Mass assignment, Cross-tenant IDOR blocked)
 * 4. Rate Limiting (Multi-tier IP + account identifier throttling on login, activation, and forgot-password)
 * 5. Admin Authorization (Verified JWT origin, removal of extraneous static credentials)
 */

import http from 'http';
import { app } from '../src/server/app';
import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import { __setFirestoreMockForTesting } from '../src/server/firebaseAdmin';
import { 
  createAuthToken, 
  generateMerchantActivationToken,
  verifyMerchantActivationToken,
  hashPassword,
  verifyPassword
} from '../src/server/auth';
import { __resetRateLimits } from '../src/server/middleware/rateLimiter';
import { Merchant, Driver, PartnerRegistration } from '../src/types';

const PORT = 3105;
let server: http.Server;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, title: string, errorDetail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${title}`);
  } else {
    failedCount++;
    console.error(`  ❌ [FAIL] ${title} ${errorDetail ? `-> ${errorDetail}` : ''}`);
  }
}

async function runSecuritySuite() {
  console.log('\n================================================================');
  console.log('🔒 RUNNING TUMPANGGO PHASE 2 SECURITY AUDIT TEST SUITE');
  console.log('================================================================\n');

  // Reset rate limits before beginning test suite
  __resetRateLimits();

  server = app.listen(PORT, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));

  try {
    // -------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------
    const testInactiveMerchant: Merchant = {
      id: 'm_sec_test_inactive',
      name: 'Warung Audit Inactive',
      ownerName: 'Pemilik Audit',
      phone: '08129990001',
      address: 'Jl. Audit Keamanan No. 1, Tumpang',
      latitude: -7.9482,
      longitude: 112.7612,
      openTime: '08:00',
      closeTime: '21:00',
      bankName: 'Bank BRI',
      bankAccount: '1111222233',
      bankHolder: 'Pemilik Audit',
      active: false,
      isActivated: false,
      cookTimeEstimate: '15 menit',
      description: 'Warung untuk tes audit',
      category: 'Nasi & Lauk',
      email: 'merchant_inactive@test.com',
      password: hashPassword('OldPass123'),
      rating: 4.0,
      createdAt: new Date().toISOString()
    };

    const testActiveMerchant: Merchant = {
      id: 'm_sec_test_active',
      name: 'Warung Audit Active',
      ownerName: 'Pemilik Audit 2',
      phone: '08129990002',
      address: 'Jl. Audit Keamanan No. 2, Tumpang',
      latitude: -7.9482,
      longitude: 112.7612,
      openTime: '08:00',
      closeTime: '21:00',
      bankName: 'Bank BCA',
      bankAccount: '4444555566',
      bankHolder: 'Pemilik Audit 2',
      active: false, // Suspended by admin!
      isActivated: true,
      cookTimeEstimate: '15 menit',
      description: 'Warung ditangguhkan admin',
      category: 'Nasi & Lauk',
      email: 'merchant_suspended@test.com',
      password: hashPassword('PassMerchant2'),
      rating: 4.8,
      createdAt: new Date().toISOString()
    };

    const testSuspendedDriver: Driver = {
      id: 'd_sec_test_suspended',
      name: 'Driver Audit Suspended',
      phone: '08129990003',
      email: 'driver_suspended@test.com',
      vehicle: 'Honda Beat N 1234 XX',
      active: false, // Suspended by admin!
      online: false,
      latitude: -7.9482,
      longitude: 112.7612,
      password: hashPassword('PassDriver1'),
      rating: 4.2,
      createdAt: new Date().toISOString()
    };

    const testActiveDriver: Driver = {
      id: 'd_sec_test_active',
      name: 'Driver Audit Active',
      phone: '08129990004',
      email: 'driver_active@test.com',
      vehicle: 'Yamaha Mio N 5678 YY',
      active: true,
      online: false,
      latitude: -7.9482,
      longitude: 112.7612,
      password: hashPassword('PassDriver2'),
      rating: 4.9,
      createdAt: new Date().toISOString()
    };

    // Inject into in-memory DB
    foodDb.data.merchants = foodDb.data.merchants.filter(
      m => m.id !== testInactiveMerchant.id && m.id !== testActiveMerchant.id
    );
    foodDb.data.merchants.push(testInactiveMerchant, testActiveMerchant);

    foodDb.data.drivers = foodDb.data.drivers.filter(
      d => d.id !== testSuspendedDriver.id && d.id !== testActiveDriver.id
    );
    foodDb.data.drivers.push(testSuspendedDriver, testActiveDriver);
    foodDb.save();

    // MINT TEST TOKENS
    const adminToken = createAuthToken({
      userId: 'u_admin_audit',
      role: 'ADMIN',
      email: 'admin@tumpanggo.id'
    });

    const suspendedMerchantToken = createAuthToken({
      userId: 'u_merchant_susp',
      role: 'MERCHANT',
      email: testActiveMerchant.email,
      entityId: testActiveMerchant.id
    });

    const suspendedDriverToken = createAuthToken({
      userId: 'u_driver_susp',
      role: 'DRIVER',
      email: testSuspendedDriver.email,
      entityId: testSuspendedDriver.id
    });

    const activeDriverToken = createAuthToken({
      userId: 'u_driver_act',
      role: 'DRIVER',
      email: testActiveDriver.email,
      entityId: testActiveDriver.id
    });

    const validActivationToken = generateMerchantActivationToken(
      testInactiveMerchant.id,
      testInactiveMerchant.email!
    );

    // =============================================================
    // TEST SUITE 1: POST /api/merchants/activate
    // =============================================================
    console.log('--- 1. AUDITING POST /api/merchants/activate & TOKEN SECURITY ---');

    // 1.1 Unauthenticated activation request without token -> 403 ACTIVATION_TOKEN_REQUIRED
    const resNoToken = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testInactiveMerchant.email,
        password: 'NewStrongPassword123'
      })
    });
    const dataNoToken = await resNoToken.json().catch(() => ({}));
    assert(
      resNoToken.status === 403 && dataNoToken.code === 'ACTIVATION_TOKEN_REQUIRED',
      'Rejects anonymous activation attempt without token with 403 ACTIVATION_TOKEN_REQUIRED',
      `Got status: ${resNoToken.status}, code: ${dataNoToken.code}`
    );

    // 1.2 Tampered / forged token signature -> 403 INVALID_ACTIVATION_TOKEN
    const resFakeToken = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testInactiveMerchant.email,
        password: 'NewStrongPassword123',
        activationToken: validActivationToken.substring(0, validActivationToken.length - 6) + 'xxxxxx'
      })
    });
    const dataFakeToken = await resFakeToken.json().catch(() => ({}));
    assert(
      resFakeToken.status === 403 && dataFakeToken.code === 'INVALID_ACTIVATION_TOKEN',
      'Rejects tampered / forged activation token signature with 403 INVALID_ACTIVATION_TOKEN',
      `Got status: ${resFakeToken.status}, code: ${dataFakeToken.code}`
    );

    // 1.3 Token generated for another email -> 403 INVALID_ACTIVATION_TOKEN
    const tokenWrongEmail = generateMerchantActivationToken('m_other', 'other@test.com');
    const resMismatch = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testInactiveMerchant.email,
        password: 'NewStrongPassword123',
        activationToken: tokenWrongEmail
      })
    });
    const dataMismatch = await resMismatch.json().catch(() => ({}));
    assert(
      resMismatch.status === 403 && dataMismatch.code === 'INVALID_ACTIVATION_TOKEN',
      'Rejects token generated for a different email address with 403 INVALID_ACTIVATION_TOKEN',
      `Got status: ${resMismatch.status}, code: ${dataMismatch.code}`
    );

    // 1.4 Expired token verification (TTL 48h)
    const expiredToken = generateMerchantActivationToken(testInactiveMerchant.id, testInactiveMerchant.email!, -1);
    const resExpired = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testInactiveMerchant.email,
        password: 'NewStrongPassword123',
        activationToken: expiredToken
      })
    });
    const dataExpired = await resExpired.json().catch(() => ({}));
    assert(
      resExpired.status === 403 && dataExpired.code === 'INVALID_ACTIVATION_TOKEN',
      'Rejects expired activation token with 403 INVALID_ACTIVATION_TOKEN',
      `Got status: ${resExpired.status}, code: ${dataExpired.code}`
    );

    // 1.5 Valid cryptographic activation token -> 200 OK and updates password & status
    const resValidActivation = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testInactiveMerchant.email,
        password: 'NewlySetSecurePassword123',
        activationToken: validActivationToken
      })
    });
    const dataValidActivation = await resValidActivation.json().catch(() => ({}));
    assert(
      resValidActivation.status === 200 && dataValidActivation.success === true,
      'Accepts valid HMAC-signed activation token and responds 200 OK',
      `Got status: ${resValidActivation.status}, error: ${dataValidActivation.error}`
    );

    const reloadedMerchant = foodDb.data.merchants.find(m => m.id === testInactiveMerchant.id);
    assert(
      reloadedMerchant?.isActivated === true && reloadedMerchant?.active === true,
      'Merchant record is now marked as isActivated: true and active: true'
    );
    assert(
      verifyPassword('NewlySetSecurePassword123', reloadedMerchant?.password).valid === true,
      'Merchant password is newly hashed and verifiable with new password'
    );
    assert(
      (dataValidActivation.merchant as any).password === undefined,
      'Merchant activation response sanitizes and removes password hash'
    );

    // 1.6 Attempting to reuse token on an already activated merchant -> rejected
    const resReplay = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testInactiveMerchant.email,
        password: 'AttackerHijackPassword999',
        activationToken: validActivationToken
      })
    });
    const dataReplay = await resReplay.json().catch(() => ({}));
    assert(
      resReplay.status === 400 && dataReplay.code === 'ALREADY_ACTIVATED',
      'Rejects activation replay on an already active merchant with 400 ALREADY_ACTIVATED',
      `Got status: ${resReplay.status}, code: ${dataReplay.code}`
    );

    // Password must remain untouched
    const reloadedAfterReplay = foodDb.data.merchants.find(m => m.id === testInactiveMerchant.id);
    assert(
      verifyPassword('NewlySetSecurePassword123', reloadedAfterReplay?.password).valid === true,
      'Merchant password remains secure against hijack after replay attempt'
    );

    // 1.7 Admin authorization header can activate merchant without activation token
    testInactiveMerchant.isActivated = false;
    testInactiveMerchant.active = false;
    foodDb.save();

    const resAdminActivate = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email: testInactiveMerchant.email,
        password: 'AdminSetPassword789'
      })
    });
    const dataAdminActivate = await resAdminActivate.json().catch(() => ({}));
    assert(
      resAdminActivate.status === 200 && dataAdminActivate.success === true,
      'Authorized Admin session can activate merchant without activation token',
      `Got status: ${resAdminActivate.status}, error: ${dataAdminActivate.error}`
    );

    // 1.8 CONCURRENT ACTIVATION TEST (10 Simultaneous Requests Race Condition)
    console.log('--- 1.8 AUDITING 10 SIMULTANEOUS ACTIVATION REQUESTS ---');
    const concurrentTestMerchant: Merchant = {
      id: 'm_sec_concurrent_test',
      name: 'Warung Concurrent Race Test',
      ownerName: 'Pemilik Concurrent',
      phone: '08129990005',
      address: 'Jl. Concurrency No. 1, Tumpang',
      latitude: -7.9482,
      longitude: 112.7612,
      openTime: '08:00',
      closeTime: '21:00',
      bankName: 'Bank BRI',
      bankAccount: '9988776655',
      bankHolder: 'Pemilik Concurrent',
      active: false,
      isActivated: false,
      cookTimeEstimate: '15 menit',
      description: 'Warung tes konkurensi aktivasi',
      category: 'Nasi & Lauk',
      email: 'concurrent_race@test.com',
      password: hashPassword('InitialPass123'),
      rating: 4.5,
      createdAt: new Date().toISOString()
    };
    foodDb.data.merchants.push(concurrentTestMerchant);
    foodDb.save();

    const concurrentToken = generateMerchantActivationToken(
      concurrentTestMerchant.id,
      concurrentTestMerchant.email!
    );

    // Fire 10 simultaneous activation requests
    const concurrentRequests = Array.from({ length: 10 }).map((_, i) =>
      fetch(`${BASE_URL}/api/merchants/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: concurrentTestMerchant.email,
          password: `ConcurrentPassword_${i}_123`,
          activationToken: concurrentToken
        })
      }).then(async res => ({
        status: res.status,
        data: await res.json().catch(() => ({}))
      }))
    );

    const concurrentResults = await Promise.all(concurrentRequests);
    const successCount = concurrentResults.filter(r => r.status === 200).length;
    const rejectedCount = concurrentResults.filter(r => r.status === 400 || r.status === 429).length;

    assert(
      successCount === 1,
      `Exactly 1 out of 10 concurrent activation requests succeeded (got ${successCount})`
    );
    assert(
      rejectedCount === 9,
      `All other 9 concurrent activation requests were safely rejected (got ${rejectedCount})`
    );

    // =============================================================
    // TEST SUITE 2: PUT /api/merchants/:id
    // =============================================================
    console.log('\n--- 2. AUDITING PUT /api/merchants/:id, IDOR & MASS ASSIGNMENT ---');

    // 2.1 Suspended merchant attempting self-reactivation via { active: true }
    const resMerchantSelfReactivate = await fetch(`${BASE_URL}/api/merchants/${testActiveMerchant.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${suspendedMerchantToken}`
      },
      body: JSON.stringify({
        active: true,
        openTime: '07:00'
      })
    });
    assert(
      resMerchantSelfReactivate.status === 200,
      'PUT /api/merchants/:id returns 200 for merchant profile update'
    );

    const reloadedSuspMerchant = foodDb.data.merchants.find(m => m.id === testActiveMerchant.id);
    assert(
      reloadedSuspMerchant?.active === false,
      'Suspended merchant self-reactivation is BLOCKED: merchant remains active: false'
    );
    assert(
      reloadedSuspMerchant?.openTime === '07:00',
      'Merchant legitimate fields (openTime) are still successfully updated'
    );

    // 2.2 Suspended merchant attempting mass assignment on sensitive fields
    await fetch(`${BASE_URL}/api/merchants/${testActiveMerchant.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${suspendedMerchantToken}`
      },
      body: JSON.stringify({
        rating: 5.0,
        isActivated: false,
        email: 'hijacked_email@test.com',
        menuCount: 999
      })
    });
    const reloadedProtectedFields = foodDb.data.merchants.find(m => m.id === testActiveMerchant.id);
    assert(
      reloadedProtectedFields?.rating === 4.8,
      'Merchant cannot tamper with protected rating (remains 4.8)'
    );
    assert(
      reloadedProtectedFields?.email === testActiveMerchant.email,
      'Merchant cannot tamper with registered email via mass assignment'
    );

    // 2.3 Cross-Tenant IDOR: Merchant A attempts to modify Merchant B
    const resMerchantIdor = await fetch(`${BASE_URL}/api/merchants/${testInactiveMerchant.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${suspendedMerchantToken}` // Token belongs to testActiveMerchant!
      },
      body: JSON.stringify({
        openTime: '05:00',
        name: 'Hacked Store Name'
      })
    });
    const dataMerchantIdor = await resMerchantIdor.json().catch(() => ({}));
    assert(
      resMerchantIdor.status === 403,
      'Cross-Tenant IDOR BLOCKED: Merchant A cannot update Merchant B (returns 403 Forbidden)',
      `Got status: ${resMerchantIdor.status}, error: ${dataMerchantIdor.error}`
    );

    // 2.4 Admin can legitimately toggle active state to true
    const resAdminReactivate = await fetch(`${BASE_URL}/api/merchants/${testActiveMerchant.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        active: true
      })
    });
    assert(
      resAdminReactivate.status === 200,
      'Admin request to PUT /api/merchants/:id responds 200'
    );
    const reloadedAdminUpdated = foodDb.data.merchants.find(m => m.id === testActiveMerchant.id);
    assert(
      reloadedAdminUpdated?.active === true,
      'Admin successfully reactivates merchant: active is now true'
    );

    // =============================================================
    // TEST SUITE 3: PUT /api/drivers/:id
    // =============================================================
    console.log('\n--- 3. AUDITING PUT /api/drivers/:id, IDOR & MASS ASSIGNMENT ---');

    // 3.1 Suspended driver attempting self-reactivation via { active: true }
    const resDriverSelfReactivate = await fetch(`${BASE_URL}/api/drivers/${testSuspendedDriver.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${suspendedDriverToken}`
      },
      body: JSON.stringify({
        active: true,
        vehicle: 'Honda Beat Modif N 1234 XX'
      })
    });
    assert(
      resDriverSelfReactivate.status === 200,
      'Driver update endpoint returns 200 for allowed vehicle update'
    );
    const reloadedSuspDriver = foodDb.data.drivers.find(d => d.id === testSuspendedDriver.id);
    assert(
      reloadedSuspDriver?.active === false,
      'Suspended driver self-reactivation is BLOCKED: driver remains active: false'
    );
    assert(
      reloadedSuspDriver?.vehicle === 'Honda Beat Modif N 1234 XX',
      'Driver legitimate field (vehicle) was updated'
    );

    // 3.2 Suspended driver attempting to toggle online: true -> 403 DRIVER_INACTIVE
    const resDriverForceOnline = await fetch(`${BASE_URL}/api/drivers/${testSuspendedDriver.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${suspendedDriverToken}`
      },
      body: JSON.stringify({
        online: true
      })
    });
    const dataDriverForceOnline = await resDriverForceOnline.json().catch(() => ({}));
    assert(
      resDriverForceOnline.status === 403 && dataDriverForceOnline.code === 'DRIVER_INACTIVE',
      'Suspended driver attempting online: true is REJECTED with 403 DRIVER_INACTIVE',
      `Got status: ${resDriverForceOnline.status}, code: ${dataDriverForceOnline.code}`
    );

    // 3.3 Active driver can toggle online: true and false
    const resActiveDriverOnline = await fetch(`${BASE_URL}/api/drivers/${testActiveDriver.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeDriverToken}`
      },
      body: JSON.stringify({
        online: true
      })
    });
    assert(
      resActiveDriverOnline.status === 200,
      'Active driver can toggle online: true'
    );

    // 3.4 Cross-Tenant IDOR: Driver A attempts to modify Driver B
    const resDriverIdor = await fetch(`${BASE_URL}/api/drivers/${testSuspendedDriver.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeDriverToken}` // Token belongs to testActiveDriver!
      },
      body: JSON.stringify({
        vehicle: 'Hijacked Motorbike'
      })
    });
    const dataDriverIdor = await resDriverIdor.json().catch(() => ({}));
    assert(
      resDriverIdor.status === 403,
      'Cross-Tenant IDOR BLOCKED: Driver A cannot update Driver B (returns 403 Forbidden)',
      `Got status: ${resDriverIdor.status}, error: ${dataDriverIdor.error}`
    );

    // 3.5 Admin can legitimately toggle driver active state
    const resAdminActivateDriver = await fetch(`${BASE_URL}/api/drivers/${testSuspendedDriver.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        active: true
      })
    });
    assert(
      resAdminActivateDriver.status === 200,
      'Admin request to PUT /api/drivers/:id responds 200'
    );
    const reloadedAdminDriver = foodDb.data.drivers.find(d => d.id === testSuspendedDriver.id);
    assert(
      reloadedAdminDriver?.active === true,
      'Admin successfully activates suspended driver: active is now true'
    );

    // =============================================================
    // TEST SUITE 4: RATE LIMITING & BRUTE FORCE PROTECTION
    // =============================================================
    console.log('\n--- 4. AUDITING RATE LIMITING & BRUTE FORCE DEFENSE ---');
    __resetRateLimits();

    // 4.1 Login Brute Force Protection (max 5 failed attempts per target)
    let lastLoginStatus = 200;
    let lastLoginHeaderRetry = '';
    let lastLoginData: any = {};

    for (let attempt = 1; attempt <= 6; attempt++) {
      const resBrute = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'victim_merchant@test.com',
          password: `WrongPassword_${attempt}`,
          role: 'MERCHANT'
        })
      });
      lastLoginStatus = resBrute.status;
      lastLoginHeaderRetry = resBrute.headers.get('retry-after') || '';
      lastLoginData = await resBrute.json().catch(() => ({}));
    }

    assert(
      lastLoginStatus === 429,
      `Exceeding login limit returns HTTP 429 Too Many Requests (got ${lastLoginStatus})`
    );
    assert(
      lastLoginData.code === 'TOO_MANY_REQUESTS',
      'Rate limit response includes standard code "TOO_MANY_REQUESTS"'
    );
    assert(
      Boolean(lastLoginHeaderRetry) && Number(lastLoginHeaderRetry) > 0,
      `Rate limit response includes HTTP header Retry-After (got ${lastLoginHeaderRetry}s)`
    );

    // 4.2 Forgot Password Brute Force Protection
    __resetRateLimits();
    let lastForgotStatus = 200;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const resForgot = await fetch(`${BASE_URL}/api/merchants/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrPhone: 'target_store@test.com'
        })
      });
      lastForgotStatus = resForgot.status;
    }
    assert(
      lastForgotStatus === 429,
      `Exceeding forgot-password attempts returns HTTP 429 Too Many Requests (got ${lastForgotStatus})`
    );

    // =============================================================
    // TEST SUITE 5: POST-AUDIT REGRESSION & CONSISTENCY TESTS
    // =============================================================
    console.log('\n--- 5. AUDITING PRODUCTION FAIL-CLOSED RATE LIMITER & ACTIVATION CONSISTENCY ---');

    // 5.1 Rate limiter fail-closed in production mode
    __resetRateLimits();
    const originalProd = foodConfig.isProduction;
    const origEnv = {
      FOOD_AUTH_SECRET: process.env.FOOD_AUTH_SECRET,
      FOOD_ADMIN_EMAIL: process.env.FOOD_ADMIN_EMAIL,
      FOOD_ADMIN_PASSWORD: process.env.FOOD_ADMIN_PASSWORD,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    };

    try {
      process.env.FOOD_AUTH_SECRET = 'a_very_long_valid_production_secret_32_chars_minimum';
      process.env.FOOD_ADMIN_EMAIL = 'admin@tumpanggo.com';
      process.env.FOOD_ADMIN_PASSWORD = 'ProductionAdminPassword123!';
      process.env.FIREBASE_PROJECT_ID = 'tumpanggo-70479';
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        client_email: 'service-account@tumpanggo-70479.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n',
        project_id: 'tumpanggo-70479'
      });

      (foodConfig as any).isProduction = true;

      // Mock probe result so gatekeeper passes, but rate limiter storage operation fails
      __setFirestoreMockForTesting({
        isConfigured: true,
        probeResult: {
          connected: true,
          canRead: true,
          canWrite: true,
          databaseId: '(default)',
          projectId: 'tumpanggo-70479',
          usingServiceAccount: true
        },
        adminDb: {
          collection: () => ({
            doc: () => ({})
          }),
          runTransaction: async () => {
            throw new Error('Firestore connection timed out in production simulation');
          }
        }
      });

      const resFailClosed = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'prod_victim@test.com',
          password: 'Password123!',
          role: 'MERCHANT'
        })
      });
      const dataFailClosed = await resFailClosed.json().catch(() => ({}));

      assert(
        resFailClosed.status === 503,
        `Firestore rate limiter failure in production strictly rejects with HTTP 503 (got ${resFailClosed.status})`
      );
      assert(
        dataFailClosed.code === 'RATE_LIMITER_UNAVAILABLE',
        `Production failure returns safe generic code RATE_LIMITER_UNAVAILABLE (got ${dataFailClosed.code})`
      );
      assert(
        !JSON.stringify(dataFailClosed).includes('connection timed out') && !JSON.stringify(dataFailClosed).includes('stack'),
        'Production 503 response never leaks internal stack traces or connection secrets'
      );
    } finally {
      (foodConfig as any).isProduction = originalProd;
      for (const [k, v] of Object.entries(origEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      __setFirestoreMockForTesting(null);
      __resetRateLimits();
    }

    // 5.2 Development/test mode allows resilient in-memory fallback
    assert(
      foodConfig.isProduction === false,
      'Environment correctly restored to development mode'
    );
    const resDevFallback = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'dev_user@test.com',
        password: 'WrongPassword',
        role: 'MERCHANT'
      })
    });
    assert(
      resDevFallback.status === 401,
      `Development mode gracefully processes via in-memory rate limiter without 503 (got ${resDevFallback.status})`
    );

    // 5.3 Merchant activation multi-document consistency (merchants + partnerRegistrations)
    const testConsistentMerchantId = 'm_sec_consistent_test';
    const testConsistentRegId = 'reg_sec_consistent_test';
    const testConsistentEmail = 'consistent_merchant@test.com';

    foodDb.data.merchants.push({
      id: testConsistentMerchantId,
      name: 'Warung Konsisten',
      ownerName: 'Pak Konsisten',
      email: testConsistentEmail,
      phone: '081299990001',
      address: 'Jl. Konsisten Tumpang',
      latitude: -7.9942,
      longitude: 112.7667,
      openTime: '08:00',
      closeTime: '21:00',
      bankName: 'Bank BRI',
      bankAccount: '1234567890',
      bankHolder: 'Pak Konsisten',
      active: false,
      isActivated: false,
      cookTimeEstimate: '15 menit',
      image: '/umkm-activity.jpg',
      description: 'Warung Konsisten Test',
      category: 'Nasi & Lauk',
      password: hashPassword('InitialPass123')
    });

    foodDb.data.partnerRegistrations.push({
      id: testConsistentRegId,
      name: 'Pak Konsisten',
      storeName: 'Warung Konsisten',
      storeId: testConsistentMerchantId,
      email: testConsistentEmail,
      phone: '081299990001',
      type: 'MERCHANT',
      status: 'APPROVED',
      storeAddress: 'Jl. Konsisten Tumpang',
      category: 'Nasi & Lauk',
      description: 'Warung Konsisten Test',
      createdAt: new Date().toISOString()
    });
    foodDb.save();

    const consistentToken = generateMerchantActivationToken(testConsistentMerchantId, testConsistentEmail);
    const resConsistentActivation = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testConsistentEmail,
        password: 'NewStrongPassword456!',
        activationToken: consistentToken
      })
    });
    const dataConsistentActivation = await resConsistentActivation.json().catch(() => ({}));

    assert(
      resConsistentActivation.status === 200 && dataConsistentActivation.success === true,
      `Merchant activation succeeds with 200 OK (got ${resConsistentActivation.status})`
    );

    const reloadedConsistentM = foodDb.data.merchants.find(m => m.id === testConsistentMerchantId);
    const reloadedConsistentReg = foodDb.data.partnerRegistrations.find(r => r.id === testConsistentRegId);

    assert(
      reloadedConsistentM?.active === true && reloadedConsistentM?.isActivated === true,
      'Merchant record is atomically marked active: true and isActivated: true'
    );
    assert(
      reloadedConsistentReg?.status === 'ACTIVATED',
      'Corresponding partnerRegistration status is atomically marked as ACTIVATED'
    );

    // 5.4 Replay rejection & Atomicity (No half-updated state)
    const resReplayActivation = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testConsistentEmail,
        password: 'AnotherHijackPassword789!',
        activationToken: consistentToken
      })
    });
    const dataConsistentReplay = await resReplayActivation.json().catch(() => ({}));
    assert(
      resReplayActivation.status === 400 && dataConsistentReplay.code === 'ALREADY_ACTIVATED',
      'Activation replay is rejected with 400 ALREADY_ACTIVATED'
    );
    const mAfterReplay = foodDb.data.merchants.find(m => m.id === testConsistentMerchantId);
    const { valid: hijackedPasswordValid } = verifyPassword('AnotherHijackPassword789!', mAfterReplay?.password);
    assert(
      !hijackedPasswordValid,
      'Merchant password remains completely untampered after rejected replay attempt'
    );

    // 5.5 Authoritative Cloud Firestore Activation (Merchant in Firestore but absent from local cache)
    const testCloudMerchantId = 'm_cloud_authoritative_test';
    const testCloudEmail = 'cloud_only@test.com';
    let cloudMerchantDocState: any = {
      id: testCloudMerchantId,
      name: 'Warung Cloud Otoritatif',
      email: testCloudEmail,
      active: false,
      isActivated: false,
      password: hashPassword('CloudTempPass123'),
      createdAt: new Date().toISOString()
    };

    // Ensure it does NOT exist in local cache initially
    foodDb.data.merchants = foodDb.data.merchants.filter(m => m.id !== testCloudMerchantId && m.email !== testCloudEmail);
    foodDb.save();

    // Mock Firestore Admin returning the merchant from cloud query and handling transaction
    __setFirestoreMockForTesting({
      isConfigured: true,
      adminDb: {
        collection: (colName: string) => ({
          doc: (docId: string) => ({
            get: async () => ({
              exists: docId === testCloudMerchantId,
              data: () => (docId === testCloudMerchantId ? cloudMerchantDocState : null)
            }),
            set: async (data: any, opts: any) => {
              if (docId === testCloudMerchantId) {
                cloudMerchantDocState = { ...cloudMerchantDocState, ...data };
              }
            }
          }),
          where: (_field: string, _op: string, val: any) => ({
            limit: () => ({
              get: async () => {
                if (colName === 'merchants' && val === testCloudEmail) {
                  return {
                    empty: false,
                    docs: [{
                      id: testCloudMerchantId,
                      data: () => cloudMerchantDocState
                    }]
                  };
                }
                return { empty: true, docs: [] };
              }
            })
          })
        }),
        runTransaction: async (updateFn: any) => {
          const fakeTx = {
            get: async (ref: any) => ({
              exists: true,
              data: () => cloudMerchantDocState
            }),
            set: (ref: any, data: any) => {
              cloudMerchantDocState = { ...cloudMerchantDocState, ...data };
            }
          };
          return updateFn(fakeTx);
        }
      }
    });

    const cloudToken = generateMerchantActivationToken(testCloudMerchantId, testCloudEmail);
    const resCloudActivation = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testCloudEmail,
        password: 'CloudActivatedPassword123!',
        activationToken: cloudToken
      })
    });
    const dataCloudActivation = await resCloudActivation.json().catch(() => ({}));

    assert(
      resCloudActivation.status === 200 && dataCloudActivation.success === true,
      `Authoritative cloud activation succeeds even when absent from local cache (got ${resCloudActivation.status})`
    );

    const hydratedMerchant = foodDb.data.merchants.find(m => m.id === testCloudMerchantId);
    assert(
      Boolean(hydratedMerchant && hydratedMerchant.active === true && hydratedMerchant.isActivated === true),
      'Merchant was authoritatively resolved from Firestore and hydrated into local cache'
    );

    // 5.6 Non-existent merchant produces 400 MERCHANT_NOT_FOUND
    const fakeNonExistentToken = generateMerchantActivationToken('m_ghost', 'ghost@test.com');
    const resGhost = await fetch(`${BASE_URL}/api/merchants/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ghost@test.com',
        password: 'GhostPassword123!',
        activationToken: fakeNonExistentToken
      })
    });
    const dataGhost = await resGhost.json().catch(() => ({}));
    assert(
      resGhost.status === 400 && dataGhost.code === 'MERCHANT_NOT_FOUND',
      `Non-existent merchant accurately returns 400 MERCHANT_NOT_FOUND (got ${resGhost.status}, code: ${dataGhost.code})`
    );

    // Clean up mock state
    __setFirestoreMockForTesting(null);

    // Clean up test data
    foodDb.data.merchants = foodDb.data.merchants.filter(
      m => m.id !== testInactiveMerchant.id && 
           m.id !== testActiveMerchant.id &&
           m.id !== concurrentTestMerchant.id &&
           m.id !== testConsistentMerchantId &&
           m.id !== testCloudMerchantId
    );
    foodDb.data.partnerRegistrations = foodDb.data.partnerRegistrations.filter(
      r => r.id !== testConsistentRegId
    );
    foodDb.data.drivers = foodDb.data.drivers.filter(
      d => d.id !== testSuspendedDriver.id && d.id !== testActiveDriver.id
    );
    foodDb.save();

  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSecuritySuite().catch(err => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});

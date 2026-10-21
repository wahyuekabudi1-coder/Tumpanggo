/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Test Suite: Customer History Rate Limiter & Privacy Protection Verification
 * Validates:
 * 1. Unit testing of checkCustomerHistoryRateLimit and resetCustomerHistoryRateLimit
 * 2. Sliding window and threshold limits (5 requests per minute)
 * 3. HTTP 429 Too Many Requests with Retry-After header
 * 4. Window reset behavior
 * 5. Authorization requirement (HTTP 403 UNVERIFIED_CUSTOMER_HISTORY_DISABLED for unverified callers)
 * 6. Authenticated Admin / Customer authorized access under rate limiting
 */

import { checkCustomerHistoryRateLimit, resetCustomerHistoryRateLimit } from '../src/server/routes/orderRoutes';
import { app } from '../src/server/app';
import { createAuthToken, AuthUser } from '../src/server/auth';
import { foodDb } from '../src/server/db';
import http from 'http';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, failureDetails?: any) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } else {
    results.push({ name, passed: false, error: 'Assertion failed', details: failureDetails });
    console.error(`  ✗ ${name}`, failureDetails ? JSON.stringify(failureDetails) : '');
  }
}

async function requestHttp(
  server: http.Server,
  path: string,
  method = 'GET',
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode || 200, headers: res.headers, data });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runRateLimiterTests() {
  console.log('\n=== TUMPANGGO CUSTOMER HISTORY RATE LIMITER & PRIVACY TEST SUITE ===\n');

  // --- PART 1: UNIT TESTS FOR checkCustomerHistoryRateLimit ---
  console.log('--- Group 1: Unit Testing Rate Limiter Logic ---');
  
  const testKey = 'test_ip_127_0_0_1';
  resetCustomerHistoryRateLimit(testKey);

  // 1. Initial 5 requests should all be allowed
  for (let i = 1; i <= 5; i++) {
    const res = checkCustomerHistoryRateLimit(testKey, 5, 1000);
    assert(res.allowed === true && res.retryAfter === 0, `Request #${i} is allowed within limit 5`);
  }

  // 2. 6th request must be rejected with retryAfter > 0
  const overLimit = checkCustomerHistoryRateLimit(testKey, 5, 1000);
  assert(overLimit.allowed === false, 'Request #6 exceeds limit and is rejected (allowed=false)');
  assert(overLimit.retryAfter > 0, 'Request #6 returns positive retryAfter seconds', { retryAfter: overLimit.retryAfter });

  // 3. Reset rate limiter clears state
  resetCustomerHistoryRateLimit(testKey);
  const afterReset = checkCustomerHistoryRateLimit(testKey, 5, 1000);
  assert(afterReset.allowed === true, 'Request immediately after resetCustomerHistoryRateLimit is allowed');

  // 4. Window expiry reset
  const shortWindowKey = 'test_short_window';
  resetCustomerHistoryRateLimit(shortWindowKey);
  // Fill up quota with a 200ms window
  for (let i = 0; i < 3; i++) {
    checkCustomerHistoryRateLimit(shortWindowKey, 3, 200);
  }
  const blockedShort = checkCustomerHistoryRateLimit(shortWindowKey, 3, 200);
  assert(blockedShort.allowed === false, 'Short-window rate limit is blocked when limit reached');

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 250));
  const expiredShort = checkCustomerHistoryRateLimit(shortWindowKey, 3, 200);
  assert(expiredShort.allowed === true, 'Request is allowed after sliding window expires');


  // --- PART 2: HTTP INTEGRATION TESTS ---
  console.log('\n--- Group 2: HTTP Integration with /api/orders/customer/:phone ---');
  
  await foodDb.ensureInitialized();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const testPhone = '081299998888';
    
    // Clear global rate limiter state before integration tests
    resetCustomerHistoryRateLimit();

    // 1. Unverified requests: first 5 requests should return HTTP 403 (unverified privacy protection)
    for (let i = 1; i <= 5; i++) {
      const res = await requestHttp(server, `/api/orders/customer/${testPhone}`);
      assert(
        res.status === 403 && res.data.code === 'UNVERIFIED_CUSTOMER_HISTORY_DISABLED',
        `Unverified request #${i} gets HTTP 403 (within rate limit)`
      );
    }

    // 2. 6th request from the same IP MUST trigger HTTP 429 Too Many Requests
    const rateLimitedRes = await requestHttp(server, `/api/orders/customer/${testPhone}`);
    assert(rateLimitedRes.status === 429, '6th request triggers HTTP 429 Too Many Requests', { status: rateLimitedRes.status });
    assert(rateLimitedRes.headers['retry-after'] !== undefined, 'HTTP 429 response includes Retry-After header', {
      retryAfter: rateLimitedRes.headers['retry-after']
    });
    assert(
      rateLimitedRes.data.error?.includes('Terlalu banyak permintaan'),
      'HTTP 429 response body contains friendly Indonesian error message',
      { error: rateLimitedRes.data.error }
    );

    // 3. Reset limiter and test authenticated Admin access
    resetCustomerHistoryRateLimit();

    const adminUser: AuthUser = {
      userId: 'admin_test_rate_limiter',
      role: 'ADMIN',
      email: 'admin@tumpanggo.com'
    };
    const adminToken = createAuthToken(adminUser);

    const adminRes = await requestHttp(server, `/api/orders/customer/${testPhone}`, 'GET', {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(adminRes.status === 200, 'Authenticated Admin successfully retrieves customer history (HTTP 200)');
    assert(Array.isArray(adminRes.data), 'Admin receives array of sanitized orders');

    // 4. Test verified customer access
    const customerUser: AuthUser = {
      userId: 'cust_verified_1',
      role: 'CUSTOMER',
      email: testPhone
    };
    const customerToken = createAuthToken(customerUser);

    const customerRes = await requestHttp(server, `/api/orders/customer/${testPhone}`, 'GET', {
      'Authorization': `Bearer ${customerToken}`
    });
    assert(customerRes.status === 200, 'Verified customer matching phone receives HTTP 200');

    // 5. Test mismatched verified customer access (trying to snoop on another phone)
    const otherCustomerToken = createAuthToken({
      userId: 'cust_verified_2',
      role: 'CUSTOMER',
      email: '081277776666'
    });
    const mismatchedRes = await requestHttp(server, `/api/orders/customer/${testPhone}`, 'GET', {
      'Authorization': `Bearer ${otherCustomerToken}`
    });
    assert(mismatchedRes.status === 403, 'Customer with mismatched phone is rejected with HTTP 403');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // --- FINAL SUMMARY ---
  console.log('\n=== RATE LIMITER TEST SUMMARY ===');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total assertions: ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);

  if (failed > 0) {
    console.error('\nFAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(` - ${r.name}: ${JSON.stringify(r.details)}`));
    process.exit(1);
  } else {
    console.log('\nALL RATE LIMITER & PRIVACY TESTS PASSED PERFECTLY!\n');
  }
}

runRateLimiterTests().catch((err) => {
  console.error('Fatal rate limiter test error:', err);
  process.exit(1);
});

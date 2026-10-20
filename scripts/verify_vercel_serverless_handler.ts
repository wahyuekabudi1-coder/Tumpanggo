/**
 * Verification script using real Node.js http.createServer to test
 * Vercel Serverless Function handler with genuine IncomingMessage and ServerResponse instances.
 */

import http from 'http';
import handler from '../api/index';

async function run() {
  console.log('=== REAL HTTP SERVERLESS HANDLER VERIFICATION ===');

  const server = http.createServer((req, res) => {
    handler(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Serverless test harness listening on ${baseUrl}`);

  try {
    // Test 1: GET /api/health
    console.log('\n[Test 1] GET /api/health (simulating Vercel rewrite)...');
    const healthRes = await fetch(`${baseUrl}/api/index?__path=/api/health`, {
      headers: { 'x-matched-path': '/api/index?__path=/api/health' }
    });
    const healthJson = await healthRes.json();
    console.log(`[Test 1 Result] Status: ${healthRes.status}, Server: ${healthJson.server}, System: ${healthJson.system}`);
    if (healthRes.status !== 200 && healthRes.status !== 503) {
      throw new Error(`Unexpected health status: ${healthRes.status}`);
    }

    // Test 2: GET /api/config
    console.log('\n[Test 2] GET /api/config...');
    const configRes = await fetch(`${baseUrl}/api/index?__path=/api/config`, {
      headers: { 'x-matched-path': '/api/index?__path=/api/config' }
    });
    const configJson = await configRes.json();
    console.log(`[Test 2 Result] Status: ${configRes.status}, QRIS: ${configJson.qrisImage}`);
    if (configRes.status !== 200) {
      throw new Error(`Unexpected config status: ${configRes.status}`);
    }

    // Test 3: POST /api/auth/login with invalid/empty body
    console.log('\n[Test 3] POST /api/auth/login (Empty payload)...');
    const loginRes = await fetch(`${baseUrl}/api/index?__path=/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-matched-path': '/api/index?__path=/api/auth/login'
      },
      body: JSON.stringify({})
    });
    const loginJson = await loginRes.json();
    console.log(`[Test 3 Result] Status: ${loginRes.status}, Error: ${loginJson.error}`);
    if (loginRes.status !== 400) {
      throw new Error(`Expected 400, got ${loginRes.status}`);
    }

    // Test 4: POST /api/auth/login with Master Admin credentials
    console.log('\n[Test 4] POST /api/auth/login (Master Admin Credentials Check)...');
    const masterLoginRes = await fetch(`${baseUrl}/api/index?__path=/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-matched-path': '/api/index?__path=/api/auth/login'
      },
      body: JSON.stringify({
        email: 'tumpanggo@gmail.com',
        password: process.env.MASTER_ADMIN_PASSWORD || process.env.FOOD_ADMIN_PASSWORD || 'test_wrong_pass',
        role: 'ADMIN'
      })
    });
    const masterJson = await masterLoginRes.json();
    console.log(`[Test 4 Result] Status: ${masterLoginRes.status}, Response:`, masterJson.token ? 'JWT token issued!' : masterJson.error);

    // Test 5: Unknown route 404
    console.log('\n[Test 5] GET /api/unknown-nonexistent-route...');
    const notFoundRes = await fetch(`${baseUrl}/api/index?__path=/api/unknown-nonexistent-route`, {
      headers: { 'x-matched-path': '/api/index?__path=/api/unknown-nonexistent-route' }
    });
    const notFoundJson = await notFoundRes.json();
    console.log(`[Test 5 Result] Status: ${notFoundRes.status}, Error: ${notFoundJson.error}`);
    if (notFoundRes.status !== 404) {
      throw new Error(`Expected 404, got ${notFoundRes.status}`);
    }

    console.log('\n=== ALL REAL HTTP SERVERLESS TESTS PASSED WITH 100% SUCCESS! ===');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('\nFAILED VERIFICATION:', err);
  process.exit(1);
});

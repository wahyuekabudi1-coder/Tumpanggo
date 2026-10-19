/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Test Suite: Total Ongkir TumpangGo Flat Rp 5.000
 * Verifies all 15 villages, distance independence, tampering rejection,
 * outside district preservation, and end-to-end backend order persistence.
 */

import { calculateDeliveryFee, isDestinationInKecamatanTumpang, FLAT_TUMPANG_DELIVERY_FEE, normalizeOrderDeliveryFee } from '../src/utils/deliveryFee';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  expectedInTumpang: boolean;
  expectedFee?: number;
}

const TEST_CASES: TestCase[] = [
  // All 15 Official Villages of Kecamatan Tumpang
  { name: '1. Desa Tumpang', address: 'Jl. Raya Tumpang No. 45, Kec. Tumpang, Malang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '2. Desa Jeru', address: 'Desa Jeru RT 02 RW 01, Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '3. Desa Malangsuko (Spaced)', address: 'Jl. Melati No. 10, Desa Malang Suko', expectedInTumpang: true, expectedFee: 5000 },
  { name: '3b. Desa Malangsuko (Single word)', address: 'Jl. Anggrek No. 5, Malangsuko, Malang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '4. Desa Pulungdowo (Single word)', address: 'Desa Pulungdowo RT 03 RW 02', expectedInTumpang: true, expectedFee: 5000 },
  { name: '4b. Desa Pulungdowo (Spaced)', address: 'Dusun Krajan, Pulung Dowo, Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '5. Desa Bokor', address: 'Jl. Kenanga No. 8, Desa Bokor, Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '6. Desa Slamet', address: 'Desa Slamet RT 04 RW 02, Kec. Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '7. Desa Wringinsongo (Single word)', address: 'Desa Wringinsongo RT 01', expectedInTumpang: true, expectedFee: 5000 },
  { name: '7b. Desa Wringinsongo (Spaced)', address: 'Wringin Songo, Kecamatan Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '8. Desa Benjor (Far East foothills)', address: 'Desa Benjor RT 01 RW 01, Tumpang', lat: -8.025, lng: 112.835, expectedInTumpang: true, expectedFee: 5000 },
  { name: '9. Desa Duwet', address: 'Desa Duwet No. 14, Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '10. Desa Duwet Krajan', address: 'Duwet Krajan RT 02 RW 03, Tumpang', lat: -8.012, lng: 112.842, expectedInTumpang: true, expectedFee: 5000 },
  { name: '11. Desa Kidal (Near Candi Kidal)', address: 'Desa Kidal RT 05 RW 02, Dekat Candi Kidal', expectedInTumpang: true, expectedFee: 5000 },
  { name: '12. Desa Kambingan', address: 'Desa Kambingan No. 22, Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: '13. Desa Ngingit (South border)', address: 'Desa Ngingit RT 03 RW 01, Tumpang', lat: -8.055, lng: 112.768, expectedInTumpang: true, expectedFee: 5000 },
  { name: '14. Desa Tulusbesar (Single word)', address: 'Desa Tulusbesar RT 02 RW 04', expectedInTumpang: true, expectedFee: 5000 },
  { name: '14b. Desa Tulusbesar (Dusun Glagah)', address: 'Dusun Glagah, Tulus Besar', expectedInTumpang: true, expectedFee: 5000 },
  { name: '15. Desa Pandanajeng (Single word)', address: 'Desa Pandanajeng RT 04 RW 01', expectedInTumpang: true, expectedFee: 5000 },
  { name: '15b. Desa Pandanajeng (Spaced)', address: 'Pandan Ajeng, Kec Tumpang', expectedInTumpang: true, expectedFee: 5000 },

  // Landmarks & Postal Codes
  { name: 'Landmark: Pasar Tumpang', address: 'Pasar Tumpang Kios B-12', expectedInTumpang: true, expectedFee: 5000 },
  { name: 'Landmark: RS Sumber Sentosa', address: 'Depan RS Sumber Sentosa, Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: 'Landmark: Candi Jago', address: 'Jl. Wisnuwardhana, Candi Jago', expectedInTumpang: true, expectedFee: 5000 },
  { name: 'Landmark: Alun-alun Tumpang', address: 'Jl. Kauman No. 1, Alun-Alun Tumpang', expectedInTumpang: true, expectedFee: 5000 },
  { name: 'Landmark: Postal Code 65156', address: 'Jl. Merbabu No. 15, 65156', expectedInTumpang: true, expectedFee: 5000 },

  // Street address in Tumpang without explicit district name
  { name: 'Local street address', address: 'Jl. Dahlia No. 4, RT 02 RW 01', lat: -7.998, lng: 112.766, expectedInTumpang: true, expectedFee: 5000 },

  // Outside Destinations (Must NOT be flat Rp 5.000)
  { name: 'Outside: Kecamatan Pakis', address: 'Jl. Raya Asrikaton No. 12, Kecamatan Pakis', expectedInTumpang: false },
  { name: 'Outside: Kecamatan Poncokusumo', address: 'Desa Belung, Kecamatan Poncokusumo', expectedInTumpang: false },
  { name: 'Outside: Kota Malang', address: 'Jl. Soekarno Hatta No. 9, Lowokwaru, Kota Malang', lat: -7.945, lng: 112.615, expectedInTumpang: false },
  { name: 'Outside: Kecamatan Jabung', address: 'Desa Sukopuro, Kecamatan Jabung', expectedInTumpang: false },
  { name: 'Outside: Kecamatan Tajinan', address: 'Kecamatan Tajinan RT 02 RW 01', expectedInTumpang: false }
];

async function runTests() {
  console.log('===============================================================');
  console.log('   TUMPANGGO ONGIR AUDIT & VERIFICATION SUITE — FLAT RP 5.000   ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. UNIT TESTS: Village & Destination Classification
  console.log('--- 1. AUDITING GEOGRAPHIC CLASSIFICATION & CALCULATIONS ---');
  for (const tc of TEST_CASES) {
    const isTumpang = isDestinationInKecamatanTumpang({
      address: tc.address,
      latitude: tc.lat,
      longitude: tc.lng
    });

    const feeResult = calculateDeliveryFee({
      address: tc.address,
      latitude: tc.lat,
      longitude: tc.lng,
      merchantLatitude: -7.9984,
      merchantLongitude: 112.7663
    });

    if (isTumpang !== tc.expectedInTumpang) {
      console.error(`❌ [FAIL] ${tc.name}: Expected isInTumpang=${tc.expectedInTumpang}, got ${isTumpang} for "${tc.address}"`);
      failed++;
    } else if (tc.expectedFee !== undefined && feeResult.deliveryFee !== tc.expectedFee) {
      console.error(`❌ [FAIL] ${tc.name}: Expected deliveryFee=${tc.expectedFee}, got ${feeResult.deliveryFee}`);
      failed++;
    } else {
      console.log(`✅ [PASS] ${tc.name} -> isInTumpang: ${isTumpang}, Ongkir: Rp ${feeResult.deliveryFee.toLocaleString('id-ID')}`);
      passed++;
    }
  }

  // 2. DISTANCE INDEPENDENCE WITHIN KECAMATAN TUMPANG
  console.log('\n--- 2. AUDITING DISTANCE INDEPENDENCE WITHIN KECAMATAN TUMPANG ---');
  const merchantLoc = { lat: -7.9984, lng: 112.7663 }; // Warung Bakso Barokah in Tumpang center
  const destinations = [
    { label: 'Close (~0.5 km) - Malangsuko', address: 'Malangsuko, Tumpang', lat: -7.999, lng: 112.767 },
    { label: 'Medium (~2.5 km) - Jeru', address: 'Desa Jeru, Tumpang', lat: -8.015, lng: 112.755 },
    { label: 'Far (~5.5 km) - Kidal', address: 'Desa Kidal, Tumpang', lat: -8.028, lng: 112.715 },
    { label: 'Very Far (~8.5 km) - Benjor', address: 'Desa Benjor, Tumpang', lat: -8.025, lng: 112.835 },
    { label: 'Remote (~9.5 km) - Duwet Krajan', address: 'Duwet Krajan, Tumpang', lat: -8.012, lng: 112.842 }
  ];

  for (const d of destinations) {
    const res = calculateDeliveryFee({
      address: d.address,
      latitude: d.lat,
      longitude: d.lng,
      merchantLatitude: merchantLoc.lat,
      merchantLongitude: merchantLoc.lng
    });

    if (res.deliveryFee === 5000 && res.isInTumpang === true) {
      console.log(`✅ [PASS] ${d.label} -> Ongkir: Rp ${res.deliveryFee.toLocaleString('id-ID')} (Distance invariant confirmed)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${d.label} -> Expected 5000, got ${res.deliveryFee}`);
      failed++;
    }
  }

  // 3. BACKEND API END-TO-END CHECKOUT & PERSISTENCE
  console.log('\n--- 3. TESTING BACKEND HTTP API CREATION & TAMPER PROOFING ---');
  try {
    // 3a. Normal Order in Jeru
    const orderPayloadJeru = {
      customerName: 'Budi Test Jeru',
      customerPhone: '081299887766',
      deliveryAddress: 'Jl. Raya Jeru No. 12, Desa Jeru, Tumpang',
      items: [
        { menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 15000, quantity: 2 }
      ],
      merchantId: 'm1',
      subtotal: 30000,
      deliveryFee: 5000,
      serviceFee: 2000
    };

    const resJeru = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayloadJeru)
    });

    if (!resJeru.ok) {
      throw new Error(`Failed to create Jeru order: HTTP ${resJeru.status}`);
    }
    const createdJeru = await resJeru.json();
    if (createdJeru.deliveryFee === 5000) {
      console.log(`✅ [PASS] Backend Created Order in Desa Jeru: ID=${createdJeru.id}, Ongkir=Rp ${createdJeru.deliveryFee}, Total=Rp ${createdJeru.total}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Backend Jeru Order has deliveryFee=${createdJeru.deliveryFee} (expected 5000)`);
      failed++;
    }

    // 3b. Far Order in Desa Benjor
    const orderPayloadBenjor = {
      customerName: 'Siti Test Benjor',
      customerPhone: '081299887755',
      deliveryAddress: 'Dusun Krajan, Desa Benjor (Lereng Bromo), Tumpang',
      latitude: -8.025,
      longitude: 112.835,
      items: [
        { menuItemId: 'menu_2', name: 'Mie Ayam Ceker Bakso', price: 13000, quantity: 2 }
      ],
      merchantId: 'm1',
      subtotal: 26000,
      deliveryFee: 5000,
      serviceFee: 2000
    };

    const resBenjor = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayloadBenjor)
    });
    const createdBenjor = await resBenjor.json();
    if (createdBenjor.deliveryFee === 5000) {
      console.log(`✅ [PASS] Backend Created Order in Desa Benjor (Far Distance): ID=${createdBenjor.id}, Ongkir=Rp ${createdBenjor.deliveryFee}, Total=Rp ${createdBenjor.total}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Backend Benjor Order has deliveryFee=${createdBenjor.deliveryFee}`);
      failed++;
    }

    // 3c. CLIENT TAMPER ATTEMPT: Client sends deliveryFee: 35000 or 0
    console.log('\n--- 4. AUDITING BACKEND TAMPER RESISTANCE ---');
    const orderTamperPayload = {
      customerName: 'Hacker Tamper Test',
      customerPhone: '081299887744',
      deliveryAddress: 'Desa Malangsuko, Tumpang',
      items: [
        { menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 15000, quantity: 1 }
      ],
      merchantId: 'm1',
      subtotal: 15000,
      deliveryFee: 99000, // Intentional manipulation by malicious client
      serviceFee: 2000
    };

    const resTamper = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderTamperPayload)
    });
    const createdTamper = await resTamper.json();
    if (createdTamper.deliveryFee === 5000) {
      const expectedTotal = 15000 + 5000 + 2000 + createdTamper.uniqueCode;
      if (createdTamper.total === expectedTotal) {
        console.log(`✅ [PASS] Client Tamper Attempt (sent Rp 99.000): Backend REJECTED client fee and strictly enforced deliveryFee=Rp 5.000. Total=Rp ${createdTamper.total}`);
        passed++;
      } else {
        console.error(`❌ [FAIL] Total mismatch: expected ${expectedTotal}, got ${createdTamper.total}`);
        failed++;
      }
    } else {
      console.error(`❌ [FAIL] Backend accepted client tampered fee: ${createdTamper.deliveryFee}`);
      failed++;
    }

    // 3d. Database Persistence Verification (GET /api/orders/:id)
    console.log('\n--- 5. AUDITING PERSISTENCE & RELOAD RETRIEVAL ---');
    const resGet = await fetch(`${BASE_URL}/api/orders/${createdJeru.id}`);
    const retrievedJeru = await resGet.json();
    if (retrievedJeru && retrievedJeru.deliveryFee === 5000) {
      console.log(`✅ [PASS] Retrieved order #${createdJeru.id} from database: Ongkir strictly preserved at Rp ${retrievedJeru.deliveryFee}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Retrieved order #${createdJeru.id} has deliveryFee=${retrievedJeru?.deliveryFee}`);
      failed++;
    }

    // 3e. Outside District Order (Pakis)
    console.log('\n--- 6. AUDITING OUTSIDE DISTRICT SEPARATION ---');
    const orderPayloadPakis = {
      customerName: 'Customer Luar Pakis',
      customerPhone: '081299887733',
      deliveryAddress: 'Jl. Raya Asrikaton No. 44, Kecamatan Pakis, Malang',
      latitude: -7.962,
      longitude: 112.705,
      items: [
        { menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 15000, quantity: 1 }
      ],
      merchantId: 'm1',
      subtotal: 15000,
      deliveryFee: 12000,
      serviceFee: 2000
    };

    const resPakis = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayloadPakis)
    });
    const createdPakis = await resPakis.json();
    if (createdPakis.deliveryFee > 5000) {
      console.log(`✅ [PASS] Outside District Order (Kecamatan Pakis): Correctly calculated based on distance -> Ongkir=Rp ${createdPakis.deliveryFee.toLocaleString('id-ID')}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Outside order incorrectly charged flat fee: ${createdPakis.deliveryFee}`);
      failed++;
    }

  } catch (err: any) {
    console.error('❌ [API ERROR]:', err.message || err);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

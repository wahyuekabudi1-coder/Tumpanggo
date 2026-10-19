/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Single Source of Truth for Delivery Fee & Geographic Boundaries
 * Mandatory Business Rule:
 * All delivery destinations within Kecamatan Tumpang are strictly charged a flat fee of Rp 5.000 per order,
 * regardless of distance, village/kelurahan, merchant location, map calculations, or internal zones.
 */

export const FLAT_TUMPANG_DELIVERY_FEE = 5000;

/**
 * The 15 official villages (desa / kelurahan) in Kecamatan Tumpang, Kabupaten Malang, Jawa Timur.
 * Includes all common naming, spacing, hyphenation, and prefix variations.
 */
export const TUMPANG_VILLAGES = [
  // 1. Tumpang
  'tumpang',
  'desa tumpang',
  'kelurahan tumpang',
  // 2. Jeru
  'jeru',
  'desa jeru',
  // 3. Malangsuko
  'malangsuko',
  'malang suko',
  'malang-suko',
  'desa malangsuko',
  'desa malang suko',
  // 4. Pulungdowo
  'pulungdowo',
  'pulung dowo',
  'pulung-dowo',
  'desa pulungdowo',
  'desa pulung dowo',
  // 5. Bokor
  'bokor',
  'desa bokor',
  // 6. Slamet
  'slamet',
  'desa slamet',
  // 7. Wringinsongo
  'wringinsongo',
  'wringin songo',
  'wringin-songo',
  'desa wringinsongo',
  'desa wringin songo',
  // 8. Benjor
  'benjor',
  'desa benjor',
  // 9. Duwet
  'duwet',
  'desa duwet',
  // 10. Duwet Krajan
  'duwet krajan',
  'duwetkrajan',
  'duwet-krajan',
  'desa duwet krajan',
  'desa duwetkrajan',
  // 11. Kidal
  'kidal',
  'desa kidal',
  // 12. Kambingan
  'kambingan',
  'desa kambingan',
  // 13. Ngingit
  'ngingit',
  'desa ngingit',
  // 14. Tulusbesar
  'tulusbesar',
  'tulus besar',
  'tulus-besar',
  'desa tulusbesar',
  'desa tulus besar',
  // 15. Pandanajeng
  'pandanajeng',
  'pandan ajeng',
  'pandan-ajeng',
  'desa pandanajeng',
  'desa pandan ajeng'
] as const;

/**
 * Key local hamlets, landmarks, and public places located within Kecamatan Tumpang.
 */
export const TUMPANG_LANDMARKS = [
  'candi kidal',
  'candi jago',
  'alun-alun tumpang',
  'alun alun tumpang',
  'taman tumpang',
  'pasar tumpang',
  'terminal tumpang',
  'kantor kecamatan tumpang',
  'kantor camat tumpang',
  'kecamatan tumpang',
  'kec. tumpang',
  'kec tumpang',
  'rs sumber sentosa',
  'rumah sakit sumber sentosa',
  'sumber sentosa',
  'puskesmas tumpang',
  'polsek tumpang',
  'koramil tumpang',
  'lembah tumpang',
  'sman 1 tumpang',
  'smpn 1 tumpang',
  'smpn 2 tumpang',
  'desela',
  'selandor',
  'argosari',
  'argo sari',
  'jilu',
  'glagah', // Dusun Glagah di Desa Tulusbesar
  'tumpanggo',
  'tumpang go',
  '65156' // Official Postal Code of Kecamatan Tumpang
] as const;

/**
 * Explicit neighboring districts or cities that are OUTSIDE Kecamatan Tumpang.
 */
export const OUTSIDE_DISTRICT_KEYWORDS = [
  'kecamatan pakis',
  'kec. pakis',
  'pakis',
  'kecamatan poncokusumo',
  'kec. poncokusumo',
  'poncokusumo',
  'kecamatan jabung',
  'kec. jabung',
  'jabung',
  'kecamatan wajak',
  'kec. wajak',
  'wajak',
  'kecamatan tajinan',
  'kec. tajinan',
  'tajinan',
  'kecamatan singosari',
  'kec. singosari',
  'singosari',
  'kecamatan lawang',
  'kec. lawang',
  'lawang',
  'kecamatan kepanjen',
  'kec. kepanjen',
  'kepanjen',
  'kota malang',
  'malang kota',
  'klojen',
  'lowokwaru',
  'sukun',
  'blimbing',
  'kedungkandang',
  'kota batu',
  'batu',
  'surabaya',
  'sidoarjo',
  'pasuruan',
  'probolinggo',
  'blitar'
] as const;

/**
 * Geographic bounding box for Kecamatan Tumpang, Kabupaten Malang.
 * Fully covers all 15 villages including eastern foothills (Benjor, Duwet Krajan)
 * and southern borders (Ngingit, Kambingan).
 */
export const TUMPANG_GEO_BOUNDS = {
  minLat: -8.1200,
  maxLat: -7.8500,
  minLng: 112.6700,
  maxLng: 112.8900
};

/**
 * Haversine formula to compute great-circle distance between two coordinates in kilometers.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface LocationInput {
  address?: string;
  details?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Normalizes input text for resilient fuzzy and keyword matching.
 */
function normalizeLocationText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines whether a destination address and/or coordinates are within Kecamatan Tumpang.
 * 
 * Evaluation Order:
 * 1. Positive identification: Contains "Tumpang", any of the 15 official villages,
 *    recognized hamlets/landmarks, or postal code 65156. -> Returns TRUE.
 * 2. Explicit outside detection: Address specifically mentions an outside district
 *    (e.g., "Kecamatan Pakis", "Poncokusumo", "Kota Malang") without matching a Tumpang village. -> Returns FALSE.
 * 3. Coordinate boundary verification: Validates GPS against the comprehensive Tumpang bounding box.
 * 4. Hyper-local default: Unless explicitly identified as outside, destinations in this
 *    Tumpang-exclusive ecosystem default to Kecamatan Tumpang (Flat Rp 5.000).
 */
export function isDestinationInKecamatanTumpang(loc: LocationInput): boolean {
  const rawCombined = [loc.address, loc.details, loc.landmark].filter(Boolean).join(' ');
  const normalized = normalizeLocationText(rawCombined);

  // 1. Direct positive check: contains postal code 65156 or "tumpang"
  if (normalized.includes('65156') || /\b(tumpang)\b/i.test(normalized)) {
    return true;
  }

  // Check against all 15 official villages
  const hasVillage = TUMPANG_VILLAGES.some(village => {
    const vNorm = normalizeLocationText(village);
    if (vNorm.includes(' ')) {
      return normalized.includes(vNorm);
    }
    const regex = new RegExp(`(^|[^a-z])${vNorm}([^a-z]|$)`, 'i');
    return regex.test(normalized);
  });

  if (hasVillage) {
    return true;
  }

  // Check against recognized local landmarks and hamlets
  const hasLandmark = TUMPANG_LANDMARKS.some(lm => {
    const lmNorm = normalizeLocationText(lm);
    return normalized.includes(lmNorm);
  });

  if (hasLandmark) {
    return true;
  }

  // 2. Explicit outside district check (e.g. "Kecamatan Pakis", "Kota Malang", "Poncokusumo")
  // Only trigger if no Tumpang keyword/village was matched
  const hasExplicitOutsideDistrict = OUTSIDE_DISTRICT_KEYWORDS.some(kw => {
    const kwNorm = normalizeLocationText(kw);
    if (kwNorm.includes(' ')) {
      return normalized.includes(kwNorm);
    }
    const regex = new RegExp(`(^|[^a-z])${kwNorm}([^a-z]|$)`, 'i');
    return regex.test(normalized);
  });

  if (hasExplicitOutsideDistrict) {
    return false;
  }

  // 3. Coordinate check: if lat/lng are provided and not zero
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number' && loc.latitude !== 0 && loc.longitude !== 0) {
    const inBounds =
      loc.latitude >= TUMPANG_GEO_BOUNDS.minLat &&
      loc.latitude <= TUMPANG_GEO_BOUNDS.maxLat &&
      loc.longitude >= TUMPANG_GEO_BOUNDS.minLng &&
      loc.longitude <= TUMPANG_GEO_BOUNDS.maxLng;

    if (inBounds) {
      return true;
    } else {
      // Clearly outside the Tumpang geographic area
      return false;
    }
  }

  // 4. Default for TumpangGo local ecosystem:
  // In a local ordering platform for Tumpang, unspecified addresses default to Kecamatan Tumpang
  return true;
}

export interface DeliveryFeeCalculationParams {
  address?: string;
  details?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  merchantLatitude?: number;
  merchantLongitude?: number;
  systemConfig?: {
    defaultDeliveryFee?: number;
    deliveryFeePerKm?: number;
  };
}

export interface DeliveryFeeResult {
  deliveryFee: number;
  isInTumpang: boolean;
  distanceKm?: number;
  explanation: string;
}

/**
 * Calculates delivery fee following the mandatory single source of truth rule.
 * 
 * MANDATORY BUSINESS RULE:
 * - Within Kecamatan Tumpang: Strictly flat Rp 5.000 per order.
 *   No distance multiplication, no zone surcharges, no minimum fees above 5000.
 * - Outside Kecamatan Tumpang: Calculated based on distance.
 */
export function calculateDeliveryFee(params: DeliveryFeeCalculationParams): DeliveryFeeResult {
  const isInTumpang = isDestinationInKecamatanTumpang({
    address: params.address,
    details: params.details,
    landmark: params.landmark,
    latitude: params.latitude,
    longitude: params.longitude
  });

  if (isInTumpang) {
    return {
      deliveryFee: FLAT_TUMPANG_DELIVERY_FEE,
      isInTumpang: true,
      explanation: 'Tarif flat Rp 5.000 untuk seluruh pengantaran di area Kecamatan Tumpang.'
    };
  }

  // Outside Kecamatan Tumpang: Calculate distance-based rate
  let distanceKm = 0;
  if (
    params.merchantLatitude &&
    params.merchantLongitude &&
    params.latitude &&
    params.longitude
  ) {
    distanceKm = calculateDistanceKm(
      params.merchantLatitude,
      params.merchantLongitude,
      params.latitude,
      params.longitude
    );
  }

  const feePerKm = params.systemConfig?.deliveryFeePerKm || 1500;
  const baseFee = params.systemConfig?.defaultDeliveryFee || 5000;
  const calculatedOutside = Math.round((distanceKm || 5) * feePerKm);
  const outsideFee = Math.max(baseFee, calculatedOutside);

  return {
    deliveryFee: outsideFee,
    isInTumpang: false,
    distanceKm: distanceKm || undefined,
    explanation: `Pengantaran luar Kecamatan Tumpang (${distanceKm ? distanceKm + ' km' : 'Luar Wilayah'}): Rp ${outsideFee.toLocaleString('id-ID')}`
  };
}

/**
 * Normalizes an order's delivery fee and total to guarantee that
 * orders inside Kecamatan Tumpang are strictly charged flat Rp 5.000.
 * Prevents database inconsistencies, stale cached values, or frontend tampering.
 */
export function normalizeOrderDeliveryFee<T extends { 
  deliveryAddress?: string;
  deliveryDetails?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  deliveryFee: number;
  subtotal: number;
  serviceFee: number;
  uniqueCode?: number;
  total: number;
}>(order: T): T {
  if (!order) return order;
  const inTumpang = isDestinationInKecamatanTumpang({
    address: order.deliveryAddress,
    details: order.deliveryDetails,
    landmark: order.landmark,
    latitude: order.latitude,
    longitude: order.longitude
  });

  if (inTumpang && order.deliveryFee !== FLAT_TUMPANG_DELIVERY_FEE) {
    order.deliveryFee = FLAT_TUMPANG_DELIVERY_FEE;
    order.total = order.subtotal + FLAT_TUMPANG_DELIVERY_FEE + order.serviceFee + (order.uniqueCode || 0);
  }
  return order;
}

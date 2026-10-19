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
 */
export const TUMPANG_VILLAGES = [
  'tumpang',
  'jeru',
  'malangsuko',
  'pulungdowo',
  'bokor',
  'slamet',
  'wringinsongo',
  'benjor',
  'duwet',
  'duwet krajan',
  'duwetkrajan',
  'kidal',
  'kambingan',
  'ngingit',
  'tulusbesar',
  'tulus besar',
  'pandanajeng',
  'pandan ajeng'
] as const;

/**
 * Key local landmarks and places located within Kecamatan Tumpang.
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
  'rs sumber sentosa',
  'desela',
  'selandor',
  'argosari', // jilu / argosari area in tumpang
  'jilu'
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
  'kepanjen',
  'kota malang',
  'malang kota',
  'klojen',
  'lowokwaru',
  'sukun',
  'blimbing',
  'kedungkandang',
  'kota batu',
  'batu'
] as const;

/**
 * Geographic bounding box for Kecamatan Tumpang, Kabupaten Malang.
 * Latitude range: roughly -8.0500 to -7.9000
 * Longitude range: roughly 112.7000 to 112.8300
 */
export const TUMPANG_GEO_BOUNDS = {
  minLat: -8.0600,
  maxLat: -7.8800,
  minLng: 112.6900,
  maxLng: 112.8300
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
 * Determines whether a destination address and/or coordinates are within Kecamatan Tumpang.
 */
export function isDestinationInKecamatanTumpang(loc: LocationInput): boolean {
  const textParts = [loc.address, loc.details, loc.landmark].filter(Boolean).join(' ').toLowerCase();

  // 1. Direct positive check: contains "tumpang" or any of the 15 Tumpang villages
  const hasTumpangKeyword = TUMPANG_VILLAGES.some(village => {
    // Regex for whole-word or boundary match to avoid false substrings
    const regex = new RegExp(`(^|[^a-z])${village}([^a-z]|$)`, 'i');
    return regex.test(textParts);
  });

  const hasLandmarkKeyword = TUMPANG_LANDMARKS.some(lm => textParts.includes(lm));

  if (hasTumpangKeyword || hasLandmarkKeyword) {
    return true;
  }

  // 2. Explicit outside district check (e.g. "Kecamatan Pakis", "Kota Malang", "Poncokusumo")
  // Only trigger if no Tumpang keyword was matched
  const hasExplicitOutsideDistrict = OUTSIDE_DISTRICT_KEYWORDS.some(kw => {
    const regex = new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, 'i');
    return regex.test(textParts);
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
      // Clearly outside the Tumpang bounding box
      return false;
    }
  }

  // 4. Default for TumpangGo local ecosystem:
  // Unless explicitly indicated as outside, destinations in this local hyper-local app are considered Kecamatan Tumpang
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
 * RULE:
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
  const outsideFee = Math.max(baseFee, Math.round((distanceKm || 5) * feePerKm));

  return {
    deliveryFee: outsideFee,
    isInTumpang: false,
    distanceKm: distanceKm || undefined,
    explanation: `Pengantaran luar Kecamatan Tumpang (${distanceKm ? distanceKm + ' km' : 'Luar Wilayah'}): Rp ${outsideFee.toLocaleString('id-ID')}`
  };
}

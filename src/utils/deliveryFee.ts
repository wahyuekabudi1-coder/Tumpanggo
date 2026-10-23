/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TumpangGo Single Source of Truth for Delivery Fee & Geographic Boundaries.
 *
 * Business rules:
 * - Kecamatan Tumpang: flat Rp5.000 per order.
 * - Kecamatan Pakis: flat Rp7.500 per order.
 * - All other districts are unsupported.
 * - Maximum merchant-to-destination distance: 10 km.
 * - Unknown/ambiguous district must not silently default to Tumpang.
 */

export const FLAT_TUMPANG_DELIVERY_FEE = 5000;
export const FLAT_PAKIS_DELIVERY_FEE = 7500;
export const MAX_DELIVERY_DISTANCE_KM = 10;

/**
 * Common village-name variants in Kecamatan Tumpang.
 * These are supporting address hints, not a substitute for a verified district.
 */
export const TUMPANG_VILLAGES = [
  'tumpang', 'desa tumpang', 'kelurahan tumpang',
  'jeru', 'desa jeru',
  'malangsuko', 'malang suko', 'malang-suko', 'desa malangsuko', 'desa malang suko',
  'pulungdowo', 'pulung dowo', 'pulung-dowo', 'desa pulungdowo', 'desa pulung dowo',
  'bokor', 'desa bokor',
  'slamet', 'desa slamet',
  'wringinsongo', 'wringin songo', 'wringin-songo', 'desa wringinsongo', 'desa wringin songo',
  'benjor', 'desa benjor',
  'duwet', 'desa duwet',
  'duwet krajan', 'duwetkrajan', 'duwet-krajan', 'desa duwet krajan', 'desa duwetkrajan',
  'kidal', 'desa kidal',
  'kambingan', 'desa kambingan',
  'ngingit', 'desa ngingit',
  'tulusbesar', 'tulus besar', 'tulus-besar', 'desa tulusbesar', 'desa tulus besar',
  'pandanajeng', 'pandan ajeng', 'pandan-ajeng', 'desa pandanajeng', 'desa pandan ajeng'
] as const;

/** Local landmarks that can be used as supporting Tumpang address hints. */
export const TUMPANG_LANDMARKS = [
  'candi kidal',
  'candi jago',
  'alun-alun tumpang',
  'alun alun tumpang',
  'taman tumpang',
  'pasar tumpang',
  'terminal tumpang'
] as const;

export interface CalculateDeliveryFeeInput {
  address?: string;
  details?: string;
  landmark?: string;
  district?: string;
  destinationDistrict?: string;
  latitude?: number;
  longitude?: number;
  merchantLatitude?: number;
  merchantLongitude?: number;
  systemConfig?: unknown;
}

export interface DeliveryFeeCalculation {
  deliveryFee: number;
  isSupported: boolean;
  isInPakis: boolean;
  isInTumpang: boolean;
  distanceKm: number | null;
  reason?: string;
}

type SupportedDistrict = 'TUMPANG' | 'PAKIS';

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i').test(text);
}

/**
 * Determine the destination district only from explicit district fields.
 * Do not infer the district from a generic address substring: village names can
 * overlap with other places and a false positive could permit an unsupported order.
 */

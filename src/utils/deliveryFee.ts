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
export const FLAT_PAKIS_DELIVERY_FEE = 7500;
export const MAX_DELIVERY_DISTANCE_KM = 10;

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

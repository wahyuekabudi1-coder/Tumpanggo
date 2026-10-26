-- =====================================================================
-- TUMPANGGO SUPABASE PRODUCTION DATA IMPORT DUMP
-- Generated: 2026-10-26T09:36:34.310Z
-- Strict Foreign Key & Anti-Dummy Sanitization Active
-- Warung Ombay & Core Operational Data Protected
-- =====================================================================

BEGIN;

-- 1. System Config
INSERT INTO system_config (id, service_fee, default_delivery_fee, commission_percent, assignment_mode, qris_image, system_open)
VALUES (
  'config_1',
  2000,
  5000,
  10,
  'MANUAL',
  '/qris-merchant.png',
  true
)
ON CONFLICT (id) DO UPDATE SET
  service_fee = EXCLUDED.service_fee,
  default_delivery_fee = EXCLUDED.default_delivery_fee,
  commission_percent = EXCLUDED.commission_percent,
  assignment_mode = EXCLUDED.assignment_mode,
  qris_image = EXCLUDED.qris_image,
  system_open = EXCLUDED.system_open;

-- 2. Merchants (0 real records)

-- 3. Categories (0 records)

-- 4. Menu Items (0 records)

-- 5. Drivers (0 records)

-- 6. Testimonials (0 records)

-- 7. Orders (0 records)

-- 8. Settlements (0 records)

-- 9. Partner Registrations (0 records)

-- 10. Audit Logs (47 records)
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_yrnfs3u',
  'admin_test',
  'ADMIN',
  'Created',
  'Created merchant Sate Ayam Madura 461930',
  '2026-10-26T09:21:01.938Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_meg5eu0',
  'm_zf6gy9n',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T09:21:01.938Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_gem9rep',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Rudi Hartono 461930 (MERCHANT)',
  '2026-10-26T09:21:01.937Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_82z7jgg',
  'admin_test',
  'ADMIN',
  'Deleted',
  'Deleted merchant Warung Nasi Pecel 461915',
  '2026-10-26T09:21:01.929Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_2japq7g',
  'admin_test',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_g0e6txo (Dewi Lestari 461915)',
  '2026-10-26T09:21:01.928Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_5i5a3rm',
  'admin_test',
  'ADMIN',
  'Created',
  'Created merchant Warung Nasi Pecel 461915',
  '2026-10-26T09:21:01.927Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_c38241y',
  'm_ury8mp5',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T09:21:01.926Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_51jznlf',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Dewi Lestari 461915 (MERCHANT)',
  '2026-10-26T09:21:01.925Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_185351v',
  'admin_test',
  'ADMIN',
  'Deleted',
  'Deleted driver Kurir Kilat Tumpang 466093',
  '2026-10-26T09:21:01.914Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_0xpi5xr',
  'admin_test',
  'ADMIN',
  'Created',
  'Created driver Kurir Kilat Tumpang 466093',
  '2026-10-26T09:21:01.913Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_4xry780',
  'admin_test',
  'ADMIN',
  'Deleted',
  'Deleted merchant Kedai Minuman Test 135587',
  '2026-10-26T09:21:01.912Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_684v748',
  'm_c4jsqo3',
  'MERCHANT',
  'Created',
  'Created menu item Jus Alpukat Kocok',
  '2026-10-26T09:21:01.911Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_asjcmv6',
  'm_c4jsqo3',
  'MERCHANT',
  'Created',
  'Created category Jus Buah Segar',
  '2026-10-26T09:21:01.911Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_cz3t5s6',
  'admin_test',
  'ADMIN',
  'Created',
  'Created merchant Kedai Minuman Test 135587',
  '2026-10-26T09:21:01.910Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_srdw87h',
  'm_c4jsqo3',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T09:21:01.910Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_98vvoir',
  'admin_test',
  'ADMIN',
  'Deleted',
  'Deleted merchant Warung Bakso Test 420130',
  '2026-10-26T09:21:01.900Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_e526d0n',
  'm_budrqek',
  'MERCHANT',
  'Created',
  'Created menu item Bakso Urat Komplit',
  '2026-10-26T09:21:01.899Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_g7wvuzv',
  'm_budrqek',
  'MERCHANT',
  'Created',
  'Created category Bakso Istimewa',
  '2026-10-26T09:21:01.898Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_unv0lmf',
  'admin_test',
  'ADMIN',
  'Created',
  'Created merchant Warung Bakso Test 420130',
  '2026-10-26T09:21:01.897Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_g4nlauh',
  'm_budrqek',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T09:21:01.897Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_bhtydin',
  'test_user',
  'ADMIN',
  'Updated',
  'Updated merchant Warung Cloud Asli',
  '2026-10-26T09:20:57.889Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_693gxr3',
  'test_user',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Cloud Asli',
  '2026-10-26T09:20:57.888Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_pvlbp2t',
  'm_cloud_authoritative_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Cloud Otoritatif',
  '2026-10-26T09:20:53.439Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_b523r7j',
  'm_sec_consistent_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Konsisten',
  '2026-10-26T09:20:53.365Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_fxpskg4',
  'u_admin_audit',
  'ADMIN',
  'Updated',
  'Updated driver Driver Audit Suspended',
  '2026-10-26T09:20:53.260Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_7bn0ftw',
  'u_driver_act',
  'DRIVER',
  'Updated',
  'Updated driver Driver Audit Active',
  '2026-10-26T09:20:53.252Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_sdvu166',
  'u_driver_susp',
  'DRIVER',
  'Updated',
  'Updated driver Driver Audit Suspended',
  '2026-10-26T09:20:53.240Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_wwqmx6q',
  'u_admin_audit',
  'ADMIN',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T09:20:53.234Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_t3m2iyt',
  'u_merchant_susp',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T09:20:53.228Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_wh581mp',
  'u_merchant_susp',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T09:20:53.220Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_nmv22oj',
  'm_sec_concurrent_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Concurrent Race Test',
  '2026-10-26T09:20:53.145Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ohlxp3g',
  'm_sec_test_inactive',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Audit Inactive',
  '2026-10-26T09:20:53.086Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_0fjzb57',
  'm_sec_test_inactive',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Audit Inactive',
  '2026-10-26T09:20:53.024Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_kiwfal1',
  'admin_authorized',
  'ADMIN',
  'Admin',
  'Admin admin_authorized memverifikasi pembayaran LUNAS & menerbitkan receipt #TG-RCP-9D3PI1A untuk pesanan #ord_9d3pi1a (Total: Rp 47.067)',
  '2026-10-26T09:20:46.512Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_htq9std',
  'admin_authorized',
  'ADMIN',
  'Updated',
  'Updated order ord_9d3pi1a status from WAITING_PAYMENT_VERIFICATION to PAYMENT_VERIFIED',
  '2026-10-26T09:20:46.507Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_y78qiv2',
  'customer',
  'CUSTOMER',
  'Updated',
  'Updated order ord_9d3pi1a status from WAITING_PAYMENT to WAITING_PAYMENT_VERIFICATION',
  '2026-10-26T09:20:46.504Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_cmnl4j7',
  'CUSTOMER',
  'CUSTOMER',
  'Created',
  'Created order TF-20261026-001 (ID: ord_9d3pi1a) Total: Rp 47,067 (UniqueCode: 67)',
  '2026-10-26T09:20:46.502Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_bol5not',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created menu item Nasi Rawon',
  '2026-10-26T09:20:46.483Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_2xqq4xf',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T09:20:46.482Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ox5pkds',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_jbaz2ob (Ahmad Concurrency 446465)',
  '2026-10-26T09:20:46.467Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_3cyqp0s',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Bakso Cak Ahmad 446465',
  '2026-10-26T09:20:46.466Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_grdzn79',
  'm_6rewnrd',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T09:20:46.465Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_zw8m8gj',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Ahmad Concurrency 446465 (MERCHANT)',
  '2026-10-26T09:20:46.463Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_vckj79t',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_d0krovp (Siti Aminah)',
  '2026-10-26T09:20:46.454Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ydves7q',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Warung Bu Siti 446440',
  '2026-10-26T09:20:46.453Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_lt1l1ul',
  'm_kkrfeug',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T09:20:46.453Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ucz8a2t',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Siti Aminah (MERCHANT)',
  '2026-10-26T09:20:46.449Z'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =====================================================================
-- TUMPANGGO SUPABASE DATA IMPORT DUMP
-- Generated: 2026-10-26T00:37:29.900Z
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

-- 2. Merchants (3 records)
INSERT INTO merchants (id, name, owner_name, phone, email, password_hash, address, latitude, longitude, open_time, close_time, bank_name, bank_account, bank_holder, active, rating, cook_time_estimate, image, business_photo, description, category, qris_image, is_activated, created_at, updated_at)
VALUES (
  'm_cloud_persisted',
  'Warung Cloud Asli',
  'Pak Cloud',
  '081234567899',
  '',
  'pbkdf2$10000$5ce31124cab81d8a5992bd7d24bbbfa3$f2539da5c68935f0ed1d172b7a2ca618923d612af5ed410a31832ffc9955d0fde2e36bf993c55793663786c912d10bc1ab40ffb7a98d87bdfb2693d0bc044c85',
  'Kecamatan Tumpang',
  -7.9482,
  112.7612,
  '08:00',
  '21:00',
  'Bank BRI',
  '123456789',
  'Pak Cloud',
  true,
  4.8,
  '20 menit',
  'https://example.com/img.jpg',
  'https://example.com/img.jpg',
  'Toko cloud',
  'Nasi & Lauk',
  '/qris-merchant.png',
  false,
  '2026-10-26T00:31:32.385Z',
  '2026-10-26T00:31:39.113Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO merchants (id, name, owner_name, phone, email, password_hash, address, latitude, longitude, open_time, close_time, bank_name, bank_account, bank_holder, active, rating, cook_time_estimate, image, business_photo, description, category, qris_image, is_activated, created_at, updated_at)
VALUES (
  'm_tnbl9si',
  'Warung Bu Siti 692398',
  'Siti Aminah',
  '081986923981',
  'busiti_692398@gmail.com',
  'pbkdf2$10000$a3cf8d3dfe0bc5d657b334054faede4d$53da27c1c152ce7e82c91a5d81c0f4bbd7a419ffd512d450de9d2dd681857b32020b95dc3415f0c568e025708b510d00d04b00ca19a8c762dc36d32f05b06e57',
  'Jl. Malangsuko No. 44, Tumpang',
  -7.9482,
  112.7612,
  '08:00',
  '21:00',
  'Bank BRI',
  '1234567890',
  'Siti Aminah',
  true,
  5,
  '15 menit',
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
  '',
  'Mitra Toko Kuliner Warung Bu Siti 692398 Kecamatan Tumpang',
  'Nasi & Lauk',
  '/qris-merchant.png',
  true,
  '2026-10-26T00:31:32.407Z',
  '2026-10-26T00:31:32.407Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO merchants (id, name, owner_name, phone, email, password_hash, address, latitude, longitude, open_time, close_time, bank_name, bank_account, bank_holder, active, rating, cook_time_estimate, image, business_photo, description, category, qris_image, is_activated, created_at, updated_at)
VALUES (
  'm_60co55x',
  'Bakso Cak Ahmad 692420',
  'Ahmad Concurrency 692420',
  '081986924209',
  'cak.ahmad_692420@gmail.com',
  'pbkdf2$10000$03b6a6482bb3885ab14c09515afcae31$e2b7837d9400de29ae97e8ba2af24c0fd0919ae841bc6f1cdff3e28baa37a7b55ff0e82089a2dc68196f7152dc4e644d828ac84eff9d8c70ce7bd8f9b7731cfa',
  'Jl. Raya Jeru No. 12, Tumpang',
  -7.9482,
  112.7612,
  '08:00',
  '21:00',
  'Bank BRI',
  '1234567890',
  'Ahmad Concurrency 692420',
  true,
  5,
  '15 menit',
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
  '',
  'Mitra Toko Kuliner Bakso Cak Ahmad 692420 Kecamatan Tumpang',
  'Bakso & Mie',
  '/qris-merchant.png',
  true,
  '2026-10-26T00:31:32.417Z',
  '2026-10-26T00:31:32.417Z'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Categories (3 records)
INSERT INTO categories (id, merchant_id, name, order_index)
VALUES (
  'cat_zrndpgr',
  'm_tnbl9si',
  'Menu Utama',
  1
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO categories (id, merchant_id, name, order_index)
VALUES (
  'cat_apiokx0',
  'm_60co55x',
  'Menu Utama',
  1
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO categories (id, merchant_id, name, order_index)
VALUES (
  'cat_gs7671i',
  'm_cloud_persisted',
  'Menu Utama',
  1
)
ON CONFLICT (id) DO NOTHING;

-- 4. Menu Items (1 records)
INSERT INTO menu_items (id, merchant_id, category_id, name, description, price, available, image, created_at, updated_at)
VALUES (
  'item_prd4sc7',
  'm_cloud_persisted',
  'cat_gs7671i',
  'Nasi Rawon',
  'Rawon daging sapi khas Tumpang',
  20000,
  true,
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
  '2026-10-26T00:31:32.420Z',
  '2026-10-26T00:31:32.420Z'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Drivers (0 records)

-- 6. Testimonials (0 records)
-- 7. Orders (1 records)
INSERT INTO orders (id, unique_code, total, status, merchant_id, merchant_name, customer_name, customer_phone, delivery_address, delivery_details, landmark, latitude, longitude, subtotal, delivery_fee, service_fee, driver_id, driver_name, payment_status, payment_method, payment_proof, payment_proof_uploaded_at, payment_rejection_reason, payment_verified_by, payment_verified_at, delivery_proof, is_settled, pre_order_date, payment_expires_at, items, created_at, updated_at)
VALUES (
  'ord_vk9rpil',
  29,
  47029,
  'PAYMENT_VERIFIED',
  'm_cloud_persisted',
  'Warung Cloud Asli',
  'Pelanggan Asli Tumpang',
  '081234509876',
  'Jl. Raya Tumpang No. 8',
  '',
  '',
  -7.9942,
  112.7667,
  40000,
  5000,
  2000,
  NULL,
  '',
  'PAID',
  'MERCHANT_QRIS',
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
  '2026-10-26T00:31:32.438Z',
  '',
  'admin_authorized',
  '2026-10-26T00:31:32.440Z',
  '',
  false,
  '',
  '2026-10-26T00:41:32.421Z',
  '[{"menuItemId":"item_prd4sc7","name":"Nasi Rawon","price":20000,"quantity":2}]'::jsonb,
  '2026-10-26T00:31:32.421Z',
  '2026-10-26T00:31:32.440Z'
)
ON CONFLICT (id) DO NOTHING;

-- 8. Settlements (0 records)

-- 9. Partner Registrations (2 records)
INSERT INTO partner_registrations (id, type, name, store_name, phone, email, address, status, notes, created_at, updated_at)
VALUES (
  'reg_r3erj7l',
  'MERCHANT',
  'Siti Aminah',
  'Warung Bu Siti 692398',
  '081986923981',
  'busiti_692398@gmail.com',
  '',
  'APPROVED',
  '',
  '2026-10-26T00:31:32.405Z',
  '2026-10-26T00:37:29.900Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO partner_registrations (id, type, name, store_name, phone, email, address, status, notes, created_at, updated_at)
VALUES (
  'reg_htb9jvv',
  'MERCHANT',
  'Ahmad Concurrency 692420',
  'Bakso Cak Ahmad 692420',
  '081986924209',
  'cak.ahmad_692420@gmail.com',
  '',
  'APPROVED',
  '',
  '2026-10-26T00:31:32.416Z',
  '2026-10-26T00:37:29.900Z'
)
ON CONFLICT (id) DO NOTHING;

-- 10. Audit Logs (68 records)
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_z7jsyhf',
  'test_user',
  'ADMIN',
  'Updated',
  'Updated merchant Warung Cloud Asli',
  '2026-10-26T00:31:39.114Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_mjvobz3',
  'test_user',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Cloud Asli',
  '2026-10-26T00:31:39.113Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_belv4hh',
  'm_cloud_authoritative_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Cloud Otoritatif',
  '2026-10-26T00:31:36.512Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_1974wm7',
  'm_sec_consistent_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Konsisten',
  '2026-10-26T00:31:36.477Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_u9n6elr',
  'u_admin_audit',
  'ADMIN',
  'Updated',
  'Updated driver Driver Audit Suspended',
  '2026-10-26T00:31:36.431Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_kiarvx4',
  'u_driver_act',
  'DRIVER',
  'Updated',
  'Updated driver Driver Audit Active',
  '2026-10-26T00:31:36.426Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_r61im72',
  'u_driver_susp',
  'DRIVER',
  'Updated',
  'Updated driver Driver Audit Suspended',
  '2026-10-26T00:31:36.421Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_pqlrm8z',
  'u_admin_audit',
  'ADMIN',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T00:31:36.417Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ynaehcf',
  'u_merchant_susp',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T00:31:36.412Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_t991kk0',
  'u_merchant_susp',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T00:31:36.409Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_63ydret',
  'm_sec_concurrent_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Concurrent Race Test',
  '2026-10-26T00:31:36.375Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_33npuck',
  'm_sec_test_inactive',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Audit Inactive',
  '2026-10-26T00:31:36.352Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_m3x9unb',
  'm_sec_test_inactive',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Audit Inactive',
  '2026-10-26T00:31:36.325Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_91lkvth',
  'admin_authorized',
  'ADMIN',
  'Admin',
  'Admin admin_authorized memverifikasi pembayaran LUNAS & menerbitkan receipt #TG-RCP-VK9RPIL untuk pesanan #ord_vk9rpil (Total: Rp 47.029)',
  '2026-10-26T00:31:32.443Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_wudax1y',
  'admin_authorized',
  'ADMIN',
  'Updated',
  'Updated order ord_vk9rpil status from WAITING_PAYMENT_VERIFICATION to PAYMENT_VERIFIED',
  '2026-10-26T00:31:32.440Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_2oscp4n',
  'customer',
  'CUSTOMER',
  'Updated',
  'Updated order ord_vk9rpil status from WAITING_PAYMENT to WAITING_PAYMENT_VERIFICATION',
  '2026-10-26T00:31:32.439Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_wvoz38d',
  'CUSTOMER',
  'CUSTOMER',
  'Created',
  'Created order TF-20261026-001 (ID: ord_vk9rpil) Total: Rp 47,029 (UniqueCode: 29)',
  '2026-10-26T00:31:32.437Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_cnlvza4',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created menu item Nasi Rawon',
  '2026-10-26T00:31:32.420Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_wr56ajx',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:31:32.419Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_3it1efn',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_htb9jvv (Ahmad Concurrency 692420)',
  '2026-10-26T00:31:32.418Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_gdom1jh',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Bakso Cak Ahmad 692420',
  '2026-10-26T00:31:32.418Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_byfmf1k',
  'm_60co55x',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:31:32.417Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_6ismcvb',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Ahmad Concurrency 692420 (MERCHANT)',
  '2026-10-26T00:31:32.416Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_kj05b0s',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_r3erj7l (Siti Aminah)',
  '2026-10-26T00:31:32.409Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ayk6578',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Warung Bu Siti 692398',
  '2026-10-26T00:31:32.408Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_plsq505',
  'm_tnbl9si',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:31:32.408Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_qpivg2n',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Siti Aminah (MERCHANT)',
  '2026-10-26T00:31:32.406Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_h8i7c40',
  'test_user',
  'ADMIN',
  'Updated',
  'Updated merchant Warung Cloud Asli',
  '2026-10-26T00:11:35.258Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_rhzdzaw',
  'test_user',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Cloud Asli',
  '2026-10-26T00:11:35.257Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_bw5u28p',
  'm_cloud_authoritative_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Cloud Otoritatif',
  '2026-10-26T00:11:32.297Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_na8k3xa',
  'm_sec_consistent_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Konsisten',
  '2026-10-26T00:11:32.249Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_8480l5f',
  'u_admin_audit',
  'ADMIN',
  'Updated',
  'Updated driver Driver Audit Suspended',
  '2026-10-26T00:11:32.210Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_cbxvx88',
  'u_driver_act',
  'DRIVER',
  'Updated',
  'Updated driver Driver Audit Active',
  '2026-10-26T00:11:32.206Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_47jqqyh',
  'u_driver_susp',
  'DRIVER',
  'Updated',
  'Updated driver Driver Audit Suspended',
  '2026-10-26T00:11:32.201Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_t1w11pr',
  'u_admin_audit',
  'ADMIN',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T00:11:32.199Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_5t3xl0b',
  'u_merchant_susp',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T00:11:32.195Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_jdnsbru',
  'u_merchant_susp',
  'MERCHANT',
  'Updated',
  'Updated merchant Warung Audit Active',
  '2026-10-26T00:11:32.191Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_m27iiwy',
  'm_sec_concurrent_test',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Concurrent Race Test',
  '2026-10-26T00:11:32.131Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_s1bxcx8',
  'm_sec_test_inactive',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Audit Inactive',
  '2026-10-26T00:11:32.094Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_s3mojpw',
  'm_sec_test_inactive',
  'MERCHANT',
  'Activated',
  'Activated merchant store Warung Audit Inactive',
  '2026-10-26T00:11:32.054Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_mlc7o7e',
  'admin_authorized',
  'ADMIN',
  'Admin',
  'Admin admin_authorized memverifikasi pembayaran LUNAS & menerbitkan receipt #TG-RCP-QAMYIID untuk pesanan #ord_qamyiid (Total: Rp 47.031)',
  '2026-10-26T00:11:28.125Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_zyv1gmc',
  'admin_authorized',
  'ADMIN',
  'Updated',
  'Updated order ord_qamyiid status from WAITING_PAYMENT_VERIFICATION to PAYMENT_VERIFIED',
  '2026-10-26T00:11:28.123Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_o58o5xk',
  'customer',
  'CUSTOMER',
  'Updated',
  'Updated order ord_qamyiid status from WAITING_PAYMENT to WAITING_PAYMENT_VERIFICATION',
  '2026-10-26T00:11:28.122Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_snjihfi',
  'CUSTOMER',
  'CUSTOMER',
  'Created',
  'Created order TF-20261026-001 (ID: ord_qamyiid) Total: Rp 47,031 (UniqueCode: 31)',
  '2026-10-26T00:11:28.121Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_3ujeqtn',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created menu item Nasi Rawon',
  '2026-10-26T00:11:28.101Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ggc9s4v',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:11:28.101Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_hfzwcrn',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_e1ngdvh (Ahmad Concurrency 488100)',
  '2026-10-26T00:11:28.100Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_w3kxf7i',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Bakso Cak Ahmad 488100',
  '2026-10-26T00:11:28.099Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_fmxjfbk',
  'm_cj7cdvd',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:11:28.098Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_0vgvf0m',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Ahmad Concurrency 488100 (MERCHANT)',
  '2026-10-26T00:11:28.097Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_g3e7c5v',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_cu2ir5z (Siti Aminah)',
  '2026-10-26T00:11:28.089Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_d0wa5qe',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Warung Bu Siti 488078',
  '2026-10-26T00:11:28.088Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_7g584us',
  'm_gi822yx',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:11:28.088Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_deqy98r',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Siti Aminah (MERCHANT)',
  '2026-10-26T00:11:28.086Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_o1k83ua',
  'admin_authorized',
  'ADMIN',
  'Admin',
  'Admin admin_authorized memverifikasi pembayaran LUNAS & menerbitkan receipt #TG-RCP-B8UQT7M untuk pesanan #ord_b8uqt7m (Total: Rp 47.034)',
  '2026-10-26T00:10:57.685Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_qxdpk01',
  'admin_authorized',
  'ADMIN',
  'Updated',
  'Updated order ord_b8uqt7m status from WAITING_PAYMENT_VERIFICATION to PAYMENT_VERIFIED',
  '2026-10-26T00:10:57.683Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_edmgnab',
  'customer',
  'CUSTOMER',
  'Updated',
  'Updated order ord_b8uqt7m status from WAITING_PAYMENT to WAITING_PAYMENT_VERIFICATION',
  '2026-10-26T00:10:57.681Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_75ufqff',
  'CUSTOMER',
  'CUSTOMER',
  'Created',
  'Created order TF-20261026-001 (ID: ord_b8uqt7m) Total: Rp 47,034 (UniqueCode: 34)',
  '2026-10-26T00:10:57.680Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_0xyjdnd',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created menu item Nasi Rawon',
  '2026-10-26T00:10:57.656Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_k3r2hof',
  'm_cloud_persisted',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:10:57.655Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_4uwmevq',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_w13nyy1 (Ahmad Concurrency 457651)',
  '2026-10-26T00:10:57.653Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_566xkmy',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Bakso Cak Ahmad 457651',
  '2026-10-26T00:10:57.652Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_qbqw3l5',
  'm_wqm0bnv',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:10:57.652Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_ljv1cv4',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Ahmad Concurrency 457651 (MERCHANT)',
  '2026-10-26T00:10:57.650Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_77aowlb',
  'admin_1',
  'ADMIN',
  'Approved',
  'Approved partner registration reg_lmn3dif (Siti Aminah)',
  '2026-10-26T00:10:57.640Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_xi2jvhb',
  'admin_1',
  'ADMIN',
  'Created',
  'Created merchant Warung Bu Siti 457629',
  '2026-10-26T00:10:57.639Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_pv9bfcv',
  'm_o0d0610',
  'MERCHANT',
  'Created',
  'Created category Menu Utama',
  '2026-10-26T00:10:57.639Z'
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  'log_pew9bnf',
  'CUSTOMER',
  'CUSTOMER',
  'Submitted',
  'Submitted partner registration for Siti Aminah (MERCHANT)',
  '2026-10-26T00:10:57.637Z'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =============================================================================
-- TUMPANGGO PRODUCTION DATABASE SCHEMA FOR SUPABASE (POSTGRESQL 15+)
-- Package: TumpangGo Super App Lokal Kecamatan Tumpang Malang
-- Purpose: Seamless migration from Cloud Firestore to Supabase Free Tier ($0/mo)
-- Features: Strict Constraints, Foreign Keys, Indexes, JSONB snapshots, and RLS
-- =============================================================================

-- Enable UUID and cryptographic extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean schema teardown (safe for re-runs in development)
-- DROP TABLE IF EXISTS audit_logs CASCADE;
-- DROP TABLE IF EXISTS testimonials CASCADE;
-- DROP TABLE IF EXISTS partner_registrations CASCADE;
-- DROP TABLE IF EXISTS settlements CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS menu_items CASCADE;
-- DROP TABLE IF EXISTS categories CASCADE;
-- DROP TABLE IF EXISTS drivers CASCADE;
-- DROP TABLE IF EXISTS merchants CASCADE;
-- DROP TABLE IF EXISTS system_config CASCADE;
-- DROP TABLE IF EXISTS rate_limits CASCADE;

-- -----------------------------------------------------------------------------
-- 1. SYSTEM CONFIGURATION (Singleton document)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_config (
  id TEXT PRIMARY KEY DEFAULT 'config_1',
  service_fee INTEGER NOT NULL DEFAULT 2000,
  delivery_fee_per_km INTEGER NOT NULL DEFAULT 2000,
  default_delivery_fee INTEGER NOT NULL DEFAULT 5000,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  assignment_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK (assignment_mode IN ('AUTOMATIC', 'MANUAL')),
  qris_image TEXT NOT NULL DEFAULT '/qris-merchant.png',
  system_open BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initial default singleton config
INSERT INTO system_config (id, service_fee, default_delivery_fee, commission_percent, assignment_mode, qris_image, system_open)
VALUES ('config_1', 2000, 5000, 10.00, 'MANUAL', '/qris-merchant.png', true)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. MERCHANTS (Mitra Toko & Dapur Kuliner)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL DEFAULT -7.9942,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 112.7667,
  open_time TEXT NOT NULL DEFAULT '08:00',
  close_time TEXT NOT NULL DEFAULT '21:00',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  bank_holder TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  cook_time_estimate TEXT NOT NULL DEFAULT '15-30 min',
  image TEXT NOT NULL DEFAULT '',
  business_photo TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Nasi & Lauk',
  qris_image TEXT NOT NULL DEFAULT '',
  qris_updated_at TIMESTAMPTZ,
  is_activated BOOLEAN NOT NULL DEFAULT false,
  pre_order_only BOOLEAN NOT NULL DEFAULT false,
  pre_order_min_amount INTEGER NOT NULL DEFAULT 0,
  pre_order_lead_days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_active ON merchants (active);
CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_merchants_category ON merchants (category);

-- -----------------------------------------------------------------------------
-- 3. CATEGORIES (Kategori Menu per Toko)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_merchant ON categories (merchant_id, order_index);

-- -----------------------------------------------------------------------------
-- 4. MENU ITEMS (Produk Kuliner)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  available BOOLEAN NOT NULL DEFAULT true,
  image TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_merchant ON menu_items (merchant_id, available);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (category_id);

-- -----------------------------------------------------------------------------
-- 5. DRIVERS (Mitra Kurir Pengantaran)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  online BOOLEAN NOT NULL DEFAULT false,
  latitude DOUBLE PRECISION NOT NULL DEFAULT -7.9942,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 112.7667,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (active, online);
CREATE INDEX IF NOT EXISTS idx_drivers_email ON drivers (LOWER(email));

-- -----------------------------------------------------------------------------
-- 6. ORDERS (Pesanan & Transaksi)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  unique_code INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'WAITING_PAYMENT',
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  merchant_name TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_details TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL DEFAULT -7.9942,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 112.7667,
  subtotal INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 5000,
  service_fee INTEGER NOT NULL DEFAULT 2000,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  payment_method TEXT NOT NULL DEFAULT 'MERCHANT_QRIS',
  payment_proof TEXT NOT NULL DEFAULT '',
  payment_proof_uploaded_at TIMESTAMPTZ,
  payment_rejection_reason TEXT NOT NULL DEFAULT '',
  payment_verified_by TEXT NOT NULL DEFAULT '',
  payment_verified_at TIMESTAMPTZ,
  delivery_proof TEXT NOT NULL DEFAULT '',
  is_settled BOOLEAN NOT NULL DEFAULT false,
  pre_order_date TEXT NOT NULL DEFAULT '',
  payment_expires_at TIMESTAMPTZ,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_merchant_created ON orders (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);

-- -----------------------------------------------------------------------------
-- 7. SETTLEMENTS (Pencairan Saldo & Komisi Mitra)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  merchant_name TEXT NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0,
  total_commission INTEGER NOT NULL DEFAULT 0,
  amount_to_pay INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'WAITING_CONFIRMATION',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  bank_holder TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_merchant ON settlements (merchant_id, status);

-- -----------------------------------------------------------------------------
-- 8. PARTNER REGISTRATIONS (Pendaftaran Mitra Baru)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_registrations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'MERCHANT' CHECK (type IN ('MERCHANT', 'DRIVER')),
  name TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_reg_status ON partner_registrations (status, type);

-- -----------------------------------------------------------------------------
-- 9. TESTIMONIALS (Ulasan Komunitas & Pengguna)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  merchant_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'pelanggan' CHECK (category IN ('merchant', 'pelanggan')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  role_detail TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  consent_approved BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'rejected', 'draft')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_pub ON testimonials (status, display_order);

-- -----------------------------------------------------------------------------
-- 10. AUDIT LOGS (Catatan Aktivitas Sistem)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SYSTEM',
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

-- -----------------------------------------------------------------------------
-- 11. RATE LIMITS (Pencegah Brute-force & Abuse)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits (reset_at);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES & ACCESS CONTROL
-- -----------------------------------------------------------------------------
-- Enable RLS on all 11 tables unconditionally
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- A. SERVICE ROLE POLICIES (Full unrestricted access for Backend Express Server)
-- Uses DROP POLICY IF EXISTS to allow idempotent re-execution without duplicate errors.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS service_role_full_access_config ON system_config;
CREATE POLICY service_role_full_access_config ON system_config FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_merchants ON merchants;
CREATE POLICY service_role_full_access_merchants ON merchants FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_categories ON categories;
CREATE POLICY service_role_full_access_categories ON categories FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_menu ON menu_items;
CREATE POLICY service_role_full_access_menu ON menu_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_drivers ON drivers;
CREATE POLICY service_role_full_access_drivers ON drivers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_orders ON orders;
CREATE POLICY service_role_full_access_orders ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_settlements ON settlements;
CREATE POLICY service_role_full_access_settlements ON settlements FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_partner ON partner_registrations;
CREATE POLICY service_role_full_access_partner ON partner_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_testi ON testimonials;
CREATE POLICY service_role_full_access_testi ON testimonials FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_audit ON audit_logs;
CREATE POLICY service_role_full_access_audit ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_full_access_limits ON rate_limits;
CREATE POLICY service_role_full_access_limits ON rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- B. STRICT ISOLATION FOR PRIVATE & SENSITIVE TABLES
-- Ensure NO public/anon policies exist on sensitive operational tables:
-- orders, drivers, settlements, partner_registrations, audit_logs, rate_limits.
-- All queries to these tables MUST be mediated by authenticated backend API endpoints.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_orders ON orders;
DROP POLICY IF EXISTS anon_write_orders ON orders;
DROP POLICY IF EXISTS anon_read_drivers ON drivers;
DROP POLICY IF EXISTS anon_read_settlements ON settlements;
DROP POLICY IF EXISTS anon_read_partner ON partner_registrations;
DROP POLICY IF EXISTS anon_write_partner ON partner_registrations;
DROP POLICY IF EXISTS anon_read_audit ON audit_logs;
DROP POLICY IF EXISTS anon_read_limits ON rate_limits;

-- -----------------------------------------------------------------------------
-- C. PUBLIC READ POLICIES & VIEWS (Granular, Safe, and Leak-Free)
-- -----------------------------------------------------------------------------

-- 1. SYSTEM CONFIGURATION:
-- Restrict direct anon access so internal settings (commission_percent, assignment_mode)
-- are not exposed to unauthenticated users.
REVOKE ALL ON system_config FROM anon, authenticated;
GRANT SELECT (id, service_fee, delivery_fee_per_km, default_delivery_fee, qris_image, system_open, updated_at) 
  ON system_config TO anon, authenticated;

DROP POLICY IF EXISTS anon_read_system_config ON system_config;
CREATE POLICY anon_read_system_config ON system_config 
  FOR SELECT TO anon 
  USING (true);

-- Dedicated safe public view for system config
CREATE OR REPLACE VIEW public_system_config AS
SELECT 
  id,
  service_fee,
  delivery_fee_per_km,
  default_delivery_fee,
  qris_image,
  system_open,
  updated_at
FROM system_config;

GRANT SELECT ON public_system_config TO anon, authenticated;

-- 2. MERCHANTS:
-- Restrict direct anon access: hide password_hash, bank_name, bank_account, bank_holder.
REVOKE ALL ON merchants FROM anon;
GRANT SELECT (
  id, name, owner_name, address, latitude, longitude, open_time, close_time,
  active, rating, cook_time_estimate, image, business_photo, description,
  category, qris_image, is_activated, pre_order_only, pre_order_min_amount,
  pre_order_lead_days, created_at, updated_at
) ON merchants TO anon;

DROP POLICY IF EXISTS anon_read_active_merchants ON merchants;
CREATE POLICY anon_read_active_merchants ON merchants 
  FOR SELECT TO anon 
  USING (active = true);

-- Dedicated safe public view for active merchants
CREATE OR REPLACE VIEW public_merchants AS
SELECT 
  id, name, owner_name, address, latitude, longitude, open_time, close_time,
  active, rating, cook_time_estimate, image, business_photo, description,
  category, qris_image, is_activated, pre_order_only, pre_order_min_amount,
  pre_order_lead_days, created_at, updated_at
FROM merchants
WHERE active = true;

GRANT SELECT ON public_merchants TO anon, authenticated;

-- 3. CATEGORIES:
-- Only expose categories that belong to active merchants (prevents leaking inactive/suspended stores).
DROP POLICY IF EXISTS anon_read_categories ON categories;
CREATE POLICY anon_read_categories ON categories 
  FOR SELECT TO anon 
  USING (
    EXISTS (
      SELECT 1 FROM merchants 
      WHERE merchants.id = categories.merchant_id 
        AND merchants.active = true
    )
  );

-- 4. MENU ITEMS:
-- Only expose items that are available AND belong to an active merchant.
DROP POLICY IF EXISTS anon_read_menu_items ON menu_items;
CREATE POLICY anon_read_menu_items ON menu_items 
  FOR SELECT TO anon 
  USING (
    available = true 
    AND EXISTS (
      SELECT 1 FROM merchants 
      WHERE merchants.id = menu_items.merchant_id 
        AND merchants.active = true
    )
  );

-- 5. TESTIMONIALS:
-- Only expose published testimonials with consent approved.
DROP POLICY IF EXISTS anon_read_published_testimonials ON testimonials;
CREATE POLICY anon_read_published_testimonials ON testimonials 
  FOR SELECT TO anon 
  USING (status = 'published' AND consent_approved = true);

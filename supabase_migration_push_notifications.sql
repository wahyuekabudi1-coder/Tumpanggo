-- =============================================================================
-- MIGRASI SQL NON-DESTRUKTIF: PUSH NOTIFICATION TUMPANGGO MERCHANT (PRODUKSI)
-- Target Database : Supabase PostgreSQL (Proyek TumpangGo)
-- Sifat Migrasi   : Idempoten & Non-Destruktif (Tidak menghapus tabel/data lama)
-- =============================================================================
-- Urutan Penerapan:
-- 1. Buka Supabase Dashboard -> SQL Editor.
-- 2. Tempel seluruh isi file ini dan klik "Run".
-- 3. Pastikan SUPABASE_SERVICE_ROLE_KEY dan FIREBASE_SERVICE_ACCOUNT_KEY sudah
--    disetel di Vercel Environment Variables, lalu redeploy backend Vercel.
-- =============================================================================

BEGIN;

-- 1. Pastikan tabel push_subscriptions tersedia (atau tambahkan kolom baru jika tabel lama sudah ada)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('MERCHANT', 'DRIVER', 'CUSTOMER')),
  entity_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'WEB_PUSH' CHECK (type IN ('WEB_PUSH', 'FCM')),
  fcm_token TEXT,
  subscription JSONB,
  device_info TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '1.0.0',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade aman apabila tabel push_subscriptions dibuat oleh versi skema terdahulu
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'WEB_PUSH';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS subscription JSONB;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS device_info TEXT NOT NULL DEFAULT '';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS app_version TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_push_subs_entity ON push_subscriptions (role, entity_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_fcm_token ON push_subscriptions (fcm_token);

-- Kunci RLS: Hanya backend server (service_role) yang boleh membaca/menulis token perangkat
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_subscriptions FROM anon, authenticated;
DROP POLICY IF EXISTS anon_read_push_subs ON push_subscriptions;
DROP POLICY IF EXISTS service_role_full_access_push_subs ON push_subscriptions;
CREATE POLICY service_role_full_access_push_subs ON push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Buat tabel Outbox & Deduplikasi Event Push Notification (push_notification_events)
CREATE TABLE IF NOT EXISTS push_notification_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'NEW_ORDER',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN (
      'PENDING',
      'SENT',
      'RETRYING',
      'FAILED_NO_SUBSCRIBERS',
      'FAILED_PERMANENT',
      'PARTIAL',
      'FAILED',
      'SKIPPED_NO_SUBS'
    )
  ),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_fcm INTEGER NOT NULL DEFAULT 0,
  sent_web_push INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Perbarui constraint status secara aman jika tabel sudah pernah dibuat sebelumnya
ALTER TABLE push_notification_events DROP CONSTRAINT IF EXISTS push_notification_events_status_check;
ALTER TABLE push_notification_events ADD CONSTRAINT push_notification_events_status_check
  CHECK (
    status IN (
      'PENDING',
      'SENT',
      'RETRYING',
      'FAILED_NO_SUBSCRIBERS',
      'FAILED_PERMANENT',
      'PARTIAL',
      'FAILED',
      'SKIPPED_NO_SUBS'
    )
  );

CREATE INDEX IF NOT EXISTS idx_push_events_merchant_status ON push_notification_events (merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_push_events_order ON push_notification_events (order_id);

-- Kunci RLS: Hanya backend server (service_role) yang boleh mengakses outbox push
ALTER TABLE push_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_notification_events FROM anon, authenticated;
DROP POLICY IF EXISTS anon_read_push_events ON push_notification_events;
DROP POLICY IF EXISTS service_role_full_access_push_events ON push_notification_events;
CREATE POLICY service_role_full_access_push_events ON push_notification_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

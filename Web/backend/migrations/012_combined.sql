-- Migration 012: Compliance Sprint A+B
-- NĐ 13/2023 (PDPD), NĐ 72/2020 (DQTV fields), TT 13/2013 (audit),
-- Luật DQTV 2019 Điều 26-30 (training), TCVN 11930:2017 (password policy)

-- 1. Password history (TCVN 11930:2017 — last 5 hashes, bcrypt cost=6)
CREATE TABLE IF NOT EXISTS user_password_history (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pw_history_user ON user_password_history(user_id, created_at DESC);

-- 2. CCCD encryption columns on militia_profiles (NĐ 13/2023 Điều 9)
--    cccd_lookup_hash: HMAC-SHA256 for lookup (UNIQUE, indexed)
--    cccd_encrypted:   AES-256-GCM ciphertext (base64)
--    cccd plaintext column kept for data migration; drop after migrating
ALTER TABLE militia_profiles
  ADD COLUMN IF NOT EXISTS cccd_lookup_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS cccd_encrypted   TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_militia_cccd_lookup
  ON militia_profiles(cccd_lookup_hash)
  WHERE cccd_lookup_hash IS NOT NULL;

-- 3. NĐ 72/2020 Điều 15-18 required registration fields
ALTER TABLE militia_profiles
  ADD COLUMN IF NOT EXISTS occupation               VARCHAR(200),
  ADD COLUMN IF NOT EXISTS education_level          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS health_status            VARCHAR(20)
    CHECK (health_status IS NULL OR health_status IN ('good', 'average', 'poor')),
  ADD COLUMN IF NOT EXISTS blood_type               VARCHAR(5),
  ADD COLUMN IF NOT EXISTS permanent_address        TEXT,
  ADD COLUMN IF NOT EXISTS judicial_clearance_status VARCHAR(20) DEFAULT 'clear'
    CHECK (judicial_clearance_status IN ('clear', 'pending', 'flagged')),
  ADD COLUMN IF NOT EXISTS initial_enlistment_date  DATE;

-- 4. GPS retention index (NĐ 13/2023 — giảm thiểu dữ liệu, auto-delete >90 ngày)
CREATE INDEX IF NOT EXISTS idx_gps_captured_at ON gps_points(captured_at);

-- 5. Training records (Luật DQTV 2019 Điều 26-30, NĐ 72/2020 Điều 21-25)
--    DQTV nòng cốt: 15-20 ngày huấn luyện/năm
CREATE TABLE IF NOT EXISTS training_records (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    militia_id     UUID         NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE,
    training_type  VARCHAR(50)  NOT NULL
      CHECK (training_type IN ('military', 'political', 'fire', 'first_aid', 'other')),
    from_date      DATE         NOT NULL,
    to_date        DATE         NOT NULL,
    total_days     DECIMAL(5,1) NOT NULL,
    location       VARCHAR(200),
    instructor     VARCHAR(200),
    result         VARCHAR(20)  NOT NULL DEFAULT 'pass'
      CHECK (result IN ('pass', 'fail', 'not_evaluated')),
    certificate_no VARCHAR(50),
    notes          TEXT,
    created_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_training_militia  ON training_records(militia_id);
CREATE INDEX IF NOT EXISTS idx_training_year     ON training_records(militia_id, from_date);
CREATE INDEX IF NOT EXISTS idx_training_type     ON training_records(training_type);

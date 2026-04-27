-- Migration 014: Sprint B/C additions — payroll enhancements, rewards, official documents
-- NĐ 72/2020 Điều 41-52: payroll_rules table
-- NĐ 85/2016: session_timeout_minutes system setting
-- NĐ 30/2020: official_documents table

-- ── payroll_rules ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_rules (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code       VARCHAR(50)   UNIQUE NOT NULL,
  rule_name       VARCHAR(200)  NOT NULL,
  formula         VARCHAR(50)   CHECK (formula IN ('daily_rate', 'flat', 'percentage')),
  multiplier      NUMERIC(5,3),
  applies_to      VARCHAR(50)   DEFAULT 'all',
  effective_from  DATE          NOT NULL,
  effective_to    DATE,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── system_settings keys (NĐ 72/2020 + NĐ 85/2016) ───────────────────────────

INSERT INTO system_settings(key, value, description) VALUES
  ('min_wage_region_1',              '4960000', 'Lương tối thiểu vùng I (VNĐ/tháng) — NĐ 38/2022'),
  ('training_daily_allowance_rate',  '0.2',     'Hệ số phụ cấp huấn luyện/ngày — NĐ 72/2020 Điều 43'),
  ('session_timeout_minutes',        '30',      'Thời gian auto-logout khi không hoạt động — NĐ 85/2016'),
  ('password_min_length',            '8',       'Độ dài tối thiểu mật khẩu'),
  ('max_login_attempts',             '5',       'Số lần thử đăng nhập tối đa trước khi khóa'),
  ('gps_retention_days',             '90',      'Số ngày lưu trữ dữ liệu GPS — NĐ 72/2020 Điều 33')
ON CONFLICT (key) DO NOTHING;

-- ── payroll_items: is_manually_adjusted flag ──────────────────────────────────

ALTER TABLE payroll_items
  ADD COLUMN IF NOT EXISTS is_manually_adjusted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adjusted_score        NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS adjustment_note       TEXT,
  ADD COLUMN IF NOT EXISTS adjusted_by           UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ;

-- ── militia_rewards ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS militia_rewards (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  militia_id  UUID          NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE,
  reward_type VARCHAR(20)   NOT NULL CHECK (reward_type IN ('reward', 'discipline')),
  title       VARCHAR(200)  NOT NULL,
  description TEXT,
  issued_date DATE,
  issued_by   VARCHAR(200),
  created_at  TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rewards_militia ON militia_rewards(militia_id);

-- ── files: related entity tracking ───────────────────────────────────────────

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS related_id   UUID,
  ADD COLUMN IF NOT EXISTS related_type VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_files_related ON files(related_id, related_type);

-- ── official_documents (NĐ 30/2020) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS official_documents (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number          VARCHAR(50),
  doc_type            VARCHAR(50)   NOT NULL CHECK (doc_type IN
                        ('cong_van', 'quyet_dinh', 'thong_bao', 'bao_cao', 'bien_ban', 'other')),
  title               VARCHAR(500)  NOT NULL,
  issued_by           VARCHAR(200),
  issued_date         DATE,
  effective_date      DATE,
  expiry_date         DATE,
  status              VARCHAR(20)   DEFAULT 'active'
                        CHECK (status IN ('draft', 'active', 'expired', 'revoked')),
  subject             TEXT,
  file_id             UUID          REFERENCES files(id),
  related_militia_id  UUID          REFERENCES militia_profiles(id),
  related_unit_id     UUID          REFERENCES units(id),
  created_by          UUID          NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_official_docs_type   ON official_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_official_docs_status ON official_documents(status);

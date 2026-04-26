CREATE TABLE ca_dqtv_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dqtv_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ca_user_id, dqtv_user_id)
);
CREATE INDEX idx_ca_assignments_ca ON ca_dqtv_assignments(ca_user_id);
CREATE INDEX idx_ca_assignments_dqtv ON ca_dqtv_assignments(dqtv_user_id);

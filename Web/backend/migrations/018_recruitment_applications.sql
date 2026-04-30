-- Migration 018: Recruitment applications table
CREATE TABLE IF NOT EXISTS recruitment_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  age INTEGER CHECK (age IS NULL OR (age >= 16 AND age <= 65)),
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  id_number VARCHAR(20),
  district VARCHAR(100),
  apply_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'approved', 'rejected')),
  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recruitment_status ON recruitment_applications(status);
CREATE INDEX idx_recruitment_created_by ON recruitment_applications(created_by);
CREATE INDEX idx_recruitment_deleted ON recruitment_applications(deleted_at)
  WHERE deleted_at IS NOT NULL;

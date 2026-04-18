-- Migration 010: PoliceApp — Work Reports
-- Created: 2026-03-10

-- Bảng work_reports (DQTV gửi báo cáo công việc)
CREATE TABLE IF NOT EXISTS work_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(30) NOT NULL CHECK (report_type IN ('daily', 'incident', 'monthly')),
    content TEXT NOT NULL,
    location VARCHAR(255),
    images JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_reports_user ON work_reports(user_id);
CREATE INDEX idx_work_reports_type ON work_reports(report_type);
CREATE INDEX idx_work_reports_status ON work_reports(status);
CREATE INDEX idx_work_reports_created ON work_reports(created_at);

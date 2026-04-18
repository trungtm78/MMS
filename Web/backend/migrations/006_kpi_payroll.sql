-- Migration 006: KPI and Payroll Tables
-- Created: 2026-03-04

-- KPI periods table
CREATE TABLE IF NOT EXISTS kpi_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    rule_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (year, month)
);

-- KPI scores table
CREATE TABLE IF NOT EXISTS kpi_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES kpi_periods(id) ON DELETE CASCADE,
    militia_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE,
    attendance_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    task_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    discipline_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    attitude_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    supervisor_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    total_score DECIMAL(5, 2) NOT NULL DEFAULT 0,
    rank INTEGER,
    rank_in_unit INTEGER,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (period_id, militia_id)
);

-- KPI criteria table (reference data)
CREATE TABLE IF NOT EXISTS kpi_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('attendance', 'task', 'discipline', 'attitude', 'supervisor')),
    max_score DECIMAL(5, 2) NOT NULL DEFAULT 100,
    weight DECIMAL(3, 2) NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Payroll periods table
CREATE TABLE IF NOT EXISTS payroll_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'approved', 'paid')),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (year, month)
);

-- Payroll items table
CREATE TABLE IF NOT EXISTS payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    militia_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE,
    base_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
    attendance_allowance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    task_bonus DECIMAL(12, 2) NOT NULL DEFAULT 0,
    kpi_bonus DECIMAL(12, 2) NOT NULL DEFAULT 0,
    other_allowance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    deduction DECIMAL(12, 2) NOT NULL DEFAULT 0,
    net_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (payroll_period_id, militia_id)
);

-- Indexes
CREATE INDEX idx_kpi_periods_year_month ON kpi_periods(year, month);
CREATE INDEX idx_kpi_periods_status ON kpi_periods(status);
CREATE INDEX idx_kpi_scores_period ON kpi_scores(period_id);
CREATE INDEX idx_kpi_scores_militia ON kpi_scores(militia_id);
CREATE INDEX idx_kpi_scores_total ON kpi_scores(total_score DESC);
CREATE INDEX idx_kpi_criteria_category ON kpi_criteria(category);
CREATE INDEX idx_payroll_periods_year_month ON payroll_periods(year, month);
CREATE INDEX idx_payroll_periods_status ON payroll_periods(status);
CREATE INDEX idx_payroll_items_period ON payroll_items(payroll_period_id);
CREATE INDEX idx_payroll_items_militia ON payroll_items(militia_id);

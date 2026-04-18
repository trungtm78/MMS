-- Migration 004: Attendance and GPS Tables
-- Created: 2026-03-04

-- Attendance records table
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    militia_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    work_date DATE NOT NULL,
    checkin_at TIMESTAMP WITH TIME ZONE,
    checkin_lat DECIMAL(10, 8),
    checkin_lng DECIMAL(11, 8),
    checkin_accuracy DECIMAL(8, 2),
    checkin_location_name TEXT,
    checkout_at TIMESTAMP WITH TIME ZONE,
    checkout_lat DECIMAL(10, 8),
    checkout_lng DECIMAL(11, 8),
    checkout_accuracy DECIMAL(8, 2),
    checkout_location_name TEXT,
    source VARCHAR(20) NOT NULL DEFAULT 'mobile' CHECK (source IN ('mobile', 'web', 'manual')),
    status VARCHAR(20) NOT NULL DEFAULT 'checked_in' CHECK (status IN ('checked_in', 'checked_out', 'late', 'early_leave', 'absent')),
    work_hours DECIMAL(5, 2),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (militia_id, work_date)
);

-- GPS points table (tracking history)
CREATE TABLE IF NOT EXISTS gps_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    militia_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 2),
    altitude DECIMAL(8, 2),
    speed DECIMAL(8, 2),
    battery INTEGER CHECK (battery >= 0 AND battery <= 100),
    signal_strength INTEGER,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    source VARCHAR(20) NOT NULL DEFAULT 'mobile'
);

-- GPS latest table (current position)
CREATE TABLE IF NOT EXISTS gps_latest (
    militia_id UUID PRIMARY KEY REFERENCES militia_profiles(id) ON DELETE CASCADE,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 2),
    altitude DECIMAL(8, 2),
    speed DECIMAL(8, 2),
    battery INTEGER CHECK (battery >= 0 AND battery <= 100),
    signal_strength INTEGER,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'unknown'))
);

-- Indexes
CREATE INDEX idx_attendance_militia ON attendance_records(militia_id);
CREATE INDEX idx_attendance_date ON attendance_records(work_date);
CREATE INDEX idx_attendance_task ON attendance_records(task_id);
CREATE INDEX idx_attendance_status ON attendance_records(status);
CREATE INDEX idx_gps_points_militia ON gps_points(militia_id);
CREATE INDEX idx_gps_points_captured ON gps_points(captured_at);
CREATE INDEX idx_gps_latest_status ON gps_latest(status);
CREATE INDEX idx_gps_latest_seen ON gps_latest(last_seen_at);

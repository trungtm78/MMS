-- Migration 002: Personnel Tables
-- Created: 2026-03-04

-- Militia profiles table (Dân quân tự vệ)
CREATE TABLE IF NOT EXISTS militia_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    militia_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    cccd VARCHAR(12) UNIQUE NOT NULL,
    dob DATE NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    phone VARCHAR(20),
    address TEXT,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    position VARCHAR(100),
    rank VARCHAR(50),
    join_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred', 'retired')),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Police profiles table
CREATE TABLE IF NOT EXISTS police_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_no VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    cccd VARCHAR(12) UNIQUE NOT NULL,
    dob DATE NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    phone VARCHAR(20),
    address TEXT,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    position VARCHAR(100),
    rank VARCHAR(50) NOT NULL,
    appointment_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred', 'retired')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_militia_profiles_user ON militia_profiles(user_id);
CREATE INDEX idx_militia_profiles_code ON militia_profiles(militia_code);
CREATE INDEX idx_militia_profiles_unit ON militia_profiles(unit_id);
CREATE INDEX idx_militia_profiles_status ON militia_profiles(status);
CREATE INDEX idx_police_profiles_user ON police_profiles(user_id);
CREATE INDEX idx_police_profiles_badge ON police_profiles(badge_no);
CREATE INDEX idx_police_profiles_unit ON police_profiles(unit_id);
CREATE INDEX idx_police_profiles_status ON police_profiles(status);

-- Migration 003: Task Operations Tables
-- Created: 2026-03-04

-- Files table (for attachments and evidence)
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_key VARCHAR(500) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    checksum VARCHAR(64),
    category VARCHAR(50) DEFAULT 'general',
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('patrol', 'guard', 'inspection', 'support', 'training', 'admin', 'other')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue')),
    deadline TIMESTAMP WITH TIME ZONE,
    location_name TEXT,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Task assignments table
CREATE TABLE IF NOT EXISTS task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'rejected', 'in_progress', 'completed')),
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    note TEXT,
    UNIQUE (task_id, assignee_id)
);

-- Task updates table (progress tracking)
CREATE TABLE IF NOT EXISTS task_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_assignment_id UUID NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    status VARCHAR(50),
    note TEXT,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Task evidences table
CREATE TABLE IF NOT EXISTS task_evidences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_update_id UUID NOT NULL REFERENCES task_updates(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    evidence_type VARCHAR(50) NOT NULL CHECK (evidence_type IN ('photo', 'video', 'document', 'audio', 'other')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_tasks_code ON tasks(code);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_tasks_unit ON tasks(unit_id);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX idx_task_assignments_assignee ON task_assignments(assignee_id);
CREATE INDEX idx_task_assignments_status ON task_assignments(status);
CREATE INDEX idx_task_updates_assignment ON task_updates(task_assignment_id);
CREATE INDEX idx_task_updates_updated_by ON task_updates(updated_by);
CREATE INDEX idx_task_evidences_update ON task_evidences(task_update_id);
CREATE INDEX idx_task_evidences_file ON task_evidences(file_id);

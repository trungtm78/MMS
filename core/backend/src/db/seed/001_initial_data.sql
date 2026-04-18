-- Seed Data (Fixed UUIDs)
-- Created: 2026-03-04

-- Insert Roles (không cần id vì auto gen UUID)
INSERT INTO roles (code, name, description) VALUES
    ('system_admin', 'Quản trị hệ thống', 'Toàn quyền quản lý hệ thống'),
    ('ubnd_leader', 'Lãnh đạo UBND', 'Giám sát dashboards và báo cáo'),
    ('police_ward', 'Công an phường', 'Quản lý cấp phường'),
    ('police_area', 'Công an khu vực', 'Quản lý cấp khu vực'),
    ('office_staff', 'Nhân viên văn phòng', 'Quản lý chấm công, lương'),
    ('militia', 'Dân quân tự vệ', 'Ngườ dùng DQTV'),
    ('auditor', 'Kiểm toán viên', 'Kiểm tra tuân thủ')
ON CONFLICT (code) DO NOTHING;

-- Insert Permissions
INSERT INTO permissions (code, name, description, module) VALUES
    ('users:read', 'Xem danh sách ngườ dùng', 'Xem thông tin ngườ dùng', 'users'),
    ('users:create', 'Tạo ngườ dùng', 'Tạo ngườ dùng mới', 'users'),
    ('tasks:read', 'Xem nhiệm vụ', 'Xem danh sách nhiệm vụ', 'tasks'),
    ('tasks:create', 'Tạo nhiệm vụ', 'Tạo nhiệm vụ mới', 'tasks'),
    ('attendance:read', 'Xem chấm công', 'Xem dữ liệu chấm công', 'attendance'),
    ('attendance:checkin', 'Điểm danh', 'Điểm danh vào/ra', 'attendance'),
    ('leave:read', 'Xem đơn nghỉ', 'Xem đơn xin nghỉ', 'leave'),
    ('leave:create', 'Tạo đơn nghỉ', 'Tạo đơn xin nghỉ', 'leave'),
    ('incidents:read', 'Xem sự cố', 'Xem danh sách sự cố', 'incidents'),
    ('incidents:create', 'Báo cáo sự cố', 'Báo cáo sự cố/SOS', 'incidents')
ON CONFLICT (code) DO NOTHING;

-- Assign all permissions to system_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'system_admin'
ON CONFLICT DO NOTHING;

-- Assign militia permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'militia'
AND p.code IN ('tasks:read', 'attendance:read', 'attendance:checkin', 'leave:read', 'leave:create', 'incidents:read', 'incidents:create')
ON CONFLICT DO NOTHING;

-- Insert Units
INSERT INTO units (code, name, type, address) VALUES
    ('PHU_DINH', 'Phường Phú Định', 'ward', 'Phường Phú Định, Quận 6, TP.HCM'),
    ('PHU_DINH_KP1', 'Khu phố 1 - Phú Định', 'area', 'Khu phố 1, Phường Phú Định')
ON CONFLICT (code) DO NOTHING;

-- Update unit parent
UPDATE units SET parent_id = (SELECT id FROM units WHERE code = 'PHU_DINH') WHERE code = 'PHU_DINH_KP1';

-- Insert Leave Types
INSERT INTO leave_types (code, name, description, max_days_per_year, requires_document, is_paid) VALUES
    ('PAID', 'Nghỉ phép có lương', 'Nghỉ phép hàng năm', 12, FALSE, TRUE),
    ('SICK', 'Nghỉ ốm', 'Nghỉ do bệnh tật', NULL, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Insert KPI Criteria
INSERT INTO kpi_criteria (code, name, category, max_score, weight, description) VALUES
    ('ATTENDANCE', 'Chấm công', 'attendance', 100, 0.25, 'Đánh giá dựa trên ngày công và giờ giấc'),
    ('TASK_COMPLETION', 'Hoàn thành nhiệm vụ', 'task', 100, 0.30, 'Đánh giá dựa trên số lượng và chất lượng nhiệm vụ')
ON CONFLICT (code) DO NOTHING;

-- Insert Test Users (password: 123456)
INSERT INTO users (username, password_hash, full_name, email, phone, status) VALUES
    ('admin', '$2a$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Quản trị viên', 'admin@mms.vn', '0900000001', 'active'),
    ('dqtv001', '$2a$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Nguyễn Văn An', 'dqtv001@mms.vn', '0909123456', 'active'),
    ('dqtv002', '$2a$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Trần Thị Bình', 'dqtv002@mms.vn', '0909123457', 'active'),
    ('dqtv003', '$2a$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Lê Văn Cường', 'dqtv003@mms.vn', '0909123458', 'active')
ON CONFLICT (username) DO NOTHING;

-- Assign Roles
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'admin' AND r.code = 'system_admin'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'dqtv001' AND r.code = 'militia'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'dqtv002' AND r.code = 'militia'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'dqtv003' AND r.code = 'militia'
ON CONFLICT DO NOTHING;

-- Insert Militia Profiles
INSERT INTO militia_profiles (user_id, militia_code, full_name, cccd, dob, gender, phone, address, unit_id, position, join_date, status, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
SELECT 
    u.id, 'HCM-PHD-T12-0001', 'Nguyễn Văn An', '079095001001', '1995-05-15', 'male', '0909123456', '123 Đường ABC, KP1', 
    (SELECT id FROM units WHERE code = 'PHU_DINH_KP1'), 'Dân quân thường trực', '2022-10-01', 'active', 'Nguyễn Thị Bích', '0916789012', 'Vợ'
FROM users u WHERE u.username = 'dqtv001'
ON CONFLICT (militia_code) DO NOTHING;

INSERT INTO militia_profiles (user_id, militia_code, full_name, cccd, dob, gender, phone, address, unit_id, position, join_date, status, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
SELECT 
    u.id, 'HCM-PHD-T12-0002', 'Trần Thị Bình', '079095001002', '1998-03-20', 'female', '0909123457', '456 Đường DEF, KP1',
    (SELECT id FROM units WHERE code = 'PHU_DINH_KP1'), 'Dân quân thường trực', '2023-01-15', 'active', 'Trần Văn Cường', '0916789013', 'Anh'
FROM users u WHERE u.username = 'dqtv002'
ON CONFLICT (militia_code) DO NOTHING;

INSERT INTO militia_profiles (user_id, militia_code, full_name, cccd, dob, gender, phone, address, unit_id, position, join_date, status, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
SELECT 
    u.id, 'HCM-PHD-T12-0003', 'Lê Văn Cường', '079095001003', '1997-08-10', 'male', '0909123458', '789 Đường GHI, KP2',
    (SELECT id FROM units WHERE code = 'PHU_DINH_KP1'), 'Dân quân thường trực', '2022-06-01', 'active', 'Lê Thị Dung', '0916789014', 'Vợ'
FROM users u WHERE u.username = 'dqtv003'
ON CONFLICT (militia_code) DO NOTHING;

-- Insert User Unit Scopes
INSERT INTO user_unit_scopes (user_id, unit_id, scope_type)
SELECT u.id, u2.id, 'own' FROM users u, units u2
WHERE u.username = 'dqtv001' AND u2.code = 'PHU_DINH_KP1'
ON CONFLICT DO NOTHING;

INSERT INTO user_unit_scopes (user_id, unit_id, scope_type)
SELECT u.id, u2.id, 'own' FROM users u, units u2
WHERE u.username = 'dqtv002' AND u2.code = 'PHU_DINH_KP1'
ON CONFLICT DO NOTHING;

INSERT INTO user_unit_scopes (user_id, unit_id, scope_type)
SELECT u.id, u2.id, 'own' FROM users u, units u2
WHERE u.username = 'dqtv003' AND u2.code = 'PHU_DINH_KP1'
ON CONFLICT DO NOTHING;

-- Seed Data: PoliceApp — CA user, permissions, police_profile
-- Created: 2026-03-10

-- ─── New Permissions for police_area ─────────────────────────────────────────
INSERT INTO permissions (code, name, description, module) VALUES
    ('militia:view', 'Xem danh sách DQTV', 'Xem hồ sơ và thông tin DQTV', 'users'),
    ('alerts:manage', 'Quản lý cảnh báo', 'Xem và xử lý cảnh báo hệ thống', 'alerts'),
    ('reports:team', 'Xem báo cáo đội', 'Xem báo cáo thống kê toàn đội', 'reports'),
    ('gps:view', 'Xem GPS đội', 'Theo dõi vị trí GPS của DQTV', 'gps'),
    ('leave:approve', 'Duyệt đơn nghỉ', 'Phê duyệt và từ chối đơn xin nghỉ phép', 'leave')
ON CONFLICT (code) DO NOTHING;

-- ─── Assign permissions to police_area role ───────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'police_area'
AND p.code IN (
    'tasks:read', 'tasks:create',
    'leave:read', 'leave:approve',
    'militia:view',
    'alerts:manage',
    'reports:team',
    'gps:view',
    'users:read'
)
ON CONFLICT DO NOTHING;

-- ─── Test user: ca001 (password: 123456) ──────────────────────────────────────
-- password hash = bcrypt('123456', 10) — same as dqtv001/admin
-- totp_secret set (mfa_enabled=false) to bypass MFA setup enforcement in dev/test
INSERT INTO users (username, password_hash, full_name, email, phone, status, mfa_enabled, totp_secret) VALUES
    ('ca001', '$2b$10$B/p2LlNh.0uxtiuoUXpageMzeiJaT8RwoceYflEuHzYtJht4/OWs2',
     'Võ Văn Tân', 'ca001@mms.vn', '0901234567', 'active', false, 'JBSWY3DPEHPK3PXP')
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    mfa_enabled   = EXCLUDED.mfa_enabled,
    totp_secret   = EXCLUDED.totp_secret;

-- ─── Assign role police_area to ca001 ────────────────────────────────────────
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'ca001' AND r.code = 'police_area'
ON CONFLICT DO NOTHING;

-- ─── Police profile for ca001 ────────────────────────────────────────────────
INSERT INTO police_profiles (user_id, badge_no, full_name, cccd, dob, gender, phone, unit_id, position, rank, appointment_date, status)
SELECT
    u.id,
    'CA-KV-001',
    'Trung úy Võ Văn Tân',
    '079095000001',
    '1990-01-15',
    'male',
    '0901234567',
    (SELECT id FROM units WHERE code = 'PHU_DINH'),
    'Công an khu vực',
    'Trung úy',
    '2020-06-01',
    'active'
FROM users u WHERE u.username = 'ca001'
ON CONFLICT (badge_no) DO NOTHING;

-- ─── Unit scope: ca001 quản lý toàn phường PHU_DINH ─────────────────────────
INSERT INTO user_unit_scopes (user_id, unit_id, scope_type)
SELECT u.id, un.id, 'subordinate' FROM users u, units un
WHERE u.username = 'ca001' AND un.code = 'PHU_DINH'
ON CONFLICT DO NOTHING;

INSERT INTO user_unit_scopes (user_id, unit_id, scope_type)
SELECT u.id, un.id, 'subordinate' FROM users u, units un
WHERE u.username = 'ca001' AND un.code = 'PHU_DINH_KP1'
ON CONFLICT DO NOTHING;

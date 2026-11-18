-- Migration 023: role catalogue
-- Every role code the backend authorizes against (ROLE_CODES in
-- src/common/constants/roles.ts). Only the development seeder used to insert roles,
-- so production databases could hold users whose role code matched no row and who
-- silently received no role at all. Idempotent: existing rows keep their names.
INSERT INTO roles (code, name, description) VALUES
  ('system_admin', 'Quản trị hệ thống',     'Toàn quyền quản trị hệ thống'),
  ('ubnd_leader',  'Lãnh đạo UBND',         'Lãnh đạo Ủy ban nhân dân phường'),
  ('police_ward',  'Công an phường',        'Chỉ huy Công an phường, phạm vi toàn phường'),
  ('police_area',  'Công an khu vực',       'Công an phụ trách một khu vực'),
  ('office_staff', 'Nhân viên văn phòng',   'Cán bộ văn phòng quản lý hồ sơ'),
  ('dqtv',         'Dân quân tự vệ',        'Chiến sĩ dân quân tự vệ'),
  ('ca_officer',   'Cán bộ công an',        'Cán bộ công an được phân công phụ trách DQTV'),
  ('ca_ward',      'Công an phường (CA)',   'Tài khoản CA cấp phường'),
  ('ca_area',      'Công an khu vực (CA)',  'Tài khoản CA cấp khu vực'),
  ('dqtv_member',  'Thành viên DQTV',       'Thành viên dân quân tự vệ')
ON CONFLICT (code) DO NOTHING;

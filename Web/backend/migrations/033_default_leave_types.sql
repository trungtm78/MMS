-- Migration 033: default leave types on a fresh install
-- Idempotent.
--
-- POST /leave needs a leave type from GET /leave/types, and no migration or seeder created
-- one, so a new installation could not file any leave without hand-written SQL. The kinds
-- of leave of the Labour Code 2019 and the Social Insurance Law 2014 are added here:
--   annual          12 days a year (Labour Code art. 113)
--   marriage         3 days, own marriage (art. 115.1)
--   child_marriage   1 day, marriage of a child (art. 115.1)
--   bereavement      3 days, death of a parent, spouse or child (art. 115.1)
--   sick             no yearly limit here; certified by a medical facility (Social Insurance Law)
--   maternity        no yearly limit here; certified by a medical facility (art. 139)
--   unpaid           no yearly limit, unpaid, agreed with the unit (art. 115.3)
-- A type with a yearly limit gets each member's balance for a year when they first use it
-- (LeaveService); a type without one draws only on a balance allocated to the member for
-- the year, and is unlimited when none was.
--
-- Leave types belong to the operator: an installation that already has any leave type keeps
-- its catalogue as it is and gets none of these. Codes are stable identifiers for clients.
INSERT INTO leave_types (code, name, description, max_days_per_year, requires_document, is_paid)
SELECT defaults.code, defaults.name, defaults.description, defaults.max_days_per_year,
       defaults.requires_document, defaults.is_paid
FROM (VALUES
  ('annual', 'Nghỉ phép năm', 'Nghỉ hằng năm hưởng nguyên lương', 12, FALSE, TRUE),
  ('marriage', 'Nghỉ kết hôn', 'Bản thân kết hôn', 3, FALSE, TRUE),
  ('child_marriage', 'Nghỉ con kết hôn', 'Con đẻ, con nuôi kết hôn', 1, FALSE, TRUE),
  ('bereavement', 'Nghỉ tang', 'Cha, mẹ, vợ hoặc chồng, con chết', 3, FALSE, TRUE),
  ('sick', 'Nghỉ ốm', 'Cần giấy chứng nhận của cơ sở khám bệnh, chữa bệnh', NULL, TRUE, TRUE),
  ('maternity', 'Nghỉ thai sản', 'Theo chế độ thai sản, cần giấy chứng nhận của cơ sở y tế', NULL, TRUE, TRUE),
  ('unpaid', 'Nghỉ không lương', 'Theo thỏa thuận với đơn vị', NULL, FALSE, FALSE)
) AS defaults (code, name, description, max_days_per_year, requires_document, is_paid)
WHERE NOT EXISTS (SELECT 1 FROM leave_types)
ON CONFLICT (code) DO NOTHING;

-- Migration 026: khen thưởng and kỷ luật decisions with khiếu nại (appeals), annual
-- training plans with their sessions and session attendance, and weapon inventory checks.
-- Idempotent.
--
-- Legal grounding for the coded values (mirrored in src/rewards/reward-codes.ts, and
-- src/database/coded-values.spec.ts keeps both in step):
--   * discipline forms: Luật Dân quân tự vệ 2019 Điều 48, Thông tư 75/2020/TT-BQP Điều 8
--   * a complaint does not suspend the decision: Thông tư 75/2020/TT-BQP Điều 6
--   * reward titles and forms: Thông tư 93/2024/TT-BQP (amended by 62/2025/TT-BQP)
--   * district-level administrations ended on 01/07/2025 (two-tier local government)

-- ── Pre-existing tables ─────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS keeps a pre-existing table whatever its shape, and the
-- backend would then fail at runtime or accept invalid data. As migration 019 does,
-- compare any table this migration would adopt with its declaration below, through the
-- catalogs:
--   * every column with its exact type, NOT NULL exactly where declared (a declared
--     nullable column that is NOT NULL breaks inserts that leave it out), a default
--     wherever one is declared, the generated column's expression, and no undeclared
--     NOT NULL column without a default;
--   * the primary key columns;
--   * each foreign key's referenced table, column and ON DELETE action (all RESTRICT:
--     these rows are records to keep);
--   * CHECK constraints by meaning: the exact set of values each coded column allows,
--     every other check by name as PostgreSQL prints its declaration, and no CHECK
--     constraint this migration does not declare;
--   * the unique constraints ON CONFLICT names.
-- Every difference is reported at once, so the tables can be reconciled in one pass.
-- Indexes, the training_records foreign key and the constraint triggers are compared
-- after they are created, at the end of this file.
DO $$
DECLARE
  -- column -> type as format_type() prints it; a trailing ! means NOT NULL, otherwise the
  -- column must accept NULL
  expected CONSTANT jsonb := '{
    "reward_decisions": {
      "id": "uuid!", "militia_id": "uuid!", "reward_form": "character varying(40)!",
      "issuing_authority": "character varying(40)!", "basis": "character varying(20)!",
      "criteria": "text", "decision_number": "character varying(50)", "issued_date": "date!",
      "created_by": "uuid!", "created_at": "timestamp with time zone!"},
    "discipline_decisions": {
      "id": "uuid!", "militia_id": "uuid!", "discipline_form": "character varying(20)!",
      "violation": "text!", "violation_date": "date", "decision_date": "date!",
      "decision_number": "character varying(50)", "issued_by": "character varying(200)",
      "status": "character varying(20)!", "created_by": "uuid!",
      "created_at": "timestamp with time zone!", "updated_at": "timestamp with time zone!"},
    "discipline_appeals": {
      "id": "uuid!", "decision_id": "uuid!", "round": "smallint!", "reason": "text!",
      "filed_date": "date!", "filed_by": "uuid!", "outcome": "character varying(20)",
      "resolution": "text", "decided_date": "date", "decided_by": "uuid",
      "created_at": "timestamp with time zone!", "decided_at": "timestamp with time zone"},
    "training_plans": {
      "id": "uuid!", "unit_id": "uuid", "year": "smallint!",
      "training_type": "character varying(50)!", "title": "character varying(200)",
      "required_days": "numeric(5,1)!", "status": "character varying(20)!", "created_by": "uuid!",
      "created_at": "timestamp with time zone!", "updated_at": "timestamp with time zone!",
      "activated_at": "timestamp with time zone", "completed_at": "timestamp with time zone"},
    "training_sessions": {
      "id": "uuid!", "plan_id": "uuid!", "name": "character varying(200)!", "start_date": "date!",
      "end_date": "date!", "location": "character varying(200)!", "days_count": "numeric(5,1)!",
      "created_by": "uuid!", "created_at": "timestamp with time zone!"},
    "training_session_attendance": {
      "session_id": "uuid!", "militia_id": "uuid!", "attended": "boolean!", "recorded_by": "uuid!",
      "recorded_at": "timestamp with time zone!"},
    "weapon_inventory_checks": {
      "id": "uuid!", "check_date": "date!", "performed_by": "uuid!", "expected_count": "integer!",
      "confirmed_count": "integer!", "discrepancy": "integer", "notes": "text",
      "created_at": "timestamp with time zone!"},
    "weapon_inventory_items": {
      "check_id": "uuid!", "weapon_id": "uuid!", "weapon_type": "character varying(100)!",
      "serial_number": "character varying(100)!", "condition": "character varying(20)!",
      "storage_location": "character varying(200)!", "holder_militia_id": "uuid",
      "found": "boolean", "observed_condition": "character varying(20)"}
  }';
  -- columns declared with a DEFAULT, which inserts that leave them out rely on
  with_default CONSTANT jsonb := '{
    "reward_decisions": ["id", "basis", "created_at"],
    "discipline_decisions": ["id", "status", "created_at", "updated_at"],
    "discipline_appeals": ["id", "created_at"],
    "training_plans": ["id", "status", "created_at", "updated_at"],
    "training_sessions": ["id", "created_at"],
    "training_session_attendance": ["recorded_at"],
    "weapon_inventory_checks": ["id", "check_date", "created_at"]
  }';
  -- generated column -> its expression as pg_get_expr() prints it
  generated CONSTANT jsonb := '{
    "weapon_inventory_checks": {"discrepancy": "(confirmed_count - expected_count)"}
  }';
  primary_keys CONSTANT jsonb := '{
    "reward_decisions": ["id"], "discipline_decisions": ["id"], "discipline_appeals": ["id"],
    "training_plans": ["id"], "training_sessions": ["id"],
    "training_session_attendance": ["militia_id", "session_id"],
    "weapon_inventory_checks": ["id"], "weapon_inventory_items": ["check_id", "weapon_id"]
  }';
  -- column -> [referenced table, referenced column, ON DELETE action]
  foreign_keys CONSTANT jsonb := '{
    "reward_decisions": {"militia_id": ["militia_profiles", "id", "RESTRICT"],
      "created_by": ["users", "id", "RESTRICT"]},
    "discipline_decisions": {"militia_id": ["militia_profiles", "id", "RESTRICT"],
      "created_by": ["users", "id", "RESTRICT"]},
    "discipline_appeals": {"decision_id": ["discipline_decisions", "id", "RESTRICT"],
      "filed_by": ["users", "id", "RESTRICT"], "decided_by": ["users", "id", "RESTRICT"]},
    "training_plans": {"unit_id": ["units", "id", "RESTRICT"],
      "created_by": ["users", "id", "RESTRICT"]},
    "training_sessions": {"plan_id": ["training_plans", "id", "RESTRICT"],
      "created_by": ["users", "id", "RESTRICT"]},
    "training_session_attendance": {"session_id": ["training_sessions", "id", "RESTRICT"],
      "militia_id": ["militia_profiles", "id", "RESTRICT"], "recorded_by": ["users", "id", "RESTRICT"]},
    "weapon_inventory_checks": {"performed_by": ["users", "id", "RESTRICT"]},
    "weapon_inventory_items": {"check_id": ["weapon_inventory_checks", "id", "RESTRICT"],
      "weapon_id": ["weapons", "id", "RESTRICT"],
      "holder_militia_id": ["militia_profiles", "id", "RESTRICT"]}
  }';
  -- coded column -> the exact set of values its CHECK (column IN (...)) allows
  allowed_values CONSTANT jsonb := '{
    "reward_decisions": {
      "reward_form": ["chien_si_thi_dua_toan_quoc", "chien_si_thi_dua_toan_quan",
        "chien_si_thi_dua_co_so", "chien_si_tien_tien", "huan_chuong", "huy_chuong",
        "danh_hieu_vinh_du_nha_nuoc", "giai_thuong_nha_nuoc", "ky_niem_chuong", "bang_khen",
        "giay_khen"],
      "issuing_authority": ["state", "prime_minister", "ministry_of_defence",
        "ministry_or_province", "military_region", "provincial_military_command", "district",
        "commune"],
      "basis": ["achievement", "ad_hoc", "thematic", "contribution"]},
    "discipline_decisions": {
      "discipline_form": ["khien_trach", "canh_cao", "giang_chuc", "cach_chuc", "tuoc_danh_hieu"],
      "status": ["active", "appealed", "overturned"]},
    "discipline_appeals": {"outcome": ["upheld", "overturned"]},
    "training_plans": {
      "training_type": ["military", "political", "fire", "first_aid", "other"],
      "status": ["draft", "active", "completed"]},
    "weapon_inventory_items": {
      "condition": ["good", "damaged", "maintenance"],
      "observed_condition": ["good", "damaged", "maintenance"]}
  }';
  -- The other CHECK constraints by name, as pg_get_constraintdef() prints the declarations
  -- below (read from PostgreSQL 16)
  checks CONSTANT jsonb := '{
    "reward_decisions": {
      "chk_reward_decisions_district_before_2025":
        "CHECK ((((issuing_authority)::text <> ''district''::text) OR (issued_date < ''2025-07-01''::date)))",
      "chk_reward_decisions_criteria_length":
        "CHECK (((criteria IS NULL) OR (length(criteria) <= 2000)))"},
    "discipline_decisions": {
      "chk_discipline_decisions_violation_before_decision":
        "CHECK (((violation_date IS NULL) OR (violation_date <= decision_date)))",
      "chk_discipline_decisions_violation_not_blank":
        "CHECK (((btrim(violation) <> ''''::text) AND (length(violation) <= 2000)))"},
    "discipline_appeals": {
      "chk_discipline_appeals_round": "CHECK (((round >= 1) AND (round <= 2)))",
      "chk_discipline_appeals_reason_not_blank":
        "CHECK (((btrim(reason) <> ''''::text) AND (length(reason) <= 2000)))",
      "chk_discipline_appeals_decided_together":
        "CHECK ((((outcome IS NULL) AND (resolution IS NULL) AND (decided_date IS NULL) AND (decided_by IS NULL) AND (decided_at IS NULL)) OR ((outcome IS NOT NULL) AND (resolution IS NOT NULL) AND (decided_date IS NOT NULL) AND (decided_by IS NOT NULL) AND (decided_at IS NOT NULL) AND (btrim(resolution) <> ''''::text) AND (length(resolution) <= 2000))))",
      "chk_discipline_appeals_decided_after_filed":
        "CHECK (((decided_date IS NULL) OR (decided_date >= filed_date)))"},
    "training_plans": {
      "chk_training_plans_year": "CHECK (((year >= 2000) AND (year <= 2100)))",
      "chk_training_plans_required_days":
        "CHECK (((required_days > (0)::numeric) AND (required_days <= (365)::numeric)))",
      "chk_training_plans_lifecycle":
        "CHECK (((((status)::text = ''draft''::text) AND (activated_at IS NULL) AND (completed_at IS NULL)) OR (((status)::text = ''active''::text) AND (activated_at IS NOT NULL) AND (completed_at IS NULL)) OR (((status)::text = ''completed''::text) AND (activated_at IS NOT NULL) AND (completed_at IS NOT NULL) AND (completed_at >= activated_at))))"},
    "training_sessions": {
      "chk_training_sessions_dates": "CHECK ((end_date >= start_date))",
      "chk_training_sessions_days_count":
        "CHECK (((days_count > (0)::numeric) AND (days_count <= (((end_date - start_date) + 1))::numeric)))",
      "chk_training_sessions_one_year":
        "CHECK ((EXTRACT(year FROM start_date) = EXTRACT(year FROM end_date)))"},
    "weapon_inventory_checks": {
      "chk_weapon_inventory_checks_expected_count": "CHECK ((expected_count >= 0))",
      "chk_weapon_inventory_checks_confirmed_count": "CHECK ((confirmed_count >= 0))",
      "chk_weapon_inventory_checks_notes_length":
        "CHECK (((notes IS NULL) OR (length(notes) <= 2000)))"},
    "weapon_inventory_items": {
      "chk_weapon_inventory_items_observed_only_when_found":
        "CHECK (((observed_condition IS NULL) OR (found IS TRUE)))"}
  }';
  -- Unique constraints the backend names in ON CONFLICT, as pg_get_constraintdef() prints them
  unique_constraints CONSTANT jsonb := '{
    "discipline_appeals": {"uq_discipline_appeals_round": "UNIQUE (decision_id, round)"},
    "training_plans": {
      "uq_training_plans_unit_year_type": "UNIQUE NULLS NOT DISTINCT (unit_id, year, training_type)"}
  }';
  -- CHECK (column IN (...)) on a varchar column, as pg_get_constraintdef() prints it, and
  -- one value of its list
  in_list CONSTANT text := '^CHECK \(\(\([^()]+\)::text = ANY \(\(ARRAY\[(.*)\]\)::text\[\]\)\)\)$';
  list_item CONSTANT text := '''((?:[^'']|'''')*)''::character varying';
  fix_hint CONSTANT text := 'reconcile them with this migration before applying it';
  problems text[] := '{}';
  tbl text;
  rel regclass;
  col text;
  spec text;
  target jsonb;
  con record;
  matched oid[];
  missing text;
  undeclared text;
  actual_type text;
  actual_not_null boolean;
  actual_has_default boolean;
  actual_definition text;
  found_oid oid;
  fk_found boolean;
  fk_others text;
  list text;
  declared_values text[];
  actual_values text[];
  exact_list_found boolean;
  other_lists text;
  actual_pk text[];
  expected_pk text[];
BEGIN
  FOR tbl IN SELECT jsonb_object_keys(expected) ORDER BY 1 LOOP
    rel := to_regclass(format('public.%I', tbl));
    CONTINUE WHEN rel IS NULL;

    -- Without every column the rest cannot be compared
    SELECT string_agg(e.key, ', ' ORDER BY e.key)
      INTO missing
    FROM jsonb_each_text(expected -> tbl) e
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = rel AND a.attname = e.key AND a.attnum > 0 AND NOT a.attisdropped
    );
    IF missing IS NOT NULL THEN
      problems := problems || format('%s has no %s %s', tbl,
        CASE WHEN strpos(missing, ',') > 0 THEN 'columns' ELSE 'column' END, missing);
      CONTINUE;
    END IF;

    -- Columns: type, nullability in both directions, defaults
    FOR col, spec IN SELECT key, value FROM jsonb_each_text(expected -> tbl) ORDER BY key LOOP
      SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasdef
        INTO actual_type, actual_not_null, actual_has_default
      FROM pg_attribute a
      WHERE a.attrelid = rel AND a.attname = col AND a.attnum > 0 AND NOT a.attisdropped;
      IF actual_type <> rtrim(spec, '!') THEN
        problems := problems || format('%s.%s has type %s, expected %s',
          tbl, col, actual_type, rtrim(spec, '!'));
      END IF;
      IF right(spec, 1) = '!' AND NOT actual_not_null THEN
        problems := problems || format('%s.%s must be NOT NULL', tbl, col);
      ELSIF right(spec, 1) <> '!' AND actual_not_null THEN
        problems := problems || format('%s.%s must allow NULL', tbl, col);
      END IF;
      IF COALESCE(with_default -> tbl, '[]') ? col AND NOT actual_has_default THEN
        problems := problems || format('%s.%s has no default', tbl, col);
      END IF;
    END LOOP;

    FOR col, spec IN SELECT key, value FROM jsonb_each_text(COALESCE(generated -> tbl, '{}')) LOOP
      actual_definition := NULL;
      SELECT CASE WHEN a.attgenerated = 's' THEN pg_get_expr(d.adbin, d.adrelid) END
        INTO actual_definition
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = rel AND a.attname = col AND a.attnum > 0 AND NOT a.attisdropped;
      IF actual_definition IS DISTINCT FROM spec THEN
        problems := problems || format('%s.%s must be generated as %s', tbl, col, spec);
      END IF;
    END LOOP;

    SELECT string_agg(a.attname::text, ', ' ORDER BY a.attname::text)
      INTO undeclared
    FROM pg_attribute a
    WHERE a.attrelid = rel AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attnotnull AND NOT a.atthasdef AND a.attidentity = '' AND a.attgenerated = ''
      AND NOT (expected -> tbl) ? a.attname::text;
    IF undeclared IS NOT NULL THEN
      problems := problems || format('%s has undeclared NOT NULL columns without a default: %s',
        tbl, undeclared);
    END IF;

    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      INTO actual_pk
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = rel AND c.contype = 'p';
    SELECT array_agg(k.name ORDER BY k.name)
      INTO expected_pk
    FROM jsonb_array_elements_text(primary_keys -> tbl) AS k(name);
    IF actual_pk IS DISTINCT FROM expected_pk THEN
      problems := problems || format('%s must have its primary key on (%s)',
        tbl, array_to_string(expected_pk, ', '));
    END IF;

    -- Foreign keys: referenced table, referenced column and ON DELETE action, and no other
    -- foreign key on the column
    FOR col, target IN
      SELECT key, value FROM jsonb_each(COALESCE(foreign_keys -> tbl, '{}')) ORDER BY key
    LOOP
      SELECT bool_or(fk.matches),
             string_agg(fk.description, ', ' ORDER BY fk.description) FILTER (WHERE NOT fk.matches)
        INTO fk_found, fk_others
      FROM (
        SELECT COALESCE(
                 c.confrelid = to_regclass(format('public.%I', target ->> 0))
                 AND cardinality(c.confkey) = 1
                 AND ra.attname = target ->> 1
                 AND c.confdeltype::text = CASE target ->> 2
                   WHEN 'NO ACTION' THEN 'a' WHEN 'RESTRICT' THEN 'r' WHEN 'CASCADE' THEN 'c'
                   WHEN 'SET NULL' THEN 'n' WHEN 'SET DEFAULT' THEN 'd' END,
                 false) AS matches,
               format('%s %s', c.conname, pg_get_constraintdef(c.oid)) AS description
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        LEFT JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
        WHERE c.conrelid = rel AND c.contype = 'f'
          AND cardinality(c.conkey) = 1 AND a.attname = col
      ) fk;
      IF NOT COALESCE(fk_found, false) THEN
        problems := problems || format('%s.%s must reference %s(%s) ON DELETE %s%s',
          tbl, col, target ->> 0, target ->> 1, target ->> 2,
          CASE WHEN fk_others IS NULL THEN '' ELSE format(' (found %s)', fk_others) END);
      ELSIF fk_others IS NOT NULL THEN
        problems := problems || format('%s.%s has an unexpected foreign key %s', tbl, col, fk_others);
      END IF;
    END LOOP;

    -- CHECK constraints. Each one found is matched once; whatever is left over is unexpected.
    matched := '{}';

    FOR col, spec IN SELECT key, value FROM jsonb_each_text(COALESCE(checks -> tbl, '{}')) ORDER BY key LOOP
      found_oid := NULL;
      SELECT c.oid, pg_get_constraintdef(c.oid)
        INTO found_oid, actual_definition
      FROM pg_constraint c
      WHERE c.conrelid = rel AND c.contype = 'c' AND c.conname = col;
      IF found_oid IS NULL THEN
        problems := problems || format('%s has no CHECK constraint %s %s', tbl, col, spec);
      ELSE
        matched := matched || found_oid;
        IF actual_definition <> spec THEN
          problems := problems || format('%s.%s is %s, expected %s', tbl, col, actual_definition, spec);
        END IF;
      END IF;
    END LOOP;

    FOR col, target IN
      SELECT key, value FROM jsonb_each(COALESCE(allowed_values -> tbl, '{}')) ORDER BY key
    LOOP
      SELECT array_agg(DISTINCT v ORDER BY v) INTO declared_values
      FROM jsonb_array_elements_text(target) v;
      exact_list_found := false;
      other_lists := NULL;
      FOR con IN
        SELECT c.oid, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.conrelid = rel AND c.contype = 'c'
          AND cardinality(c.conkey) = 1 AND a.attname = col
          AND NOT c.oid = ANY (matched)
        ORDER BY c.conname
      LOOP
        list := substring(con.definition FROM in_list);
        -- Only a list made of plain values is an IN-list; any other check stays unmatched
        CONTINUE WHEN list IS NULL OR regexp_replace(list, list_item || '(, )?', '', 'g') <> '';
        SELECT array_agg(DISTINCT replace(m[1], '''''', '''') ORDER BY replace(m[1], '''''', ''''))
          INTO actual_values
        FROM regexp_matches(list, list_item, 'g') AS m;
        matched := matched || con.oid;
        IF actual_values = declared_values THEN
          exact_list_found := true;
        ELSE
          other_lists := concat_ws(' and ', other_lists,
            (SELECT '(' || string_agg(quote_literal(v), ', ' ORDER BY v) || ')'
             FROM unnest(actual_values) v));
        END IF;
      END LOOP;
      IF other_lists IS NOT NULL THEN
        problems := problems || format('%s.%s allows %s, expected %s', tbl, col, other_lists,
          (SELECT '(' || string_agg(quote_literal(v), ', ' ORDER BY v) || ')'
           FROM unnest(declared_values) v));
      ELSIF NOT exact_list_found THEN
        problems := problems || format('%s.%s has no CHECK constraint limiting it to %s', tbl, col,
          (SELECT '(' || string_agg(quote_literal(v), ', ' ORDER BY v) || ')'
           FROM unnest(declared_values) v));
      END IF;
    END LOOP;

    FOR con IN
      SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      WHERE c.conrelid = rel AND c.contype = 'c' AND NOT c.oid = ANY (matched)
      ORDER BY c.conname
    LOOP
      problems := problems || format('%s has an unexpected CHECK constraint %s %s',
        tbl, con.conname, con.definition);
    END LOOP;

    FOR col, spec IN
      SELECT key, value FROM jsonb_each_text(COALESCE(unique_constraints -> tbl, '{}')) ORDER BY key
    LOOP
      actual_definition := NULL;
      SELECT pg_get_constraintdef(c.oid)
        INTO actual_definition
      FROM pg_constraint c
      WHERE c.conrelid = rel AND c.contype = 'u' AND c.conname = col;
      IF actual_definition IS NULL THEN
        problems := problems || format('%s has no unique constraint %s %s', tbl, col, spec);
      ELSIF actual_definition <> spec THEN
        problems := problems || format('%s.%s is %s, expected %s', tbl, col, actual_definition, spec);
      END IF;
    END LOOP;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Migration 026: existing tables differ from this migration: %; %',
      array_to_string(problems, '; '), fix_hint;
  END IF;
END $$;

-- ── Shared guards for records that are kept ─────────────────────────────────────
-- Decisions, appeals and inventory results are legal records: they are never deleted,
-- and only the columns their lifecycle names may change
CREATE OR REPLACE FUNCTION mms_forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are records to keep and cannot be deleted', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE OR REPLACE FUNCTION mms_forbid_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed once recorded', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

-- ── Khen thưởng: reward decisions for a militia member ─────────────────────────
CREATE TABLE IF NOT EXISTS reward_decisions (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    militia_id        UUID         NOT NULL REFERENCES militia_profiles(id) ON DELETE RESTRICT,
    reward_form       VARCHAR(40)  NOT NULL,
    issuing_authority VARCHAR(40)  NOT NULL,
    basis             VARCHAR(20)  NOT NULL DEFAULT 'achievement',
    criteria          TEXT,
    decision_number   VARCHAR(50),
    issued_date       DATE         NOT NULL,
    created_by        UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_reward_decisions_form CHECK (reward_form IN (
      'chien_si_thi_dua_toan_quoc', 'chien_si_thi_dua_toan_quan', 'chien_si_thi_dua_co_so',
      'chien_si_tien_tien', 'huan_chuong', 'huy_chuong', 'danh_hieu_vinh_du_nha_nuoc',
      'giai_thuong_nha_nuoc', 'ky_niem_chuong', 'bang_khen', 'giay_khen')),
    CONSTRAINT chk_reward_decisions_authority CHECK (issuing_authority IN (
      'state', 'prime_minister', 'ministry_of_defence', 'ministry_or_province',
      'military_region', 'provincial_military_command', 'district', 'commune')),
    CONSTRAINT chk_reward_decisions_basis CHECK (basis IN (
      'achievement', 'ad_hoc', 'thematic', 'contribution')),
    CONSTRAINT chk_reward_decisions_district_before_2025
      CHECK (issuing_authority <> 'district' OR issued_date < DATE '2025-07-01'),
    CONSTRAINT chk_reward_decisions_criteria_length
      CHECK (criteria IS NULL OR length(criteria) <= 2000)
);
-- A member's decisions newest first (profile tab); also serves the militia foreign key
CREATE INDEX IF NOT EXISTS idx_reward_decisions_militia_issued
  ON reward_decisions(militia_id, issued_date DESC);
-- Lists and the rewards report filter and order by decision date
CREATE INDEX IF NOT EXISTS idx_reward_decisions_issued ON reward_decisions(issued_date DESC);
CREATE INDEX IF NOT EXISTS idx_reward_decisions_created_by ON reward_decisions(created_by);

CREATE OR REPLACE TRIGGER trg_reward_decisions_no_update
  BEFORE UPDATE ON reward_decisions FOR EACH ROW EXECUTE FUNCTION mms_forbid_update();
CREATE OR REPLACE TRIGGER trg_reward_decisions_no_delete
  BEFORE DELETE ON reward_decisions FOR EACH ROW EXECUTE FUNCTION mms_forbid_delete();

-- ── Kỷ luật: discipline decisions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discipline_decisions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    militia_id      UUID         NOT NULL REFERENCES militia_profiles(id) ON DELETE RESTRICT,
    discipline_form VARCHAR(20)  NOT NULL,
    violation       TEXT         NOT NULL,
    violation_date  DATE,
    decision_date   DATE         NOT NULL,
    decision_number VARCHAR(50),
    issued_by       VARCHAR(200),
    -- active: in force; appealed: an appeal is open (the decision stays in force meanwhile);
    -- overturned: annulled by a decided appeal, final
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_by      UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_discipline_decisions_form CHECK (discipline_form IN (
      'khien_trach', 'canh_cao', 'giang_chuc', 'cach_chuc', 'tuoc_danh_hieu')),
    CONSTRAINT chk_discipline_decisions_status CHECK (status IN ('active', 'appealed', 'overturned')),
    CONSTRAINT chk_discipline_decisions_violation_before_decision
      CHECK (violation_date IS NULL OR violation_date <= decision_date),
    CONSTRAINT chk_discipline_decisions_violation_not_blank
      CHECK (btrim(violation) <> '' AND length(violation) <= 2000)
);
CREATE INDEX IF NOT EXISTS idx_discipline_decisions_militia_decided
  ON discipline_decisions(militia_id, decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_decisions_decided ON discipline_decisions(decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_decisions_created_by ON discipline_decisions(created_by);

-- Only the status changes, and only along active -> appealed -> active | overturned
CREATE OR REPLACE FUNCTION discipline_decisions_guard_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.militia_id, NEW.discipline_form, NEW.violation, NEW.violation_date,
      NEW.decision_date, NEW.decision_number, NEW.issued_by, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.militia_id, OLD.discipline_form, OLD.violation, OLD.violation_date,
      OLD.decision_date, OLD.decision_number, OLD.issued_by, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'discipline decision % is a legal record: only its status may change', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'active' AND NEW.status = 'appealed')
    OR (OLD.status = 'appealed' AND NEW.status IN ('active', 'overturned'))) THEN
    RAISE EXCEPTION 'discipline decision % cannot go from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_discipline_decisions_guard_update
  BEFORE UPDATE ON discipline_decisions FOR EACH ROW EXECUTE FUNCTION discipline_decisions_guard_update();
CREATE OR REPLACE TRIGGER trg_discipline_decisions_no_delete
  BEFORE DELETE ON discipline_decisions FOR EACH ROW EXECUTE FUNCTION mms_forbid_delete();

-- ── Khiếu nại: appeals against a discipline decision ────────────────────────────
-- A first appeal and, after it is upheld, a second one (Luật Khiếu nại 2011: khiếu nại
-- lần đầu, lần hai). A decided appeal is final.
CREATE TABLE IF NOT EXISTS discipline_appeals (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id  UUID         NOT NULL REFERENCES discipline_decisions(id) ON DELETE RESTRICT,
    round        SMALLINT     NOT NULL,
    reason       TEXT         NOT NULL,
    filed_date   DATE         NOT NULL,
    filed_by     UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    outcome      VARCHAR(20),
    resolution   TEXT,
    decided_date DATE,
    decided_by   UUID         REFERENCES users(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    decided_at   TIMESTAMPTZ,
    CONSTRAINT chk_discipline_appeals_round CHECK (round BETWEEN 1 AND 2),
    CONSTRAINT chk_discipline_appeals_outcome CHECK (outcome IN ('upheld', 'overturned')),
    CONSTRAINT chk_discipline_appeals_reason_not_blank
      CHECK (btrim(reason) <> '' AND length(reason) <= 2000),
    CONSTRAINT chk_discipline_appeals_decided_together CHECK (
      (outcome IS NULL AND resolution IS NULL AND decided_date IS NULL
        AND decided_by IS NULL AND decided_at IS NULL)
      OR (outcome IS NOT NULL AND resolution IS NOT NULL AND decided_date IS NOT NULL
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL
        AND btrim(resolution) <> '' AND length(resolution) <= 2000)),
    CONSTRAINT chk_discipline_appeals_decided_after_filed
      CHECK (decided_date IS NULL OR decided_date >= filed_date),
    -- Rounds are numbered once per decision; also serves the decision foreign key
    CONSTRAINT uq_discipline_appeals_round UNIQUE (decision_id, round)
);
-- At most one open appeal per decision, even under concurrent filings
CREATE UNIQUE INDEX IF NOT EXISTS uq_discipline_appeals_open
  ON discipline_appeals(decision_id) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_appeals_filed_by ON discipline_appeals(filed_by);
CREATE INDEX IF NOT EXISTS idx_discipline_appeals_decided_by ON discipline_appeals(decided_by);

-- The filing is never rewritten; the decision is recorded once
CREATE OR REPLACE FUNCTION discipline_appeals_guard_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.outcome IS NOT NULL THEN
    RAISE EXCEPTION 'appeal % is decided and final', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.decision_id, NEW.round, NEW.reason, NEW.filed_date, NEW.filed_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.decision_id, OLD.round, OLD.reason, OLD.filed_date, OLD.filed_by, OLD.created_at) THEN
    RAISE EXCEPTION 'appeal % filing cannot be changed', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_discipline_appeals_guard_update
  BEFORE UPDATE ON discipline_appeals FOR EACH ROW EXECUTE FUNCTION discipline_appeals_guard_update();
CREATE OR REPLACE TRIGGER trg_discipline_appeals_no_delete
  BEFORE DELETE ON discipline_appeals FOR EACH ROW EXECUTE FUNCTION mms_forbid_delete();

-- Checked when the transaction commits, after both the decision and its appeal are
-- written: a decision is "appealed" exactly while one appeal is open, "overturned" exactly
-- when an appeal overturned it, and appeal rounds run 1, 2 without gaps
CREATE OR REPLACE FUNCTION discipline_appeal_state_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  decision_status TEXT;
  open_appeals INT;
  overturned_appeals INT;
  appeal_count INT;
  last_round INT;
BEGIN
  IF TG_TABLE_NAME = 'discipline_appeals' THEN
    target := NEW.decision_id;
  ELSE
    target := NEW.id;
  END IF;

  SELECT d.status INTO decision_status FROM discipline_decisions d WHERE d.id = target;
  SELECT count(*) FILTER (WHERE a.outcome IS NULL),
         count(*) FILTER (WHERE a.outcome = 'overturned'),
         count(*),
         COALESCE(max(a.round), 0)
    INTO open_appeals, overturned_appeals, appeal_count, last_round
  FROM discipline_appeals a
  WHERE a.decision_id = target;

  IF (decision_status = 'appealed') <> (open_appeals = 1)
     OR (decision_status = 'overturned') <> (overturned_appeals = 1)
     OR last_round <> appeal_count THEN
    RAISE EXCEPTION 'discipline decision % (%) disagrees with its appeals (% open, % overturned, rounds %/%)',
      target, decision_status, open_appeals, overturned_appeals, last_round, appeal_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

-- CREATE CONSTRAINT TRIGGER has no OR REPLACE; the end of this file compares a trigger
-- of the same name that already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_discipline_decisions_appeal_state'
      AND tgrelid = 'discipline_decisions'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_discipline_decisions_appeal_state
      AFTER INSERT OR UPDATE ON discipline_decisions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION discipline_appeal_state_check();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_discipline_appeals_state'
      AND tgrelid = 'discipline_appeals'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER trg_discipline_appeals_state
      AFTER INSERT OR UPDATE ON discipline_appeals
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION discipline_appeal_state_check();
  END IF;
END $$;

-- ── Kế hoạch huấn luyện: annual training plans ──────────────────────────────────
CREATE TABLE IF NOT EXISTS training_plans (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL: a ward-wide plan
    unit_id       UUID          REFERENCES units(id) ON DELETE RESTRICT,
    year          SMALLINT      NOT NULL,
    training_type VARCHAR(50)   NOT NULL,
    title         VARCHAR(200),
    required_days NUMERIC(5,1)  NOT NULL,
    status        VARCHAR(20)   NOT NULL DEFAULT 'draft',
    created_by    UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    activated_at  TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    -- The same codes as training_records.training_type
    CONSTRAINT chk_training_plans_type CHECK (training_type IN (
      'military', 'political', 'fire', 'first_aid', 'other')),
    CONSTRAINT chk_training_plans_status CHECK (status IN ('draft', 'active', 'completed')),
    CONSTRAINT chk_training_plans_year CHECK (year BETWEEN 2000 AND 2100),
    CONSTRAINT chk_training_plans_required_days CHECK (required_days > 0 AND required_days <= 365),
    CONSTRAINT chk_training_plans_lifecycle CHECK (
      (status = 'draft' AND activated_at IS NULL AND completed_at IS NULL)
      OR (status = 'active' AND activated_at IS NOT NULL AND completed_at IS NULL)
      OR (status = 'completed' AND activated_at IS NOT NULL AND completed_at IS NOT NULL
          AND completed_at >= activated_at)),
    -- One plan per unit (or the whole ward), year and training type, even under concurrent
    -- creation; also serves the unit foreign key
    CONSTRAINT uq_training_plans_unit_year_type UNIQUE NULLS NOT DISTINCT (unit_id, year, training_type)
);
CREATE INDEX IF NOT EXISTS idx_training_plans_year ON training_plans(year DESC);
CREATE INDEX IF NOT EXISTS idx_training_plans_created_by ON training_plans(created_by);

-- Plans only move forward (draft -> active -> completed) and a completed plan is closed
CREATE OR REPLACE FUNCTION training_plans_guard_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'training plan % is completed and closed', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status = 'active')
    OR (OLD.status = 'active' AND NEW.status = 'completed')) THEN
    RAISE EXCEPTION 'training plan % cannot go from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.unit_id, NEW.year, NEW.training_type, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.unit_id, OLD.year, OLD.training_type, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'training plan % keeps its unit, year and type', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_training_plans_guard_update
  BEFORE UPDATE ON training_plans FOR EACH ROW EXECUTE FUNCTION training_plans_guard_update();

-- ── Buổi/đợt huấn luyện: sessions of a plan ────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_sessions (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id    UUID          NOT NULL REFERENCES training_plans(id) ON DELETE RESTRICT,
    name       VARCHAR(200)  NOT NULL,
    start_date DATE          NOT NULL,
    end_date   DATE          NOT NULL,
    location   VARCHAR(200)  NOT NULL,
    days_count NUMERIC(5,1)  NOT NULL,
    created_by UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_training_sessions_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_training_sessions_days_count
      CHECK (days_count > 0 AND days_count <= (end_date - start_date + 1)),
    CONSTRAINT chk_training_sessions_one_year
      CHECK (EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM end_date))
);
-- A plan's sessions in date order; also serves the plan foreign key
CREATE INDEX IF NOT EXISTS idx_training_sessions_plan_start ON training_sessions(plan_id, start_date);
-- Session lists order by start date
CREATE INDEX IF NOT EXISTS idx_training_sessions_start ON training_sessions(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_training_sessions_created_by ON training_sessions(created_by);

-- ── Điểm danh buổi huấn luyện: session attendance ──────────────────────────────
CREATE TABLE IF NOT EXISTS training_session_attendance (
    session_id  UUID         NOT NULL REFERENCES training_sessions(id) ON DELETE RESTRICT,
    militia_id  UUID         NOT NULL REFERENCES militia_profiles(id) ON DELETE RESTRICT,
    attended    BOOLEAN      NOT NULL,
    recorded_by UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recorded_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, militia_id)
);
CREATE INDEX IF NOT EXISTS idx_training_session_attendance_militia
  ON training_session_attendance(militia_id);
CREATE INDEX IF NOT EXISTS idx_training_session_attendance_recorded_by
  ON training_session_attendance(recorded_by);

-- A member who attended a session gets the training record every report and the payroll
-- training allowance already count. Such a record belongs to its attendance row.
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS session_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_training_records_session_attendance'
      AND conrelid = 'training_records'::regclass
  ) THEN
    ALTER TABLE training_records
      ADD CONSTRAINT fk_training_records_session_attendance
      FOREIGN KEY (session_id, militia_id)
      REFERENCES training_session_attendance(session_id, militia_id) ON DELETE RESTRICT;
  END IF;
END $$;
-- One record per member per session; serves the foreign key above
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_records_session_member
  ON training_records(session_id, militia_id) WHERE session_id IS NOT NULL;

-- ── Kiểm kê vũ khí: weapon inventory checks ────────────────────────────────────
CREATE TABLE IF NOT EXISTS weapon_inventory_checks (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The Vietnamese calendar day of the check
    check_date      DATE         NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    performed_by    UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    -- Active weapons on record when the check was saved
    expected_count  INTEGER      NOT NULL,
    -- Weapons the checker confirmed
    confirmed_count INTEGER      NOT NULL,
    discrepancy     INTEGER      GENERATED ALWAYS AS (confirmed_count - expected_count) STORED,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_weapon_inventory_checks_expected_count CHECK (expected_count >= 0),
    CONSTRAINT chk_weapon_inventory_checks_confirmed_count CHECK (confirmed_count >= 0),
    CONSTRAINT chk_weapon_inventory_checks_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)
);
CREATE INDEX IF NOT EXISTS idx_weapon_inventory_checks_date
  ON weapon_inventory_checks(check_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weapon_inventory_checks_performed_by
  ON weapon_inventory_checks(performed_by);

-- The register as it stood at the check, one row per active weapon
CREATE TABLE IF NOT EXISTS weapon_inventory_items (
    check_id           UUID          NOT NULL REFERENCES weapon_inventory_checks(id) ON DELETE RESTRICT,
    weapon_id          UUID          NOT NULL REFERENCES weapons(id) ON DELETE RESTRICT,
    weapon_type        VARCHAR(100)  NOT NULL,
    serial_number      VARCHAR(100)  NOT NULL,
    condition          VARCHAR(20)   NOT NULL,
    storage_location   VARCHAR(200)  NOT NULL,
    holder_militia_id  UUID          REFERENCES militia_profiles(id) ON DELETE RESTRICT,
    -- NULL: not verified one by one
    found              BOOLEAN,
    observed_condition VARCHAR(20),
    PRIMARY KEY (check_id, weapon_id),
    CONSTRAINT chk_weapon_inventory_items_condition CHECK (condition IN ('good', 'damaged', 'maintenance')),
    CONSTRAINT chk_weapon_inventory_items_observed_condition
      CHECK (observed_condition IN ('good', 'damaged', 'maintenance')),
    CONSTRAINT chk_weapon_inventory_items_observed_only_when_found
      CHECK (observed_condition IS NULL OR found IS TRUE)
);
CREATE INDEX IF NOT EXISTS idx_weapon_inventory_items_weapon ON weapon_inventory_items(weapon_id);
CREATE INDEX IF NOT EXISTS idx_weapon_inventory_items_holder ON weapon_inventory_items(holder_militia_id);

CREATE OR REPLACE TRIGGER trg_weapon_inventory_checks_no_update
  BEFORE UPDATE ON weapon_inventory_checks FOR EACH ROW EXECUTE FUNCTION mms_forbid_update();
CREATE OR REPLACE TRIGGER trg_weapon_inventory_checks_no_delete
  BEFORE DELETE ON weapon_inventory_checks FOR EACH ROW EXECUTE FUNCTION mms_forbid_delete();
CREATE OR REPLACE TRIGGER trg_weapon_inventory_items_no_update
  BEFORE UPDATE ON weapon_inventory_items FOR EACH ROW EXECUTE FUNCTION mms_forbid_update();
CREATE OR REPLACE TRIGGER trg_weapon_inventory_items_no_delete
  BEFORE DELETE ON weapon_inventory_items FOR EACH ROW EXECUTE FUNCTION mms_forbid_delete();

-- ── Existing indexes, constraints and constraint triggers ───────────────────────
-- CREATE INDEX IF NOT EXISTS keeps any existing relation of that name, whatever it indexes,
-- and the foreign key and constraint triggers above are skipped when one of their name
-- exists. As in migration 019, compare each with the definition PostgreSQL prints for its
-- declaration (read from PostgreSQL 16).
DO $$
DECLARE
  indexes CONSTANT jsonb := '{
    "idx_reward_decisions_militia_issued":
      "CREATE INDEX idx_reward_decisions_militia_issued ON public.reward_decisions USING btree (militia_id, issued_date DESC)",
    "idx_reward_decisions_issued":
      "CREATE INDEX idx_reward_decisions_issued ON public.reward_decisions USING btree (issued_date DESC)",
    "idx_reward_decisions_created_by":
      "CREATE INDEX idx_reward_decisions_created_by ON public.reward_decisions USING btree (created_by)",
    "idx_discipline_decisions_militia_decided":
      "CREATE INDEX idx_discipline_decisions_militia_decided ON public.discipline_decisions USING btree (militia_id, decision_date DESC)",
    "idx_discipline_decisions_decided":
      "CREATE INDEX idx_discipline_decisions_decided ON public.discipline_decisions USING btree (decision_date DESC)",
    "idx_discipline_decisions_created_by":
      "CREATE INDEX idx_discipline_decisions_created_by ON public.discipline_decisions USING btree (created_by)",
    "uq_discipline_appeals_round":
      "CREATE UNIQUE INDEX uq_discipline_appeals_round ON public.discipline_appeals USING btree (decision_id, round)",
    "uq_discipline_appeals_open":
      "CREATE UNIQUE INDEX uq_discipline_appeals_open ON public.discipline_appeals USING btree (decision_id) WHERE (outcome IS NULL)",
    "idx_discipline_appeals_filed_by":
      "CREATE INDEX idx_discipline_appeals_filed_by ON public.discipline_appeals USING btree (filed_by)",
    "idx_discipline_appeals_decided_by":
      "CREATE INDEX idx_discipline_appeals_decided_by ON public.discipline_appeals USING btree (decided_by)",
    "uq_training_plans_unit_year_type":
      "CREATE UNIQUE INDEX uq_training_plans_unit_year_type ON public.training_plans USING btree (unit_id, year, training_type) NULLS NOT DISTINCT",
    "idx_training_plans_year":
      "CREATE INDEX idx_training_plans_year ON public.training_plans USING btree (year DESC)",
    "idx_training_plans_created_by":
      "CREATE INDEX idx_training_plans_created_by ON public.training_plans USING btree (created_by)",
    "idx_training_sessions_plan_start":
      "CREATE INDEX idx_training_sessions_plan_start ON public.training_sessions USING btree (plan_id, start_date)",
    "idx_training_sessions_start":
      "CREATE INDEX idx_training_sessions_start ON public.training_sessions USING btree (start_date DESC)",
    "idx_training_sessions_created_by":
      "CREATE INDEX idx_training_sessions_created_by ON public.training_sessions USING btree (created_by)",
    "idx_training_session_attendance_militia":
      "CREATE INDEX idx_training_session_attendance_militia ON public.training_session_attendance USING btree (militia_id)",
    "idx_training_session_attendance_recorded_by":
      "CREATE INDEX idx_training_session_attendance_recorded_by ON public.training_session_attendance USING btree (recorded_by)",
    "uq_training_records_session_member":
      "CREATE UNIQUE INDEX uq_training_records_session_member ON public.training_records USING btree (session_id, militia_id) WHERE (session_id IS NOT NULL)",
    "idx_weapon_inventory_checks_date":
      "CREATE INDEX idx_weapon_inventory_checks_date ON public.weapon_inventory_checks USING btree (check_date DESC, created_at DESC)",
    "idx_weapon_inventory_checks_performed_by":
      "CREATE INDEX idx_weapon_inventory_checks_performed_by ON public.weapon_inventory_checks USING btree (performed_by)",
    "idx_weapon_inventory_items_weapon":
      "CREATE INDEX idx_weapon_inventory_items_weapon ON public.weapon_inventory_items USING btree (weapon_id)",
    "idx_weapon_inventory_items_holder":
      "CREATE INDEX idx_weapon_inventory_items_holder ON public.weapon_inventory_items USING btree (holder_militia_id)"
  }';
  -- table -> constraint name -> definition as pg_get_constraintdef() prints it
  constraints CONSTANT jsonb := '{
    "training_records": {
      "fk_training_records_session_attendance":
        "FOREIGN KEY (session_id, militia_id) REFERENCES training_session_attendance(session_id, militia_id) ON DELETE RESTRICT"}
  }';
  -- table -> constraint trigger name -> definition as pg_get_triggerdef() prints it
  triggers CONSTANT jsonb := '{
    "discipline_decisions": {
      "trg_discipline_decisions_appeal_state":
        "CREATE CONSTRAINT TRIGGER trg_discipline_decisions_appeal_state AFTER INSERT OR UPDATE ON public.discipline_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION discipline_appeal_state_check()"},
    "discipline_appeals": {
      "trg_discipline_appeals_state":
        "CREATE CONSTRAINT TRIGGER trg_discipline_appeals_state AFTER INSERT OR UPDATE ON public.discipline_appeals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION discipline_appeal_state_check()"}
  }';
  problems text[] := '{}';
  tbl text;
  target jsonb;
  item_name text;
  declared text;
  actual text;
  valid boolean;
BEGIN
  FOR item_name, declared IN SELECT key, value FROM jsonb_each_text(indexes) ORDER BY key LOOP
    actual := NULL;
    SELECT pg_get_indexdef(i.indexrelid), i.indisvalid
      INTO actual, valid
    FROM pg_index i
    WHERE i.indexrelid = to_regclass(format('public.%I', item_name));
    IF actual IS NULL THEN
      problems := problems || format('%s exists but is not an index', item_name);
    ELSIF actual <> declared THEN
      problems := problems || format('%s is %s, expected %s', item_name, actual, declared);
    ELSIF NOT valid THEN
      problems := problems || format(
        '%s is invalid, as an interrupted CREATE INDEX CONCURRENTLY leaves it', item_name);
    END IF;
  END LOOP;

  FOR tbl, target IN SELECT key, value FROM jsonb_each(constraints) ORDER BY key LOOP
    FOR item_name, declared IN SELECT key, value FROM jsonb_each_text(target) ORDER BY key LOOP
      actual := NULL;
      SELECT pg_get_constraintdef(c.oid)
        INTO actual
      FROM pg_constraint c
      WHERE c.conrelid = to_regclass(format('public.%I', tbl)) AND c.conname = item_name;
      IF actual IS NULL THEN
        problems := problems || format('%s has no constraint %s', tbl, item_name);
      ELSIF actual <> declared THEN
        problems := problems || format('%s.%s is %s, expected %s', tbl, item_name, actual, declared);
      END IF;
    END LOOP;
  END LOOP;

  FOR tbl, target IN SELECT key, value FROM jsonb_each(triggers) ORDER BY key LOOP
    FOR item_name, declared IN SELECT key, value FROM jsonb_each_text(target) ORDER BY key LOOP
      actual := NULL;
      SELECT pg_get_triggerdef(t.oid)
        INTO actual
      FROM pg_trigger t
      WHERE t.tgrelid = to_regclass(format('public.%I', tbl)) AND t.tgname = item_name;
      IF actual IS NULL THEN
        problems := problems || format('%s has no trigger %s', tbl, item_name);
      ELSIF actual <> declared THEN
        problems := problems || format('%s.%s is %s, expected %s', tbl, item_name, actual, declared);
      END IF;
    END LOOP;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Migration 026: existing indexes, constraints or triggers differ from this migration: %; drop or rename them before applying it',
      array_to_string(problems, '; ');
  END IF;
END $$;

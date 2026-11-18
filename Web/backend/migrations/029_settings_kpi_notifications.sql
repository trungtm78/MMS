-- Migration 029: KPI targets (chỉ tiêu KPI) and per-user notification preferences.
-- Idempotent.
--
-- 1. kpi_target_settings — the thresholds militia members are assessed against. Versions
--    are append-only: each change adds a row effective from the Vietnamese business day it
--    was made, so a past period is always compared with the targets in force at its end,
--    and the table itself is the history of who set what. Only system_admin writes them,
--    and every write is audited (src/settings/kpi-targets.service.ts).
-- 2. notification_preferences — which notification categories each user receives and on
--    which channels. A user without a row receives the defaults, which the column defaults
--    mirror (DEFAULT_NOTIFICATION_PREFERENCES in
--    src/settings/notification-preferences.service.ts).

-- ── Pre-existing tables ─────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS keeps a pre-existing table whatever its shape. As in
-- migrations 019 and 026, compare any table this migration would adopt with its
-- declaration below: every column with its exact type, nullability and default, the
-- primary key, the foreign keys and the CHECK constraints. Any difference stops the
-- migration with what to fix. The index and triggers are compared at the end of this file.
DO $$
DECLARE
  -- column -> type as format_type() prints it; a trailing ! means NOT NULL, otherwise the
  -- column must accept NULL
  expected CONSTANT jsonb := '{
    "kpi_target_settings": {
      "id": "uuid!", "effective_from": "date!", "min_attendance_days": "smallint!",
      "min_tasks_completed": "smallint!", "max_overdue_tasks": "smallint!",
      "min_training_hours": "smallint!", "evaluation_period": "character varying(10)!",
      "created_by": "uuid!", "created_at": "timestamp with time zone!"},
    "notification_preferences": {
      "user_id": "uuid!", "channel_in_app": "boolean!", "channel_push": "boolean!",
      "channel_email": "boolean!", "task_assigned": "boolean!", "task_overdue": "boolean!",
      "attendance_reminder": "boolean!", "leave_approval": "boolean!",
      "system_announcements": "boolean!", "sos_alerts": "boolean!",
      "updated_at": "timestamp with time zone!"}
  }';
  -- column -> its DEFAULT as pg_get_expr() prints it; the defaults are the preferences of a
  -- user who never chose, so their values matter, not only their presence
  defaults CONSTANT jsonb := '{
    "kpi_target_settings": {"id": "gen_random_uuid()", "created_at": "now()"},
    "notification_preferences": {
      "channel_in_app": "true", "channel_push": "true", "channel_email": "false",
      "task_assigned": "true", "task_overdue": "true", "attendance_reminder": "true",
      "leave_approval": "true", "system_announcements": "true", "sos_alerts": "true",
      "updated_at": "now()"}
  }';
  primary_keys CONSTANT jsonb := '{
    "kpi_target_settings": ["id"], "notification_preferences": ["user_id"]
  }';
  -- column -> [referenced table, referenced column, ON DELETE action]
  foreign_keys CONSTANT jsonb := '{
    "kpi_target_settings": {"created_by": ["users", "id", "RESTRICT"]},
    "notification_preferences": {"user_id": ["users", "id", "CASCADE"]}
  }';
  -- Every CHECK constraint by name, as pg_get_constraintdef() prints the declarations below
  -- (read from PostgreSQL 16)
  checks CONSTANT jsonb := '{
    "kpi_target_settings": {
      "chk_kpi_target_settings_min_attendance_days":
        "CHECK (((min_attendance_days >= 1) AND (min_attendance_days <= 31)))",
      "chk_kpi_target_settings_min_tasks_completed":
        "CHECK (((min_tasks_completed >= 0) AND (min_tasks_completed <= 100)))",
      "chk_kpi_target_settings_max_overdue_tasks":
        "CHECK (((max_overdue_tasks >= 0) AND (max_overdue_tasks <= 20)))",
      "chk_kpi_target_settings_min_training_hours":
        "CHECK (((min_training_hours >= 0) AND (min_training_hours <= 500)))",
      "chk_kpi_target_settings_evaluation_period":
        "CHECK (((evaluation_period)::text = ANY ((ARRAY[''monthly''::character varying, ''quarterly''::character varying, ''yearly''::character varying])::text[])))"},
    "notification_preferences": {}
  }';
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
  actual_default text;
  actual_definition text;
  found_oid oid;
  fk_found boolean;
  fk_others text;
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

    -- Columns: type, nullability in both directions, the exact default or none
    FOR col, spec IN SELECT key, value FROM jsonb_each_text(expected -> tbl) ORDER BY key LOOP
      SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
        INTO actual_type, actual_not_null, actual_default
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
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
      IF actual_default IS DISTINCT FROM (defaults -> tbl ->> col) THEN
        problems := problems || format('%s.%s has default %s, expected %s', tbl, col,
          COALESCE(actual_default, 'none'), COALESCE(defaults -> tbl ->> col, 'none'));
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

    -- CHECK constraints by name; any other CHECK constraint is unexpected
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

    FOR con IN
      SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      WHERE c.conrelid = rel AND c.contype = 'c' AND NOT c.oid = ANY (matched)
      ORDER BY c.conname
    LOOP
      problems := problems || format('%s has an unexpected CHECK constraint %s %s',
        tbl, con.conname, con.definition);
    END LOOP;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Migration 029: existing tables differ from this migration: %; %',
      array_to_string(problems, '; '), fix_hint;
  END IF;
END $$;

-- ── KPI targets ───────────────────────────────────────────────────────────────
-- Ranges match the settings page and KpiTargetsDto (src/settings/settings.dto.ts)
CREATE TABLE IF NOT EXISTS kpi_target_settings (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    effective_from      DATE         NOT NULL,
    min_attendance_days SMALLINT     NOT NULL,
    min_tasks_completed SMALLINT     NOT NULL,
    max_overdue_tasks   SMALLINT     NOT NULL,
    min_training_hours  SMALLINT     NOT NULL,
    evaluation_period   VARCHAR(10)  NOT NULL,
    created_by          UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_kpi_target_settings_min_attendance_days
      CHECK (min_attendance_days BETWEEN 1 AND 31),
    CONSTRAINT chk_kpi_target_settings_min_tasks_completed
      CHECK (min_tasks_completed BETWEEN 0 AND 100),
    CONSTRAINT chk_kpi_target_settings_max_overdue_tasks
      CHECK (max_overdue_tasks BETWEEN 0 AND 20),
    CONSTRAINT chk_kpi_target_settings_min_training_hours
      CHECK (min_training_hours BETWEEN 0 AND 500),
    CONSTRAINT chk_kpi_target_settings_evaluation_period
      CHECK (evaluation_period IN ('monthly', 'quarterly', 'yearly'))
);

-- The version in force on a day: the latest effective_from on or before it, then the
-- latest write of that day
CREATE INDEX IF NOT EXISTS idx_kpi_target_settings_effective
  ON kpi_target_settings (effective_from DESC, created_at DESC);

-- Versions are history: a change is a new row, never an edit or a removal
CREATE OR REPLACE FUNCTION kpi_target_settings_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'kpi_target_settings is append-only: add a new version instead of % ', TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.kpi_target_settings'::regclass
      AND tgname = 'trg_kpi_target_settings_append_only'
  ) THEN
    CREATE TRIGGER trg_kpi_target_settings_append_only
      BEFORE UPDATE OR DELETE ON kpi_target_settings
      FOR EACH ROW EXECUTE FUNCTION kpi_target_settings_append_only();
  END IF;
  -- Row triggers do not see TRUNCATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.kpi_target_settings'::regclass
      AND tgname = 'trg_kpi_target_settings_no_truncate'
  ) THEN
    CREATE TRIGGER trg_kpi_target_settings_no_truncate
      BEFORE TRUNCATE ON kpi_target_settings
      FOR EACH STATEMENT EXECUTE FUNCTION kpi_target_settings_append_only();
  END IF;
END $$;

-- ── Notification preferences ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id              UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    channel_in_app       BOOLEAN      NOT NULL DEFAULT TRUE,
    channel_push         BOOLEAN      NOT NULL DEFAULT TRUE,
    channel_email        BOOLEAN      NOT NULL DEFAULT FALSE,
    task_assigned        BOOLEAN      NOT NULL DEFAULT TRUE,
    task_overdue         BOOLEAN      NOT NULL DEFAULT TRUE,
    attendance_reminder  BOOLEAN      NOT NULL DEFAULT TRUE,
    leave_approval       BOOLEAN      NOT NULL DEFAULT TRUE,
    system_announcements BOOLEAN      NOT NULL DEFAULT TRUE,
    sos_alerts           BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Pre-existing index and triggers ───────────────────────────────────────────
-- IF NOT EXISTS keeps an index or trigger of the same name whatever it does
DO $$
DECLARE
  -- name -> definition as pg_get_indexdef() / pg_get_triggerdef() print it
  indexes CONSTANT jsonb := '{
    "idx_kpi_target_settings_effective":
      "CREATE INDEX idx_kpi_target_settings_effective ON public.kpi_target_settings USING btree (effective_from DESC, created_at DESC)"
  }';
  triggers CONSTANT jsonb := '{
    "trg_kpi_target_settings_append_only":
      "CREATE TRIGGER trg_kpi_target_settings_append_only BEFORE DELETE OR UPDATE ON public.kpi_target_settings FOR EACH ROW EXECUTE FUNCTION kpi_target_settings_append_only()",
    "trg_kpi_target_settings_no_truncate":
      "CREATE TRIGGER trg_kpi_target_settings_no_truncate BEFORE TRUNCATE ON public.kpi_target_settings FOR EACH STATEMENT EXECUTE FUNCTION kpi_target_settings_append_only()"
  }';
  problems text[] := '{}';
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

  FOR item_name, declared IN SELECT key, value FROM jsonb_each_text(triggers) ORDER BY key LOOP
    actual := NULL;
    SELECT pg_get_triggerdef(t.oid)
      INTO actual
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.kpi_target_settings'::regclass AND t.tgname = item_name;
    IF actual IS NULL THEN
      problems := problems || format('kpi_target_settings has no trigger %s', item_name);
    ELSIF actual <> declared THEN
      problems := problems || format('%s is %s, expected %s', item_name, actual, declared);
    END IF;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Migration 029: existing indexes or triggers differ from this migration: %; drop or rename them before applying it',
      array_to_string(problems, '; ');
  END IF;
END $$;

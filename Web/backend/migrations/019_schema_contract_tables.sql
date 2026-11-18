-- Migration 019: tables the backend already queries but no earlier migration created
-- (weapons, weapon allocations, exemptions, organization units, KPI evaluations) and
-- militia_profiles columns read by the profile API. Idempotent.

-- CREATE TABLE IF NOT EXISTS keeps a pre-existing table whatever its shape, and the
-- backend would then fail at runtime or accept invalid data. Before adopting a table,
-- compare it with the declarations below through the catalogs:
--   * every column with its exact type, NOT NULL exactly where declared (a declared
--     nullable column that is NOT NULL breaks inserts that leave it out), a default
--     wherever one is declared, and no undeclared NOT NULL column without a default;
--   * the primary key on id;
--   * each foreign key's referenced table, column and ON DELETE action;
--   * CHECK constraints by meaning: the exact set of values each coded column allows,
--     every other check as PostgreSQL prints its declaration (named checks by name), and
--     no CHECK constraint this migration does not declare.
-- Every difference is reported at once, so the tables can be reconciled in one pass. The
-- indexes are compared after they are created, at the end of this file.
DO $$
DECLARE
  -- column -> type as format_type() prints it; a trailing ! means NOT NULL, otherwise the
  -- column must accept NULL
  expected CONSTANT jsonb := '{
    "weapons": {
      "id": "uuid!", "type": "character varying(100)!", "serial_number": "character varying(100)!",
      "acquired_at": "date!", "condition": "character varying(20)!",
      "storage_location": "character varying(200)!", "responsible_person_id": "uuid",
      "status": "character varying(20)!", "created_at": "timestamp with time zone!",
      "updated_at": "timestamp with time zone!"},
    "weapon_allocations": {
      "id": "uuid!", "weapon_id": "uuid!", "recipient_id": "uuid!",
      "issued_at": "timestamp with time zone!", "purpose": "character varying(500)!",
      "returned_at": "timestamp with time zone", "created_at": "timestamp with time zone!"},
    "exemptions": {
      "id": "uuid!", "militia_id": "uuid!", "type": "character varying(20)!", "reason": "text!",
      "legal_basis": "character varying(500)!", "effective_date": "date!", "expiry_date": "date",
      "status": "character varying(20)!", "documents": "text[]",
      "created_at": "timestamp with time zone!", "updated_at": "timestamp with time zone!"},
    "organization_units": {
      "id": "uuid!", "type": "character varying(20)!", "name": "character varying(200)!",
      "commander_id": "uuid", "parent_id": "uuid", "capacity": "integer!",
      "ward_id": "character varying(50)", "created_at": "timestamp with time zone!",
      "updated_at": "timestamp with time zone!"},
    "kpi_evaluations": {
      "id": "uuid!", "evaluator_id": "uuid!", "target_user_id": "uuid!", "criteria": "jsonb!",
      "scores": "jsonb!", "weighted_score": "numeric(6,2)!",
      "recommendation": "character varying(20)!", "notes": "text", "month": "smallint!",
      "year": "smallint!", "created_at": "timestamp with time zone!"}
  }';
  -- columns declared with a DEFAULT, which inserts that leave them out rely on
  with_default CONSTANT jsonb := '{
    "weapons": ["id", "condition", "status", "created_at", "updated_at"],
    "weapon_allocations": ["id", "issued_at", "created_at"],
    "exemptions": ["id", "status", "created_at", "updated_at"],
    "organization_units": ["id", "capacity", "created_at", "updated_at"],
    "kpi_evaluations": ["id", "criteria", "month", "year", "created_at"]
  }';
  -- column -> [referenced table, referenced column, ON DELETE action]
  foreign_keys CONSTANT jsonb := '{
    "weapons": {"responsible_person_id": ["militia_profiles", "id", "SET NULL"]},
    "weapon_allocations": {"weapon_id": ["weapons", "id", "RESTRICT"],
      "recipient_id": ["militia_profiles", "id", "RESTRICT"]},
    "exemptions": {"militia_id": ["militia_profiles", "id", "RESTRICT"]},
    "organization_units": {"commander_id": ["militia_profiles", "id", "SET NULL"],
      "parent_id": ["organization_units", "id", "RESTRICT"]},
    "kpi_evaluations": {"evaluator_id": ["users", "id", "RESTRICT"],
      "target_user_id": ["users", "id", "CASCADE"]}
  }';
  -- coded column -> the exact set of values its CHECK (column IN (...)) allows
  allowed_values CONSTANT jsonb := '{
    "weapons": {"condition": ["good", "damaged", "maintenance"],
      "status": ["active", "retired", "maintenance"]},
    "exemptions": {"type": ["exemption", "deferral"], "status": ["active", "expired", "revoked"]},
    "organization_units": {"type": ["tieu_doi", "trung_doi", "dai_doi"]},
    "kpi_evaluations": {"recommendation": ["reward", "maintain", "training", "warning", "discipline"]}
  }';
  -- The other CHECK constraints, as pg_get_constraintdef() prints the declarations below
  -- (read from PostgreSQL 16). A named check must keep its name; a column check may have any.
  checks CONSTANT jsonb := '{
    "weapon_allocations": [
      {"name": "chk_weapon_allocations_returned_after_issued",
       "definition": "CHECK (((returned_at IS NULL) OR (returned_at >= issued_at)))"}],
    "exemptions": [
      {"name": "chk_exemptions_expiry_after_effective",
       "definition": "CHECK (((expiry_date IS NULL) OR (expiry_date >= effective_date)))"}],
    "organization_units": [
      {"column": "capacity", "definition": "CHECK ((capacity >= 0))"},
      {"name": "chk_organization_units_not_own_parent",
       "definition": "CHECK (((parent_id IS NULL) OR (parent_id <> id)))"}],
    "kpi_evaluations": [
      {"column": "month", "definition": "CHECK (((month >= 1) AND (month <= 12)))"}]
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
  item jsonb;
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
      IF (with_default -> tbl) ? col AND NOT actual_has_default THEN
        problems := problems || format('%s.%s has no default', tbl, col);
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

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.conrelid = rel AND c.contype = 'p'
        AND cardinality(c.conkey) = 1 AND a.attname = 'id'
    ) THEN
      problems := problems || format('%s has no primary key on id', tbl);
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

    FOR item IN
      SELECT value FROM jsonb_array_elements(COALESCE(checks -> tbl, '[]')) WHERE value ? 'name'
    LOOP
      found_oid := NULL;
      SELECT c.oid, pg_get_constraintdef(c.oid)
        INTO found_oid, actual_definition
      FROM pg_constraint c
      WHERE c.conrelid = rel AND c.contype = 'c' AND c.conname = item ->> 'name';
      IF found_oid IS NULL THEN
        problems := problems || format('%s has no CHECK constraint %s %s',
          tbl, item ->> 'name', item ->> 'definition');
      ELSE
        matched := matched || found_oid;
        IF actual_definition <> item ->> 'definition' THEN
          problems := problems || format('%s.%s is %s, expected %s',
            tbl, item ->> 'name', actual_definition, item ->> 'definition');
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

    FOR item IN
      SELECT value FROM jsonb_array_elements(COALESCE(checks -> tbl, '[]')) WHERE NOT value ? 'name'
    LOOP
      found_oid := NULL;
      SELECT c.oid INTO found_oid
      FROM pg_constraint c
      WHERE c.conrelid = rel AND c.contype = 'c' AND NOT c.oid = ANY (matched)
        AND pg_get_constraintdef(c.oid) = item ->> 'definition'
      ORDER BY c.conname
      LIMIT 1;
      IF found_oid IS NULL THEN
        problems := problems || format('%s.%s has no CHECK constraint %s',
          tbl, item ->> 'column', item ->> 'definition');
      ELSE
        matched := matched || found_oid;
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
    RAISE EXCEPTION 'Migration 019: existing tables differ from this migration: %; %',
      array_to_string(problems, '; '), fix_hint;
  END IF;
END $$;

-- ── Weapons (Luật DQTV 2019: quản lý vũ khí, công cụ hỗ trợ) ───────────────────
CREATE TABLE IF NOT EXISTS weapons (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    type                  VARCHAR(100) NOT NULL,
    serial_number         VARCHAR(100) NOT NULL,
    acquired_at           DATE         NOT NULL,
    condition             VARCHAR(20)  NOT NULL DEFAULT 'good'
                            CHECK (condition IN ('good', 'damaged', 'maintenance')),
    storage_location      VARCHAR(200) NOT NULL,
    responsible_person_id UUID         REFERENCES militia_profiles(id) ON DELETE SET NULL,
    status                VARCHAR(20)  NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'retired', 'maintenance')),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_weapons_status ON weapons(status);
CREATE INDEX IF NOT EXISTS idx_weapons_responsible_person ON weapons(responsible_person_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weapons_serial ON weapons(serial_number)
  WHERE serial_number IS NOT NULL AND serial_number != '';

CREATE TABLE IF NOT EXISTS weapon_allocations (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    weapon_id    UUID         NOT NULL REFERENCES weapons(id) ON DELETE RESTRICT,
    recipient_id UUID         NOT NULL REFERENCES militia_profiles(id) ON DELETE RESTRICT,
    issued_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    purpose      VARCHAR(500) NOT NULL,
    returned_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_weapon_allocations_returned_after_issued
      CHECK (returned_at IS NULL OR returned_at >= issued_at)
);
-- A weapon can be out with at most one person at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_weapon_allocations_open
  ON weapon_allocations(weapon_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_weapon_allocations_recipient ON weapon_allocations(recipient_id);
-- A weapon's allocation history, newest first; also serves the weapons foreign key
CREATE INDEX IF NOT EXISTS idx_weapon_allocations_weapon
  ON weapon_allocations(weapon_id, issued_at DESC);

-- ── Exemptions / deferrals (miễn, hoãn thực hiện nghĩa vụ DQTV) ───────────────
CREATE TABLE IF NOT EXISTS exemptions (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- A decision on legal obligations is a record to keep: a profile with exemptions
    -- cannot be deleted
    militia_id     UUID         NOT NULL REFERENCES militia_profiles(id) ON DELETE RESTRICT,
    type           VARCHAR(20)  NOT NULL CHECK (type IN ('exemption', 'deferral')),
    reason         TEXT         NOT NULL,
    legal_basis    VARCHAR(500) NOT NULL,
    effective_date DATE         NOT NULL,
    expiry_date    DATE,
    status         VARCHAR(20)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'expired', 'revoked')),
    documents      TEXT[],
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_exemptions_expiry_after_effective
      CHECK (expiry_date IS NULL OR expiry_date >= effective_date)
);
CREATE INDEX IF NOT EXISTS idx_exemptions_militia ON exemptions(militia_id);
CREATE INDEX IF NOT EXISTS idx_exemptions_status_expiry ON exemptions(status, expiry_date);

-- ── Organization units (tiểu đội / trung đội / đại đội) ────────────────────────
CREATE TABLE IF NOT EXISTS organization_units (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    type         VARCHAR(20)  NOT NULL CHECK (type IN ('tieu_doi', 'trung_doi', 'dai_doi')),
    name         VARCHAR(200) NOT NULL,
    commander_id UUID         REFERENCES militia_profiles(id) ON DELETE SET NULL,
    parent_id    UUID         REFERENCES organization_units(id) ON DELETE RESTRICT,
    capacity     INT          NOT NULL DEFAULT 0 CHECK (capacity >= 0),
    ward_id      VARCHAR(50),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_organization_units_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_organization_units_parent ON organization_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_organization_units_commander ON organization_units(commander_id);

-- ── KPI evaluations (CA đánh giá DQTV hằng tháng, 5 tiêu chí có trọng số) ─────
CREATE TABLE IF NOT EXISTS kpi_evaluations (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluator_id   UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    criteria       JSONB        NOT NULL DEFAULT '[]'::jsonb,
    scores         JSONB        NOT NULL,
    weighted_score NUMERIC(6,2) NOT NULL,
    recommendation VARCHAR(20)  NOT NULL
                     CHECK (recommendation IN ('reward', 'maintain', 'training', 'warning', 'discipline')),
    notes          TEXT,
    -- Evaluation period in Vietnam time; the service inserts without month/year
    month          SMALLINT     NOT NULL
                     DEFAULT EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::smallint
                     CHECK (month BETWEEN 1 AND 12),
    year           SMALLINT     NOT NULL
                     DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::smallint,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- One evaluation per evaluator, person and month, enforced even under concurrent submits
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_evaluations_monthly
  ON kpi_evaluations(evaluator_id, target_user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_kpi_evaluations_target_period
  ON kpi_evaluations(target_user_id, year, month);

-- ── Militia profile columns read by the profile API ───────────────────────────
ALTER TABLE militia_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE militia_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- CREATE INDEX IF NOT EXISTS keeps any existing relation of that name, whatever it indexes:
-- a unique index that is not partial rejects valid rows, and one on other columns does not
-- serve its queries or uniqueness. Compare every index declared above with the definition
-- pg_get_indexdef() prints for its declaration (read from PostgreSQL 16).
DO $$
DECLARE
  expected CONSTANT jsonb := '{
    "idx_weapons_status":
      "CREATE INDEX idx_weapons_status ON public.weapons USING btree (status)",
    "idx_weapons_responsible_person":
      "CREATE INDEX idx_weapons_responsible_person ON public.weapons USING btree (responsible_person_id)",
    "idx_weapons_serial":
      "CREATE UNIQUE INDEX idx_weapons_serial ON public.weapons USING btree (serial_number) WHERE ((serial_number IS NOT NULL) AND ((serial_number)::text <> ''''::text))",
    "uq_weapon_allocations_open":
      "CREATE UNIQUE INDEX uq_weapon_allocations_open ON public.weapon_allocations USING btree (weapon_id) WHERE (returned_at IS NULL)",
    "idx_weapon_allocations_recipient":
      "CREATE INDEX idx_weapon_allocations_recipient ON public.weapon_allocations USING btree (recipient_id)",
    "idx_weapon_allocations_weapon":
      "CREATE INDEX idx_weapon_allocations_weapon ON public.weapon_allocations USING btree (weapon_id, issued_at DESC)",
    "idx_exemptions_militia":
      "CREATE INDEX idx_exemptions_militia ON public.exemptions USING btree (militia_id)",
    "idx_exemptions_status_expiry":
      "CREATE INDEX idx_exemptions_status_expiry ON public.exemptions USING btree (status, expiry_date)",
    "idx_organization_units_parent":
      "CREATE INDEX idx_organization_units_parent ON public.organization_units USING btree (parent_id)",
    "idx_organization_units_commander":
      "CREATE INDEX idx_organization_units_commander ON public.organization_units USING btree (commander_id)",
    "uq_kpi_evaluations_monthly":
      "CREATE UNIQUE INDEX uq_kpi_evaluations_monthly ON public.kpi_evaluations USING btree (evaluator_id, target_user_id, year, month)",
    "idx_kpi_evaluations_target_period":
      "CREATE INDEX idx_kpi_evaluations_target_period ON public.kpi_evaluations USING btree (target_user_id, year, month)"
  }';
  problems text[] := '{}';
  index_name text;
  declared text;
  actual text;
  valid boolean;
BEGIN
  FOR index_name, declared IN SELECT key, value FROM jsonb_each_text(expected) ORDER BY key LOOP
    actual := NULL;
    SELECT pg_get_indexdef(i.indexrelid), i.indisvalid
      INTO actual, valid
    FROM pg_index i
    WHERE i.indexrelid = to_regclass(format('public.%I', index_name));
    IF actual IS NULL THEN
      problems := problems || format('%s exists but is not an index', index_name);
    ELSIF actual <> declared THEN
      problems := problems || format('%s is %s, expected %s', index_name, actual, declared);
    ELSIF NOT valid THEN
      problems := problems || format(
        '%s is invalid, as an interrupted CREATE INDEX CONCURRENTLY leaves it', index_name);
    END IF;
  END LOOP;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Migration 019: existing indexes differ from this migration: %; drop or rename them before applying it',
      array_to_string(problems, '; ');
  END IF;
END $$;

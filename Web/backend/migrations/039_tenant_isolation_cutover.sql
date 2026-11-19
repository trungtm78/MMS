-- Migration 039: tenant isolation of every tenant table, the short cutover window (M1a).
--
-- One transaction. Everything slow was done online by 038 (columns, unique and foreign-key
-- indexes); this file only attaches: it swaps the global unique keys for the per-tenant
-- ones built by 038, turns every foreign key between two tenant tables into a composite
-- (tenant_id, ...) key added NOT VALID (validated online by 040), and enables Row-Level
-- Security everywhere. Each statement waits at most MIGRATION_LOCK_TIMEOUT for its lock.
-- The release that contains it is incompatible (ON CONFLICT targets change): deploy it
-- drained, see docs/migrations.md.
--
-- The legacy single-tenant database default of 037 (ALTER DATABASE ... SET app.tenant_id)
-- is NOT touched: a legacy deployment keeps writing and reading the first tenant on all 66
-- tables exactly as it did on the nine of the M0 slice. It is removed at the enforced
-- cutover (M1b).

-- 0. Precondition: only the first tenant owns data. 038 labelled every row that existed
--    before it with the first tenant and this file turns that label into foreign keys, so a
--    row of another tenant (the M0 slice lets tenants be created and written to) would end
--    up referencing rows labelled with the first tenant: 040 would then fail on a schema the
--    old version can no longer run on. Refused here instead, while the transaction still
--    rolls everything back. A tenant row without data does not block. Every tenant table is
--    checked, through the tenant_id-led indexes 038 built (two range probes per table).
--    038 leaves the new column without planner statistics, and without them the planner
--    prefers a sequential scan of a large table: sequential scans are disabled for the
--    probe only (restored below) so it stays an index probe whatever autovacuum did.
DO $$
DECLARE
    first_tenant constant uuid := 'a1000000-0000-4000-8000-000000000001';
    t text;
    owned boolean;
    foreign_tables text[] := '{}';
    seqscan_before text := current_setting('enable_seqscan');
BEGIN
    PERFORM set_config('enable_seqscan', 'off', true);
    FOR t IN
        SELECT c.relname FROM pg_class c
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND c.relname <> 'tenants'
           AND EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
         ORDER BY c.relname
    LOOP
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %1$I WHERE tenant_id < %2$L) OR EXISTS (SELECT 1 FROM %1$I WHERE tenant_id > %2$L)',
            t, first_tenant) INTO owned;
        IF owned THEN
            foreign_tables := foreign_tables || t;
        END IF;
    END LOOP;
    PERFORM set_config('enable_seqscan', seqscan_before, true);
    IF cardinality(foreign_tables) > 0 THEN
        RAISE EXCEPTION 'tenant isolation cutover refused, rows of another tenant: %. Every row that existed before 038 belongs to the first tenant (%), and the cutover would give a row of another tenant references into rows of the first. Nothing was changed by this file. Delete the rows of the other tenants together with everything that references them (or restore a backup without them), then run the migrator again',
            array_to_string(foreign_tables, ', '), first_tenant;
    END IF;
END $$;

-- 1. Parent keys: the (tenant_id, id) unique indexes of 038 become constraints the
--    composite foreign keys can reference
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'conversations', 'devices', 'discipline_decisions', 'files', 'kpi_periods',
        'leave_requests', 'leave_types', 'militia_profiles', 'notifications',
        'organization_units', 'payroll_periods', 'sessions', 'task_assignments',
        'task_reports', 'task_updates', 'tasks', 'training_plans',
        'training_session_attendance', 'training_sessions', 'units', 'users',
        'weapon_inventory_checks', 'weapons', 'work_reports'] LOOP
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE USING INDEX %I',
                       t, 'uq_' || t || '_tenant_row', 'uq_' || t || '_tenant_row');
    END LOOP;
END $$;

-- 2. Natural keys: unique per tenant. Constraint names that code relies on are kept:
--    ON CONFLICT ON CONSTRAINT uq_training_plans_unit_year_type (training-plans.service.ts)
--    and system_settings_pkey.
ALTER TABLE incidents
    DROP CONSTRAINT incidents_code_key,
    ADD CONSTRAINT uq_incidents_tenant_code UNIQUE USING INDEX uq_incidents_tenant_code;
ALTER TABLE kpi_criteria
    DROP CONSTRAINT kpi_criteria_code_key,
    ADD CONSTRAINT uq_kpi_criteria_tenant_code UNIQUE USING INDEX uq_kpi_criteria_tenant_code;
ALTER TABLE kpi_periods
    DROP CONSTRAINT kpi_periods_year_month_key,
    ADD CONSTRAINT uq_kpi_periods_tenant_year_month
        UNIQUE USING INDEX uq_kpi_periods_tenant_year_month;
ALTER TABLE leave_requests
    DROP CONSTRAINT leave_requests_code_key,
    ADD CONSTRAINT uq_leave_requests_tenant_code UNIQUE USING INDEX uq_leave_requests_tenant_code;
ALTER TABLE leave_types
    DROP CONSTRAINT leave_types_code_key,
    ADD CONSTRAINT uq_leave_types_tenant_code UNIQUE USING INDEX uq_leave_types_tenant_code;
ALTER TABLE payroll_periods
    DROP CONSTRAINT payroll_periods_year_month_key,
    ADD CONSTRAINT uq_payroll_periods_tenant_year_month
        UNIQUE USING INDEX uq_payroll_periods_tenant_year_month;
ALTER TABLE payroll_rules
    DROP CONSTRAINT payroll_rules_rule_code_key,
    ADD CONSTRAINT uq_payroll_rules_tenant_rule_code
        UNIQUE USING INDEX uq_payroll_rules_tenant_rule_code;
ALTER TABLE police_profiles
    DROP CONSTRAINT police_profiles_badge_no_key,
    DROP CONSTRAINT police_profiles_cccd_key,
    ADD CONSTRAINT uq_police_profiles_tenant_badge_no
        UNIQUE USING INDEX uq_police_profiles_tenant_badge_no,
    ADD CONSTRAINT uq_police_profiles_tenant_cccd UNIQUE USING INDEX uq_police_profiles_tenant_cccd;
ALTER TABLE devices
    DROP CONSTRAINT devices_fingerprint_key,
    ADD CONSTRAINT uq_devices_tenant_fingerprint UNIQUE USING INDEX uq_devices_tenant_fingerprint;
ALTER TABLE device_tokens
    DROP CONSTRAINT device_tokens_push_token_key,
    ADD CONSTRAINT uq_device_tokens_tenant_push_token
        UNIQUE USING INDEX uq_device_tokens_tenant_push_token;
ALTER TABLE system_settings
    DROP CONSTRAINT system_settings_pkey,
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY USING INDEX uq_system_settings_tenant_key;
ALTER TABLE training_plans
    DROP CONSTRAINT uq_training_plans_unit_year_type,
    ADD CONSTRAINT uq_training_plans_unit_year_type
        UNIQUE USING INDEX uq_training_plans_tenant_unit_year_type;
-- Partial unique indexes cannot be constraints; 038 built their per-tenant successors. The
-- direct-conversation key keeps its name (test/migrations.e2e-spec.ts names it)
DROP INDEX uq_conversations_direct_key;
ALTER INDEX uq_conversations_tenant_direct_key RENAME TO uq_conversations_direct_key;
DROP INDEX idx_weapons_serial;

-- 3. Every foreign key between two tenant tables becomes (tenant_id, <columns>), same name,
--    same delete rule. A nullable SET NULL key clears only its own column (PostgreSQL 15+):
--    a plain SET NULL would also clear tenant_id, which is NOT NULL. Checked as the table
--    owner, a single-column key let a tenant point a row at another tenant's row; the
--    composite key cannot match a parent of another tenant.
DO $$
DECLARE
    tenant_tables constant text[] := ARRAY[
        'alerts', 'attendance_records', 'audit_logs', 'auth_challenges', 'ca_dqtv_assignments',
        'conversation_participants', 'conversations', 'device_tokens', 'devices',
        'discipline_appeals', 'discipline_decisions', 'exemptions', 'files', 'gps_latest',
        'gps_points', 'incidents', 'kpi_criteria', 'kpi_evaluations', 'kpi_periods',
        'kpi_scores', 'kpi_target_settings', 'leave_approvals', 'leave_balances',
        'leave_requests', 'leave_types', 'messages', 'mfa_recovery_codes', 'mfa_temp_tokens',
        'militia_profiles', 'militia_rewards', 'notification_preferences',
        'notification_receipts', 'notifications', 'official_documents', 'organization_units',
        'outbox_events', 'payroll_items', 'payroll_periods', 'payroll_rules',
        'police_profiles', 'recovery_codes', 'recruitment_applications', 'reward_decisions',
        'sessions', 'system_settings', 'task_assignments', 'task_evidences',
        'task_report_photos', 'task_reports', 'task_updates', 'tasks', 'training_plans',
        'training_records', 'training_session_attendance', 'training_sessions', 'units',
        'user_password_history', 'user_roles', 'user_unit_scopes', 'users',
        'weapon_allocations', 'weapon_inventory_checks', 'weapon_inventory_items', 'weapons',
        'work_report_attachments', 'work_reports'];
    fk record;
    child_cols text;
    parent_cols text;
    on_delete text;
    rewritten int := 0;
BEGIN
    FOR fk IN
        SELECT c.conname, c.conrelid, c.confrelid, c.conkey, c.confkey, c.confdeltype,
               c.confupdtype, c.condeferrable
          FROM pg_constraint c
         WHERE c.contype = 'f'
           AND c.connamespace = 'public'::regnamespace
           AND c.conrelid::regclass::text = ANY (tenant_tables)
           AND c.confrelid::regclass::text = ANY (tenant_tables)
         ORDER BY c.conrelid::regclass::text, c.conname
    LOOP
        IF fk.confupdtype <> 'a' OR fk.condeferrable THEN
            RAISE EXCEPTION 'foreign key % has an ON UPDATE action or is deferrable: rewrite it by hand',
                fk.conname;
        END IF;
        SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO child_cols
          FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k.attnum;
        SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO parent_cols
          FROM unnest(fk.confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = fk.confrelid AND a.attnum = k.attnum;
        on_delete := CASE fk.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN format('SET NULL (%s)', child_cols)
        END;
        IF on_delete IS NULL THEN
            RAISE EXCEPTION 'foreign key % has delete rule %: rewrite it by hand',
                fk.conname, fk.confdeltype;
        END IF;
        EXECUTE format(
            'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %s) '
            'REFERENCES %s (tenant_id, %s) ON DELETE %s NOT VALID',
            fk.conrelid::regclass, fk.conname, fk.conname, child_cols,
            fk.confrelid::regclass, parent_cols, on_delete);
        rewritten := rewritten + 1;
    END LOOP;
    -- The schema at this point is fixed by migrations 001-038: a different count means a
    -- foreign key was added or lost and must be reviewed, not silently rewritten
    IF rewritten <> 114 THEN
        RAISE EXCEPTION 'expected 114 foreign keys between tenant tables, rewrote %', rewritten;
    END IF;
END $$;

-- 4. The tenant of every row of the 57 new tenant tables exists (validated online by 040),
--    and Row-Level Security answers for them exactly as for the slice of 037
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'alerts', 'attendance_records', 'auth_challenges', 'ca_dqtv_assignments',
        'conversation_participants', 'conversations', 'device_tokens', 'devices',
        'discipline_appeals', 'discipline_decisions', 'exemptions', 'gps_latest', 'gps_points',
        'incidents', 'kpi_criteria', 'kpi_evaluations', 'kpi_periods', 'kpi_scores',
        'kpi_target_settings', 'leave_approvals', 'leave_balances', 'leave_requests',
        'leave_types', 'messages', 'mfa_recovery_codes', 'mfa_temp_tokens', 'militia_rewards',
        'notification_preferences', 'official_documents', 'organization_units',
        'outbox_events', 'payroll_items', 'payroll_periods', 'payroll_rules',
        'police_profiles', 'recovery_codes', 'recruitment_applications', 'reward_decisions',
        'sessions', 'system_settings', 'task_evidences', 'task_report_photos', 'task_reports',
        'task_updates', 'training_plans', 'training_records', 'training_session_attendance',
        'training_sessions', 'user_password_history', 'user_roles', 'user_unit_scopes',
        'weapon_allocations', 'weapon_inventory_checks', 'weapon_inventory_items', 'weapons',
        'work_report_attachments', 'work_reports'] LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants (id) NOT VALID',
            t, t || '_tenant_id_fkey');
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL TO mms_app
                 USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
    END LOOP;
END $$;

-- 5. Privileges. 036 granted mms_app every FUTURE table of the schema by default, which
--    would hand the runtime role the platform tables of M2 the moment they are created.
--    From here on a table is reachable by mms_app only through an explicit GRANT in its
--    migration (the schema guard test checks every table against an explicit list).
--    The global catalogues are read-only for the runtime role: a tenant must not change
--    what a role means for every other tenant.
--    A default ACL belongs to the role that ran ALTER DEFAULT PRIVILEGES, and a bare
--    "ALTER DEFAULT PRIVILEGES ... REVOKE" only reaches the current role's. 036 may have been
--    run by another superuser than this file, so every default ACL of the schema is read from
--    the catalog and revoked for its own role and each of its grantees. 041 asserts that none
--    is left.
DO $$
DECLARE
    acl record;
BEGIN
    FOR acl IN
        SELECT r.rolname AS owner,
               CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES'
                                    WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' END AS kind,
               CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE quote_ident(g.rolname) END AS grantee
          FROM pg_default_acl d
          JOIN pg_roles r ON r.oid = d.defaclrole
          CROSS JOIN LATERAL aclexplode(d.defaclacl) x
          LEFT JOIN pg_roles g ON g.oid = x.grantee
         WHERE d.defaclnamespace = 'public'::regnamespace AND x.grantee <> d.defaclrole
         GROUP BY 1, 2, 3
    LOOP
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON %s FROM %s',
                       acl.owner, acl.kind, acl.grantee);
    END LOOP;
END $$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON roles, permissions, role_permissions
    FROM mms_app;
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT c.relname FROM pg_class c
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
    LOOP
        EXECUTE format('REVOKE ALL ON %I FROM mms_app', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO mms_app', t);
    END LOOP;
END $$;

-- 6. The revocation announcements of 035 name the tenant, so a replica closes the sockets of
--    the user in that tenant's rooms instead of scanning every socket it holds
CREATE OR REPLACE FUNCTION notify_session_ended() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.revoked_at IS NULL THEN
      PERFORM pg_notify('mms_auth_revocation', json_build_object(
        'kind', 'session', 'userId', OLD.user_id, 'sessionId', OLD.id,
        'tenantId', OLD.tenant_id)::text);
    END IF;
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
        AND NEW.replaced_by IS NULL THEN
    PERFORM pg_notify('mms_auth_revocation', json_build_object(
      'kind', 'session', 'userId', NEW.user_id, 'sessionId', NEW.id,
      'tenantId', NEW.tenant_id)::text);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION notify_account_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.auth_version IS DISTINCT FROM OLD.auth_version
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_notify('mms_auth_revocation', json_build_object(
      'kind', 'account', 'userId', NEW.id,
      'version', NEW.auth_version, 'active', NEW.status = 'active',
      'tenantId', NEW.tenant_id)::text);
  END IF;
  RETURN NULL;
END $$;

-- 7. Catalog assertions: the cutover is all or nothing
DO $$
DECLARE
    problems text[];
BEGIN
    SELECT array_agg(format('%s: %s', c.relname, p.problem) ORDER BY c.relname)
      INTO problems
      FROM pg_class c
      CROSS JOIN LATERAL (
          SELECT 'tenant_id is not uuid NOT NULL DEFAULT app_tenant_id()' AS problem
           WHERE NOT EXISTS (
               SELECT 1 FROM pg_attribute a
                 JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnotnull
                  AND a.atttypid = 'uuid'::regtype
                  AND pg_get_expr(d.adbin, d.adrelid) = 'app_tenant_id()')
          UNION ALL
          SELECT 'row-level security is not enabled and forced'
           WHERE NOT (c.relrowsecurity AND c.relforcerowsecurity)
          UNION ALL
          SELECT 'has no tenant_isolation policy'
           WHERE NOT EXISTS (SELECT 1 FROM pg_policy p
                              WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
          UNION ALL
          SELECT format('foreign key %s to tenant table %s does not include tenant_id',
                        f.conname, f.confrelid::regclass)
            FROM pg_constraint f
           WHERE f.conrelid = c.oid AND f.contype = 'f'
             AND f.confrelid <> 'tenants'::regclass
             AND EXISTS (SELECT 1 FROM pg_attribute pa
                          WHERE pa.attrelid = f.confrelid AND pa.attname = 'tenant_id')
             AND NOT EXISTS (SELECT 1 FROM unnest(f.conkey) k
                               JOIN pg_attribute ka ON ka.attrelid = f.conrelid AND ka.attnum = k
                              WHERE ka.attname = 'tenant_id')
      ) p
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname NOT IN ('schema_migrations', 'tenants', 'roles', 'permissions',
                             'role_permissions', 'login_attempts');
    IF problems IS NOT NULL THEN
        RAISE EXCEPTION 'tenant isolation is incomplete: %', array_to_string(problems, '; ');
    END IF;
END $$;

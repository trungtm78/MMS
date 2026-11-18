-- Migration 037: tenant_id and row-level security on the M0 slice.
-- Every existing row belongs to the first tenant. The column is added with that constant as
-- its default (PostgreSQL keeps a constant default in the catalog, so the table is not
-- rewritten) and the default then becomes the tenant of the session.
-- This is NOT an online change. REFERENCES tenants(id) makes each table be scanned to
-- validate the foreign key, and the foreign key, the tenant_id index and the per-tenant
-- unique constraints are built under exclusive table locks, all in this one transaction:
-- users and audit_logs, among others, block readers and writers for as long as that takes.
-- Measure it on a production-sized copy; M1, which does this to ~60 more tables, must
-- build online.

DO $$
DECLARE
    t text;
    first_tenant constant uuid := 'a1000000-0000-4000-8000-000000000001';
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'units', 'militia_profiles', 'tasks', 'task_assignments',
                             'files', 'notifications', 'notification_receipts', 'audit_logs'] LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)',
            t, first_tenant);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT app_tenant_id()', t);
        EXECUTE format('CREATE INDEX idx_%s_tenant ON %I (tenant_id)', t, t);
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL TO mms_app
                 USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
    END LOOP;
END $$;

-- Natural keys are unique per tenant
ALTER TABLE users
    DROP CONSTRAINT users_username_key,
    DROP CONSTRAINT users_email_key,
    ADD CONSTRAINT uq_users_tenant_username UNIQUE (tenant_id, username),
    ADD CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email);
ALTER TABLE units
    DROP CONSTRAINT units_code_key,
    ADD CONSTRAINT uq_units_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE militia_profiles
    DROP CONSTRAINT militia_profiles_militia_code_key,
    DROP CONSTRAINT militia_profiles_cccd_key,
    ADD CONSTRAINT uq_militia_profiles_tenant_code UNIQUE (tenant_id, militia_code),
    ADD CONSTRAINT uq_militia_profiles_tenant_cccd UNIQUE (tenant_id, cccd);
DROP INDEX uidx_militia_cccd_lookup;
CREATE UNIQUE INDEX uidx_militia_cccd_lookup
    ON militia_profiles (tenant_id, cccd_lookup_hash) WHERE cccd_lookup_hash IS NOT NULL;
ALTER TABLE tasks
    DROP CONSTRAINT tasks_code_key,
    ADD CONSTRAINT uq_tasks_tenant_code UNIQUE (tenant_id, code);

-- Legacy single-tenant mode (TENANCY_MODE=legacy, the default until M1): sessions that
-- never write a tenant, such as migrations, admin tools and the application itself in
-- legacy mode, inherit the first tenant. M1 removes this with
--   ALTER DATABASE <db> RESET app.tenant_id
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET app.tenant_id = %L', current_database(),
                   'a1000000-0000-4000-8000-000000000001');
END $$;

-- Migration 036: tenants, tenant context function, database roles (multi-tenancy M0)
-- The first tenant owns every pre-existing row (see 037).

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('provisioning', 'pending_activation', 'active', 'suspended',
                          'read_only', 'offboarding', 'archived')),
    parent_tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tenants_code CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
);
CREATE UNIQUE INDEX uq_tenants_code ON tenants (lower(code));

INSERT INTO tenants (id, code, name)
VALUES ('a1000000-0000-4000-8000-000000000001', 'phu-dinh', 'Phường Phú Định');

-- The tenant of the current database session; empty or unset means "no tenant"
CREATE FUNCTION app_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Roles are cluster-wide: tolerate them existing, and two migrators racing to create them
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['mms_app', 'mms_platform'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            BEGIN
                EXECUTE format(
                    'CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', r);
            EXCEPTION WHEN duplicate_object OR unique_violation THEN
                NULL;
            END;
        END IF;
    END LOOP;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO mms_app, mms_platform', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO mms_app, mms_platform;

-- The runtime role reads and writes the application tables, never the migration history
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mms_app;
REVOKE ALL ON schema_migrations FROM mms_app;
REVOKE INSERT, UPDATE, DELETE ON tenants FROM mms_app;

-- The platform role manages tenants and nothing else
GRANT SELECT, INSERT, UPDATE ON tenants TO mms_platform;

-- tenants is not FORCE-d: the SECURITY DEFINER functions below run as its owner and read
-- all rows, while the runtime role sees only its own tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_own_row ON tenants FOR SELECT TO mms_app
    USING (id = app_tenant_id());
CREATE POLICY tenants_platform ON tenants FOR ALL TO mms_platform
    USING (true) WITH CHECK (true);

-- Sign-in resolves the tenant code before any tenant is known
CREATE FUNCTION auth_tenant_by_code(p_code text)
    RETURNS TABLE (id uuid, status text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT t.id, t.status::text FROM tenants t WHERE lower(t.code) = lower(btrim(p_code)) $$;

-- Background jobs enumerate the tenants to run for
CREATE FUNCTION maintenance_tenant_ids()
    RETURNS TABLE (id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT t.id FROM tenants t WHERE t.status <> 'archived' ORDER BY t.code $$;

REVOKE ALL ON FUNCTION auth_tenant_by_code(text), maintenance_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_tenant_by_code(text), maintenance_tenant_ids() TO mms_app;

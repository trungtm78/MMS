-- Migration 041: catalog assertion of tenant isolation (M1a).
--
-- 038 prepared the schema online, 039 cut it over in one transaction, 040 validated every
-- foreign key 039 added NOT VALID. This file proves the result from the catalog and changes
-- nothing: it is transactional, so a failed assertion leaves 041 unrecorded and the next
-- start asserts again. 040 can be marked applied while one of its statements was skipped
-- by hand, or an index build can have been interrupted: neither passes this file.
--
-- The checks run against the schema as it is when this file is applied, which is why the
-- counts are exact: 66 tenant tables (every table of the public schema except the 6 global
-- ones named below) and 114 foreign keys between them.
DO $$
DECLARE
    global_tables constant text[] := ARRAY['schema_migrations', 'tenants', 'roles',
        'permissions', 'role_permissions', 'login_attempts'];
    tenant_tables oid[];
    problems text[] := '{}';
    found text[];
    n integer;
BEGIN
    SELECT array_agg(c.oid ORDER BY c.relname)
      INTO tenant_tables
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname <> ALL (global_tables);

    -- 66 tenant tables
    IF coalesce(cardinality(tenant_tables), 0) <> 66 THEN
        problems := problems || format('expected 66 tenant tables, found %s',
            coalesce(cardinality(tenant_tables), 0));
    END IF;

    -- Row-level security is enabled and forced on every one
    SELECT array_agg(c.relname::text ORDER BY c.relname)
      INTO found
      FROM pg_class c
     WHERE c.oid = ANY (tenant_tables)
       AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
    IF found IS NOT NULL THEN
        problems := problems || format(
            'row-level security is not enabled and forced on: %s',
            array_to_string(found, ', '));
    END IF;

    -- The policy is exactly the template: one permissive policy for all commands, for
    -- mms_app only, on both sides the tenant of the row equals the tenant of the session.
    -- Its name alone proves nothing: a permissive USING (true) policy under the same name,
    -- or a second permissive policy, would open the table to every tenant.
    SELECT array_agg(c.relname::text ORDER BY c.relname)
      INTO found
      FROM pg_class c
     WHERE c.oid = ANY (tenant_tables)
       AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) <> 1;
    IF found IS NOT NULL THEN
        problems := problems || format(
            'a tenant table must have exactly one policy, tenant_isolation, but does not: %s',
            array_to_string(found, ', '));
    END IF;

    SELECT array_agg(c.relname::text ORDER BY c.relname)
      INTO found
      FROM pg_class c
     WHERE c.oid = ANY (tenant_tables)
       AND NOT EXISTS (
           SELECT 1 FROM pg_policy p
            WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
              AND p.polpermissive AND p.polcmd = '*'
              AND p.polroles = ARRAY['mms_app'::regrole::oid]
              AND pg_get_expr(p.polqual, p.polrelid) = '(tenant_id = app_tenant_id())'
              AND pg_get_expr(p.polwithcheck, p.polrelid) = '(tenant_id = app_tenant_id())');
    IF found IS NOT NULL THEN
        problems := problems || format(
            'the tenant_isolation policy differs from the template on: %s',
            array_to_string(found, ', '));
    END IF;

    -- tenant_id is uuid NOT NULL DEFAULT app_tenant_id() on every one
    SELECT array_agg(c.relname::text ORDER BY c.relname)
      INTO found
      FROM pg_class c
     WHERE c.oid = ANY (tenant_tables)
       AND NOT EXISTS (
           SELECT 1 FROM pg_attribute a
             JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnotnull
              AND NOT a.attisdropped AND a.atttypid = 'uuid'::regtype
              AND pg_get_expr(d.adbin, d.adrelid) = 'app_tenant_id()');
    IF found IS NOT NULL THEN
        problems := problems || format(
            'tenant_id is not uuid NOT NULL DEFAULT app_tenant_id() on: %s',
            array_to_string(found, ', '));
    END IF;

    -- No default privileges in the schema, for any role: a table created later (the platform
    -- tables of M2) must not reach the runtime role without an explicit grant
    SELECT array_agg(DISTINCT r.rolname::text)
      INTO found
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
     WHERE d.defaclnamespace = 'public'::regnamespace;
    IF found IS NOT NULL THEN
        problems := problems || format(
            'default privileges are still set in schema public by: %s',
            array_to_string(found, ', '));
    END IF;

    -- A global table never references a tenant table: that would leak a tenant's rows
    -- into a table every tenant reads
    SELECT array_agg(format('%s.%s', f.conrelid::regclass, f.conname)
                     ORDER BY f.conrelid::regclass::text, f.conname)
      INTO found
      FROM pg_constraint f
     WHERE f.contype = 'f'
       AND f.conrelid IN (SELECT c.oid FROM pg_class c
                           WHERE c.relnamespace = 'public'::regnamespace
                             AND c.relname = ANY (global_tables))
       AND f.confrelid = ANY (tenant_tables);
    IF found IS NOT NULL THEN
        problems := problems || format(
            'global tables reference tenant tables: %s', array_to_string(found, ', '));
    END IF;

    -- No foreign key of the schema is left NOT VALID
    SELECT array_agg(format('%s.%s', f.conrelid::regclass, f.conname) ORDER BY f.conrelid::regclass::text, f.conname)
      INTO found
      FROM pg_constraint f
     WHERE f.connamespace = 'public'::regnamespace AND f.contype = 'f'
       AND NOT f.convalidated;
    IF found IS NOT NULL THEN
        problems := problems || format('foreign keys not validated: %s',
            array_to_string(found, ', '));
    END IF;

    -- Every tenant table has exactly one validated foreign key tenant_id -> tenants
    SELECT array_agg(c.relname::text ORDER BY c.relname)
      INTO found
      FROM pg_class c
     WHERE c.oid = ANY (tenant_tables)
       AND (SELECT count(*)
              FROM pg_constraint f
              JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attname = 'tenant_id'
             WHERE f.conrelid = c.oid AND f.contype = 'f' AND f.convalidated
               AND f.confrelid = 'tenants'::regclass
               AND f.conkey = ARRAY[a.attnum]) <> 1;
    IF found IS NOT NULL THEN
        problems := problems || format(
            'no single validated tenant_id foreign key to tenants on: %s',
            array_to_string(found, ', '));
    END IF;

    -- Between two tenant tables a foreign key is composite: tenant_id pairs with the
    -- parent's tenant_id at the same position. There are 114 of them.
    SELECT count(*) INTO n
      FROM pg_constraint f
     WHERE f.contype = 'f' AND f.conrelid = ANY (tenant_tables)
       AND f.confrelid = ANY (tenant_tables);
    IF n <> 114 THEN
        problems := problems || format(
            'expected 114 foreign keys between tenant tables, found %s', n);
    END IF;

    SELECT array_agg(format('%s.%s', f.conrelid::regclass, f.conname) ORDER BY f.conrelid::regclass::text, f.conname)
      INTO found
      FROM pg_constraint f
     WHERE f.contype = 'f' AND f.conrelid = ANY (tenant_tables)
       AND f.confrelid = ANY (tenant_tables)
       AND NOT EXISTS (
           SELECT 1
             FROM generate_subscripts(f.conkey, 1) i
             JOIN pg_attribute ca ON ca.attrelid = f.conrelid
                                 AND ca.attnum = f.conkey[i] AND ca.attname = 'tenant_id'
             JOIN pg_attribute pa ON pa.attrelid = f.confrelid
                                 AND pa.attnum = f.confkey[i] AND pa.attname = 'tenant_id');
    IF found IS NOT NULL THEN
        problems := problems || format(
            'single-column foreign keys between tenant tables: %s',
            array_to_string(found, ', '));
    END IF;

    -- No index of the schema is invalid or unready (an interrupted CONCURRENTLY build)
    SELECT array_agg(i.relname::text ORDER BY i.relname)
      INTO found
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class c ON c.oid = x.indrelid
     WHERE c.relnamespace = 'public'::regnamespace
       AND NOT (x.indisvalid AND x.indisready);
    IF found IS NOT NULL THEN
        problems := problems || format('invalid indexes: %s',
            array_to_string(found, ', '));
    END IF;

    IF cardinality(problems) > 0 THEN
        RAISE EXCEPTION 'tenant isolation assertion failed: %',
            array_to_string(problems, '; ');
    END IF;
END $$;

// Plants rows in every tenant table of a tenant, driven by the catalog, so the isolation
// proofs cover each table without a hand-written fixture per table. A table added later is
// seeded (and swept) automatically, or the seeder fails and names the table and column.
//
// Value of a column, first rule that applies:
//  1. COLUMN_VALUES, by `table.column` then by `column` (cross-column CHECKs, periods).
//  2. tenant_id: the tenant. The uuid primary key `id`: left to its default.
//  3. A foreign-key column: the parent row seeded earlier in the same batch (tables go
//     parents first). A self-reference stays NULL. A key to a global table (roles) takes the
//     first row of that table.
//  4. A column with a default is left to it, except a text column no CHECK involves: that
//     one gets the canary, so a leak of it is visible.
//  5. A nullable column that a CHECK ties to other columns (other than a list of allowed
//     values) stays NULL: those CHECKs couple columns (returned_at, decided_*, expiry_date).
//  6. A column whose CHECK is a list of allowed values takes the first value.
//  7. By type: text -> CANARY-<label>-<uuid>, cut to the column length when it is at least
//     20 characters, else <label> + random digits (a 12-character cccd must stay unique);
//     uuid -> a random id; numbers -> 1; boolean -> false;
//     date -> a June 2026 day chosen by the batch; timestamps -> now; json -> {canary};
//     text[] -> [canary]; another array -> NULL when nullable.
import { randomBytes, randomUUID } from 'crypto';
import type { Client } from 'pg';
import { tenantTables } from './tenancy-catalog';

export interface ColumnShape {
  name: string;
  /** format_type, e.g. 'character varying(50)' */
  type: string;
  /** pg_type.typcategory: S string, N numeric, B boolean, D date/time, U uuid/json, A array, I inet */
  category: string;
  /** pg_type.typname, e.g. 'varchar', 'uuid', 'jsonb', '_text' */
  baseType: string;
  maxLength: number | null;
  notNull: boolean;
  hasDefault: boolean;
  /** The values of a single-column CHECK (col IN (...)) */
  allowed: string[] | null;
  /** Involved in any other CHECK */
  inOtherCheck: boolean;
}

export interface ForeignKeyShape {
  name: string;
  /** Referencing columns, tenant_id left out */
  columns: string[];
  parent: string;
  parentColumns: string[];
  /** The parent is a global table */
  global: boolean;
}

export interface TableShape {
  name: string;
  columns: ColumnShape[];
  foreignKeys: ForeignKeyShape[];
}

export type Row = Record<string, unknown>;
export type SeededRows = Map<string, Row>;

export interface SeedContext {
  tenantId: string;
  /** 'A' or 'B': text values read CANARY-<label>-<uuid> */
  label: string;
  /** Tells repeated seedings of one tenant apart (periods, dates) */
  batch: number;
}

export interface SeedOptions extends SeedContext {
  /**
   * Only the rows a row of this table can point at: its parents, theirs in turn, and the
   * table itself when it references itself. No row of the table is planted, so a row built
   * for it afterwards meets no unique key of an earlier one.
   */
  ancestorsOf?: string;
}

/** One foreign key of a row built for another purpose, pointed at a given parent row. */
export interface Swap {
  foreignKey: string;
  parent: Row;
}

export const canaryOf = (label: string): string =>
  `CANARY-${label}-${randomUUID()}`;

export const dateFor = (batch: number): string =>
  `2026-06-${String(((batch - 1) % 28) + 1).padStart(2, '0')}`;

const monthFor = (batch: number): number => ((batch - 1) % 12) + 1;

const randomDigits = (count: number): string =>
  Array.from(randomBytes(Math.max(count, 0)), (byte) => String(byte % 10)).join(
    '',
  );

export const quoteIdent = (name: string): string =>
  `"${name.replace(/"/g, '""')}"`;

const COLUMN_VALUES: Readonly<Record<string, (ctx: SeedContext) => unknown>> = {
  year: () => 2026,
  // Periods are unique per tenant and (year, month): one month per batch
  month: (ctx) => monthFor(ctx.batch),
  // A decided appeal (upheld) leaves its decision 'active', which the deferred
  // appeal-state trigger of migration 026 accepts with or without the appeal row
  'discipline_decisions.status': () => 'active',
  'discipline_appeals.outcome': () => 'upheld',
  'discipline_appeals.resolution': (ctx) => canaryOf(ctx.label),
  'discipline_appeals.decided_date': (ctx) => dateFor(ctx.batch),
  'discipline_appeals.decided_at': () => new Date(),
};

const OMIT = Symbol('omit');

// CHECK ((status)::text = ANY ((ARRAY['a'::character varying, 'b'::character varying])::text[]))
function allowedValues(definition: string): string[] | null {
  if (!/= ANY \(+ARRAY\[/.test(definition)) return null;
  const values = [...definition.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    m[1].replace(/''/g, "'"),
  );
  return values.length > 0 ? values : null;
}

/** Every tenant table with its columns and foreign keys, parents before children. */
export async function readTenantSchema(c: Client): Promise<TableShape[]> {
  const tables = await tenantTables(c);
  const tableSet = new Set(tables);
  const columns = (
    await c.query<ColumnShape & { table: string }>(
      `SELECT c.relname AS "table", a.attname AS name,
              format_type(a.atttypid, a.atttypmod) AS type,
              t.typcategory AS category, t.typname AS "baseType",
              CASE WHEN t.typname IN ('varchar', 'bpchar') AND a.atttypmod > 4
                   THEN a.atttypmod - 4 END AS "maxLength",
              a.attnotnull AS "notNull", a.atthasdef AS "hasDefault",
              NULL::text[] AS allowed, false AS "inOtherCheck"
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_type t ON t.oid = a.atttypid
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum`,
      [tables],
    )
  ).rows;
  const checks = (
    await c.query<{ table: string; definition: string; columns: string[] }>(
      `SELECT c.relname AS "table", pg_get_constraintdef(k.oid) AS definition,
              ARRAY(SELECT a.attname FROM unnest(k.conkey) AS n(attnum)
                      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = n.attnum
                   )::text[] AS columns
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
        WHERE k.contype = 'c' AND c.relnamespace = 'public'::regnamespace
          AND c.relname = ANY ($1)`,
      [tables],
    )
  ).rows;
  for (const check of checks) {
    const allowed =
      check.columns.length === 1 ? allowedValues(check.definition) : null;
    for (const name of check.columns) {
      const column = columns.find(
        (col) => col.table === check.table && col.name === name,
      );
      if (!column) continue;
      if (allowed) column.allowed = allowed;
      else column.inOtherCheck = true;
    }
  }
  const keys = (
    await c.query<{
      table: string;
      name: string;
      parent: string;
      columns: string[];
      parentColumns: string[];
    }>(
      `SELECT c.relname AS "table", f.conname AS name, p.relname AS parent,
              ARRAY(SELECT a.attname FROM unnest(f.conkey) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.attnum
                     ORDER BY k.ord)::text[] AS columns,
              ARRAY(SELECT a.attname FROM unnest(f.confkey) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = f.confrelid AND a.attnum = k.attnum
                     ORDER BY k.ord)::text[] AS "parentColumns"
         FROM pg_constraint f
         JOIN pg_class c ON c.oid = f.conrelid
         JOIN pg_class p ON p.oid = f.confrelid
        WHERE f.contype = 'f' AND c.relnamespace = 'public'::regnamespace
          AND c.relname = ANY ($1) AND p.relname <> 'tenants'`,
      [tables],
    )
  ).rows;
  const shapes = tables.map((name) => ({
    name,
    columns: columns
      .filter((col) => col.table === name)
      .map(
        (col): ColumnShape => ({
          name: col.name,
          type: col.type,
          category: col.category,
          baseType: col.baseType,
          maxLength: col.maxLength,
          notNull: col.notNull,
          hasDefault: col.hasDefault,
          allowed: col.allowed,
          inOtherCheck: col.inOtherCheck,
        }),
      ),
    foreignKeys: keys
      .filter((k) => k.table === name)
      .map((k) => {
        const kept = k.columns
          .map((column, i) => [column, k.parentColumns[i]] as const)
          .filter(([column]) => column !== 'tenant_id');
        return {
          name: k.name,
          columns: kept.map(([column]) => column),
          parent: k.parent,
          parentColumns: kept.map(([, parentColumn]) => parentColumn),
          global: !tableSet.has(k.parent),
        };
      }),
  }));
  return topological(shapes);
}

function topological(shapes: TableShape[]): TableShape[] {
  const byName = new Map(shapes.map((s) => [s.name, s]));
  const state = new Map<string, 'visiting' | 'done'>();
  const ordered: TableShape[] = [];
  const visit = (shape: TableShape, path: string[]): void => {
    if (state.get(shape.name) === 'done') return;
    if (state.get(shape.name) === 'visiting') {
      throw new Error(
        `Foreign key cycle: ${[...path, shape.name].join(' -> ')}`,
      );
    }
    state.set(shape.name, 'visiting');
    for (const fk of shape.foreignKeys) {
      const parent = byName.get(fk.parent);
      if (parent && parent.name !== shape.name)
        visit(parent, [...path, shape.name]);
    }
    state.set(shape.name, 'done');
    ordered.push(shape);
  };
  shapes.forEach((shape) => visit(shape, []));
  return ordered;
}

/** The first row of every global table a tenant table references. */
export async function globalRows(
  c: Client,
  shapes: TableShape[],
): Promise<SeededRows> {
  const parents = new Set(
    shapes.flatMap((s) =>
      s.foreignKeys.filter((k) => k.global).map((k) => k.parent),
    ),
  );
  const rows: SeededRows = new Map();
  for (const parent of parents) {
    const [first] = (
      await c.query<Row>(
        `SELECT * FROM ${quoteIdent(parent)} ORDER BY 1 LIMIT 1`,
      )
    ).rows;
    if (!first) throw new Error(`Global table ${parent} is empty`);
    rows.set(parent, first);
  }
  return rows;
}

function byType(
  shape: TableShape,
  column: ColumnShape,
  ctx: SeedContext,
): unknown {
  switch (column.category) {
    case 'S': {
      const canary = canaryOf(ctx.label);
      if (column.maxLength === null || column.maxLength >= canary.length)
        return canary;
      // Room for the marker and enough randomness to stay unique: CANARY-B- + 11 hex digits
      if (column.maxLength >= 20) return canary.slice(0, column.maxLength);
      // Too short for a marker that stays unique (cccd is 12): the label and random digits
      return `${ctx.label}${randomDigits(column.maxLength - ctx.label.length)}`;
    }
    case 'N':
      return 1;
    case 'B':
      return false;
    case 'D':
      return column.baseType === 'date' ? dateFor(ctx.batch) : new Date();
    case 'I':
      return '127.0.0.1';
    case 'U':
      if (column.baseType === 'uuid') return randomUUID();
      if (column.baseType === 'json' || column.baseType === 'jsonb') {
        return { canary: canaryOf(ctx.label) };
      }
      break;
    case 'A':
      if (column.baseType === '_text' || column.baseType === '_varchar') {
        return [canaryOf(ctx.label)];
      }
      if (!column.notNull) return null;
      if (column.baseType === '_uuid') return [randomUUID()];
      break;
  }
  if (!column.notNull) return null;
  throw new Error(
    `No value rule for ${shape.name}.${column.name} (${column.type}): add one to COLUMN_VALUES`,
  );
}

function valueFor(
  shape: TableShape,
  column: ColumnShape,
  ctx: SeedContext,
  keys: ForeignKeyShape[],
  parents: SeededRows,
  globals: SeededRows,
): unknown {
  const explicit =
    COLUMN_VALUES[`${shape.name}.${column.name}`] ?? COLUMN_VALUES[column.name];
  if (explicit) return explicit(ctx);
  const fk = keys.find((k) => k.columns.includes(column.name));
  if (fk) {
    if (fk.parent === shape.name) return null;
    const parent = (fk.global ? globals : parents).get(fk.parent);
    if (!parent) {
      throw new Error(
        `${shape.name}.${column.name}: no seeded ${fk.parent} row`,
      );
    }
    return parent[fk.parentColumns[fk.columns.indexOf(column.name)]];
  }
  const plainText =
    column.category === 'S' && column.allowed === null && !column.inOtherCheck;
  if (column.hasDefault && !plainText) return OMIT;
  if (!column.notNull && column.inOtherCheck) return null;
  if (column.allowed) return column.allowed[0];
  return byType(shape, column, ctx);
}

/** A valid row of `shape` for `ctx.tenantId`, its foreign keys pointing at `parents`. */
export function buildRow(
  shape: TableShape,
  ctx: SeedContext,
  parents: SeededRows,
  globals: SeededRows,
  swap?: Swap,
): Row {
  const row: Row = { tenant_id: ctx.tenantId };
  const filled = new Set(['tenant_id', 'id']);
  // Multi-column keys first: they fix every column they share with a single-column one
  const keys = [...shape.foreignKeys].sort(
    (x, y) => y.columns.length - x.columns.length,
  );
  if (swap) {
    const fk = keys.find((k) => k.name === swap.foreignKey);
    if (!fk)
      throw new Error(`${shape.name} has no foreign key ${swap.foreignKey}`);
    fk.columns.forEach((column, i) => {
      row[column] = swap.parent[fk.parentColumns[i]];
      filled.add(column);
    });
  }
  for (const column of shape.columns) {
    if (filled.has(column.name)) continue;
    const value = valueFor(shape, column, ctx, keys, parents, globals);
    if (value !== OMIT) row[column.name] = value;
  }
  return row;
}

export async function insertRow(
  c: Client,
  table: string,
  row: Row,
): Promise<Row> {
  const names = Object.keys(row);
  const { rows } = await c.query<Row>(
    `INSERT INTO ${quoteIdent(table)} (${names.map(quoteIdent).join(', ')})
     VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    names.map((name) => row[name]),
  );
  return rows[0];
}

function ancestorClosure(shapes: TableShape[], table: string): TableShape[] {
  const byName = new Map(shapes.map((s) => [s.name, s]));
  if (!byName.has(table)) throw new Error(`${table} is not a tenant table`);
  const keep = new Set<string>();
  const add = (name: string): void => {
    if (keep.has(name)) return;
    keep.add(name);
    for (const fk of byName.get(name)?.foreignKeys ?? []) {
      if (!fk.global) add(fk.parent);
    }
  };
  for (const fk of byName.get(table)?.foreignKeys ?? []) {
    if (!fk.global) add(fk.parent);
  }
  return shapes.filter((shape) => keep.has(shape.name));
}

/**
 * One row in every tenant table (or every ancestor table of one) of `options.tenantId`, in one
 * transaction, as the connected role (an admin connection writes tenant_id explicitly).
 */
export async function seedCanaryRows(
  c: Client,
  options: SeedOptions,
): Promise<SeededRows> {
  const shapes = await readTenantSchema(c);
  const globals = await globalRows(c, shapes);
  const wanted = options.ancestorsOf
    ? ancestorClosure(shapes, options.ancestorsOf)
    : shapes;
  const seeded: SeededRows = new Map();
  let current = '';
  await c.query('BEGIN');
  try {
    for (const shape of wanted) {
      current = shape.name;
      seeded.set(
        shape.name,
        await insertRow(
          c,
          shape.name,
          buildRow(shape, options, seeded, globals),
        ),
      );
    }
    current = 'COMMIT (deferred constraint triggers)';
    await c.query('COMMIT');
  } catch (error) {
    await c.query('ROLLBACK');
    throw new Error(
      `Seeding ${current} of tenant ${options.label} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return seeded;
}

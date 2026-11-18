// Every route of the application as the isolation sweep calls it: its path parameters and
// the id fields of its body and query, each mapped to the tenant table whose ids it takes.
// A route whose parameter or id field is not mapped fails the coverage test, so a new route
// cannot stay out of the sweep. Read the service query that consumes a parameter before
// mapping it: the map is what makes the sweep send the other tenant's id where it matters.
import { RequestMethod, type INestApplication } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { getMetadataStorage } from 'class-validator';
import { AttendanceEntryDto } from '../../src/training/dto/training-plan.dto';
import { InventoryItemDto } from '../../src/weapons/dto/record-inventory.dto';

export type DtoClass = new (...args: never[]) => object;

export interface SweptRoute {
  /** 'GET', 'POST', ... */
  method: string;
  /** Without the global prefix, e.g. '/tasks/:id' */
  path: string;
  /** `${method} ${path}`, the key of PATH_PARAMS */
  key: string;
  pathParams: string[];
  bodyDto: DtoClass | null;
  /** @Body('name') single fields */
  bodyFields: string[];
  queryDto: DtoClass | null;
  queryFields: string[];
}

export interface IdField {
  /** Dotted path in the payload, e.g. 'attendance.memberId' */
  path: string;
  name: string;
  /** The DTO class declaring it */
  dto: string;
  array: boolean;
}

// Path parameter -> tenant table, per route. Checked against each service's query.
export const PATH_PARAMS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  'DELETE /assignments/:id': { id: 'ca_dqtv_assignments' },
  'DELETE /devices/:sessionId': { sessionId: 'sessions' },
  'DELETE /devices/sessions/:id': { id: 'sessions' },
  'DELETE /militia/:id': { id: 'militia_profiles' },
  'DELETE /notifications/:id': { id: 'notifications' },
  'DELETE /official-documents/:id': { id: 'official_documents' },
  'DELETE /organization/units/:id': { id: 'organization_units' },
  'DELETE /recruitment/applications/:id': { id: 'recruitment_applications' },
  'DELETE /tasks/:id': { id: 'tasks' },
  'DELETE /training/:id': { id: 'training_records' },
  'DELETE /weapons/:id': { id: 'weapons' },
  'GET /admin/users/:id': { id: 'users' },
  'GET /chat/conversations/:id/messages': { id: 'conversations' },
  'GET /discipline/:id': { id: 'discipline_decisions' },
  'GET /files/:id': { id: 'files' },
  'GET /gps/history/:id': { id: 'militia_profiles' },
  'GET /leave/:id': { id: 'leave_requests' },
  'GET /militia/:id': { id: 'militia_profiles' },
  'GET /militia/:id/documents': { id: 'militia_profiles' },
  'GET /militia/:id/history': { id: 'militia_profiles' },
  'GET /militia/:id/rewards': { id: 'militia_profiles' },
  'GET /official-documents/:id': { id: 'official_documents' },
  'GET /organization/units/:id': { id: 'organization_units' },
  'GET /payroll/periods/:id/export-pdf': { id: 'payroll_periods' },
  'GET /recruitment/applications/:id': { id: 'recruitment_applications' },
  'GET /rewards/:id': { id: 'reward_decisions' },
  'GET /sos/:id': { id: 'incidents' },
  'GET /tasks/:id': { id: 'tasks' },
  'GET /training/:id': { id: 'training_records' },
  'GET /training/plans/:id': { id: 'training_plans' },
  'GET /training/sessions/:id': { id: 'training_sessions' },
  'GET /training/sessions/:id/members': { id: 'training_sessions' },
  'GET /weapons/:id': { id: 'weapons' },
  'GET /weapons/inventory/:id': { id: 'weapon_inventory_checks' },
  'GET /work-reports/:id': { id: 'work_reports' },
  'PATCH /admin/users/:id/role': { id: 'users' },
  'PATCH /admin/users/:id/status': { id: 'users' },
  'PATCH /discipline/:id/appeal': { id: 'discipline_decisions' },
  'PATCH /discipline/:id/appeal/decision': { id: 'discipline_decisions' },
  'PATCH /exemptions/:id/review': { id: 'exemptions' },
  'PATCH /leave/:id/cancel': { id: 'leave_requests' },
  'PATCH /leave/:id/review': { id: 'leave_requests' },
  'PATCH /militia/:id': { id: 'militia_profiles' },
  'PATCH /notifications/:id/read': { id: 'notifications' },
  'PATCH /official-documents/:id': { id: 'official_documents' },
  'PATCH /organization/positions/:id': { id: 'organization_units' },
  'PATCH /organization/units/:id': { id: 'organization_units' },
  'PATCH /payroll/kpi/:militiaId': { militiaId: 'militia_profiles' },
  'PATCH /recruitment/applications/:id': { id: 'recruitment_applications' },
  'PATCH /sos/:id/status': { id: 'incidents' },
  'PATCH /tasks/:id': { id: 'tasks' },
  'PATCH /tasks/:id/progress': { id: 'tasks' },
  'PATCH /training/:id': { id: 'training_records' },
  'PATCH /training/plans/:id/status': { id: 'training_plans' },
  'PATCH /weapons/:id': { id: 'weapons' },
  'PATCH /weapons/allocations/:id/return': { id: 'weapon_allocations' },
  'PATCH /work-reports/:id/review': { id: 'work_reports' },
  'POST /admin/users/:id/mfa/reset': { id: 'users' },
  'POST /admin/users/:id/reset-password': { id: 'users' },
  'POST /chat/conversations/:id/messages': { id: 'conversations' },
  'POST /chat/conversations/:id/read': { id: 'conversations' },
  'POST /militia/:id/documents': { id: 'militia_profiles' },
  'POST /payroll/periods/:id/calculate': { id: 'payroll_periods' },
  'POST /payroll/periods/:id/lock': { id: 'payroll_periods' },
  'POST /payroll/periods/:id/reopen': { id: 'payroll_periods' },
  'POST /tasks/:id/accept': { id: 'tasks' },
  'POST /tasks/:id/report': { id: 'tasks' },
  'POST /training/sessions/:id/attendance': { id: 'training_sessions' },
  'PUT /approvals/:id/approve': { id: 'leave_requests' },
  'PUT /approvals/:id/reject': { id: 'leave_requests' },
};

// Id field of a body or query DTO -> tenant table. `Dto.field` wins over `field`.
export const FIELD_TABLES: Readonly<Record<string, string>> = {
  caUserId: 'users',
  dqtvUserId: 'users',
  userId: 'users',
  targetUserId: 'users',
  replacementId: 'users',
  assignedTo: 'users',
  participantIds: 'users',
  militiaId: 'militia_profiles',
  memberId: 'militia_profiles',
  assigneeMilitiaId: 'militia_profiles',
  commanderId: 'militia_profiles',
  recipientId: 'militia_profiles',
  leaveTypeId: 'leave_types',
  fileId: 'files',
  fileIds: 'files',
  attachmentIds: 'files',
  photoIds: 'files',
  unitId: 'units',
  periodId: 'payroll_periods',
  planId: 'training_plans',
  weaponId: 'weapons',
  // weapons.responsible_person_id and official_documents.related_* are foreign keys
  responsiblePersonId: 'militia_profiles',
  relatedMilitiaId: 'militia_profiles',
  relatedUnitId: 'units',
  // audit_logs.actor_id is a foreign key to users
  actorId: 'users',
  // audit_logs.entity_id is polymorphic (the id of any audited row, no foreign key): the
  // table the audit query reads is audit_logs, which RLS isolates
  entityId: 'audit_logs',
  'CreateUnitDto.parentId': 'organization_units',
  'UpdateUnitDto.parentId': 'organization_units',
};

// Fields that match the id-name rule but hold free text, not a reference to any row. Keyed
// `Dto.field`, with the reason: organization_units.ward_id is a varchar(50) label with no
// foreign key, and no query joins it to a table.
export const FREE_TEXT_FIELDS: Readonly<Record<string, string>> = {
  'CreateUnitDto.wardId':
    'organization_units.ward_id is a free-text varchar(50) label',
  'UpdateUnitDto.wardId':
    'organization_units.ward_id is a free-text varchar(50) label',
};

// String fields naming a row by its code: the sweep sends the other tenant's code
export const CODE_FIELDS: Readonly<
  Record<string, { table: string; column: string }>
> = {
  unitCode: { table: 'units', column: 'code' },
};

// ValidateNested arrays lose their element type in design:type metadata
export const NESTED_DTOS: Readonly<Record<string, DtoClass>> = {
  'SessionAttendanceDto.attendance': AttendanceEntryDto,
  'RecordInventoryDto.items': InventoryItemDto,
};

const toPaths = (value: unknown): string[] =>
  (Array.isArray(value) ? (value as unknown[]) : [value ?? '']).map((p) =>
    String(p),
  );

const joinPath = (...parts: string[]): string =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

const isDtoClass = (value: unknown): value is DtoClass =>
  typeof value === 'function' &&
  ![Object, String, Number, Boolean, Array].includes(value as never);

const isListed = (record: object, key: string): boolean =>
  Object.keys(record).includes(key);

interface Argument {
  data: unknown;
  type: unknown;
}

export function discoverRoutes(app: INestApplication): SweptRoute[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const routes: SweptRoute[] = [];
  for (const wrapper of discovery.getControllers() as InstanceWrapper<object>[]) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<
      string,
      unknown
    >;
    const controllerPaths = toPaths(
      Reflect.getMetadata(PATH_METADATA, metatype),
    );
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as object;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      if (method === undefined) continue;
      const declared = (Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        metatype,
        name,
      ) ?? {}) as Record<string, { index: number; data?: unknown }>;
      const types = (Reflect.getMetadata(
        'design:paramtypes',
        prototype,
        name,
      ) ?? []) as unknown[];
      const of = (kind: RouteParamtypes): Argument[] =>
        Object.entries(declared)
          .filter(([key]) => key.split(':')[0] === String(kind))
          .map(([, arg]) => ({ data: arg.data, type: types[arg.index] }));
      const bodies = of(RouteParamtypes.BODY);
      const queries = of(RouteParamtypes.QUERY);
      const dtoOf = (args: Argument[]): DtoClass | null => {
        const whole = args.find(
          (arg) => arg.data === undefined && isDtoClass(arg.type),
        );
        return whole && isDtoClass(whole.type) ? whole.type : null;
      };
      const fieldsOf = (args: Argument[]): string[] =>
        args.flatMap((arg) => (typeof arg.data === 'string' ? [arg.data] : []));
      for (const controllerPath of controllerPaths) {
        for (const methodPath of toPaths(
          Reflect.getMetadata(PATH_METADATA, handler),
        )) {
          const path = joinPath(controllerPath, methodPath);
          const verb = RequestMethod[method];
          routes.push({
            method: verb,
            path,
            key: `${verb} ${path}`,
            pathParams: [...path.matchAll(/:(\w+)/g)].map((m) => m[1]),
            bodyDto: dtoOf(bodies),
            bodyFields: fieldsOf(bodies),
            queryDto: dtoOf(queries),
            queryFields: fieldsOf(queries),
          });
        }
      }
    }
  }
  return routes.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}

/** The id fields of a DTO (validated as UUID, or named *Id / *Ids), nested DTOs included. */
export function idFieldsOf(
  dto: DtoClass,
  prefix = '',
): { fields: IdField[]; problems: string[] } {
  const metadata = getMetadataStorage().getTargetValidationMetadatas(
    dto,
    '',
    true,
    false,
  );
  const byProperty = new Map<string, typeof metadata>();
  for (const entry of metadata) {
    byProperty.set(entry.propertyName, [
      ...(byProperty.get(entry.propertyName) ?? []),
      entry,
    ]);
  }
  const fields: IdField[] = [];
  const problems: string[] = [];
  for (const [property, entries] of byProperty) {
    const path = prefix ? `${prefix}.${property}` : property;
    if (entries.some((e) => e.name === 'isUuid') || /Ids?$/.test(property)) {
      fields.push({
        path,
        name: property,
        dto: dto.name,
        array: entries.some((e) => e.each === true) || /Ids$/.test(property),
      });
    }
    if (entries.some((e) => e.type === 'nestedValidation')) {
      const declaredType: unknown = Reflect.getMetadata(
        'design:type',
        dto.prototype as object,
        property,
      );
      const nested =
        NESTED_DTOS[`${dto.name}.${property}`] ??
        (isDtoClass(declaredType) ? declaredType : undefined);
      if (!nested) {
        problems.push(
          `${dto.name}.${property}: nested DTO without an entry in NESTED_DTOS`,
        );
      } else {
        const inner = idFieldsOf(nested, path);
        fields.push(...inner.fields);
        problems.push(...inner.problems);
      }
    }
  }
  return { fields, problems };
}

export const isFreeText = (field: IdField): boolean =>
  isListed(FREE_TEXT_FIELDS, `${field.dto}.${field.name}`);

export const tableOfField = (field: IdField): string | undefined =>
  isListed(FIELD_TABLES, `${field.dto}.${field.name}`)
    ? FIELD_TABLES[`${field.dto}.${field.name}`]
    : isListed(FIELD_TABLES, field.name)
      ? FIELD_TABLES[field.name]
      : undefined;

/** Every route parameter or id field that is not mapped to a tenant table. */
export function unmappedParameters(
  routes: SweptRoute[],
  tenantTableSet: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const check = (where: string, table: string | undefined) => {
    if (table === undefined) problems.push(`${where}: not mapped`);
    else if (!tenantTableSet.has(table)) {
      problems.push(
        `${where}: mapped to ${table}, which is not a tenant table`,
      );
    }
  };
  for (const route of routes) {
    const params = isListed(PATH_PARAMS, route.key)
      ? PATH_PARAMS[route.key]
      : {};
    for (const param of route.pathParams) {
      check(
        `${route.key} :${param}`,
        isListed(params, param) ? params[param] : undefined,
      );
    }
    const parts = [
      ['body', route.bodyDto, route.bodyFields],
      ['query', route.queryDto, route.queryFields],
    ] as const;
    for (const [kind, dto, singles] of parts) {
      if (dto) {
        const { fields, problems: nested } = idFieldsOf(dto);
        problems.push(...nested.map((p) => `${route.key} ${kind}: ${p}`));
        for (const field of fields.filter((f) => !isFreeText(f))) {
          check(`${route.key} ${kind}.${field.path}`, tableOfField(field));
        }
      }
      for (const name of singles.filter((field) => /Ids?$/.test(field))) {
        check(
          `${route.key} ${kind}.${name}`,
          isListed(FIELD_TABLES, name) ? FIELD_TABLES[name] : undefined,
        );
      }
    }
  }
  return problems;
}

/** PATH_PARAMS entries of routes that no longer exist. */
export const staleParameterEntries = (routes: SweptRoute[]): string[] => {
  const keys = new Set(routes.map((route) => route.key));
  return Object.keys(PATH_PARAMS).filter((key) => !keys.has(key));
};

/** Every table a mapped parameter or field names. */
export const mappedTables = (): string[] =>
  [
    ...new Set([
      ...Object.values(PATH_PARAMS).flatMap((params) => Object.values(params)),
      ...Object.values(FIELD_TABLES),
      ...Object.values(CODE_FIELDS).map((field) => field.table),
    ]),
  ].sort();

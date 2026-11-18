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
import { isListed } from './tenancy-catalog';
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
  /**
   * @Body() / @Query() parameters whose design type is not a class (Partial<...>, Record<...>,
   * an interface, an inline type), so no validation metadata can be read from it. Each one
   * fails the coverage test unless UNTYPED_PARAMETERS covers it.
   */
  uninspected: string[];
  /** The kinds ('body' | 'query') of the untyped parameters UNTYPED_PARAMETERS covers */
  untyped: string[];
}

export interface IdField {
  /** Dotted path in the payload, e.g. 'attendance.memberId' */
  path: string;
  name: string;
  /** The DTO class declaring it */
  dto: string;
  array: boolean;
  /** A string naming a row by its code (*Code, *Codes), not by its id */
  code: boolean;
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

// A body or query parameter that is not typed as a class, so its fields cannot be read from
// metadata. Key: `${route key} body` or `${route key} query`. Without `sameAs` the parameter
// holds no id or code field (the reason says why). With `sameAs` (the key of a route whose
// parameter of the same kind is the real DTO) the sweep inspects that DTO's fields instead.
export interface UntypedParameter {
  reason: string;
  sameAs?: string;
}
export const UNTYPED_PARAMETERS: Readonly<Record<string, UntypedParameter>> = {
  'PATCH /admin/system-settings body': {
    reason:
      'Record<string, string>: setting name -> value, only the six EDITABLE_KEYS of admin.controller.ts (numbers and rates); no row id or code',
  },
  'PATCH /official-documents/:id body': {
    reason:
      'Partial<CreateDocDto>: the same fields as the create route, relatedMilitiaId and relatedUnitId among them',
    sameAs: 'POST /official-documents',
  },
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

// Fields that match the id or code name rule but hold free text, not a reference to any row.
// Keyed `Dto.field` (or `field` for a single @Body('x') / @Query('x')), with the reason.
export const FREE_TEXT_FIELDS: Readonly<Record<string, string>> = {
  'CreateUnitDto.wardId':
    'organization_units.ward_id is a free-text varchar(50) label with no foreign key',
  'UpdateUnitDto.wardId':
    'organization_units.ward_id is a free-text varchar(50) label with no foreign key',
  'LoginDto.tenantCode':
    'names the tenant itself in the global registry; the pre-auth lookup (auth_tenant_by_code) resolves it, it is no row of a tenant table',
  'QuickCreateMilitiaDto.militiaCode':
    "the new row's own militia_code (an attribute it is created with), not a reference to an existing row",
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

const isIdName = (name: string): boolean => /Ids?$/.test(name);
const isCodeName = (name: string): boolean => /[a-z]Codes?$/.test(name);

type ControllerClass = abstract new (...args: never[]) => object;

/** What discovery reads of a Nest controller: its class. */
export interface ControllerRef {
  metatype: ControllerClass | null | undefined;
}

export interface Discovery {
  routes: SweptRoute[];
  /** Controllers or parameters the discovery could not read: each one fails the sweep */
  problems: string[];
}

interface Argument {
  index: number;
  data: unknown;
  type: unknown;
}

type Kind = 'body' | 'query';

const bySort = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/**
 * The routes of controller classes, read from their metadata. The class is read, not the
 * instance: a request- or transient-scoped controller has no usable instance and its routes
 * are routes all the same, so none is dropped for lacking one. A controller with no class at
 * all cannot be read and is reported.
 */
export function routesOfControllers(controllers: ControllerRef[]): Discovery {
  const scanner = new MetadataScanner();
  const routes: SweptRoute[] = [];
  const problems: string[] = [];
  for (const { metatype } of controllers) {
    if (!metatype) {
      problems.push(
        'a controller without a class: its routes cannot be listed',
      );
      continue;
    }
    const prototype = metatype.prototype as Record<string, unknown>;
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
          .map(([, arg]) => ({
            index: arg.index,
            data: arg.data,
            type: types[arg.index],
          }));
      const args: Record<Kind, Argument[]> = {
        body: of(RouteParamtypes.BODY),
        query: of(RouteParamtypes.QUERY),
      };
      const dtoOf = (kind: Kind): DtoClass | null => {
        const whole = args[kind].find(
          (arg) => arg.data === undefined && isDtoClass(arg.type),
        );
        return whole && isDtoClass(whole.type) ? whole.type : null;
      };
      const fieldsOf = (kind: Kind): string[] =>
        args[kind].flatMap((arg) =>
          typeof arg.data === 'string' ? [arg.data] : [],
        );
      const untypedOf = (kind: Kind): Argument[] =>
        args[kind].filter(
          (arg) => arg.data === undefined && !isDtoClass(arg.type),
        );
      for (const controllerPath of controllerPaths) {
        for (const methodPath of toPaths(
          Reflect.getMetadata(PATH_METADATA, handler),
        )) {
          const path = joinPath(controllerPath, methodPath);
          const verb = RequestMethod[method];
          const key = `${verb} ${path}`;
          const route: SweptRoute = {
            method: verb,
            path,
            key,
            pathParams: [...path.matchAll(/:(\w+)/g)].map((m) => m[1]),
            bodyDto: dtoOf('body'),
            bodyFields: fieldsOf('body'),
            queryDto: dtoOf('query'),
            queryFields: fieldsOf('query'),
            uninspected: [],
            untyped: [],
          };
          for (const kind of ['body', 'query'] as const) {
            for (const arg of untypedOf(kind)) {
              if (isListed(UNTYPED_PARAMETERS, `${key} ${kind}`)) {
                route.untyped.push(kind);
              } else {
                const type = (arg.type as { name?: string } | undefined)?.name;
                route.uninspected.push(
                  `${kind} argument #${arg.index} (${type ?? 'no type'}) is not typed as a class: no id field can be read from it`,
                );
              }
            }
          }
          routes.push(route);
        }
      }
    }
  }
  // An untyped parameter that stands for another route's DTO is inspected as that DTO
  for (const route of routes) {
    for (const kind of route.untyped as Kind[]) {
      const { sameAs } = UNTYPED_PARAMETERS[`${route.key} ${kind}`];
      if (sameAs === undefined) continue;
      const donor = routes.find((other) => other.key === sameAs);
      const dto = donor && (kind === 'body' ? donor.bodyDto : donor.queryDto);
      if (!dto) {
        problems.push(
          `${route.key} ${kind}: sameAs ${sameAs} has no ${kind} DTO`,
        );
      } else if (kind === 'body') {
        route.bodyDto = dto;
      } else {
        route.queryDto = dto;
      }
    }
  }
  return { routes: routes.sort((x, y) => bySort(x.key, y.key)), problems };
}

/** Every route of the running application, and what could not be read. */
export function discover(app: INestApplication): Discovery {
  const wrappers = app
    .get(DiscoveryService)
    .getControllers() as InstanceWrapper<object>[];
  return routesOfControllers(
    wrappers.map((wrapper) => ({
      metatype: wrapper.metatype as ControllerClass | null,
    })),
  );
}

export const discoverRoutes = (app: INestApplication): SweptRoute[] =>
  discover(app).routes;

/** The id and code fields of a DTO (validated as UUID, or named *Id / *Ids / *Code), nested DTOs included. */
export function idFieldsOf(
  dto: DtoClass,
  prefix = '',
): { fields: IdField[]; problems: string[]; nested: string[] } {
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
  const nestedKeys: string[] = [];
  for (const [property, entries] of byProperty) {
    const path = prefix ? `${prefix}.${property}` : property;
    const code = isCodeName(property);
    if (
      entries.some((e) => e.name === 'isUuid') ||
      isIdName(property) ||
      code
    ) {
      fields.push({
        path,
        name: property,
        dto: dto.name,
        array:
          entries.some((e) => e.each === true) || /(Ids|Codes)$/.test(property),
        code,
      });
    }
    if (entries.some((e) => e.type === 'nestedValidation')) {
      nestedKeys.push(`${dto.name}.${property}`);
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
        nestedKeys.push(...inner.nested);
      }
    }
  }
  return { fields, problems, nested: nestedKeys };
}

const lookup = <T>(
  record: Readonly<Record<string, T>>,
  field: IdField,
): T | undefined =>
  isListed(record, `${field.dto}.${field.name}`)
    ? record[`${field.dto}.${field.name}`]
    : isListed(record, field.name)
      ? record[field.name]
      : undefined;

export const isFreeText = (field: IdField): boolean =>
  lookup(FREE_TEXT_FIELDS, field) !== undefined;

export const tableOfField = (field: IdField): string | undefined =>
  lookup(FIELD_TABLES, field);

export const codeOfField = (
  field: IdField,
): { table: string; column: string } | undefined => lookup(CODE_FIELDS, field);

/** A single @Body('x') / @Query('x') as a field, for the same lookups as a DTO field. */
const singleField = (name: string): IdField => ({
  path: name,
  name,
  dto: '',
  array: false,
  code: isCodeName(name),
});

const fieldsOfRoute = (
  route: SweptRoute,
): { kind: Kind; dto: DtoClass | null; singles: string[] }[] => [
  { kind: 'body', dto: route.bodyDto, singles: route.bodyFields },
  { kind: 'query', dto: route.queryDto, singles: route.queryFields },
];

/**
 * Every route parameter, id field or code field that is not mapped to a tenant table, and
 * every body or query that cannot be read.
 */
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
  const checkField = (where: string, field: IdField) => {
    if (isFreeText(field)) return;
    if (field.code) {
      const entry = codeOfField(field);
      if (entry === undefined) problems.push(`${where}: code field not mapped`);
      else check(where, entry.table);
    } else {
      check(where, tableOfField(field));
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
    problems.push(...route.uninspected.map((u) => `${route.key} ${u}`));
    for (const { kind, dto, singles } of fieldsOfRoute(route)) {
      if (dto) {
        const { fields, problems: nested } = idFieldsOf(dto);
        problems.push(...nested.map((p) => `${route.key} ${kind}: ${p}`));
        for (const field of fields) {
          checkField(`${route.key} ${kind}.${field.path}`, field);
        }
      }
      for (const name of singles.filter((n) => isIdName(n) || isCodeName(n))) {
        checkField(`${route.key} ${kind}.${name}`, singleField(name));
      }
    }
  }
  return problems;
}

/** Map entries that nothing in the application uses any more. */
export function staleParameterEntries(routes: SweptRoute[]): string[] {
  const stale: string[] = [];
  const byKey = new Map(routes.map((route) => [route.key, route]));
  for (const [key, params] of Object.entries(PATH_PARAMS)) {
    const route = byKey.get(key);
    if (!route) {
      stale.push(`PATH_PARAMS['${key}']: no such route`);
      continue;
    }
    for (const param of Object.keys(params)) {
      if (!route.pathParams.includes(param)) {
        stale.push(
          `PATH_PARAMS['${key}'].${param}: the route has no such path parameter`,
        );
      }
    }
  }
  const used = new Set<string>();
  const nested = new Set<string>();
  for (const route of routes) {
    for (const { dto, singles } of fieldsOfRoute(route)) {
      if (dto) {
        const read = idFieldsOf(dto);
        for (const field of read.fields) {
          used.add(`${field.dto}.${field.name}`);
          used.add(field.name);
        }
        read.nested.forEach((entry) => nested.add(entry));
      }
      singles.forEach((name) => used.add(name));
    }
  }
  const unused = (name: string, record: object, seen: Set<string>) =>
    Object.keys(record)
      .filter((key) => !seen.has(key))
      .map((key) => `${name}['${key}']: nothing uses it`);
  stale.push(
    ...unused('FIELD_TABLES', FIELD_TABLES, used),
    ...unused('CODE_FIELDS', CODE_FIELDS, used),
    ...unused('FREE_TEXT_FIELDS', FREE_TEXT_FIELDS, used),
    ...unused('NESTED_DTOS', NESTED_DTOS, nested),
  );
  for (const key of Object.keys(UNTYPED_PARAMETERS)) {
    const at = key.lastIndexOf(' ');
    const route = byKey.get(key.slice(0, at));
    if (!route?.untyped.includes(key.slice(at + 1))) {
      stale.push(`UNTYPED_PARAMETERS['${key}']: no such untyped parameter`);
    }
  }
  return stale;
}

/** Every table a mapped parameter or field names. */
export const mappedTables = (): string[] =>
  [
    ...new Set([
      ...Object.values(PATH_PARAMS).flatMap((params) => Object.values(params)),
      ...Object.values(FIELD_TABLES),
      ...Object.values(CODE_FIELDS).map((field) => field.table),
    ]),
  ].sort();

interface ExpressLayer {
  route?: { path: unknown; methods: Record<string, boolean> };
}
interface ExpressApp {
  router?: { stack: ExpressLayer[] };
  _router?: { stack: ExpressLayer[] };
}

/**
 * The routes the HTTP server itself serves, read from the Express router stack: `${METHOD}
 * ${path}` without the global prefix. A route registered for every method is 'ALL'. This is
 * the independent view that the discovery from Nest's metadata is checked against.
 */
export function routerRoutes(
  app: INestApplication,
  apiPrefix: string,
): string[] {
  const express = app.getHttpAdapter().getInstance() as ExpressApp;
  const stack = (express.router ?? express._router)?.stack;
  if (!stack) throw new Error('The HTTP adapter exposes no router stack');
  const prefix = '/' + apiPrefix.replace(/^[/]+|[/]+$/g, '');
  return stack
    .flatMap((layer) => (layer.route ? [layer.route] : []))
    .flatMap((route) => {
      const path = String(route.path);
      const methods = Object.keys(route.methods).map((m) => m.toUpperCase());
      const verbs = methods.length > 10 ? ['ALL'] : methods;
      const local = path.startsWith(prefix) ? path.slice(prefix.length) : path;
      return verbs.map((verb) => `${verb} ${local === '' ? '/' : local}`);
    })
    .sort(bySort);
}

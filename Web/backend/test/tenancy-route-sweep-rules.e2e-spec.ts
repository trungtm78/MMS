// The rules of the route sweep, proven on fake controllers: what it reports when a path
// parameter, an id or code field, a nested DTO or a whole body is not covered, and what it
// reports as stale. No database, no application: pure functions over decorator metadata.
import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import {
  idFieldsOf,
  routesOfControllers,
  staleParameterEntries,
  unmappedParameters,
  type SweptRoute,
} from './support/route-sweep';

const TENANT_TABLES = new Set([
  'users',
  'units',
  'tasks',
  'militia_profiles',
  'official_documents',
]);

class ProbeItemDto {
  @IsUUID()
  zzProbeItemId: string;
}

class ProbeDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  zzProbeUnmappedId?: string;

  @IsOptional()
  @IsString()
  zzProbeUnmappedCode?: string;

  @IsOptional()
  @IsString()
  unitCode?: string;
}

class MappedDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  unitCode?: string;
}

class NestedProbeDto {
  @ValidateNested({ each: true })
  items: ProbeItemDto[];
}

const routesOf = (controller: new () => object): SweptRoute[] => {
  const found = routesOfControllers([{ metatype: controller }]);
  expect(found.problems).toEqual([]);
  return found.routes;
};

describe('route sweep rules', () => {
  describe('path parameters', () => {
    @Controller('zzprobe')
    class PathController {
      @Get(':zzProbeId')
      get() {
        return null;
      }
    }

    @Controller('tasks')
    class MappedPathController {
      @Get(':id')
      get() {
        return null;
      }
    }

    it('fails a path parameter that no entry maps', () => {
      expect(
        unmappedParameters(routesOf(PathController), TENANT_TABLES),
      ).toEqual(['GET /zzprobe/:zzProbeId :zzProbeId: not mapped']);
    });

    it('accepts a mapped path parameter, and refuses one mapped to a table that is not a tenant table', () => {
      const routes = routesOf(MappedPathController);
      expect(unmappedParameters(routes, TENANT_TABLES)).toEqual([]);
      expect(unmappedParameters(routes, new Set(['users']))).toEqual([
        'GET /tasks/:id :id: mapped to tasks, which is not a tenant table',
      ]);
    });
  });

  describe('id and code fields of a DTO', () => {
    @Controller('zzprobe')
    class DtoController {
      @Post()
      create(@Body() dto: ProbeDto) {
        return dto;
      }

      @Get()
      list(@Query() query: ProbeDto) {
        return query;
      }
    }

    @Controller('zzmapped')
    class MappedController {
      @Post()
      create(@Body() dto: MappedDto) {
        return dto;
      }
    }

    it('fails an unmapped id field and an unmapped code field, in a body and in a query', () => {
      expect(
        unmappedParameters(routesOf(DtoController), TENANT_TABLES),
      ).toEqual([
        'GET /zzprobe query.zzProbeUnmappedId: not mapped',
        'GET /zzprobe query.zzProbeUnmappedCode: code field not mapped',
        'POST /zzprobe body.zzProbeUnmappedId: not mapped',
        'POST /zzprobe body.zzProbeUnmappedCode: code field not mapped',
      ]);
    });

    it('passes id and code fields that CODE_FIELDS and FIELD_TABLES map', () => {
      expect(
        unmappedParameters(routesOf(MappedController), TENANT_TABLES),
      ).toEqual([]);
    });

    it('fails a code field whose table is not a tenant table', () => {
      expect(
        unmappedParameters(
          routesOf(MappedController),
          new Set(['users', 'tasks']),
        ),
      ).toEqual([
        'POST /zzmapped body.unitCode: mapped to units, which is not a tenant table',
      ]);
    });
  });

  describe('single fields', () => {
    @Controller('zzprobe')
    class SingleController {
      @Get('ids')
      ids(@Query('zzProbeUnmappedId') id?: string) {
        return id;
      }

      @Get('codes')
      codes(
        @Query('zzProbeCode') code?: string,
        @Query('unitCode') u?: string,
      ) {
        return [code, u];
      }
    }

    it('fails an unmapped single id field and an unmapped single code field, and passes unitCode', () => {
      expect(
        unmappedParameters(routesOf(SingleController), TENANT_TABLES),
      ).toEqual([
        'GET /zzprobe/codes query.zzProbeCode: code field not mapped',
        'GET /zzprobe/ids query.zzProbeUnmappedId: not mapped',
      ]);
    });
  });

  describe('a body or query that is not typed as a class', () => {
    @Controller('zzprobe')
    class UntypedController {
      @Patch('partial/:id')
      partial(@Body() dto: Partial<ProbeDto>) {
        return dto;
      }

      @Patch('inline')
      inline(@Body() dto: { userId: string }) {
        return dto;
      }

      @Get('record')
      record(@Query() query: Record<string, string>) {
        return query;
      }
    }

    // The key of a covered parameter in UNTYPED_PARAMETERS
    @Controller('admin')
    class CoveredController {
      @Patch('system-settings')
      settings(@Body() dto: Record<string, string>) {
        return dto;
      }
    }

    // POST is the real DTO, PATCH takes Partial<...> and is covered by sameAs
    @Controller('official-documents')
    class SameAsController {
      @Post()
      create(@Body() dto: ProbeDto) {
        return dto;
      }

      @Patch(':id')
      update(@Body() dto: Partial<ProbeDto>) {
        return dto;
      }
    }

    it('reports every untyped body and query instead of skipping it', () => {
      const routes = routesOf(UntypedController);
      expect(routes.map((route) => route.uninspected)).toEqual([
        [
          'query argument #0 (Object) is not typed as a class: no id field can be read from it',
        ],
        [
          'body argument #0 (Object) is not typed as a class: no id field can be read from it',
        ],
        [
          'body argument #0 (Object) is not typed as a class: no id field can be read from it',
        ],
      ]);
      expect(unmappedParameters(routes, TENANT_TABLES)).toEqual(
        expect.arrayContaining([
          'GET /zzprobe/record query argument #0 (Object) is not typed as a class: no id field can be read from it',
          'PATCH /zzprobe/inline body argument #0 (Object) is not typed as a class: no id field can be read from it',
        ]),
      );
    });

    it('lets UNTYPED_PARAMETERS cover a parameter that holds no id field', () => {
      const [route] = routesOf(CoveredController);
      expect(route.key).toBe('PATCH /admin/system-settings');
      expect(route.uninspected).toEqual([]);
      expect(route.untyped).toEqual(['body']);
      expect(unmappedParameters([route], TENANT_TABLES)).toEqual([]);
    });

    it('inspects the DTO of the route a covered parameter stands for', () => {
      const routes = routesOf(SameAsController);
      const patch = routes.find(
        (route) => route.key === 'PATCH /official-documents/:id',
      );
      expect(patch?.bodyDto).toBe(ProbeDto);
      expect(patch?.uninspected).toEqual([]);
      expect(unmappedParameters(routes, TENANT_TABLES)).toEqual([
        'PATCH /official-documents/:id body.zzProbeUnmappedId: not mapped',
        'PATCH /official-documents/:id body.zzProbeUnmappedCode: code field not mapped',
        'POST /official-documents body.zzProbeUnmappedId: not mapped',
        'POST /official-documents body.zzProbeUnmappedCode: code field not mapped',
      ]);
    });
  });

  describe('controllers', () => {
    @Controller('zzprobe')
    class ScopedController {
      @Get()
      list() {
        return null;
      }
    }

    it('reports a controller that has no class instead of dropping it', () => {
      const found = routesOfControllers([{ metatype: null }]);
      expect(found.routes).toEqual([]);
      expect(found.problems).toEqual([
        'a controller without a class: its routes cannot be listed',
      ]);
    });

    it('lists the routes of a controller from its class, with no instance needed', () => {
      expect(routesOf(ScopedController).map((route) => route.key)).toEqual([
        'GET /zzprobe',
      ]);
    });
  });

  describe('nested DTOs', () => {
    it('reports a nested DTO that has no entry in NESTED_DTOS and cannot be read from its type', () => {
      const { fields, problems } = idFieldsOf(NestedProbeDto);
      expect(fields).toEqual([]);
      expect(problems).toEqual([
        'NestedProbeDto.items: nested DTO without an entry in NESTED_DTOS',
      ]);
    });
  });

  describe('stale entries', () => {
    const noRoutes: SweptRoute[] = [];

    it('reports every entry of every map when no route uses it', () => {
      const stale = staleParameterEntries(noRoutes);
      expect(stale).toEqual(
        expect.arrayContaining([
          "PATH_PARAMS['GET /tasks/:id']: no such route",
          "FIELD_TABLES['userId']: nothing uses it",
          "CODE_FIELDS['unitCode']: nothing uses it",
          "FREE_TEXT_FIELDS['CreateUnitDto.wardId']: nothing uses it",
          "NESTED_DTOS['SessionAttendanceDto.attendance']: nothing uses it",
          "UNTYPED_PARAMETERS['PATCH /admin/system-settings body']: no such untyped parameter",
        ]),
      );
    });

    it('reports a parameter that a live PATH_PARAMS key no longer has', () => {
      @Controller('tasks')
      class RenamedController {
        @Get(':taskId')
        get() {
          return null;
        }
      }
      @Controller('tasks')
      class LiveController {
        @Get(':id')
        get() {
          return null;
        }
      }
      expect(
        staleParameterEntries(routesOf(LiveController)).filter((entry) =>
          entry.startsWith("PATH_PARAMS['GET /tasks/:id']"),
        ),
      ).toEqual([]);
      // The same key with a different parameter name is a different route: its entry is stale
      expect(
        staleParameterEntries(routesOf(RenamedController)).filter((entry) =>
          entry.startsWith("PATH_PARAMS['GET /tasks/:id']"),
        ),
      ).toEqual(["PATH_PARAMS['GET /tasks/:id']: no such route"]);
    });

    it('reports a parameter name that is no longer on its live route', () => {
      // A route of the real table whose path no longer carries the parameter its entry maps
      const route: SweptRoute = {
        method: 'GET',
        path: '/tasks/:id',
        key: 'GET /tasks/:id',
        pathParams: [],
        bodyDto: null,
        bodyFields: [],
        queryDto: null,
        queryFields: [],
        uninspected: [],
        untyped: [],
      };
      expect(
        staleParameterEntries([route]).filter((entry) =>
          entry.startsWith("PATH_PARAMS['GET /tasks/:id']"),
        ),
      ).toEqual([
        "PATH_PARAMS['GET /tasks/:id'].id: the route has no such path parameter",
      ]);
    });
  });
});

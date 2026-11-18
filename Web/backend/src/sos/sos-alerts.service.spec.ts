// GET /sos/alerts: SOS incidents limited to the reporters each caller is responsible for
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import { userInUnit } from '../common/sql/user-access.sql';
import { SosAlertsService } from './sos-alerts.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const assignments = { getAssignedDqtvIds: jest.fn() };

const sqlOf = (call: number) => query.mock.calls[call][0];
const paramsOf = (call: number) => query.mock.calls[call][1] as unknown[];

function respond(
  counts = { total: 1, active: 1, resolved: 0 },
  data: Record<string, unknown>[] = [{ id: 'inc-1' }],
) {
  query.mockResolvedValueOnce([counts]).mockResolvedValueOnce(data);
}

describe('SosAlertsService', () => {
  let service: SosAlertsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SosAlertsService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: AssignmentsService, useValue: assignments },
      ],
    }).compile();
    service = moduleRef.get(SosAlertsService);
    query.mockReset();
    assignments.getAssignedDqtvIds.mockReset();
  });

  describe('scope', () => {
    it('limits a militia member to the alerts they raised', async () => {
      respond();
      await service.list(
        { sub: 'dqtv-1', role: 'dqtv', unitScope: 'KV-A' },
        { unitCode: 'KV-B' },
      );
      expect(paramsOf(0).slice(0, 2)).toEqual([['dqtv-1'], null]);
    });

    it('limits a CA officer to alerts from their assigned DQTV and their own', async () => {
      assignments.getAssignedDqtvIds.mockResolvedValueOnce(['d-1', 'd-2']);
      respond();
      await service.list(
        { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV-A' },
        {},
      );
      expect(assignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
      expect(paramsOf(0).slice(0, 2)).toEqual([['d-1', 'd-2', 'ca-1'], null]);
    });

    it('locks unit staff to reporters of their unit whatever they request', async () => {
      respond();
      await service.list(
        { sub: 's-1', role: 'office_staff', unitScope: 'KV-A' },
        { unitCode: 'KV-B' },
      );
      expect(paramsOf(0).slice(0, 2)).toEqual([null, 'KV-A']);
      // a reporter belongs to a unit through a militia profile or an account scope
      expect(sqlOf(0)).toContain(userInUnit('i.reporter_id', '$2'));
      expect(sqlOf(1)).toContain(userInUnit('i.reporter_id', '$2'));
    });

    it('lets a wide role narrow to a unit', async () => {
      respond();
      await service.list(
        { sub: 'w-1', role: 'police_ward', unitScope: null },
        { unitCode: 'KV-B' },
      );
      expect(paramsOf(0).slice(0, 2)).toEqual([null, 'KV-B']);
    });

    it('refuses an area role without a unit scope', async () => {
      await expect(
        service.list({ sub: 'a-1', role: 'police_area', unitScope: null }, {}),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(query).not.toHaveBeenCalled();
    });

    it('refuses a role that does not see SOS alerts', async () => {
      await expect(
        service.list({ sub: 'l-1', role: 'ubnd_leader', unitScope: null }, {}),
      ).rejects.toThrow(new ForbiddenException('insufficient_role'));
    });
  });

  describe('filters', () => {
    const wide = { sub: 'w-1', role: 'system_admin', unitScope: null };

    it.each<[string | undefined, string[] | null]>([
      [undefined, null],
      ['all', null],
      ['active', ['open', 'acknowledged', 'responding']],
      ['resolved', ['resolved', 'closed']],
      ['responding', ['responding']],
    ])('reads status %p as %p', async (status, statuses) => {
      respond();
      await service.list(wide, { status });
      expect(paramsOf(0).slice(2)).toEqual([statuses, null]);
    });

    it('filters on a known severity', async () => {
      respond();
      await service.list(wide, { severity: 'urgent' });
      expect(paramsOf(0).slice(2)).toEqual([null, 'urgent']);
    });

    it('refuses an unknown status or severity before querying', async () => {
      await expect(service.list(wide, { status: 'bogus' })).rejects.toThrow(
        new BadRequestException('invalid_status'),
      );
      await expect(service.list(wide, { severity: 'x' })).rejects.toThrow(
        new BadRequestException('invalid_severity'),
      );
      expect(query).not.toHaveBeenCalled();
    });
  });

  it('pages active alerts first, most severe then newest, with counts for the whole scope', async () => {
    const data = [
      {
        id: 'inc-1',
        status: 'open',
        statusGroup: 'active',
        reporterId: 'd-1',
        reporterName: 'Nguyễn Văn An',
      },
    ];
    respond({ total: 7, active: 3, resolved: 4 }, data);

    const result = await service.list(
      { sub: 'w-1', role: 'system_admin', unitScope: null },
      { page: 2, limit: 5 },
    );

    expect(paramsOf(1)).toEqual([null, null, null, null, 5, 5]);
    expect(sqlOf(1)).toMatch(
      /ORDER BY \(i\.status IN \('open', 'acknowledged', 'responding'\)\) DESC,\s+CASE i\.severity/,
    );
    expect(sqlOf(1)).toMatch(/i\.created_at DESC, i\.id DESC/);
    expect(result).toEqual({
      data,
      total: 7,
      page: 2,
      limit: 5,
      counts: { active: 3, resolved: 4 },
    });
  });

  // T23 agent: GET /sos/:id showed any alert to any reader
  describe('findOne', () => {
    it('returns one alert of the caller scope with the fields of the list', async () => {
      query.mockResolvedValueOnce([{ id: 'inc-1', code: 'SOS-1' }]);

      await expect(
        service.findOne(
          { sub: 'dqtv-1', role: 'dqtv', unitScope: 'KV-A' },
          'inc-1',
        ),
      ).resolves.toEqual({ id: 'inc-1', code: 'SOS-1' });

      expect(paramsOf(0)).toEqual([['dqtv-1'], null, 'inc-1']);
      expect(sqlOf(0)).toMatch(/AS "statusGroup"/);
      expect(sqlOf(0)).toMatch(/AND i\.id = \$3/);
    });

    it('answers an alert outside the caller scope like a missing one', async () => {
      query.mockResolvedValueOnce([]);

      await expect(
        service.findOne(
          { sub: 's-1', role: 'office_staff', unitScope: 'KV-A' },
          'inc-9',
        ),
      ).rejects.toThrow(new NotFoundException('incident_not_found'));
      expect(paramsOf(0)).toEqual([null, 'KV-A', 'inc-9']);
    });
  });

  it('clamps paging', async () => {
    respond();
    const result = await service.list(
      { sub: 'w-1', role: 'system_admin', unitScope: null },
      { page: 0, limit: 500 },
    );
    expect(paramsOf(1).slice(4)).toEqual([100, 0]);
    expect(result).toMatchObject({ page: 1, limit: 100 });
  });
});

import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import { memberReachSql } from '../common/access/member-scope';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { rooms } from '../notifications/rooms';
import { TenantContext } from '../database/tenancy/tenant-context';
import {
  GPS_OFFLINE_AFTER_MINUTES,
  GPS_UPDATE_EVENT,
  gpsUnitRoom,
  gpsWardRoom,
} from './gps-rooms';
import { GpsService } from './gps.service';

const mockQuery = jest.fn();
const mockDs = { query: mockQuery };
const mockAssignments = {
  getAssignedDqtvIds: jest.fn(),
  getCaOfficerIds: jest.fn(),
};
const mockGateway = { emitToRooms: jest.fn() };

const TID = '11111111-1111-4111-8111-111111111111';

const callsOf = () => mockQuery.mock.calls as [string, unknown[]][];
const sqlOf = (call: number) => callsOf()[call][0];
const paramsOf = (call: number) => callsOf()[call][1];

const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };
const areaOfficer = { sub: 'area-1', role: 'police_area', unitScope: 'KV1' };
const caOfficer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV1' };
const member = { sub: 'dq-1', role: 'dqtv', unitScope: 'KV1' };

// One row of GET /gps/live
const liveRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'militia-1',
  militiaId: 'militia-1',
  userId: 'user-1',
  name: 'Nguyen Van A',
  fullName: 'Nguyen Van A',
  unitCode: 'KV1',
  lat: 10.762,
  lng: 106.66,
  accuracy: 5,
  lastUpdate: '2026-09-14T01:00:00.000Z',
  lastSeenAt: '2026-09-14T01:00:00.000Z',
  status: 'online',
  ...overrides,
});

async function build() {
  const mod = await Test.createTestingModule({
    providers: [
      GpsService,
      { provide: getDataSourceToken(), useValue: mockDs },
      { provide: AssignmentsService, useValue: mockAssignments },
      { provide: NotificationsGateway, useValue: mockGateway },
    ],
  }).compile();
  return mod.get(GpsService);
}

describe('GpsService', () => {
  let service: GpsService;

  beforeEach(async () => {
    service = await build();
    mockQuery.mockReset();
    mockAssignments.getAssignedDqtvIds.mockReset();
    mockAssignments.getCaOfficerIds.mockReset();
    mockGateway.emitToRooms.mockReset();
    mockAssignments.getCaOfficerIds.mockResolvedValue([]);
  });

  // ── recordLocation ────────────────────────────────────────────────────────

  describe('recordLocation', () => {
    const recorded = (row = liveRow()) =>
      mockQuery
        .mockResolvedValueOnce([{ id: 'militia-1' }]) // the caller's profile
        .mockResolvedValueOnce([]) // points + latest
        .mockResolvedValueOnce([row]); // the new live row

    it('refuses a caller without a militia profile', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await expect(
        service.recordLocation('user-no-profile', { lat: 10.762, lng: 106.66 }),
      ).rejects.toThrow(new NotFoundException('militia_profile_not_found'));
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(sqlOf(0)).toMatch(/FROM militia_profiles WHERE user_id = \$1/);
      expect(mockGateway.emitToRooms).not.toHaveBeenCalled();
    });

    it('stores the point and the latest position of the profile in one statement', async () => {
      recorded();

      await service.recordLocation('user-1', { lat: 10.762, lng: 106.66 });

      expect(paramsOf(1)[0]).toBe('militia-1');
      expect(sqlOf(1)).toContain('WITH ins AS');
      expect(sqlOf(1)).toContain('gps_points');
      expect(sqlOf(1)).toMatch(/INSERT INTO gps_latest[\s\S]*ON CONFLICT/);
    });

    // gps-live e2e: /gps/live answered accuracy null although the client sent it
    it('keeps the accuracy of the latest position, on the first point and every later one', async () => {
      recorded();

      await service.recordLocation('user-1', {
        lat: 10.762,
        lng: 106.66,
        accuracy: 4.5,
      });

      expect(sqlOf(1)).toMatch(
        /INSERT INTO gps_latest\s*\(militia_id, lat, lng, accuracy, last_seen_at, status\)\s*VALUES \(\$1, \$2, \$3, \$4, \$5, 'online'\)/,
      );
      expect(sqlOf(1)).toMatch(/accuracy = EXCLUDED\.accuracy/);
      expect(paramsOf(1)[3]).toBe(4.5);
    });

    it('keeps the capture time the client sent, else now', async () => {
      const capturedAt = '2026-01-15T10:30:00.000Z';
      recorded();
      await service.recordLocation('user-1', { lat: 10, lng: 106, capturedAt });
      expect(paramsOf(1)[4]).toBe(capturedAt);

      mockQuery.mockReset();
      recorded();
      await service.recordLocation('user-1', { lat: 10, lng: 106 });
      expect(paramsOf(1)[4]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    // Members of a unit share unit:<code> rooms, so a position only goes to staff rooms
    it('publishes the new position to the staff who may see the member, never to their unit room', async () => {
      const row = liveRow();
      recorded(row);
      mockAssignments.getCaOfficerIds.mockResolvedValueOnce(['ca-1', 'ca-2']);

      await service.recordLocation('user-1', { lat: 10.762, lng: 106.66 });

      expect(sqlOf(2)).toMatch(/WHERE gl\.militia_id = \$1/);
      expect(paramsOf(2)).toEqual(['militia-1', GPS_OFFLINE_AFTER_MINUTES]);
      expect(mockAssignments.getCaOfficerIds).toHaveBeenCalledWith('user-1');
      expect(mockGateway.emitToRooms).toHaveBeenCalledWith(
        [
          gpsWardRoom(undefined),
          gpsUnitRoom(undefined, 'KV1'),
          rooms.user(undefined, 'ca-1'),
          rooms.user(undefined, 'ca-2'),
        ],
        GPS_UPDATE_EVENT,
        row,
      );
      const [published] = mockGateway.emitToRooms.mock.calls[0] as [string[]];
      expect(published).not.toContain(rooms.unit(undefined, 'KV1'));
    });

    // Unit codes repeat across tenants: every room of the update is the tenant's own
    it('publishes only to the rooms of the tenant the position was recorded under', async () => {
      const row = liveRow();
      recorded(row);
      mockAssignments.getCaOfficerIds.mockResolvedValueOnce(['ca-1']);

      await TenantContext.runAs({ tenantId: TID }, () =>
        service.recordLocation('user-1', { lat: 10.762, lng: 106.66 }),
      );

      expect(mockGateway.emitToRooms).toHaveBeenCalledWith(
        [
          rooms.gpsWard(TID),
          rooms.gpsUnit(TID, 'KV1'),
          rooms.user(TID, 'ca-1'),
        ],
        GPS_UPDATE_EVENT,
        row,
      );
      const [published] = mockGateway.emitToRooms.mock.calls[0] as [string[]];
      expect(published.every((room) => room.startsWith(`t:${TID}:`))).toBe(
        true,
      );
    });
  });

  // ── getLive ───────────────────────────────────────────────────────────────

  describe('getLive', () => {
    it('lists the latest positions of the members in scope, offline once stale', async () => {
      mockQuery.mockResolvedValueOnce([liveRow()]);

      await expect(service.getLive(admin)).resolves.toEqual([liveRow()]);

      const sql = sqlOf(0);
      expect(sql).toMatch(
        /CASE WHEN gl\.last_seen_at >= now\(\) - make_interval\(mins => \$4\) THEN gl\.status ELSE 'offline' END AS status/,
      );
      expect(sql).toContain(
        memberReachSql({ everyone: '$1', unit: '$2', userIds: '$3' }),
      );
      expect(sql).toMatch(/JOIN units u ON u\.id = mp\.unit_id/);
      expect(sql).toMatch(/u\.code\s+AS "unitCode"/);
      for (const alias of [
        '"militiaId"',
        '"fullName"',
        '"lastUpdate"',
        '"lastSeenAt"',
      ]) {
        expect(sql).toContain(alias);
      }
      expect(sql).toMatch(/ORDER BY gl\.last_seen_at DESC/);
      expect(paramsOf(0)).toEqual([
        true,
        null,
        null,
        GPS_OFFLINE_AFTER_MINUTES,
      ]);
    });

    it('limits unit staff to their unit and a CA officer to the DQTV assigned to them', async () => {
      mockQuery.mockResolvedValue([]);
      mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-7']);

      await service.getLive(areaOfficer);
      await service.getLive(caOfficer);

      expect(paramsOf(0)).toEqual([
        false,
        'KV1',
        null,
        GPS_OFFLINE_AFTER_MINUTES,
      ]);
      expect(paramsOf(1)).toEqual([
        false,
        null,
        ['dq-7'],
        GPS_OFFLINE_AFTER_MINUTES,
      ]);
    });

    // Every role held counts, whatever its priority: a unit role and ca_officer reach the
    // members of the unit and the DQTV assigned, whichever is the primary role
    it.each(['police_area', 'ca_officer'])(
      'gives police_area with ca_officer their unit and their DQTV (primary %s)',
      async (primary) => {
        mockQuery.mockResolvedValueOnce([]);
        mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-7']);

        await service.getLive({
          sub: 'pc-1',
          role: primary,
          roles: ['police_area', 'ca_officer'],
          unitScope: 'KV1',
        });

        expect(paramsOf(0)).toEqual([
          false,
          'KV1',
          ['dq-7'],
          GPS_OFFLINE_AFTER_MINUTES,
        ]);
      },
    );

    // As on every member route: a member sees only their own record
    it('limits a member to their own position', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await service.getLive(member);

      expect(paramsOf(0)).toEqual([
        false,
        null,
        ['dq-1'],
        GPS_OFFLINE_AFTER_MINUTES,
      ]);
    });

    it('refuses a role that reads no positions', async () => {
      await expect(
        service.getLive({ sub: 'l-1', role: 'ubnd_leader', unitScope: null }),
      ).rejects.toThrow(new ForbiddenException('insufficient_role'));
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('answers a member outside the caller scope like an unknown one', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await expect(
        service.getHistory(areaOfficer, 'm1', undefined, undefined, 1, 50),
      ).rejects.toThrow(new NotFoundException('militia_not_found'));

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(sqlOf(0)).toMatch(/WHERE mp\.id = \$1 AND/);
      expect(sqlOf(0)).toContain(
        memberReachSql({ everyone: '$2', unit: '$3', userIds: '$4' }),
      );
      expect(paramsOf(0)).toEqual(['m1', false, 'KV1', null]);
    });

    it.each(['police_area', 'ca_officer'])(
      'reads the history of an assigned DQTV outside the unit for police_area with ca_officer (primary %s)',
      async (primary) => {
        mockQuery
          .mockResolvedValueOnce([{ id: 'm1' }])
          .mockResolvedValueOnce([{ count: '0' }])
          .mockResolvedValueOnce([]);
        mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-7']);

        await service.getHistory(
          {
            sub: 'pc-1',
            role: primary,
            roles: ['police_area', 'ca_officer'],
            unitScope: 'KV1',
          },
          'm1',
        );

        expect(paramsOf(0)).toEqual(['m1', false, 'KV1', ['dq-7']]);
      },
    );

    it('pages the points of a member in scope within the date range', async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'm1' }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([
          { id: 'gp1', lat: 10, lng: 106, capturedAt: '2025-01-01T00:00:00Z' },
        ]);

      const result = await service.getHistory(
        admin,
        'm1',
        '2025-01-01',
        '2025-01-31',
        1,
        10,
      );

      expect(result).toMatchObject({ total: 5, page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(sqlOf(1)).toContain('captured_at >=');
      expect(sqlOf(1)).toContain('captured_at <=');
    });

    it('caps the page size at 200', async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'm1' }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.getHistory(admin, 'm1', undefined, undefined, 1, 9999);

      expect(paramsOf(2)).toContain(200);
    });
  });
});

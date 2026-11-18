import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import { SOS_SCOPE_SQL } from './sos-scope';
import { SosService } from './sos.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const manager = { query };
const dataSource = {
  query,
  transaction: jest.fn((work: (mgr: typeof manager) => unknown) =>
    work(manager),
  ),
};
const gateway = { emitToUnit: jest.fn(), emitToTenant: jest.fn() };
const assignments = { getAssignedDqtvIds: jest.fn() };

const sqlOf = (call: number) => query.mock.calls[call][0];
const paramsOf = (call: number) => query.mock.calls[call][1] as unknown[];

describe('SosService', () => {
  let service: SosService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SosService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: AssignmentsService, useValue: assignments },
      ],
    }).compile();
    service = moduleRef.get(SosService);
    jest.clearAllMocks();
    query.mockReset();
  });

  describe('create', () => {
    useUtcServerClock(VN_1_OCTOBER_0130);
    const dto = {
      incidentType: 'sos',
      severity: 'urgent' as const,
      title: 'SOS',
    };

    // T23 agent: POST /sos never wrote incidents.code (NOT NULL, UNIQUE) nor a message
    // (NOT NULL), so every alert failed with a server error on a real database
    it('stores the alert with a code of the Vietnamese day and an empty message when none is given', async () => {
      const row = {
        id: 'inc-1',
        code: 'SOS-20261001-7KQ2XM',
        incidentType: 'sos',
        severity: 'urgent',
        title: 'SOS',
        status: 'open',
      };
      query.mockResolvedValueOnce([row]);

      await expect(service.create('user-1', 'UNIT_001', dto)).resolves.toEqual(
        row,
      );

      expect(sqlOf(0)).toMatch(
        /INSERT INTO incidents\s*\(code, reporter_id, incident_type, severity, title, message, lat, lng, status\)/,
      );
      expect(sqlOf(0)).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
      const [code, reporter, type, severity, title, message, lat, lng] =
        paramsOf(0);
      expect(code).toMatch(/^SOS-20261001-[0-9A-HJKMNP-TV-Z]{6}$/);
      expect([reporter, type, severity, title, message, lat, lng]).toEqual([
        'user-1',
        'sos',
        'urgent',
        'SOS',
        '',
        null,
        null,
      ]);
    });

    it('draws another code when the first is already taken', async () => {
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'inc-1' }]);

      await service.create('user-1', null, dto);

      expect(query).toHaveBeenCalledTimes(2);
      expect(paramsOf(1)[0]).not.toBe(paramsOf(0)[0]);
    });

    it('announces the alert to its unit room, or to everyone without a unit', async () => {
      query
        .mockResolvedValueOnce([
          {
            id: 'inc-1',
            code: 'SOS-1',
            incidentType: 'sos',
            severity: 'urgent',
            title: 'SOS',
          },
        ])
        .mockResolvedValueOnce([{ id: 'inc-2', code: 'SOS-2' }]);

      await service.create('user-1', 'UNIT_001', dto);
      await service.create('user-1', null, dto);

      expect(gateway.emitToUnit).toHaveBeenCalledWith(
        'UNIT_001',
        'sos:new',
        expect.objectContaining({ id: 'inc-1', code: 'SOS-1' }),
      );
      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        'sos:new',
        expect.objectContaining({ id: 'inc-2', code: 'SOS-2' }),
      );
    });
  });

  // T23 agent: PATCH /sos/:id/status let any responder change any unit's alert to any
  // status, and closing a resolved alert erased when it was resolved
  describe('updateStatus', () => {
    const caOfficer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV-A' };
    const ward = { sub: 'w-1', role: 'police_ward', unitScope: null };
    const lockedAt = (status: string) =>
      query.mockResolvedValueOnce([{ id: 'inc-1', status }]);
    const updated = (row: Record<string, unknown>) =>
      query.mockResolvedValueOnce([[row], 1]);

    it('changes an alert the responder is responsible for, under its row lock', async () => {
      assignments.getAssignedDqtvIds.mockResolvedValueOnce(['d-1']);
      lockedAt('open');
      updated({ id: 'inc-1', status: 'acknowledged' });

      await expect(
        service.updateStatus(caOfficer, 'inc-1', { status: 'acknowledged' }),
      ).resolves.toEqual({ id: 'inc-1', status: 'acknowledged' });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(sqlOf(0)).toContain(SOS_SCOPE_SQL);
      expect(sqlOf(0)).toMatch(/AND i\.id = \$3\s+FOR UPDATE/);
      expect(paramsOf(0)).toEqual([['d-1', 'ca-1'], null, 'inc-1']);
    });

    it('answers an alert outside the responder scope like a missing one', async () => {
      query.mockResolvedValueOnce([]);

      await expect(
        service.updateStatus(ward, 'inc-9', { status: 'responding' }),
      ).rejects.toThrow(new NotFoundException('incident_not_found'));
      expect(query).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['closed', 'responding'],
      ['closed', 'resolved'],
      ['resolved', 'acknowledged'],
      ['responding', 'open'],
      ['open', 'open'],
    ])('refuses to move a %s alert to %s', async (from, to) => {
      lockedAt(from);

      await expect(
        service.updateStatus(ward, 'inc-1', { status: to }),
      ).rejects.toThrow(new ConflictException('invalid_status_transition'));
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('records who resolved the alert and when, keeping the first resolution when it is closed', async () => {
      lockedAt('responding');
      updated({ id: 'inc-1', status: 'resolved' });

      await service.updateStatus(ward, 'inc-1', {
        status: 'resolved',
        resolutionNote: 'Đã xử lý',
      });

      // One explicit type for $1: PostgreSQL refuses to deduce two (e2e: 500 on every change)
      expect(sqlOf(1)).toMatch(/SET status = \$1::text,/);
      expect(sqlOf(1)).toMatch(
        /resolved_at = CASE WHEN \$1::text IN \('resolved', 'closed'\) THEN COALESCE\(resolved_at, now\(\)\) ELSE NULL END/,
      );
      expect(sqlOf(1)).toMatch(
        /resolved_by = CASE WHEN \$1::text IN \('resolved', 'closed'\) THEN COALESCE\(resolved_by, \$4::uuid\) ELSE NULL END/,
      );
      expect(paramsOf(1)).toEqual([
        'resolved',
        null,
        'Đã xử lý',
        'w-1',
        'inc-1',
      ]);
      expect(gateway.emitToTenant).toHaveBeenCalledWith('sos:resolved', {
        id: 'inc-1',
      });
    });

    it('lets a resolved alert be taken up again or closed', async () => {
      lockedAt('resolved');
      updated({ id: 'inc-1', status: 'responding' });
      lockedAt('resolved');
      updated({ id: 'inc-1', status: 'closed' });

      await service.updateStatus(ward, 'inc-1', { status: 'responding' });
      await service.updateStatus(ward, 'inc-1', { status: 'closed' });

      expect(paramsOf(1)[0]).toBe('responding');
      expect(paramsOf(3)[0]).toBe('closed');
      expect(gateway.emitToTenant).not.toHaveBeenCalled();
    });

    it('assigns the alert only to an active account', async () => {
      lockedAt('open');
      query.mockResolvedValueOnce([]);

      await expect(
        service.updateStatus(ward, 'inc-1', {
          status: 'responding',
          assignedTo: '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01',
        }),
      ).rejects.toThrow(new BadRequestException('assignee_not_found'));
      expect(sqlOf(1)).toMatch(
        /SELECT 1 FROM users WHERE id = \$1 AND status = 'active'/,
      );
      expect(query).toHaveBeenCalledTimes(2);
    });
  });
});

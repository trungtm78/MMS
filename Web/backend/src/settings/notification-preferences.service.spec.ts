import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreferencesService,
  type NotificationPreferences,
} from './notification-preferences.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const dataSource = { query };

const dqtv = { sub: 'dqtv-1', role: 'dqtv', unitScope: null };
const caOfficer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV-01' };
// A militia member who also holds an area police role responds to SOS
const dqtvAndArea = {
  sub: 'u-2',
  role: 'police_area',
  roles: ['police_area', 'dqtv'],
  unitScope: 'KV-01',
};

const allOn: NotificationPreferences = {
  channels: { inApp: true, push: true, email: false },
  categories: {
    taskAssigned: true,
    taskOverdue: true,
    attendanceReminder: true,
    leaveApproval: true,
    systemAnnouncements: true,
    sosAlerts: true,
  },
};

const storedRow = (change: Record<string, boolean> = {}) => ({
  channelInApp: true,
  channelPush: false,
  channelEmail: true,
  taskAssigned: true,
  taskOverdue: false,
  attendanceReminder: true,
  leaveApproval: true,
  systemAnnouncements: false,
  sosAlerts: true,
  updatedAt: new Date('2026-09-14T01:00:00Z'),
  ...change,
});

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(NotificationPreferencesService);
    query.mockReset();
  });

  it('declares every category and channel on by default except email', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual(allOn);
  });

  describe('get', () => {
    it('answers the defaults for a user without stored preferences', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.get(dqtv)).resolves.toEqual({
        ...allOn,
        mandatory: ['channels.inApp'],
        updatedAt: null,
        isDefault: true,
      });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('FROM notification_preferences p'),
        ['dqtv-1'],
      );
    });

    it('answers what the user stored', async () => {
      query.mockResolvedValueOnce([storedRow()]);

      await expect(service.get(dqtv)).resolves.toEqual({
        channels: { inApp: true, push: false, email: true },
        categories: {
          taskAssigned: true,
          taskOverdue: false,
          attendanceReminder: true,
          leaveApproval: true,
          systemAnnouncements: false,
          sosAlerts: true,
        },
        mandatory: ['channels.inApp'],
        updatedAt: new Date('2026-09-14T01:00:00Z'),
        isDefault: false,
      });
    });

    it.each([
      ['a CA officer', caOfficer],
      ['a member who also holds an area police role', dqtvAndArea],
    ])(
      'keeps SOS alerts on for %s, whatever is stored',
      async (_label, actor) => {
        query.mockResolvedValueOnce([storedRow({ sosAlerts: false })]);

        const prefs = await service.get(actor);

        expect(prefs.mandatory).toEqual([
          'channels.inApp',
          'categories.sosAlerts',
        ]);
        expect(prefs.categories.sosAlerts).toBe(true);
      },
    );
  });

  describe('update', () => {
    it('upserts every preference of the caller and answers the stored result', async () => {
      const wanted: NotificationPreferences = {
        channels: { inApp: true, push: false, email: true },
        categories: {
          ...allOn.categories,
          taskOverdue: false,
          sosAlerts: false,
        },
      };
      query.mockResolvedValueOnce([
        storedRow({
          taskOverdue: false,
          systemAnnouncements: true,
          sosAlerts: false,
        }),
      ]);

      const result = await service.update(dqtv, wanted);

      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO notification_preferences/);
      expect(sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
      expect(params).toEqual([
        'dqtv-1',
        true,
        false,
        true,
        true,
        false,
        true,
        true,
        true,
        false,
      ]);
      expect(result.categories.sosAlerts).toBe(false);
      expect(result.isDefault).toBe(false);
    });

    it('refuses to turn the in-app channel off', async () => {
      await expect(
        service.update(dqtv, {
          ...allOn,
          channels: { ...allOn.channels, inApp: false },
        }),
      ).rejects.toThrow(
        new BadRequestException('notification_preference_mandatory'),
      );
      expect(query).not.toHaveBeenCalled();
    });

    it('refuses to let a responder turn SOS alerts off', async () => {
      await expect(
        service.update(caOfficer, {
          ...allOn,
          categories: { ...allOn.categories, sosAlerts: false },
        }),
      ).rejects.toThrow(
        new BadRequestException('notification_preference_mandatory'),
      );
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('acceptingRecipients', () => {
    const ids = ['a', 'b'];

    it('asks nothing for no recipients', async () => {
      await expect(
        service.acceptingRecipients([], 'taskAssigned', 'push'),
      ).resolves.toEqual([]);
      expect(query).not.toHaveBeenCalled();
    });

    it('filters on the whitelisted columns, with the defaults for users without a row', async () => {
      query.mockResolvedValueOnce([{ id: 'b' }]);

      await expect(
        service.acceptingRecipients(ids, 'taskAssigned', 'push'),
      ).resolves.toEqual(['b']);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('COALESCE(p.channel_push, true)');
      expect(sql).toContain('COALESCE(p.task_assigned, true)');
      expect(params).toEqual([ids]);
    });

    it('uses the email default (off) for the email channel', async () => {
      query.mockResolvedValueOnce([]);
      await service.acceptingRecipients(ids, 'leaveApproval', 'email');
      expect(query.mock.calls[0][0]).toContain(
        'COALESCE(p.channel_email, false)',
      );
    });

    it('never filters the in-app channel, and always reaches responders with SOS alerts', async () => {
      query.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
      await service.acceptingRecipients(ids, 'sosAlerts', 'inApp');
      const sql = query.mock.calls[0][0];
      expect(sql).not.toContain('channel_in_app');
      expect(sql).toMatch(/r\.code = ANY\(\$2::text\[\]\)/);
      expect(query.mock.calls[0][1]).toEqual([
        ids,
        [
          'ca_area',
          'ca_officer',
          'ca_ward',
          'police_area',
          'police_ward',
          'system_admin',
        ],
      ]);
    });

    it('refuses a category or channel the backend does not know', async () => {
      await expect(
        service.acceptingRecipients(
          ids,
          'x; DROP TABLE users' as never,
          'push',
        ),
      ).rejects.toThrow('unknown_notification_category');
      await expect(
        service.acceptingRecipients(ids, 'taskAssigned', 'sms' as never),
      ).rejects.toThrow('unknown_notification_channel');
      expect(query).not.toHaveBeenCalled();
    });
  });
});

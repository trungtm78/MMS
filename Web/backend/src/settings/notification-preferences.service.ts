// Per-user notification preferences: which categories a user receives, and on which
// channels (migration 029). A user without a row receives the defaults. Two preferences
// cannot be turned off: the in-app inbox (the record of what was sent), and SOS alerts for
// the roles that respond to them, as emergency alerting systems keep critical alerts
// outside user opt-out.
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { holdsAnyRole } from '../common/access/unit-scope';
import { queryRows } from '../database/query-rows';

export const NOTIFICATION_CHANNELS = ['inApp', 'push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CATEGORIES = [
  'taskAssigned',
  'taskOverdue',
  'attendanceReminder',
  'leaveApproval',
  'systemAnnouncements',
  'sosAlerts',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationPreferences {
  channels: Record<NotificationChannel, boolean>;
  categories: Record<NotificationCategory, boolean>;
}

export interface NotificationPreferencesView extends NotificationPreferences {
  /** Preferences the caller cannot turn off, as "channels.inApp" / "categories.sosAlerts" */
  mandatory: string[];
  updatedAt: Date | null;
  isDefault: boolean;
}

// The column defaults of migration 029 declare the same values
export const DEFAULT_NOTIFICATION_PREFERENCES: Readonly<NotificationPreferences> =
  {
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

// The roles that act on SOS alerts (PATCH /sos/:id/status)
export const SOS_RESPONDER_ROLES: ReadonlySet<string> = new Set([
  'system_admin',
  'police_ward',
  'police_area',
  'ca_ward',
  'ca_area',
  'ca_officer',
]);

// Column names are chosen from these maps only, never from request text
const CHANNEL_COLUMNS: Readonly<Record<NotificationChannel, string>> = {
  inApp: 'channel_in_app',
  push: 'channel_push',
  email: 'channel_email',
};
const CATEGORY_COLUMNS: Readonly<Record<NotificationCategory, string>> = {
  taskAssigned: 'task_assigned',
  taskOverdue: 'task_overdue',
  attendanceReminder: 'attendance_reminder',
  leaveApproval: 'leave_approval',
  systemAnnouncements: 'system_announcements',
  sosAlerts: 'sos_alerts',
};

const camel = (column: string) =>
  column.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

const SELECT_COLUMNS = [
  ...Object.values(CHANNEL_COLUMNS),
  ...Object.values(CATEGORY_COLUMNS),
  'updated_at',
]
  .map((column) => `p.${column} AS "${camel(column)}"`)
  .join(', ');

type StoredRow = Record<string, boolean> & { updatedAt: Date };

type PreferenceActor = Pick<JwtPayload, 'sub' | 'role' | 'roles'>;

// Own keys only: "__proto__", "constructor" and the like never name a column
const hasOwn = (map: object, key: string): boolean =>
  Object.keys(map).includes(key);

@Injectable()
export class NotificationPreferencesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(actor: PreferenceActor): Promise<NotificationPreferencesView> {
    const [row] = await this.dataSource.query<StoredRow[]>(
      `SELECT ${SELECT_COLUMNS}
       FROM notification_preferences p
       WHERE p.user_id = $1`,
      [actor.sub],
    );
    return this.view(actor, row);
  }

  async update(
    actor: PreferenceActor,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferencesView> {
    const responder = holdsAnyRole(actor, SOS_RESPONDER_ROLES);
    if (
      !preferences.channels.inApp ||
      (responder && !preferences.categories.sosAlerts)
    ) {
      throw new BadRequestException('notification_preference_mandatory');
    }

    const columns = [
      ...NOTIFICATION_CHANNELS.map((c) => CHANNEL_COLUMNS[c]),
      ...NOTIFICATION_CATEGORIES.map((c) => CATEGORY_COLUMNS[c]),
    ];
    const values = [
      ...NOTIFICATION_CHANNELS.map((c) => preferences.channels[c]),
      ...NOTIFICATION_CATEGORIES.map((c) => preferences.categories[c]),
    ];
    const [row] = await queryRows<StoredRow>(
      this.dataSource,
      `INSERT INTO notification_preferences AS p
         (user_id, ${columns.join(', ')}, updated_at)
       VALUES ($1::uuid, ${columns.map((_c, i) => `$${i + 2}`).join(', ')}, now())
       ON CONFLICT (user_id) DO UPDATE
         SET ${columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()
       RETURNING ${SELECT_COLUMNS}`,
      [actor.sub, ...values],
    );
    return this.view(actor, row);
  }

  /**
   * The recipients, in the given order, who accept a category on a channel. For notification
   * senders: users without stored preferences get the defaults, the in-app channel is never
   * filtered, and SOS alerts always reach responders.
   */
  async acceptingRecipients(
    userIds: string[],
    category: NotificationCategory,
    channel: NotificationChannel,
  ): Promise<string[]> {
    if (!hasOwn(CATEGORY_COLUMNS, category)) {
      throw new Error('unknown_notification_category');
    }
    if (!hasOwn(CHANNEL_COLUMNS, channel)) {
      throw new Error('unknown_notification_channel');
    }
    if (!userIds.length) return [];

    const params: unknown[] = [userIds];
    const conditions: string[] = [];
    if (channel !== 'inApp') {
      conditions.push(
        `COALESCE(p.${CHANNEL_COLUMNS[channel]}, ${DEFAULT_NOTIFICATION_PREFERENCES.channels[channel]})`,
      );
    }
    const categoryAccepted = `COALESCE(p.${CATEGORY_COLUMNS[category]}, ${DEFAULT_NOTIFICATION_PREFERENCES.categories[category]})`;
    if (category === 'sosAlerts') {
      params.push([...SOS_RESPONDER_ROLES].sort());
      conditions.push(
        `(${categoryAccepted} OR EXISTS (
           SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.code = ANY($2::text[])))`,
      );
    } else {
      conditions.push(categoryAccepted);
    }

    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT u.id
       FROM unnest($1::uuid[]) WITH ORDINALITY AS u(id, position)
       LEFT JOIN notification_preferences p ON p.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.position`,
      params,
    );
    return rows.map((r) => r.id);
  }

  private view(
    actor: PreferenceActor,
    row: StoredRow | undefined,
  ): NotificationPreferencesView {
    const responder = holdsAnyRole(actor, SOS_RESPONDER_ROLES);
    const pick = <K extends string>(
      keys: readonly K[],
      columns: Readonly<Record<K, string>>,
      defaults: Readonly<Record<K, boolean>>,
    ) =>
      Object.fromEntries(
        keys.map((key) => [
          key,
          row ? Boolean(row[camel(columns[key])]) : defaults[key],
        ]),
      ) as Record<K, boolean>;

    const channels = pick(
      NOTIFICATION_CHANNELS,
      CHANNEL_COLUMNS,
      DEFAULT_NOTIFICATION_PREFERENCES.channels,
    );
    const categories = pick(
      NOTIFICATION_CATEGORIES,
      CATEGORY_COLUMNS,
      DEFAULT_NOTIFICATION_PREFERENCES.categories,
    );
    const mandatory = ['channels.inApp'];
    channels.inApp = true;
    if (responder) {
      mandatory.push('categories.sosAlerts');
      categories.sosAlerts = true;
    }
    return {
      channels,
      categories,
      mandatory,
      updatedAt: row?.updatedAt ?? null,
      isDefault: !row,
    };
  }
}

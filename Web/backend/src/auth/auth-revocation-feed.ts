// Ended sessions and changed accounts, as Postgres announces them (migration 035). Every
// session revocation and every change of an account's version or status sends a
// notification on AUTH_REVOCATION_CHANNEL from a trigger, so whatever path made the change
// is covered, and the notification is delivered only once that change commits: a client
// told its session ended can never sign back in on the state from before. Each replica
// listens on its own connection and acts on the sockets it holds.
//
// A notification sent while the listening connection is down is lost, so subscribers are
// asked to re-check everything they hold (resync) each time the connection is (re)opened.
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

export const AUTH_REVOCATION_CHANNEL = 'mms_auth_revocation';

/**
 * - session: the session ended (signed out, revoked on a device, ended by refresh); a
 *   rotation, which continues the session under a new id, is not announced
 * - account: the account's version or status changed; tokens of another version, and
 *   every token once the account is not active, no longer work
 */
export type AuthRevocation =
  | { kind: 'session'; userId: string; sessionId: string; tenantId?: string }
  | {
      kind: 'account';
      userId: string;
      version: number;
      active: boolean;
      tenantId?: string;
    };

export interface AuthRevocationSubscriber {
  revoked(event: AuthRevocation): void;
  /** Notifications may have been missed: re-check everything held. */
  resync(): void;
}

/** The part of a pg.Client the feed uses. */
export interface ListenerConnection {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<unknown>;
  on(
    event: 'notification',
    listener: (message: { channel: string; payload?: string }) => void,
  ): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export type ListenerConnectionFactory = () => ListenerConnection;
export const LISTENER_CONNECTION_FACTORY = Symbol(
  'AUTH_REVOCATION_LISTENER_CONNECTION_FACTORY',
);

// Delays before reconnecting, in ms; the last one repeats
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The event a notification payload describes, or null when it describes none. */
export function parseAuthRevocation(payload: string): AuthRevocation | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { kind, userId, sessionId, version, active, tenantId } =
    value as Record<string, unknown>;
  if (typeof userId !== 'string' || !isUUID(userId)) return null;
  // Named since migration 039; absent from an older trigger
  if (
    tenantId !== undefined &&
    (typeof tenantId !== 'string' || !isUUID(tenantId))
  ) {
    return null;
  }
  const tenant =
    typeof tenantId === 'string' ? { tenantId: tenantId.toLowerCase() } : {};
  if (kind === 'session') {
    return typeof sessionId === 'string' && isUUID(sessionId)
      ? { kind, userId, sessionId, ...tenant }
      : null;
  }
  if (kind === 'account') {
    // auth_version is a BIGINT: the trigger may send it as a number or a string
    const parsed =
      typeof version === 'number' || typeof version === 'string'
        ? Number(version)
        : NaN;
    return Number.isSafeInteger(parsed) && typeof active === 'boolean'
      ? { kind, userId, version: parsed, active, ...tenant }
      : null;
  }
  return null;
}

@Injectable()
export class AuthRevocationFeed
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AuthRevocationFeed.name);
  private readonly subscribers = new Set<AuthRevocationSubscriber>();
  private connection: ListenerConnection | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private failedAttempts = 0;
  private stopped = false;

  constructor(
    @Inject(LISTENER_CONNECTION_FACTORY)
    private readonly connect: ListenerConnectionFactory,
  ) {}

  /** Delivers every event to `subscriber` until the returned function is called. */
  subscribe(subscriber: AuthRevocationSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  // Listening before the HTTP server accepts anyone; an unreachable database does not stop
  // the application (TypeORM reports that), the feed keeps retrying
  async onApplicationBootstrap(): Promise<void> {
    this.stopped = false;
    await this.open();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) await this.close(connection);
  }

  private async open(): Promise<void> {
    const connection = this.connect();
    this.connection = connection;
    let lost = false;
    const onLost = (error?: Error) => {
      if (lost) return;
      lost = true;
      if (this.connection === connection) this.connection = null;
      if (this.stopped) return;
      this.logger.warn(
        `Auth revocation feed lost its database connection${error ? ` (${error.message})` : ''}; reconnecting`,
      );
      void this.close(connection);
      this.scheduleReconnect();
    };
    connection.on('notification', (message) => this.deliver(message));
    connection.on('error', (error) => onLost(error));
    connection.on('end', () => onLost());

    try {
      await connection.connect();
      await connection.query(`LISTEN ${AUTH_REVOCATION_CHANNEL}`);
    } catch (error) {
      if (lost) return;
      lost = true;
      if (this.connection === connection) this.connection = null;
      void this.close(connection);
      if (this.stopped) return;
      this.logger.warn(
        `Auth revocation feed could not listen (${errorMessage(error)}); retrying`,
      );
      this.scheduleReconnect();
      return;
    }
    this.failedAttempts = 0;
    for (const subscriber of [...this.subscribers]) {
      this.call(() => subscriber.resync());
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped) return;
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.failedAttempts, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.failedAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) void this.open();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private async close(connection: ListenerConnection): Promise<void> {
    try {
      await connection.end();
    } catch (error) {
      this.logger.warn(
        `Auth revocation feed could not close a connection (${errorMessage(error)})`,
      );
    }
  }

  private deliver(message: { channel: string; payload?: string }): void {
    if (message.channel !== AUTH_REVOCATION_CHANNEL) return;
    const event = parseAuthRevocation(message.payload ?? '');
    if (!event) {
      // Dropping an announcement it cannot read would leave the session it ended open:
      // every subscriber checks everything it holds instead
      this.logger.warn(
        `Could not read an auth revocation notification, re-checking every session: ${message.payload ?? '(empty)'}`,
      );
      for (const subscriber of [...this.subscribers]) {
        this.call(() => subscriber.resync());
      }
      return;
    }
    for (const subscriber of [...this.subscribers]) {
      this.call(() => subscriber.revoked(event));
    }
  }

  // One subscriber failing must not keep the event from the others
  private call(work: () => void): void {
    try {
      work();
    } catch (error) {
      this.logger.warn(
        `An auth revocation subscriber failed (${errorMessage(error)})`,
      );
    }
  }
}

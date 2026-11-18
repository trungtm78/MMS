// BR-AUTH-02: five failed sign-ins on one submitted name lock it for 30 minutes.
//
// The counter lives in Postgres (login_attempts, migration 030), so every backend replica
// shares it and it survives restarts. An attempt takes a slot under the counter's row lock
// before its password is checked, and failures plus attempts still being checked never
// exceed the limit: a burst of concurrent guesses cannot get past it. The slot is then
// settled as a failure (counted, locking at the limit) or a pass (freed).
//
// Counters are keyed by an HMAC of the name as typed (trimmed, lower-cased), whether or not
// the account exists, so a lock reveals nothing about which usernames are real, and the
// table never holds what people typed (a password entered as the username included).
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import { queryRows } from '../database/query-rows';

export const LOGIN_FAILURE_LIMIT = 5;
/** How long a lock lasts, and how long failures keep adding up after the last one. */
export const LOGIN_LOCK_MINUTES = 30;
/** No sign-in takes this long: slots older than this belong to a stopped instance. */
export const LOGIN_PENDING_STALE_MINUTES = 5;

export const LOGIN_ATTEMPT_KEY = Symbol('LOGIN_ATTEMPT_KEY');

export interface LoginAttempt {
  /** The name is unknown or the password wrong: counts towards the lock. */
  failed(): Promise<void>;
  /** The password was right: not a failure. Earlier failures stay until sign-in completes. */
  passed(): Promise<void>;
  /** Frees the slot of an attempt an unexpected error ended; a no-op once settled. */
  release(): Promise<void>;
}

interface CounterRow {
  failed_count: number;
  pending_count: number;
  locked: boolean;
  failures_expired: boolean;
  pending_stale: boolean;
}

const RESERVE_SQL = `
  SELECT failed_count, pending_count,
         locked_until IS NOT NULL AND locked_until > now() AS locked,
         CASE WHEN locked_until IS NOT NULL THEN locked_until <= now()
              ELSE last_failure_at IS NULL
                   OR last_failure_at <= now() - make_interval(mins => $2)
         END AS failures_expired,
         pending_updated_at IS NULL
           OR pending_updated_at <= now() - make_interval(mins => $3) AS pending_stale
  FROM login_attempts
  WHERE name_hash = $1
  FOR UPDATE`;

const FAILED_SQL = `
  INSERT INTO login_attempts (name_hash, failed_count, last_failure_at, locked_until)
  VALUES ($1, 1, now(), CASE WHEN 1 >= $2 THEN now() + make_interval(mins => $3) END)
  ON CONFLICT (name_hash) DO UPDATE SET
    pending_count = GREATEST(login_attempts.pending_count - 1, 0),
    failed_count = login_attempts.failed_count + 1,
    last_failure_at = now(),
    locked_until = CASE WHEN login_attempts.failed_count + 1 >= $2
                        THEN now() + make_interval(mins => $3)
                        ELSE login_attempts.locked_until END`;

const PASSED_SQL = `UPDATE login_attempts SET pending_count = GREATEST(pending_count - 1, 0) WHERE name_hash = $1`;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(LOGIN_ATTEMPT_KEY) private readonly key: Buffer,
  ) {}

  /** The counter key of a submitted name. */
  nameHash(username: string): string {
    return createHmac('sha256', this.key)
      .update(username.trim().toLowerCase())
      .digest('hex');
  }

  /** Takes a slot for one sign-in attempt; 403 account_locked when none is left. */
  async begin(username: string): Promise<LoginAttempt> {
    const nameHash = this.nameHash(username);
    const granted = await this.dataSource.transaction(async (mgr) => {
      await mgr.query(
        `INSERT INTO login_attempts (name_hash) VALUES ($1) ON CONFLICT (name_hash) DO NOTHING`,
        [nameHash],
      );
      const [counter] = await mgr.query<CounterRow[]>(RESERVE_SQL, [
        nameHash,
        LOGIN_LOCK_MINUTES,
        LOGIN_PENDING_STALE_MINUTES,
      ]);
      if (counter.locked) return false;
      const failed = counter.failures_expired ? 0 : counter.failed_count;
      const pending = counter.pending_stale ? 0 : counter.pending_count;
      if (failed + pending >= LOGIN_FAILURE_LIMIT) return false;
      await mgr.query(
        `UPDATE login_attempts
         SET failed_count = $2, pending_count = $3, pending_updated_at = now(), locked_until = NULL
         WHERE name_hash = $1`,
        [nameHash, failed, pending + 1],
      );
      return true;
    });
    if (!granted) throw new ForbiddenException('account_locked');
    return this.attempt(nameHash);
  }

  /** Forgets failures and any lock once every factor of a sign-in has passed. */
  async clear(username: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE login_attempts SET failed_count = 0, last_failure_at = NULL, locked_until = NULL WHERE name_hash = $1`,
      [this.nameHash(username)],
    );
  }

  /** Deletes counters that neither lock, count nor hold a live slot; returns how many. */
  async purgeExpired(): Promise<number> {
    const purged = await queryRows<{ name_hash: string }>(
      this.dataSource,
      `DELETE FROM login_attempts
       WHERE (locked_until IS NULL OR locked_until <= now())
         AND (last_failure_at IS NULL OR last_failure_at <= now() - make_interval(mins => $1))
         AND (pending_count = 0 OR pending_updated_at IS NULL
              OR pending_updated_at <= now() - make_interval(mins => $2))
       RETURNING name_hash`,
      [LOGIN_LOCK_MINUTES, LOGIN_PENDING_STALE_MINUTES],
    );
    return purged.length;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeOnSchedule(): Promise<void> {
    try {
      const purged = await this.purgeExpired();
      if (purged > 0) {
        this.logger.log(`Purged ${purged} expired sign-in counters`);
      }
    } catch (error) {
      this.logger.error(
        `Purging expired sign-in counters failed: ${errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private attempt(nameHash: string): LoginAttempt {
    let settled = false;
    const settle = async (sql: string, parameters: unknown[]) => {
      if (settled) return;
      settled = true;
      await this.dataSource.query(sql, parameters);
    };
    const passed = () => settle(PASSED_SQL, [nameHash]);

    return {
      failed: () =>
        settle(FAILED_SQL, [nameHash, LOGIN_FAILURE_LIMIT, LOGIN_LOCK_MINUTES]),
      passed,
      release: async () => {
        // Runs while another error is being handled, which must not be replaced
        try {
          await passed();
        } catch (error) {
          this.logger.warn(
            `Could not free a sign-in attempt slot (${errorMessage(error)}); it lapses after ${LOGIN_PENDING_STALE_MINUTES} minutes without attempts`,
          );
        }
      },
    };
  }
}

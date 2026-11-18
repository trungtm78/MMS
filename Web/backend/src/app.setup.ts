import { isIP } from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

export type TrustProxy = boolean | number | string;

export interface HttpAppOptions {
  apiPrefix: string;
  /** Browser origins allowed to call the API; CORS stays off when omitted. */
  corsOrigin?: string | string[];
  /**
   * Express "trust proxy": which reverse proxies may state the client address in
   * X-Forwarded-For. Rate limits, sessions and audit rows use that address.
   */
  trustProxy?: TrustProxy;
}

const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

const TRUST_PROXY_FORMS =
  'true, false, a hop count, or a comma-separated list of IP addresses, CIDR ranges, loopback, linklocal and uniquelocal';

function invalidTrustProxy(detail: string): Error {
  return new Error(
    `TRUST_PROXY is invalid: ${detail}. Expected ${TRUST_PROXY_FORMS}.`,
  );
}

/** One list entry: a keyword, an IP address, or an IP/prefix-length range. */
function trustedProxyEntry(entry: string): string {
  if (!entry) throw invalidTrustProxy('the list has an empty entry');

  const keyword = entry.toLowerCase();
  if (TRUST_PROXY_KEYWORDS.has(keyword)) return keyword;

  const [address, prefix, ...extra] = entry.split('/');
  const family = entry.includes('%') ? 0 : isIP(address);
  if (family !== 0 && extra.length === 0) {
    if (prefix === undefined) return entry;
    const maxPrefix = family === 4 ? 32 : 128;
    if (/^\d{1,3}$/.test(prefix) && Number(prefix) <= maxPrefix) return entry;
  }
  throw invalidTrustProxy(
    `"${entry}" is not an IP address, a CIDR range (address/prefix length) or one of loopback, linklocal, uniquelocal; a hop count or true/false must stand alone`,
  );
}

/**
 * TRUST_PROXY validated and converted to what Express expects: true/false, a hop count, or
 * an address list. Anything else fails, since Express would read a malformed value as an
 * address (an integer-like string even as an IPv4 address) and trust the wrong peers.
 *
 * In production the variable is required: behind a proxy without it every client shares
 * the proxy's address, so one client's failed sign-ins throttle everyone. "false" is the
 * deliberate choice for an API that clients reach directly. "true" trusts any peer and is
 * only safe when nothing but the proxy can reach the API.
 */
export function trustProxySetting(
  raw: string | undefined,
  options: { production?: boolean } = {},
): TrustProxy | undefined {
  const value = raw?.trim();
  if (!value) {
    if (options.production) {
      throw new Error(
        'TRUST_PROXY must be set when NODE_ENV=production: list the reverse proxies in front of the API ' +
          '(behind the bundled nginx: "loopback, linklocal, uniquelocal"), or set it to false when clients ' +
          "connect directly. Without it every client is rate-limited as the proxy's address.",
      );
    }
    return undefined;
  }

  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (!Number.isSafeInteger(hops)) {
      throw invalidTrustProxy(`hop count "${value}" is too large`);
    }
    return hops;
  }

  return value
    .split(',')
    .map((entry) => trustedProxyEntry(entry.trim()))
    .join(', ');
}

/** TRUST_PROXY from the process environment, required when NODE_ENV=production. */
export function trustProxyFromEnv(
  env: Record<string, string | undefined> = process.env,
): TrustProxy | undefined {
  return trustProxySetting(env.TRUST_PROXY, {
    production: env.NODE_ENV?.trim() === 'production',
  });
}

// HTTP behaviour shared by main.ts and the e2e suites, so the tests exercise the API
// exactly as it is served
export function configureHttpApp(
  app: INestApplication,
  options: HttpAppOptions,
): void {
  app.setGlobalPrefix(options.apiPrefix);

  if (options.trustProxy !== undefined) {
    const express = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: unknown): void;
    };
    express.set('trust proxy', options.trustProxy);
  }

  if (options.corsOrigin !== undefined) {
    app.enableCors({
      origin: options.corsOrigin,
      credentials: true,
      // Every method a route uses: leave approvals are PUT
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}

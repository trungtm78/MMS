// The HTTP behaviour main.ts applies must be the one the e2e suites test against
import { ValidationPipe } from '@nestjs/common';
import {
  configureHttpApp,
  trustProxyFromEnv,
  trustProxySetting,
} from './app.setup';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function fakeApp() {
  const express = { set: jest.fn() };
  return {
    express,
    setGlobalPrefix: jest.fn(),
    enableCors: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
    getHttpAdapter: () => ({ getInstance: () => express }),
  };
}

describe('configureHttpApp', () => {
  it('serves the API under the configured prefix', () => {
    const app = fakeApp();

    configureHttpApp(app as never, { apiPrefix: 'api/v1/mms_core' });

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1/mms_core');
  });

  it('rejects unknown properties and converts input to the declared types', () => {
    const app = fakeApp();

    configureHttpApp(app as never, { apiPrefix: 'api' });

    const [pipe] = app.useGlobalPipes.mock.calls[0] as [ValidationPipe];
    expect(pipe).toBeInstanceOf(ValidationPipe);
    const internals = pipe as unknown as {
      validatorOptions: object;
      isTransformEnabled: boolean;
    };
    expect(internals.validatorOptions).toMatchObject({
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(internals.isTransformEnabled).toBe(true);
  });

  it('formats every error with the shared exception filter', () => {
    const app = fakeApp();

    configureHttpApp(app as never, { apiPrefix: 'api' });

    const [filter] = app.useGlobalFilters.mock.calls[0] as [unknown];
    expect(filter).toBeInstanceOf(HttpExceptionFilter);
  });

  // The web app approves and rejects leave with PUT; a preflight that omits it blocks the call
  it('allows every HTTP method the API serves from the web origin', () => {
    const app = fakeApp();

    configureHttpApp(app as never, {
      apiPrefix: 'api',
      corsOrigin: ['http://localhost:5173'],
    });

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  });

  // Behind nginx every request arrives from the proxy; without this, rate limits and audit
  // rows would treat all clients as one address
  it('trusts the configured reverse proxies for the client address', () => {
    const app = fakeApp();

    configureHttpApp(app as never, {
      apiPrefix: 'api',
      trustProxy: 'loopback, linklocal, uniquelocal',
    });

    expect(app.express.set).toHaveBeenCalledWith(
      'trust proxy',
      'loopback, linklocal, uniquelocal',
    );
  });

  it('trusts no proxy unless configured', () => {
    const app = fakeApp();

    configureHttpApp(app as never, { apiPrefix: 'api' });

    expect(app.express.set).not.toHaveBeenCalled();
  });

  it('leaves CORS off when no origin is configured', () => {
    const app = fakeApp();

    configureHttpApp(app as never, { apiPrefix: 'api' });

    expect(app.enableCors).not.toHaveBeenCalled();
  });
});

describe('trustProxySetting', () => {
  const ACCEPTED: [
    string | undefined,
    boolean | number | string | undefined,
  ][] = [
    [undefined, undefined],
    ['', undefined],
    ['   ', undefined],
    ['true', true],
    ['false', false],
    [' TRUE ', true],
    ['False', false],
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['loopback, uniquelocal', 'loopback, uniquelocal'],
    ['loopback,linklocal,uniquelocal', 'loopback, linklocal, uniquelocal'],
    ['Loopback, UniqueLocal', 'loopback, uniquelocal'],
    ['10.0.0.1', '10.0.0.1'],
    ['10.0.0.0/8, 172.16.0.0/12', '10.0.0.0/8, 172.16.0.0/12'],
    ['::1, fc00::/7, fe80::/10', '::1, fc00::/7, fe80::/10'],
    ['192.168.1.10/32, loopback', '192.168.1.10/32, loopback'],
  ];

  it.each(ACCEPTED)('reads TRUST_PROXY=%p as %p', (raw, expected) => {
    expect(trustProxySetting(raw)).toBe(expected);
  });

  // Whatever passes validation must be a value Express itself compiles
  it.each(ACCEPTED.filter(([, value]) => value !== undefined))(
    'hands Express a value it accepts for TRUST_PROXY=%p',
    (raw) => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const express = require('express') as () => {
        set(setting: string, value: unknown): void;
        get(setting: string): unknown;
      };
      /* eslint-enable @typescript-eslint/no-require-imports */
      const app = express();

      app.set('trust proxy', trustProxySetting(raw));

      expect(typeof app.get('trust proxy fn')).toBe('function');
    },
  );

  // Express would read "1.5" or "2 hops" as an address and fail with an unrelated message,
  // or read an integer-like string as an IPv4 address
  it.each([
    '-1',
    '+1',
    '1.5',
    '1e3',
    '0x10',
    '2 hops',
    '99999999999999999999',
    'yes',
    'on',
    'localhost',
    'loopback,',
    ',loopback',
    'loopback,,uniquelocal',
    '1, loopback',
    'true, loopback',
    '300.1.1.1',
    '10.0.0/8',
    '10.0.0.0/',
    '10.0.0.0/33',
    '10.0.0.0/8/8',
    '::1/129',
    '10.0.0.0/255.0.0.0',
  ])('rejects TRUST_PROXY=%p', (raw) => {
    expect(() => trustProxySetting(raw)).toThrow(/TRUST_PROXY/);
    expect(() => trustProxySetting(raw, { production: true })).toThrow(
      /TRUST_PROXY/,
    );
  });

  it('names the offending entry of a list', () => {
    expect(() => trustProxySetting('loopback, 10.0.0.0/33')).toThrow(
      /10\.0\.0\.0\/33/,
    );
  });

  // Behind nginx without it, every client shares the proxy's address and one person's
  // failed sign-ins throttle everybody
  it.each([undefined, '', '  '])(
    'requires TRUST_PROXY in production (value %p)',
    (raw) => {
      expect(() => trustProxySetting(raw, { production: true })).toThrow(
        /TRUST_PROXY must be set when NODE_ENV=production/,
      );
    },
  );

  it('accepts an explicit false in production for an API served without a proxy', () => {
    expect(trustProxySetting('false', { production: true })).toBe(false);
  });

  it('accepts the compose topology in production', () => {
    expect(
      trustProxySetting('loopback, linklocal, uniquelocal', {
        production: true,
      }),
    ).toBe('loopback, linklocal, uniquelocal');
  });
});

// main.ts reads the process environment through this
describe('trustProxyFromEnv', () => {
  it('is required when NODE_ENV=production', () => {
    expect(() => trustProxyFromEnv({ NODE_ENV: 'production' })).toThrow(
      /TRUST_PROXY/,
    );
  });

  it('is optional in other environments', () => {
    expect(trustProxyFromEnv({ NODE_ENV: 'development' })).toBeUndefined();
    expect(trustProxyFromEnv({})).toBeUndefined();
  });

  it('validates the configured value', () => {
    expect(
      trustProxyFromEnv({ NODE_ENV: 'production', TRUST_PROXY: 'loopback' }),
    ).toBe('loopback');
    expect(() =>
      trustProxyFromEnv({ NODE_ENV: 'development', TRUST_PROXY: 'yes' }),
    ).toThrow(/TRUST_PROXY/);
  });
});

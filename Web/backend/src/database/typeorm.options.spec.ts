import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { bindTenantToConnections } from './tenancy/bind-tenant';
import {
  assertLegacyRoleSeesTenantData,
  assertLegacyTenantDefaultPresent,
  assertNoLegacyTenantDefault,
  assertRuntimeRoleEnforcesRls,
} from './tenancy/boot-guards';
import { TenancyConfigError } from './tenancy/tenancy-mode';
import { buildTypeOrmOptions, tenantAwareDataSource } from './typeorm.options';

jest.mock('typeorm', () => ({
  ...jest.requireActual<typeof import('typeorm')>('typeorm'),
  DataSource: jest.fn(),
}));
jest.mock('./tenancy/bind-tenant');
jest.mock('./tenancy/boot-guards');

const MockedDataSource = DataSource as unknown as jest.Mock;
const options = { type: 'postgres', url: 'postgres://x' } as DataSourceOptions;

describe('buildTypeOrmOptions', () => {
  const config = { get: jest.fn() } as unknown as ConfigService;

  it('never synchronizes the schema or installs extensions: the migrations own both', () => {
    expect(buildTypeOrmOptions(config)).toMatchObject({
      synchronize: false,
      installExtensions: false,
    });
  });

  it('gives up at once on a tenancy configuration error and retries anything else', () => {
    const { toRetry } = buildTypeOrmOptions(config);
    expect(toRetry?.(new TenancyConfigError('bad'))).toBe(false);
    expect(toRetry?.(new Error('connection refused'))).toBe(true);
  });
});

describe('tenantAwareDataSource', () => {
  const originalMode = process.env.TENANCY_MODE;
  const calls: string[] = [];
  const fake = { initialize: jest.fn(), destroy: jest.fn() };

  beforeEach(() => {
    calls.length = 0;
    jest.resetAllMocks();
    MockedDataSource.mockImplementation(() => fake);
    fake.initialize.mockImplementation(() => {
      calls.push('initialize');
      return Promise.resolve(fake);
    });
    fake.destroy.mockImplementation(() => {
      calls.push('destroy');
      return Promise.resolve();
    });
    jest.mocked(bindTenantToConnections).mockImplementation(() => {
      calls.push('bind');
    });
    jest.mocked(assertNoLegacyTenantDefault).mockImplementation(() => {
      calls.push('legacyDefaultGuard');
      return Promise.resolve();
    });
    jest.mocked(assertRuntimeRoleEnforcesRls).mockImplementation(() => {
      calls.push('roleGuard');
      return Promise.resolve();
    });
    jest.mocked(assertLegacyTenantDefaultPresent).mockImplementation(() => {
      calls.push('legacyDefaultPresentGuard');
      return Promise.resolve();
    });
    jest.mocked(assertLegacyRoleSeesTenantData).mockImplementation(() => {
      calls.push('legacyRoleGuard');
      return Promise.resolve();
    });
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = originalMode;
  });

  describe('in legacy mode', () => {
    beforeEach(() => {
      delete process.env.TENANCY_MODE;
    });

    it('opens a data source with no binding, then checks the legacy database and role', async () => {
      await expect(tenantAwareDataSource(options)).resolves.toBe(fake);

      expect(MockedDataSource).toHaveBeenCalledWith(options);
      expect(calls).toEqual([
        'initialize',
        'legacyDefaultPresentGuard',
        'legacyRoleGuard',
      ]);
      expect(bindTenantToConnections).not.toHaveBeenCalled();
      expect(assertLegacyTenantDefaultPresent).toHaveBeenCalledWith(fake);
      expect(assertLegacyRoleSeesTenantData).toHaveBeenCalledWith(fake);
      expect(assertNoLegacyTenantDefault).not.toHaveBeenCalled();
      expect(assertRuntimeRoleEnforcesRls).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a database that lost its default tenant',
        assertLegacyTenantDefaultPresent,
      ],
      [
        'a role that Row-Level Security would lock out',
        assertLegacyRoleSeesTenantData,
      ],
    ])('closes the data source and rethrows for %s', async (_name, guard) => {
      const refusal = new TenancyConfigError('refused');
      jest.mocked(guard).mockRejectedValue(refusal);

      await expect(tenantAwareDataSource(options)).rejects.toBe(refusal);

      expect(fake.destroy).toHaveBeenCalledTimes(1);
    });

    it('does not look at the role once the database is already refused', async () => {
      jest
        .mocked(assertLegacyTenantDefaultPresent)
        .mockRejectedValue(new TenancyConfigError('no default'));

      await expect(tenantAwareDataSource(options)).rejects.toBeInstanceOf(
        TenancyConfigError,
      );

      expect(assertLegacyRoleSeesTenantData).not.toHaveBeenCalled();
    });
  });

  describe('in enforced mode', () => {
    beforeEach(() => {
      process.env.TENANCY_MODE = 'enforced';
    });

    it('binds before the first connection, then checks the database and the role', async () => {
      await expect(tenantAwareDataSource(options)).resolves.toBe(fake);

      expect(calls).toEqual([
        'bind',
        'initialize',
        'legacyDefaultGuard',
        'roleGuard',
      ]);
      expect(bindTenantToConnections).toHaveBeenCalledWith(fake);
      expect(assertNoLegacyTenantDefault).toHaveBeenCalledWith(fake);
      expect(assertRuntimeRoleEnforcesRls).toHaveBeenCalledWith(fake);
      expect(assertLegacyTenantDefaultPresent).not.toHaveBeenCalled();
      expect(assertLegacyRoleSeesTenantData).not.toHaveBeenCalled();
    });

    it.each([
      ['the legacy tenant default', assertNoLegacyTenantDefault],
      ['a bypassing runtime role', assertRuntimeRoleEnforcesRls],
    ])(
      'closes the data source and rethrows when %s is found',
      async (_name, guard) => {
        const refusal = new TenancyConfigError('refused');
        jest.mocked(guard).mockRejectedValue(refusal);

        await expect(tenantAwareDataSource(options)).rejects.toBe(refusal);

        expect(fake.destroy).toHaveBeenCalledTimes(1);
      },
    );

    it('reports the guard error even when closing the data source fails too', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const refusal = new TenancyConfigError('refused');
      jest.mocked(assertRuntimeRoleEnforcesRls).mockRejectedValue(refusal);
      fake.destroy.mockRejectedValue(new Error('already closed'));

      await expect(tenantAwareDataSource(options)).rejects.toBe(refusal);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('already closed'),
      );
      warn.mockRestore();
    });

    it('leaves a failed connection alone: initialize cleans up after itself', async () => {
      const down = new Error('connection refused');
      fake.initialize.mockRejectedValue(down);

      await expect(tenantAwareDataSource(options)).rejects.toBe(down);

      expect(fake.destroy).not.toHaveBeenCalled();
      expect(assertNoLegacyTenantDefault).not.toHaveBeenCalled();
    });
  });

  it('fails before any connection on an unknown TENANCY_MODE', async () => {
    process.env.TENANCY_MODE = 'enforce';

    await expect(tenantAwareDataSource(options)).rejects.toBeInstanceOf(
      TenancyConfigError,
    );

    expect(fake.initialize).not.toHaveBeenCalled();
  });
});

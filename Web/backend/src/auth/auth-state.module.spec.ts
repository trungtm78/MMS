import type { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { pgListenerConnectionFactory } from './auth-state.module';

describe('pgListenerConnectionFactory', () => {
  it('opens a separate, named connection to the configured database each time', () => {
    const values: Record<string, unknown> = {
      'database.host': 'db.internal',
      'database.port': 5440,
      'database.username': 'mms',
      'database.password': 'secret',
      'database.database': 'MMS',
    };
    const config = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;

    const create = pgListenerConnectionFactory(config);
    const first = create() as Client;
    const second = create() as Client;

    expect(first).toBeInstanceOf(Client);
    expect(second).not.toBe(first);
    expect(first).toEqual(
      expect.objectContaining({
        host: 'db.internal',
        port: 5440,
        user: 'mms',
        database: 'MMS',
      }),
    );
    expect(
      (first as unknown as { connectionParameters: Record<string, unknown> })
        .connectionParameters.application_name,
    ).toBe('mms-auth-revocations');
  });
});

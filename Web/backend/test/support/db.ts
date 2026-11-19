import { Client } from 'pg';
import { fixtureConnectionOptions } from './e2e-tenancy';

/**
 * Runs `fn` with a connected client and always closes it. In an enforced run the session
 * defaults to the first tenant (support/e2e-tenancy.ts), as the legacy database default did.
 */
export async function withClient<T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: url,
    options: fixtureConnectionOptions(),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

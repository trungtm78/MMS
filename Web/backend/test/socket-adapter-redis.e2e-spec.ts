// Two backend instances share Socket.IO events through Redis: a client connected to one
// instance receives what the other emits, including after Redis dropped the connections.
//
// Requires TEST_REDIS_URL, e.g. redis://localhost:6379 (host, port and password are read
// from it)
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import type { IoAdapter } from '@nestjs/platform-socket.io';
import Redis from 'ioredis';
import type { Server } from 'socket.io';
import {
  io as connectClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import { createSocketIoAdapter } from '../src/common/realtime/socket-io-adapter';
import { rooms } from '../src/notifications/rooms';

jest.setTimeout(60_000);

const redisUrl = process.env.TEST_REDIS_URL;
if (!redisUrl) {
  throw new Error(
    'TEST_REDIS_URL is not set (e.g. redis://localhost:6379); this suite needs a real Redis',
  );
}
const target = new URL(redisUrl);
const ENV = {
  NODE_ENV: 'production',
  REDIS_HOST: target.hostname,
  REDIS_PORT: target.port || '6379',
  REDIS_PASSWORD: decodeURIComponent(target.password),
};
const CONNECTION_NAME = 'mms:socket-io';
const quietLogger = { log: () => undefined, warn: () => undefined };

interface Instance {
  http: HttpServer;
  io: Server;
  adapter: IoAdapter;
  url: string;
}

/** A backend instance reduced to its Socket.IO server; clients join the room they name. */
async function startInstance(): Promise<Instance> {
  const http = createServer();
  const adapter = await createSocketIoAdapter(http, ENV, {
    logger: quietLogger,
  });
  const io = adapter.createIOServer(0) as Server;
  io.on('connection', (socket) => {
    const { room } = socket.handshake.auth as { room?: unknown };
    if (typeof room === 'string') void socket.join(room);
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  return { http, io, adapter, url: `http://127.0.0.1:${port}` };
}

/** Polls a condition that settles asynchronously, failing after the timeout. */
async function eventually(
  check: () => Promise<boolean>,
  description: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error(`${description} did not happen within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Opens a short-lived connection to Redis for the checks the suite makes itself. */
async function withRedis<T>(work: (redis: Redis) => Promise<T>): Promise<T> {
  const redis = new Redis(redisUrl!, { lazyConnect: true });
  await redis.connect();
  try {
    return await work(redis);
  } finally {
    await redis.quit();
  }
}

const connectionIds = (redis: Redis) =>
  (redis.client('LIST') as Promise<string>).then((list) =>
    list
      .split('\n')
      .filter((line) => line.includes(` name=${CONNECTION_NAME} `))
      .map((line) => /\bid=(\d+)/.exec(line)?.[1])
      .filter((id): id is string => id !== undefined),
  );

describe('Socket.IO over Redis (e2e)', () => {
  const instances: Instance[] = [];
  const clients: ClientSocket[] = [];

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    for (const instance of instances.splice(0)) {
      await instance.io.close();
      await instance.adapter.dispose();
    }
  });

  const startPair = async () => {
    const pair = [await startInstance(), await startInstance()];
    instances.push(...pair);
    return pair;
  };

  const connectTo = (instance: Instance, room: string) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const client = connectClient(instance.url, {
        auth: { room },
        transports: ['websocket'],
        reconnection: false,
      });
      clients.push(client);
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
    });

  // Every instance answers a cross-instance socket query only once its subscription is
  // live, so a matching count means events published now reach the room's clients
  const seesRoom = (instance: Instance, room: string, count: number) =>
    eventually(
      async () => (await instance.io.in(room).fetchSockets()).length === count,
      `seeing ${count} socket(s) of ${room} from another instance`,
    );

  const nextEvent = <T>(client: ClientSocket, event: string) =>
    new Promise<T>((resolve) => client.once(event, resolve));

  it('delivers a room event emitted on one instance to a client of the other', async () => {
    const [emitting, serving] = await startPair();
    const room = rooms.unit(undefined, `e2e-${Date.now()}`);
    const member = await connectTo(serving, room);
    await seesRoom(emitting, room, 1);

    const received = nextEvent<{ level: string }>(member, 'alert');
    emitting.io.to(room).emit('alert', { level: 'high' });

    await expect(received).resolves.toEqual({ level: 'high' });
  });

  it('keeps a room event from clients outside the room on the other instance', async () => {
    const [emitting, serving] = await startPair();
    const room = rooms.unit(undefined, `e2e-in-${Date.now()}`);
    await connectTo(serving, room);
    const outsider = await connectTo(
      serving,
      rooms.unit(undefined, `e2e-out-${Date.now()}`),
    );
    await seesRoom(emitting, room, 1);

    const alerts: unknown[] = [];
    outsider.on('alert', (payload) => alerts.push(payload));
    const done = nextEvent(outsider, 'done');
    emitting.io.to(room).emit('alert', { level: 'high' });
    // Published after the alert on the same connection, so it arrives after it
    emitting.io.emit('done');

    await done;
    expect(alerts).toEqual([]);
  });

  it('delivers again once both instances reconnected after Redis dropped their connections', async () => {
    const [emitting, serving] = await startPair();
    const room = rooms.unit(undefined, `e2e-reconnect-${Date.now()}`);
    const member = await connectTo(serving, room);
    await seesRoom(emitting, room, 1);

    // Each instance holds a publisher and a subscriber
    const killed = await withRedis(async (redis) => {
      const ids = await connectionIds(redis);
      for (const id of ids) await redis.client('KILL', 'ID', id);
      return ids.length;
    });
    expect(killed).toBeGreaterThanOrEqual(4);

    await eventually(
      () =>
        withRedis(async (redis) => (await connectionIds(redis)).length >= 4),
      'reconnecting every Socket.IO Redis connection',
    );
    await seesRoom(emitting, room, 1);

    const received = nextEvent<{ level: string }>(member, 'alert');
    emitting.io.to(room).emit('alert', { level: 'after-outage' });

    await expect(received).resolves.toEqual({ level: 'after-outage' });
  });
});

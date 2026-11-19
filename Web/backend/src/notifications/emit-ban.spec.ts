// Probe of the lint ban on server-wide socket emits (eslint.config.mjs, eslint-rules/):
// runs ESLint with the repository config over a table of forbidden snippets, each of
// which must be reported, and a table of allowed ones, which must not.
//
// ESLint cannot load its ESM config inside Jest, so eslint-rules/lint-snippets.mjs lints
// every snippet in one child process.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const BACKEND = resolve(__dirname, '../..');
const ELSEWHERE = 'src/notifications/rooms.ts';
const GATEWAY = 'src/notifications/notifications.gateway.ts';

const TYPED = 'mms/no-broadcast-emit';
const SYNTAX = 'no-restricted-syntax';

const program = (body: string) => `
import { EventEmitter } from 'node:events';
import { ServerResponse } from 'node:http';
import { Server, Socket } from 'socket.io';

export class Probe {
  server!: Server;
  events = new EventEmitter();

  run(client: Socket, io: Server, res: ServerResponse) {
${body}
  }
}
`;

interface Forbidden {
  name: string;
  body: string;
  /** Where it is linted; the gateway is the one file that owns the socket server. */
  file?: string;
  /** The rule that must report it (the typed rule unless the type is hidden). */
  by?: typeof TYPED | typeof SYNTAX;
}

// Every way of reaching more than one client that the review found, plus their kin
const forbidden: Forbidden[] = [
  { name: 'this.server.emit', body: `this.server.emit('x', 1);` },
  {
    name: 'destructured server',
    body: `const { server } = this; server.emit('x', 1);`,
  },
  { name: 'optional object', body: `this.server?.emit('x', 1);` },
  { name: 'optional call', body: `this.server.emit?.('x', 1);` },
  {
    name: 'property of a context object',
    body: `const ctx = { server: this.server }; ctx.server.emit('x', 1);`,
  },
  {
    name: 'alias of the server',
    body: `const s = this.server; s.emit('x', 1);`,
  },
  { name: 'io parameter', body: `io.emit('x', 1);` },
  {
    name: 'namespace variable',
    body: `const namespace = this.server.of('/'); namespace.emit('x', 1);`,
  },
  {
    name: 'differently named namespace',
    body: `const wards = this.server.of('/wards'); wards.emit('x', 1);`,
  },
  { name: 'server.sockets', body: `this.server.sockets.emit('x', 1);` },
  { name: 'server.local', body: `this.server.local.emit('x', 1);` },
  { name: 'server.of', body: `this.server.of('/').emit('x', 1);` },
  { name: 'server.volatile', body: `this.server.volatile.emit('x', 1);` },
  { name: 'server.except', body: `this.server.except('r').emit('x', 1);` },
  { name: 'server.compress', body: `this.server.compress(true).emit('x', 1);` },
  { name: 'server.timeout', body: `this.server.timeout(10).emit('x', 1);` },
  {
    name: 'a chain through local',
    body: `this.server.local.except('r').volatile.emit('x', 1);`,
  },
  { name: 'client.broadcast', body: `client.broadcast.emit('x', 1);` },
  {
    name: 'client.broadcast in a room',
    body: `client.broadcast.to('r').emit('x', 1);`,
  },
  { name: 'computed emit', body: `this.server['emit']('x', 1);` },
  { name: 'template emit', body: "this.server[`emit`]('x', 1);" },
  {
    name: 'a computed name',
    body: `const name = 'e' + 'mit'; this.server[name]('x', 1);`,
  },
  {
    name: 'emit.call',
    body: `this.server.emit.call(this.server, 'x', 1);`,
  },
  {
    name: 'emit.bind',
    body: `const send = this.server.emit.bind(this.server); send('x');`,
  },
  {
    name: 'destructured emit',
    body: `const { emit } = this.server; emit('x');`,
  },
  { name: 'emitWithAck', body: `void this.server.emitWithAck('x', 1);` },
  { name: 'send', body: `this.server.send('x');` },
  { name: 'write', body: `this.server.write('x');` },
  {
    name: 'a remote socket',
    body: `void this.server.fetchSockets().then((all) => all[0].emit('x', 1));`,
  },
  {
    name: 'a room operator kept in a variable',
    body: `const everyone = this.server.to('r'); everyone.emit('x', 1);`,
  },
  // Room-addressed emits are allowed in the gateway only
  {
    name: 'server.to outside the gateway',
    body: `this.server.to('r').emit('x');`,
  },
  {
    name: 'client.to outside the gateway',
    body: `client.to('r').emit('x');`,
  },
  // Inside the gateway only the room-addressed chain stays
  {
    name: 'gateway: server.emit',
    body: `this.server.emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: server.local.to',
    body: `this.server.local.to('r').emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: server.sockets',
    body: `this.server.sockets.emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: server.of().to',
    body: `this.server.of('/').to('r').emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: client.broadcast',
    body: `client.broadcast.emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: client.broadcast.to',
    body: `client.broadcast.to('r').emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: server.except',
    body: `this.server.except('r').emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: operator kept in a variable',
    body: `const room = this.server.to('r'); room.emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'gateway: alias of the server',
    body: `const s = this.server; s.to('r').emit('x', 1);`,
    file: GATEWAY,
    by: SYNTAX,
  },
  // The type is hidden: the spelling catches it
  {
    name: 'an io cast to any',
    body: `(io as any).emit('x');`,
    by: SYNTAX,
  },
  {
    name: 'a cast to any',
    body: `(this.server as any).emit('x', 1);`,
    by: SYNTAX,
  },
];

const allowed: { name: string; body: string; file?: string }[] = [
  { name: 'a socket emits to its own client', body: `client.emit('x', 1);` },
  {
    name: 'endSession in the gateway',
    body: `client.emit('session_expired', { reason: 'session_revoked' }); client.disconnect(true);`,
    file: GATEWAY,
  },
  {
    name: 'a plain EventEmitter',
    body: `const emitter = new EventEmitter(); emitter.emit('x', 1);`,
  },
  { name: 'an emitter held by the class', body: `this.events.emit('x', 1);` },
  {
    name: 'an emitter parameter named emitter',
    body: `const emitter: EventEmitter = this.events; emitter.emit('x');`,
  },
  { name: 'an http response', body: `res.write('x');` },
  {
    name: 'reading the local sockets',
    body: `void this.server.local.fetchSockets();`,
  },
  {
    name: 'joining a room',
    body: `client.join('r'); void this.server.in('r').fetchSockets();`,
  },
  {
    name: 'server.to(room).emit in the gateway',
    body: `this.server.to('r').emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'server.to over several rooms in the gateway',
    body: `this.server.to(['a', 'b']).emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'server.in(room).emit in the gateway',
    body: `this.server.in('r').emit('x', 1);`,
    file: GATEWAY,
  },
  {
    name: 'client.to(room).emit in the gateway',
    body: `client.to('r').emit('x', 1);`,
    file: GATEWAY,
  },
];

interface Report {
  rules: (string | null)[];
  fatal: string[];
}

const lintAll = (snippets: { file: string; code: string }[]): Report[] =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [resolve(BACKEND, 'eslint-rules/lint-snippets.mjs')],
      {
        cwd: BACKEND,
        input: JSON.stringify(snippets),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    ),
  ) as Report[];

describe('the server-wide emit ban', () => {
  const reports = new Map<string, Report>();
  const key = (kind: string, name: string) => `${kind}:${name}`;

  // Loads the TypeScript project once (about 20 s)
  beforeAll(() => {
    const entries = [
      ...forbidden.map((e) => ({ kind: 'forbidden', ...e })),
      ...allowed.map((e) => ({ kind: 'allowed', ...e })),
    ];
    const results = lintAll(
      entries.map((e) => ({
        file: e.file ?? ELSEWHERE,
        code: program(e.body),
      })),
    );
    entries.forEach((e, index) =>
      reports.set(key(e.kind, e.name), results[index]),
    );
  }, 240_000);

  it.each(forbidden)('reports $name', ({ name, by = TYPED }) => {
    const report = reports.get(key('forbidden', name));
    expect(report?.fatal).toEqual([]);
    expect(report?.rules).toContain(by);
  });

  it.each(allowed)('allows $name', ({ name }) => {
    const report = reports.get(key('allowed', name));
    expect(report?.fatal).toEqual([]);
    expect(report?.rules).not.toContain(TYPED);
    expect(report?.rules).not.toContain(SYNTAX);
  });
});

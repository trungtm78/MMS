// Runs the e2e suites, one Jest process per file (a single process trips the Terminus heap
// check of app.e2e-spec: docs/tenancy.md), in legacy mode, enforced mode or both, one at a
// time (mms_app and mms_platform are cluster-wide roles: two runs on one cluster break each
// other). Prints a line when a suite starts and when it ends. The output of every suite is
// streamed to test-results/<mode>--<file>.log, kept only for a suite that failed.
//
// The runner locks the application roles (NOLOGIN, no password) itself after every Jest
// process, whatever its status, and when it is interrupted: Jest's global teardown does not
// run when a process is killed.
//
//   node scripts/run-e2e.mjs [--mode=legacy|enforced|both | --mode <x>] [file-name-fragment...]
//
// Environment: MIGRATION_TEST_ADMIN_URL (required), E2E_SUITE_TIMEOUT_MS (default 30 min).
// Exit code: 0 all passed, 1 a suite failed, 2 bad usage or no suite to run, 130/143 interrupted.
import { spawn } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import args from './run-e2e-args.cjs';
import roles from '../test/support/e2e-roles.cjs';

const { UsageError, childEnv, modesOf, parseArgs, selectSuites } = args;
const { lockApplicationRoles } = roles;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_TAIL = 256 * 1024;
const DEFAULT_SUITE_TIMEOUT_MS = 30 * 60 * 1000;
const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGBREAK: 131 };

const seconds = (ms) => Math.round(ms / 1000);

function suiteTimeoutMs(env) {
  const raw = env.E2E_SUITE_TIMEOUT_MS;
  if (raw === undefined || raw === '') return DEFAULT_SUITE_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new UsageError(
      `E2E_SUITE_TIMEOUT_MS must be a positive integer, got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

/** Runs one Jest process to its end. Never rejects: a failure to start is a result. */
function runSuite({ mode, file, timeoutMs, logPath, onStart }) {
  return new Promise((resolve) => {
    const log = createWriteStream(logPath);
    let tail = '';
    let timedOut = false;
    let settled = false;
    const jest = join(root, 'node_modules', 'jest', 'bin', 'jest.js');
    const child = spawn(
      process.execPath,
      [jest, '--config', './test/jest-e2e.json', '--runInBand', `test/${file}`],
      {
        cwd: root,
        env: childEnv(process.env, mode),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    onStart(child);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const collect = (chunk) => {
      log.write(chunk);
      tail = (tail + chunk.toString()).slice(-OUTPUT_TAIL);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log.end(() => resolve({ ...outcome, timedOut, tail }));
    };
    child.on('error', (error) => settle({ status: null, signal: null, error }));
    child.on('close', (status, signal) => settle({ status, signal }));
  });
}

function describeOutcome(outcome, timeoutMs) {
  if (outcome.error) return `could not start: ${outcome.error.message}`;
  if (outcome.timedOut) return `timed out after ${seconds(timeoutMs)}s`;
  const jestSummary = /Tests:\s+(.*)/.exec(outcome.tail)?.[1]?.trim();
  if (jestSummary) return jestSummary;
  if (outcome.signal) return `killed by ${outcome.signal}`;
  return 'no test summary';
}

export async function main(argv, { install = true } = {}) {
  let parsed;
  let files;
  let timeoutMs;
  try {
    parsed = parseArgs(argv);
    timeoutMs = suiteTimeoutMs(process.env);
    files = selectSuites(
      readdirSync(join(root, 'test'))
        .filter((f) => f.endsWith('.e2e-spec.ts'))
        .sort(),
      parsed.fragments,
    );
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    return 2;
  }
  const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!adminUrl) {
    console.error(
      'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:<password>@localhost:5440/postgres)',
    );
    return 2;
  }

  const out = join(root, 'test-results');
  mkdirSync(out, { recursive: true });
  for (const old of readdirSync(out).filter((f) => f.endsWith('.log'))) {
    rmSync(join(out, old), { force: true });
  }

  let lockFailed = false;
  const lock = async () => {
    try {
      await lockApplicationRoles(adminUrl);
    } catch (error) {
      lockFailed = true;
      console.error(
        `ERROR  could not lock mms_app and mms_platform (NOLOGIN): ${error.message}`,
      );
    }
  };

  let current;
  let interrupted;
  const onSignal = (signal) => {
    if (interrupted) {
      // A second signal: stop waiting, lock and leave
      void lock().finally(() => process.exit(SIGNAL_EXIT[signal] ?? 1));
      return;
    }
    interrupted = signal;
    console.error(
      `\n${signal}: stopping the running suite, then locking the roles`,
    );
    const child = current;
    if (child) {
      child.kill();
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }
  };
  const signals = Object.keys(SIGNAL_EXIT);
  if (install) for (const signal of signals) process.on(signal, onSignal);

  const modes = modesOf(parsed.mode);
  const results = [];
  const writeSummary = () =>
    writeFileSync(
      join(out, 'e2e-summary.json'),
      JSON.stringify(
        {
          filter: { mode: parsed.mode, fragments: parsed.fragments },
          interrupted: interrupted ?? null,
          results,
        },
        null,
        2,
      ),
    );
  try {
    for (const mode of modes) {
      for (const file of files) {
        if (interrupted) break;
        const logPath = join(out, `${mode}--${file}.log`);
        console.log(`RUN   ${mode.padEnd(8)}  ${file}`);
        const started = Date.now();
        let outcome;
        try {
          outcome = await runSuite({
            mode,
            file,
            timeoutMs,
            logPath,
            onStart: (child) => {
              current = child;
            },
          });
        } finally {
          current = undefined;
          // Whatever happened to the process, no login outlives it
          await lock();
        }
        const ok = outcome.status === 0 && !outcome.timedOut && !outcome.error;
        const summary = describeOutcome(outcome, timeoutMs);
        const took = seconds(Date.now() - started);
        results.push({ mode, file, ok, summary, seconds: took });
        console.log(
          `${ok ? 'PASS' : 'FAIL'}  ${mode.padEnd(8)}  ${file.padEnd(46)}  ${summary}  (${took}s)`,
        );
        if (ok) rmSync(logPath, { force: true });
      }
    }
  } finally {
    if (install) for (const signal of signals) process.off(signal, onSignal);
    await lock();
    writeSummary();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n${results.length - failed}/${results.length} suite runs passed`,
  );
  if (interrupted) {
    console.error(
      `Interrupted by ${interrupted}: ${results.length} of ${modes.length * files.length} suite runs ran`,
    );
    return SIGNAL_EXIT[interrupted];
  }
  if (results.length === 0) {
    console.error('No suite ran');
    return 2;
  }
  return failed === 0 && !lockFailed ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2));
}

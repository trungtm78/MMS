'use strict';
// The pure parts of scripts/run-e2e.mjs, kept apart so a spec can test them: the arguments,
// the choice of suites and the environment each Jest process gets. CommonJS so the .mjs
// runner and the TypeScript specs both import it.

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

const MODES = ['legacy', 'enforced'];

// What a run of one mode must not inherit from the shell: the mode and the backend's
// connection and sign-in settings. The suites set their own; a stale value would make the
// mode the run asked for differ from the mode it applied.
const PINNED_ENV = [
  'TENANCY_MODE',
  'LEGACY_DEFAULT_TENANT_CODE',
  'DB_USER',
  'DB_PASSWORD',
];

/** `--mode=<x>` or `--mode <x>`, and file-name fragments; anything else is refused. */
function parseArgs(argv) {
  let mode;
  const fragments = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let value;
    if (arg === '--mode') {
      value = argv[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError('--mode needs a value: legacy, enforced or both');
      }
    } else if (arg.startsWith('--mode=')) {
      value = arg.slice('--mode='.length);
    } else if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option ${arg}`);
    } else {
      fragments.push(arg);
      continue;
    }
    if (mode !== undefined) throw new UsageError('--mode was given twice');
    mode = value.trim().toLowerCase();
    if (mode !== 'both' && !MODES.includes(mode)) {
      throw new UsageError(
        `Unknown --mode=${value}: use legacy, enforced or both`,
      );
    }
  }
  return { mode: mode ?? 'both', fragments };
}

const modesOf = (mode) => (mode === 'both' ? [...MODES] : [mode]);

/** The suites whose name contains a fragment (all when none); a fragment must match one. */
function selectSuites(files, fragments) {
  const unmatched = fragments.filter((f) => !files.some((n) => n.includes(f)));
  if (unmatched.length > 0) {
    throw new UsageError(
      `No e2e suite matches ${unmatched.map((f) => JSON.stringify(f)).join(', ')} (suites: ${files.join(', ')})`,
    );
  }
  const selected =
    fragments.length === 0
      ? [...files]
      : files.filter((n) => fragments.some((f) => n.includes(f)));
  if (selected.length === 0)
    throw new UsageError('There is no e2e suite to run');
  return selected;
}

/** The environment of one Jest process: the shell's, without its tenancy state. */
function childEnv(base, mode) {
  const env = { ...base };
  for (const name of PINNED_ENV) delete env[name];
  env.E2E_TENANCY = mode;
  return env;
}

module.exports = {
  PINNED_ENV,
  UsageError,
  childEnv,
  modesOf,
  parseArgs,
  selectSuites,
};

// Runs every e2e suite, one Jest process per file (a single process trips the Terminus heap
// check of app.e2e-spec: docs/tenancy.md), in legacy mode, enforced mode or both, and prints
// one line per run. Failed runs leave their output in test-results/.
//   node scripts/run-e2e.mjs [--mode=legacy|enforced|both] [file-name-fragment]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = (args.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'both').toLowerCase();
const fragment = args.find((a) => !a.startsWith('--'));
const modes = mode === 'both' ? ['legacy', 'enforced'] : [mode];
if (!modes.every((m) => m === 'legacy' || m === 'enforced')) {
  console.error(`Unknown --mode=${mode}: use legacy, enforced or both`);
  process.exit(2);
}
const files = readdirSync(join(root, 'test'))
  .filter((f) => f.endsWith('.e2e-spec.ts') && (!fragment || f.includes(fragment)))
  .sort();
const jest = join(root, 'node_modules', 'jest', 'bin', 'jest.js');
const out = join(root, 'test-results');
mkdirSync(out, { recursive: true });
const results = [];
for (const m of modes) {
  for (const file of files) {
    const started = Date.now();
    const run = spawnSync(
      process.execPath,
      [jest, '--config', './test/jest-e2e.json', '--runInBand', `test/${file}`],
      {
        cwd: root,
        env: { ...process.env, E2E_TENANCY: m },
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const summary = /Tests:\s+(.*)/.exec(output)?.[1]?.trim() ?? 'no test summary';
    const ok = run.status === 0;
    results.push({ mode: m, file, ok, summary, seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${m.padEnd(8)}  ${file.padEnd(46)}  ${summary}`);
    if (!ok) writeFileSync(join(out, `${m}--${file}.log`), output);
  }
}
writeFileSync(join(out, 'e2e-summary.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} suite runs passed`);
process.exit(failed === 0 ? 0 : 1);

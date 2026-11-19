// Lints source snippets with the repository config and prints, per snippet, the rules that
// reported it. Input on stdin: [{ "file": "src/...", "code": "..." }]. A snippet is linted
// under the path of a real file (the typed rules need a file the TypeScript project
// knows); lintText replaces its content and nothing is written.
//
// It is a separate process because ESLint loads eslint.config.mjs with a dynamic import,
// which Jest's CommonJS sandbox does not allow (emit-ban.spec.ts runs it).
import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const snippets = JSON.parse(Buffer.concat(chunks).toString('utf8'));

const eslint = new ESLint({ cwd: root });
const reports = [];
for (const { file, code } of snippets) {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(root, file),
  });
  reports.push({
    rules: [...new Set(result.messages.map((m) => m.ruleId))],
    fatal: result.messages.filter((m) => m.fatal).map((m) => m.message),
  });
}
process.stdout.write(JSON.stringify(reports));

import * as fs from 'fs';
import * as path from 'path';

/** Requires every *.entity.ts under dir so its decorators register TypeORM metadata. */
export function loadAllEntities(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadAllEntities(full);
    } else if (entry.name.endsWith('.entity.ts')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(full);
    }
  }
}

// Environment of an e2e suite that runs the backend as the runtime role mms_app with
// TENANCY_MODE=enforced. Import it before AppModule, like app-env.ts (which it builds on).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import './app-env';
import { APP_PASSWORD } from './tenancy';

export const E2E_UPLOAD_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'mms-uploads-'),
);

Object.assign(process.env, {
  TENANCY_MODE: 'enforced',
  DB_USER: 'mms_app',
  DB_PASSWORD: APP_PASSWORD,
  UPLOAD_DIR: E2E_UPLOAD_DIR,
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// getDb() falls back to journal/charts/data/app.db, so an unpinned test run reads and writes the
// developer's real database — settings written by one test then leak into another's expectations.
process.env.KANSOKU_DB_PATH ??= path.join(
  mkdtempSync(path.join(tmpdir(), 'kansoku-core-test-')),
  'app.db',
);

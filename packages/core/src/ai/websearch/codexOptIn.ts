import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { appMeta } from '../../db/schema.js';

const CODEX_OPT_IN_KEY = 'web_search_codex_v1';

export function isCodexSearchEnabled(): boolean {
  try {
    const row = getDb().select().from(appMeta).where(eq(appMeta.key, CODEX_OPT_IN_KEY)).get();
    return row?.value === '1';
  } catch {
    return false;
  }
}

export function setCodexSearchEnabled(enabled: boolean): void {
  const value = enabled ? '1' : '0';
  getDb()
    .insert(appMeta)
    .values({ key: CODEX_OPT_IN_KEY, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } })
    .run();
}

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOnboardingFileStore } from '@desktop/shell/onboarding/store.js';

describe('createOnboardingFileStore', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onboarding-store-'));
    path = join(dir, 'onboarding-state.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports not-completed and not-skipped when the file is absent', async () => {
    const store = createOnboardingFileStore(path);
    expect(await store.getState()).toEqual({ completed: false, longbridgeSkipped: false });
  });

  it('persists completion and reads it back', async () => {
    const store = createOnboardingFileStore(path);
    expect(await store.complete()).toEqual({ completed: true, longbridgeSkipped: false });
    expect(await createOnboardingFileStore(path).getState()).toEqual({
      completed: true,
      longbridgeSkipped: false,
    });
  });

  it('treats a corrupt file as not-completed and not-skipped', async () => {
    await writeFile(path, 'not json');
    expect(await createOnboardingFileStore(path).getState()).toEqual({
      completed: false,
      longbridgeSkipped: false,
    });
  });

  it('persists the longbridge skip and reads it back', async () => {
    const store = createOnboardingFileStore(path);
    expect(await store.skipLongbridge()).toEqual({ completed: false, longbridgeSkipped: true });
    expect(await createOnboardingFileStore(path).getState()).toEqual({
      completed: false,
      longbridgeSkipped: true,
    });
  });

  it('keeps each flag independent — completing does not clear a prior skip, and skipping does not clear completion', async () => {
    const store = createOnboardingFileStore(path);
    await store.skipLongbridge();
    expect(await store.complete()).toEqual({ completed: true, longbridgeSkipped: true });

    const other = createOnboardingFileStore(path);
    await other.complete();
    expect(await other.skipLongbridge()).toEqual({ completed: true, longbridgeSkipped: true });
  });
});

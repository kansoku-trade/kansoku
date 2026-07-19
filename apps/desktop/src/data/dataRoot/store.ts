import { chmod, readFile, writeFile } from 'node:fs/promises';

export interface DataRootPreference {
  path: string | null;
}

export interface DataRootStore {
  get(): Promise<DataRootPreference>;
  setPath(path: string): Promise<void>;
  clear(): Promise<void>;
}

export function createDataRootFileStore(filePath: string): DataRootStore {
  async function read(): Promise<DataRootPreference> {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DataRootPreference>;
      return { path: typeof parsed.path === 'string' ? parsed.path : null };
    } catch {
      return { path: null };
    }
  }

  async function write(pref: DataRootPreference): Promise<void> {
    await writeFile(filePath, JSON.stringify(pref), { mode: 0o600 });
    await chmod(filePath, 0o600);
  }

  return {
    get: read,
    async setPath(path: string) {
      await write({ path });
    },
    async clear() {
      await write({ path: null });
    },
  };
}

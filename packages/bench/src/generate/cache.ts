import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export function cacheFile(cacheRoot: string, symbol: string, period: string): string {
  return join(cacheRoot, `${symbol}-${period}.json`);
}

export async function readCache<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCache<T>(file: string, data: T): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

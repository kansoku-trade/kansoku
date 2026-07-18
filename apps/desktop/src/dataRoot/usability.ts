import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export function isDataRootUsable(path: string): boolean {
  if (!existsSync(path)) return false;

  try {
    if (!statSync(path).isDirectory()) return false;
  } catch {
    return false;
  }

  try {
    accessSync(path, constants.W_OK);
  } catch {
    return false;
  }

  const probe = join(path, `.data-root-usable-probe-${process.pid}`);
  try {
    writeFileSync(probe, '');
    unlinkSync(probe);
    return true;
  } catch {
    try {
      mkdirSync(probe);
      rmdirSync(probe);
      return true;
    } catch {
      return false;
    }
  }
}

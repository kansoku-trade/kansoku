import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import type { Plugin } from 'vite';

const PRO_PATH_MARKER = `${sep}apps${sep}pro${sep}`;

export function isProModule(id: string): boolean {
  const path = id.split('?')[0]!;
  if (path.includes(PRO_PATH_MARKER)) return true;
  try {
    return realpathSync(path).includes(PRO_PATH_MARKER);
  } catch {
    return false;
  }
}

export interface ProLeakGuardOptions {
  // Chunk-path segment marking encrypted output. A chunk counts as encrypted
  // when its emitted name contains this segment, so both '__pro__/x.mjs' and
  // 'assets/__pro__/x.js' are recognised.
  proDir: string;
}

// This dir IS the paid-code boundary: stagePro encrypts it into pro.enc and
// deletes the plaintext. Two invariants, both build-fatal:
//   1. no pro module may land in a chunk outside it (it would ship
//      unencrypted);
//   2. no chunk outside it may STATICALLY import a chunk inside it — the
//      plaintext is gone in shipped builds, so a static edge crashes the free
//      app at startup. The composition point's dynamic import is the only
//      legal edge, and it is wrapped in try/catch.
export function proLeakGuard({ proDir }: ProLeakGuardOptions): Plugin {
  const isEncrypted = (fileName: string) => fileName.includes(proDir);

  return {
    name: 'kansoku:pro-leak-guard',
    generateBundle(_options, bundle) {
      const problems: string[] = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || isEncrypted(fileName)) continue;
        for (const id of Object.keys(chunk.modules)) {
          if (isProModule(id)) {
            problems.push(`pro module outside ${proDir} — ${fileName}: ${id}`);
          }
        }
        for (const imported of chunk.imports) {
          if (isEncrypted(imported)) {
            problems.push(
              `public chunk statically imports encrypted chunk — ${fileName} -> ${imported}`,
            );
          }
        }
      }
      if (problems.length > 0) {
        this.error(`pro chunk boundary violated:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
      }
    },
  };
}

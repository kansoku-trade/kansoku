import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(pkgRoot, '..', '..', '.claude', 'skills', 'canvas', 'sdk');

// Models pay per read, not per byte. Parts 1 / 2 / 5 of the skill's skeleton appear in
// every canvas, so their declarations merge into one file; charts, scenarios and controls
// are conditional and stay separate so a canvas that needs none of them reads none.
const CORE = ['layout', 'text', 'data'];

rmSync(outDir, { force: true, recursive: true });
execFileSync('tsgo', ['-p', 'tsconfig.json'], { cwd: pkgRoot, stdio: 'inherit' });

const merged = new Set(CORE.map((name) => `./${name}.js`));
const specifiers = new Map();
const bodies = [];
for (const name of CORE) {
  const path = join(outDir, `${name}.d.ts`);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const parsed = /^import type \{([^}]+)\} from '([^']+)';$/.exec(line);
    if (!parsed) {
      bodies.push(line);
      continue;
    }
    // A file that is being merged in no longer needs importing from.
    if (merged.has(parsed[2])) continue;
    const names = specifiers.get(parsed[2]) ?? new Set();
    for (const spec of parsed[1].split(',')) names.add(spec.trim());
    specifiers.set(parsed[2], names);
  }
  unlinkSync(path);
}

const header = [...specifiers]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([from, names]) => `import type { ${[...names].sort().join(', ')} } from '${from}';`)
  .join('\n');

writeFileSync(
  join(outDir, 'core.d.ts'),
  `${header}\n${bodies.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`,
  'utf8',
);

const emitted = readdirSync(outDir).sort();
console.log(`canvas skill declarations: ${emitted.join(', ')}`);

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../src/platform/env.js';

const AGENTS_ROOT = join(PROJECT_ROOT, '.agents', 'skills');
const FIX_HINT = '运行 python3 scripts/sync-agents-skills.py 修复';

// Tracked-ness is the definition of first-party, because .gitignore already draws
// that exact line: /.claude/skills/* is ignored and each shipped skill is un-ignored
// by name. Anything else in that directory is a local install — a third-party skill
// restored into .agents, or a development-only one like `acceptance` — and this
// guard has no claim on how the user arranges those.
function firstPartySkills(): string[] {
  const tracked = execFileSync('git', ['ls-files', '.claude/skills'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  const names = new Set<string>();
  for (const line of tracked.split('\n')) {
    const name = line.split('/')[2];
    if (name) names.add(name);
  }
  return [...names].sort();
}

// .agents/ is git-ignored, so nothing in git can stop a first-party skill from being
// copied (and drifting) instead of linked — this guard is the only thing that does.
describe.skipIf(!existsSync(AGENTS_ROOT))('agents skills parity', () => {
  it('links every first-party skill into .agents instead of copying it', () => {
    const broken: string[] = [];
    for (const name of firstPartySkills()) {
      const entry = join(AGENTS_ROOT, name);
      if (!existsSync(entry)) {
        broken.push(`${name}: missing`);
        continue;
      }
      if (!lstatSync(entry).isSymbolicLink()) {
        broken.push(`${name}: real copy, will drift`);
        continue;
      }
      if (readlinkSync(entry) !== join('..', '..', '.claude', 'skills', name)) {
        broken.push(`${name}: links to ${readlinkSync(entry)}`);
      }
    }
    expect(broken, `${broken.join('; ')} — ${FIX_HINT}`).toEqual([]);
  });
});

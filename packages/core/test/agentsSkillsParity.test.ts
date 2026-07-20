import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../src/platform/env.js';

const AGENTS_ROOT = join(PROJECT_ROOT, '.agents', 'skills');
const CLAUDE_ROOT = join(PROJECT_ROOT, '.claude', 'skills');
const FIX_HINT = '运行 python3 scripts/sync-agents-skills.py 修复';

function firstPartySkills(): string[] {
  const lock = JSON.parse(readFileSync(join(PROJECT_ROOT, 'skills-lock.json'), 'utf8')) as {
    skills: Record<string, unknown>;
  };
  const locked = new Set(Object.keys(lock.skills));
  return readdirSync(CLAUDE_ROOT).filter((name) => !locked.has(name));
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

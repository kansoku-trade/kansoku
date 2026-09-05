import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundledSkillsPath, removeLegacyBundledSkillsLink } from '@desktop/boot/skills.js';

const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('removeLegacyBundledSkillsLink', () => {
  it('removes only the old link to the bundled skills tree', () => {
    const dataRoot = tempDir('kansoku-data-');
    const bundled = tempDir('kansoku-skills-');
    mkdirSync(join(dataRoot, '.claude'), { recursive: true });
    symlinkSync(bundled, join(dataRoot, '.claude', 'skills'), 'dir');

    expect(removeLegacyBundledSkillsLink(dataRoot, bundled)).toBe(true);
    expect(existsSync(join(dataRoot, '.claude'))).toBe(false);
  });

  it('leaves a user-owned skills directory untouched', () => {
    const dataRoot = tempDir('kansoku-data-');
    const bundled = tempDir('kansoku-skills-');
    mkdirSync(join(dataRoot, '.claude', 'skills'), { recursive: true });

    expect(removeLegacyBundledSkillsLink(dataRoot, bundled)).toBe(false);
    expect(existsSync(join(dataRoot, '.claude', 'skills'))).toBe(true);
  });

  it('leaves a link to another target untouched', () => {
    const dataRoot = tempDir('kansoku-data-');
    const bundled = tempDir('kansoku-skills-');
    const userSkills = tempDir('user-skills-');
    mkdirSync(join(dataRoot, '.claude'), { recursive: true });
    symlinkSync(userSkills, join(dataRoot, '.claude', 'skills'), 'dir');

    expect(removeLegacyBundledSkillsLink(dataRoot, bundled)).toBe(false);
    expect(existsSync(join(dataRoot, '.claude', 'skills'))).toBe(true);
  });
});

describe('bundledSkillsPath', () => {
  it('resolves Resources/skills', () => {
    expect(bundledSkillsPath('/App/Contents/Resources')).toBe('/App/Contents/Resources/skills');
  });
});

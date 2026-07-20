import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSkillIndex, readSkill } from '../src/ai/agents/skills.js';

let root: string;

function writeSkill(name: string, content: string) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skills-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('loadSkillIndex', () => {
  it('parses name and single-line description from frontmatter', () => {
    writeSkill('alpha', `---\nname: alpha\ndescription: does alpha things\n---\n\n# Alpha\n`);
    const index = loadSkillIndex([root]);
    expect(index).toEqual([
      { name: 'alpha', description: 'does alpha things', dir: join(root, 'alpha') },
    ]);
  });

  it('joins folded > multi-line description values with spaces', () => {
    writeSkill(
      'beta',
      `---\nname: beta\ndescription: >\n  first line of\n  the description\n---\n\n# Beta\n`,
    );
    const index = loadSkillIndex([root]);
    expect(index).toEqual([
      { name: 'beta', description: 'first line of the description', dir: join(root, 'beta') },
    ]);
  });

  it('joins folded | multi-line description values with spaces', () => {
    writeSkill(
      'gamma',
      `---\nname: gamma\ndescription: |\n  piped first\n  piped second\n---\n\n# Gamma\n`,
    );
    const index = loadSkillIndex([root]);
    expect(index).toEqual([
      { name: 'gamma', description: 'piped first piped second', dir: join(root, 'gamma') },
    ]);
  });

  it('defaults description to empty string when missing', () => {
    writeSkill('delta', `---\nname: delta\n---\n\n# Delta\n`);
    const index = loadSkillIndex([root]);
    expect(index).toEqual([{ name: 'delta', description: '', dir: join(root, 'delta') }]);
  });

  it('skips folders missing SKILL.md', () => {
    mkdirSync(join(root, 'no-skill-file'), { recursive: true });
    const index = loadSkillIndex([root]);
    expect(index).toEqual([]);
  });

  it('skips entries missing name', () => {
    writeSkill('no-name', `---\ndescription: nameless\n---\n`);
    const index = loadSkillIndex([root]);
    expect(index).toEqual([]);
  });

  it('silently skips nonexistent scan dirs', () => {
    const missing = join(root, 'does-not-exist');
    expect(loadSkillIndex([missing])).toEqual([]);
  });

  it('sorts results by name', () => {
    writeSkill('zeta', `---\nname: zeta\ndescription: z\n---\n`);
    writeSkill('alpha', `---\nname: alpha\ndescription: a\n---\n`);
    const index = loadSkillIndex([root]);
    expect(index.map((s) => s.name)).toEqual(['alpha', 'zeta']);
  });

  it('scans multiple dirs', () => {
    const root2 = mkdtempSync(join(tmpdir(), 'skills-test-2-'));
    try {
      writeSkill('alpha', `---\nname: alpha\ndescription: a\n---\n`);
      mkdirSync(join(root2, 'beta'), { recursive: true });
      writeFileSync(join(root2, 'beta', 'SKILL.md'), `---\nname: beta\ndescription: b\n---\n`);
      const index = loadSkillIndex([root, root2]);
      expect(index.map((s) => s.name)).toEqual(['alpha', 'beta']);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('resolves dir to an absolute path', () => {
    writeSkill('alpha', `---\nname: alpha\ndescription: a\n---\n`);
    const index = loadSkillIndex([root]);
    expect(index[0].dir).toBe(join(root, 'alpha'));
  });

  it('loads the real repo .claude/skills dir and finds stock-deep-dive', () => {
    const realDir = join(process.cwd(), '..', '..', '.claude', 'skills');
    const index = loadSkillIndex([realDir]);
    const found = index.find((s) => s.name === 'stock-deep-dive');
    expect(found).toBeDefined();
    expect(found?.description.length).toBeGreaterThan(0);
  });
});

describe('readSkill', () => {
  it('returns the full SKILL.md text including frontmatter', () => {
    const content = `---\nname: alpha\ndescription: does alpha things\n---\n\n# Alpha\n`;
    writeSkill('alpha', content);
    const index = loadSkillIndex([root]);
    expect(readSkill(index, 'alpha')).toBe(content);
  });

  it('returns null when the name is not in the index', () => {
    const index = loadSkillIndex([root]);
    expect(readSkill(index, 'missing')).toBeNull();
  });
});

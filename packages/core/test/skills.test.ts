import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CANVAS_COMPONENT_NAMES } from '@kansoku/canvas/names';
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

  it('reads folded descriptions with a chomping indicator', () => {
    for (const [name, marker] of [
      ['folded', '>'],
      ['folded-strip', '>-'],
      ['literal-keep', '|+'],
    ]) {
      writeSkill(name, `---\nname: ${name}\ndescription: ${marker}\n  first line\n  second line\n---\n\n# ${name}\n`);
    }
    const index = loadSkillIndex([root]);
    for (const name of ['folded', 'folded-strip', 'literal-keep']) {
      expect(index.find((s) => s.name === name)?.description).toBe('first line second line');
    }
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

describe('canvas skill sdk declarations', () => {
  const sdkDir = join(process.cwd(), '..', '..', '.claude', 'skills', 'canvas', 'sdk');

  it('keeps the always-needed components in one file so a canvas costs one read', () => {
    const core = readFileSync(join(sdkDir, 'core.d.ts'), 'utf8');
    for (const name of [...CANVAS_COMPONENT_NAMES.layout, ...CANVAS_COMPONENT_NAMES.text, ...CANVAS_COMPONENT_NAMES.data]) {
      expect(core).toContain(`declare function ${name}(`);
    }
  });

  it('declares every component the canvas skill allows', () => {
    const declared = readdirSync(sdkDir)
      .filter((f) => f.endsWith('.d.ts'))
      .map((f) => readFileSync(join(sdkDir, f), 'utf8'))
      .join('\n');
    const missing = Object.values(CANVAS_COMPONENT_NAMES)
      .flat()
      .filter((name) => !new RegExp(`declare function ${name}\\b`).test(declared));
    expect(missing).toEqual([]);
  });
});

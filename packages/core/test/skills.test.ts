import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CANVAS_COMPONENT_NAMES } from '@kansoku/canvas/names';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSkillIndex, loadSkillsPolicy, readSkill } from '../src/ai/agents/skills.js';
import { PROJECT_ROOT, skillSearchDirs } from '../src/platform/env.js';

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
      { name: 'alpha', description: 'does alpha things', dir: join(root, 'alpha'), references: [] },
    ]);
  });

  it('joins folded > multi-line description values with spaces', () => {
    writeSkill(
      'beta',
      `---\nname: beta\ndescription: >\n  first line of\n  the description\n---\n\n# Beta\n`,
    );
    const index = loadSkillIndex([root]);
    expect(index).toEqual([
      {
        name: 'beta',
        description: 'first line of the description',
        dir: join(root, 'beta'),
        references: [],
      },
    ]);
  });

  it('joins folded | multi-line description values with spaces', () => {
    writeSkill(
      'gamma',
      `---\nname: gamma\ndescription: |\n  piped first\n  piped second\n---\n\n# Gamma\n`,
    );
    const index = loadSkillIndex([root]);
    expect(index).toEqual([
      {
        name: 'gamma',
        description: 'piped first piped second',
        dir: join(root, 'gamma'),
        references: [],
      },
    ]);
  });

  it('defaults description to empty string when missing', () => {
    writeSkill('delta', `---\nname: delta\n---\n\n# Delta\n`);
    const index = loadSkillIndex([root]);
    expect(index).toEqual([
      { name: 'delta', description: '', dir: join(root, 'delta'), references: [] },
    ]);
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
      writeSkill(
        name,
        `---\nname: ${name}\ndescription: ${marker}\n  first line\n  second line\n---\n\n# ${name}\n`,
      );
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
  const sdkDir = join(PROJECT_ROOT, 'packages', 'core', 'skills', 'canvas', 'sdk');

  it('keeps the always-needed components in one file so a canvas costs one read', () => {
    const core = readFileSync(join(sdkDir, 'core.d.ts'), 'utf8');
    for (const name of [
      ...CANVAS_COMPONENT_NAMES.layout,
      ...CANVAS_COMPONENT_NAMES.text,
      ...CANVAS_COMPONENT_NAMES.data,
    ]) {
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

describe('agent-only policy', () => {
  const writePolicy = (dir: string, agentOnly: unknown) =>
    writeFileSync(join(dir, 'skills-policy.json'), JSON.stringify({ version: 1, agentOnly }));

  it('keeps repo-tooling skills out of the injected catalog and out of read_skill', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'skills-policy-'));
    writePolicy(repoRoot, ['release']);
    writeSkill('release', '---\nname: release\ndescription: bump the desktop version\n---\nbody');
    writeSkill('trade-gate', '---\nname: trade-gate\ndescription: trade decision gate\n---\nbody');

    const index = loadSkillIndex([root], { repoRoot });
    expect(index.map((skill) => skill.name)).toEqual(['trade-gate']);
    expect(readSkill(index, 'release')).toBeNull();
  });

  it('hides every name the policy lists', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'skills-policy-'));
    const names = ['acceptance', 'chart', 'generative-ui', 'release', 'skill-creator'];
    writePolicy(repoRoot, names);
    for (const name of names) {
      writeSkill(name, `---\nname: ${name}\ndescription: repo tooling\n---\nbody`);
    }
    expect(loadSkillIndex([root], { repoRoot })).toEqual([]);
  });

  it('filters nothing when the policy file is missing or malformed', () => {
    const missing = mkdtempSync(join(tmpdir(), 'skills-policy-'));
    const malformed = mkdtempSync(join(tmpdir(), 'skills-policy-'));
    writeFileSync(join(malformed, 'skills-policy.json'), '{ not json');
    writeSkill('release', '---\nname: release\ndescription: repo tooling\n---\nbody');

    expect(loadSkillsPolicy(missing).agentOnly).toEqual([]);
    expect(loadSkillsPolicy(malformed).agentOnly).toEqual([]);
    expect(loadSkillIndex([root], { repoRoot: missing }).map((s) => s.name)).toEqual(['release']);
  });

  it('reads the real repo policy so a caller that omits repoRoot still filters', () => {
    expect(loadSkillsPolicy(PROJECT_ROOT).agentOnly).toContain('release');
  });
});

describe('runtime reference chapters', () => {
  const writeChapter = (skill: string, runtime: string, file: string, body: string) => {
    const dir = join(root, skill, 'references', runtime);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), body);
  };

  beforeEach(() => {
    writeSkill('td', '---\nname: td\ndescription: discipline\n---\ncore body');
    writeChapter('td', 'app', 'b-second.md', 'app chapter two');
    writeChapter('td', 'app', 'a-first.md', 'app chapter one');
    writeChapter('td', 'bench', 'episode.md', 'bench chapter');
    writeChapter('td', 'app', 'notes.txt', 'not markdown');
  });

  it('appends only the requested runtime chapters, name-sorted', () => {
    const text = readSkill(loadSkillIndex([root], { runtime: 'app' }), 'td')!;
    expect(text).toContain('core body');
    expect(text.indexOf('app chapter one')).toBeLessThan(text.indexOf('app chapter two'));
    expect(text).not.toContain('bench chapter');
    expect(text).not.toContain('not markdown');
  });

  it('appends the bench chapter and no app chapter for the bench runtime', () => {
    const text = readSkill(loadSkillIndex([root], { runtime: 'bench' }), 'td')!;
    expect(text).toContain('core body');
    expect(text).toContain('bench chapter');
    expect(text).not.toContain('app chapter');
  });

  it('returns the bare SKILL.md when no runtime is given', () => {
    const index = loadSkillIndex([root]);
    expect(index.find((s) => s.name === 'td')!.references).toEqual([]);
    const text = readSkill(index, 'td')!;
    expect(text).toContain('core body');
    expect(text).not.toContain('chapter');
  });

  it('tolerates a skill with no references directory', () => {
    writeSkill('plain', '---\nname: plain\ndescription: plain\n---\nplain body');
    expect(readSkill(loadSkillIndex([root], { runtime: 'app' }), 'plain')).toContain('plain body');
  });
});

describe('app-only skills root', () => {
  it('resolves canvas from packages/core/skills, not from .claude/skills', () => {
    const dirs = skillSearchDirs(PROJECT_ROOT);
    const canvas = loadSkillIndex(dirs, { runtime: 'app' }).find((s) => s.name === 'canvas');
    expect(canvas).toBeDefined();
    expect(canvas!.dir).toBe(join(PROJECT_ROOT, 'packages', 'core', 'skills', 'canvas'));
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'skills', 'canvas'))).toBe(false);
  });

  it('keeps the generated SDK declarations next to the skill', () => {
    const sdk = join(PROJECT_ROOT, 'packages', 'core', 'skills', 'canvas', 'sdk', 'index.d.ts');
    expect(existsSync(sdk)).toBe(true);
  });
});

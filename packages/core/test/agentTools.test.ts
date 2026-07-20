import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildResearchTools, createDefaultExec } from '../src/ai/agents/agentTools.js';
import type { SkillMeta } from '../src/ai/agents/skills.js';

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'agent-tools-test-'));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function writeSkill(dir: string, name: string, content: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content);
}

describe('buildResearchTools', () => {
  it('returns exactly read_skill, bash, read_file in that order', () => {
    const { tools } = buildResearchTools({ repoRoot, skillIndex: [] });
    expect(tools.map((t) => t.name)).toEqual(['read_skill', 'bash', 'read_file']);
  });

  it('uses a provided skillIndex as-is and returns it', async () => {
    const skillDir = join(repoRoot, 'fake-skill');
    writeSkill(skillDir, 'fake-skill', '---\nname: fake-skill\ndescription: fake\n---\nfake body');
    const skillIndex: SkillMeta[] = [{ name: 'fake-skill', description: 'fake', dir: skillDir }];

    const result = buildResearchTools({ repoRoot, skillIndex });
    expect(result.skillIndex).toBe(skillIndex);

    const readSkillTool = result.tools.find((t) => t.name === 'read_skill')!;
    const res = await readSkillTool.execute('c1', { name: 'fake-skill' });
    expect((res.content[0] as { text: string }).text).toContain('fake body');
  });

  it('loads the skill index from skillSearchDirs(repoRoot) when skillIndex is omitted', () => {
    writeSkill(
      join(repoRoot, '.claude', 'skills', 'foo'),
      'foo',
      '---\nname: foo\ndescription: foo skill\n---\nfoo body',
    );

    const { skillIndex } = buildResearchTools({ repoRoot });
    expect(skillIndex.find((s) => s.name === 'foo')).toBeDefined();
  });

  it('fires onSkillRead only after a successful read_skill execute', async () => {
    const skillDir = join(repoRoot, 'fake-skill');
    writeSkill(skillDir, 'fake-skill', '---\nname: fake-skill\ndescription: fake\n---\nfake body');
    const skillIndex: SkillMeta[] = [{ name: 'fake-skill', description: 'fake', dir: skillDir }];

    const readNames: string[] = [];
    const { tools } = buildResearchTools({
      repoRoot,
      skillIndex,
      onSkillRead: (name) => readNames.push(name),
    });
    const readSkillTool = tools.find((t) => t.name === 'read_skill')!;

    await readSkillTool.execute('c1', { name: 'does-not-exist' });
    expect(readNames).toEqual([]);

    await readSkillTool.execute('c2', { name: 'fake-skill' });
    expect(readNames).toEqual(['fake-skill']);
  });

  it('default exec runs commands with an augmented PATH', async () => {
    const exec = createDefaultExec(repoRoot);
    const { stdout } = await exec('echo $PATH');
    const dirs = stdout.trim().split(':');
    expect(dirs).toContain('/opt/homebrew/bin');
    expect(dirs).toContain('/usr/local/bin');
  });

  it('uses a custom exec for the bash tool', async () => {
    const calls: string[] = [];
    const { tools } = buildResearchTools({
      repoRoot,
      skillIndex: [],
      exec: async (command) => {
        calls.push(command);
        return { stdout: 'custom-output', stderr: '' };
      },
    });

    const bashTool = tools.find((t) => t.name === 'bash')!;
    const res = await bashTool.execute('c1', { command: 'echo hi' });

    expect(calls).toEqual(['echo hi']);
    expect((res.content[0] as { text: string }).text).toContain('custom-output');
  });

  it('exposes additional read-only mounts without changing the free tool surface', async () => {
    const memoryRoot = join(repoRoot, 'memory-mount');
    mkdirSync(join(memoryRoot, 'symbols'), { recursive: true });
    mkdirSync(join(memoryRoot, '.runtime'), { recursive: true });
    writeFileSync(join(memoryRoot, 'MEMORY.md'), '偏好：使用日线。');
    writeFileSync(join(memoryRoot, 'symbols', 'AAPL.md'), 'AAPL 风险预算：2%。');
    writeFileSync(join(memoryRoot, '.runtime', 'pending.md'), 'internal');
    writeFileSync(join(memoryRoot, 'secret.json'), '{"secret":true}');

    const { tools } = buildResearchTools({
      repoRoot,
      skillIndex: [],
      readMounts: [
        {
          name: 'memory',
          root: memoryRoot,
          include: ['**/*.md'],
          exclude: ['.runtime/**'],
        },
      ],
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'read_skill',
      'bash',
      'read_file',
      'list_files',
      'grep',
    ]);

    const readFile = tools.find((tool) => tool.name === 'read_file')!;
    const readable = await readFile.execute('read-ok', {
      mount: 'memory',
      path: 'symbols/AAPL.md',
    });
    expect((readable.content[0] as { text: string }).text).toContain('风险预算');

    const excluded = await readFile.execute('read-excluded', {
      mount: 'memory',
      path: '.runtime/pending.md',
    });
    expect((excluded.content[0] as { text: string }).text).toContain('rejected');

    const wrongType = await readFile.execute('read-type', {
      mount: 'memory',
      path: 'secret.json',
    });
    expect((wrongType.content[0] as { text: string }).text).toContain('rejected');

    const escaped = await readFile.execute('read-escape', {
      mount: 'memory',
      path: '../outside.md',
    });
    expect((escaped.content[0] as { text: string }).text).toContain('outside mount root');
  });

  it('does not follow symlinks outside an additional mount', async () => {
    const memoryRoot = join(repoRoot, 'memory-symlink-mount');
    const outside = join(repoRoot, 'outside-memory.md');
    mkdirSync(memoryRoot, { recursive: true });
    writeFileSync(outside, 'must not be readable');
    symlinkSync(outside, join(memoryRoot, 'escaped.md'));

    const { tools } = buildResearchTools({
      repoRoot,
      skillIndex: [],
      readMounts: [{ name: 'memory', root: memoryRoot, include: ['**/*.md'] }],
    });
    const readFile = tools.find((tool) => tool.name === 'read_file')!;
    const result = await readFile.execute('read-symlink', {
      mount: 'memory',
      path: 'escaped.md',
    });

    expect((result.content[0] as { text: string }).text).toContain('outside mount root');
  });

  it('implements grep file, content, count, glob, and pagination behavior', async () => {
    const memoryRoot = join(repoRoot, 'memory-grep-mount');
    mkdirSync(join(memoryRoot, 'symbols'), { recursive: true });
    writeFileSync(join(memoryRoot, 'MEMORY.md'), '风险偏好：保守\n交易周期：日线\n');
    writeFileSync(join(memoryRoot, 'symbols', 'AAPL.md'), '风险预算：2%\n避免追高\n');
    writeFileSync(join(memoryRoot, 'symbols', 'TSLA.md'), '风险预算：1%\n波动较高\n');

    const { tools } = buildResearchTools({
      repoRoot,
      skillIndex: [],
      readMounts: [{ name: 'memory', root: memoryRoot, include: ['**/*.md'] }],
    });
    const grep = tools.find((tool) => tool.name === 'grep')!;

    const files = await grep.execute('grep-files', {
      mount: 'memory',
      pattern: '风险',
      glob: '*.{md,txt}',
    });
    expect((files.content[0] as { text: string }).text).toBe(
      ['MEMORY.md', 'symbols/AAPL.md', 'symbols/TSLA.md'].join('\n'),
    );

    const content = await grep.execute('grep-content', {
      mount: 'memory',
      pattern: '风险预算',
      glob: 'symbols/*.md',
      output_mode: 'content',
      offset: 1,
      head_limit: 1,
    });
    expect((content.content[0] as { text: string }).text).toBe('symbols/TSLA.md:1:风险预算：1%');

    const count = await grep.execute('grep-count', {
      mount: 'memory',
      pattern: '风险',
      output_mode: 'count',
    });
    expect((count.content[0] as { text: string }).text).toContain('total:3');
  });
});

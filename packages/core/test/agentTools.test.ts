import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultExec,
  resetExecPathCacheForTests,
} from '../src/ai/agents/agentTools/execTool.js';
import { buildResearchTools } from '../src/ai/agents/agentTools/researchTools.js';
import type { SkillMeta } from '../src/ai/agents/skills.js';
import { homeExtraBinDirs } from '../src/platform/userPath.js';

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'agent-tools-test-'));
  resetExecPathCacheForTests();
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
  resetExecPathCacheForTests();
});

function writeSkill(dir: string, name: string, content: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content);
}

describe('buildResearchTools', () => {
  it('returns shared skill, bash, and lossless transcript tools, plus configured web search', async () => {
    const bare = await buildResearchTools({ repoRoot, skillIndex: [], webSearchConfigured: false });
    expect(bare.tools.map((t) => t.name)).toEqual(['read_skill', 'bash', 'read_bash_transcript']);

    const configured = await buildResearchTools({
      repoRoot,
      skillIndex: [],
      webSearchConfigured: true,
    });
    expect(configured.tools.map((t) => t.name)).toEqual([
      'read_skill',
      'bash',
      'read_bash_transcript',
      'web_search',
    ]);
  });

  it('uses a provided skillIndex as-is and returns it', async () => {
    const skillDir = join(repoRoot, 'fake-skill');
    writeSkill(skillDir, 'fake-skill', '---\nname: fake-skill\ndescription: fake\n---\nfake body');
    const skillIndex: SkillMeta[] = [{ name: 'fake-skill', description: 'fake', dir: skillDir }];

    const result = await buildResearchTools({ repoRoot, skillIndex });
    expect(result.skillIndex).toBe(skillIndex);

    const readSkillTool = result.tools.find((t) => t.name === 'read_skill')!;
    const res = await readSkillTool.execute('c1', { name: 'fake-skill' });
    expect((res.content[0] as { text: string }).text).toContain('fake body');
  });

  it('loads the skill index from skillSearchDirs(repoRoot) when skillIndex is omitted', async () => {
    writeSkill(
      join(repoRoot, '.claude', 'skills', 'foo'),
      'foo',
      '---\nname: foo\ndescription: foo skill\n---\nfoo body',
    );

    const { skillIndex } = await buildResearchTools({ repoRoot });
    expect(skillIndex.find((s) => s.name === 'foo')).toBeDefined();
  });

  it('fires onSkillRead only after a successful read_skill execute', async () => {
    const skillDir = join(repoRoot, 'fake-skill');
    writeSkill(skillDir, 'fake-skill', '---\nname: fake-skill\ndescription: fake\n---\nfake body');
    const skillIndex: SkillMeta[] = [{ name: 'fake-skill', description: 'fake', dir: skillDir }];

    const readNames: string[] = [];
    const { tools } = await buildResearchTools({
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
    for (const dir of homeExtraBinDirs()) {
      expect(dirs).toContain(dir);
    }
  });

  it('default exec exposes stable skill roots and returns nonzero exit codes', async () => {
    const exec = createDefaultExec(repoRoot);
    const roots = await exec('printf "%s\n%s" "$KANSOKU_SKILLS_DIR" "$KANSOKU_APP_SKILLS_DIR"');
    expect(roots.stdout).toBe(
      `${join(repoRoot, '.claude', 'skills')}\n${join(repoRoot, 'packages', 'core', 'skills')}`,
    );
    expect((await exec('exit 1')).exitCode).toBe(1);
  });

  it('uses a custom exec for the bash tool', async () => {
    const calls: string[] = [];
    const { tools } = await buildResearchTools({
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

  it('spools long bash output and reads every character through transcript pages', async () => {
    const expected = '甲乙丙'.repeat(12_000);
    const { tools } = await buildResearchTools({
      repoRoot,
      skillIndex: [],
      exec: async () => ({ stdout: expected, stderr: '' }),
      webSearchConfigured: false,
    });
    const bash = tools.find((tool) => tool.name === 'bash')!;
    const reader = tools.find((tool) => tool.name === 'read_bash_transcript')!;
    const result = await bash.execute('bash-1', { command: 'large-output' });
    const summary = (result.content[0] as { text: string }).text;
    const id = /transcript_id=([^\n]+)/.exec(summary)?.[1];
    const path = /transcript_path=([^\n]+)/.exec(summary)?.[1];
    expect(id).toBeTruthy();
    expect(path).toBeTruthy();

    let offset = 0;
    let received = '';
    for (;;) {
      const page = await reader.execute('read-1', {
        transcript_id: id!,
        offset,
        limit: 10_000,
      });
      const payload = JSON.parse((page.content[0] as { text: string }).text) as {
        text: string;
        next_offset: number;
        eof: boolean;
      };
      received += payload.text;
      offset = payload.next_offset;
      if (payload.eof) break;
    }
    expect(received).toBe(expected);
    rmSync(path!);
  });

  it('reports rg no-match as an exit code instead of a failed tool call', async () => {
    const { tools } = await buildResearchTools({
      repoRoot,
      skillIndex: [],
      exec: async () => ({ stdout: '', stderr: '', exitCode: 1 }),
      webSearchConfigured: false,
    });
    const result = await tools
      .find((tool) => tool.name === 'bash')!
      .execute('bash-1', {
        command: 'rg query',
      });
    expect((result.content[0] as { text: string }).text).toBe('[exit_code 1]\n');
  });

  it('does not let transcript reads escape the managed temp directory', async () => {
    const { tools } = await buildResearchTools({
      repoRoot,
      skillIndex: [],
      webSearchConfigured: false,
    });
    const result = await tools
      .find((tool) => tool.name === 'read_bash_transcript')!
      .execute('read-1', { transcript_id: '../../etc/passwd' });
    expect((result.content[0] as { text: string }).text).toBe('rejected: invalid transcript_id');
  });
});

describe('web_search', () => {
  const findWebSearch = async (
    webSearch: (options: { query: string; recency?: string }) => Promise<string>,
  ) => {
    const { tools } = await buildResearchTools({
      repoRoot,
      skillIndex: [],
      webSearch: webSearch as never,
      webSearchConfigured: true,
    });
    const tool = tools.find((t) => t.name === 'web_search');
    if (!tool) throw new Error('web_search tool missing');
    return tool;
  };

  const runTool = async (
    tool: Awaited<ReturnType<typeof findWebSearch>>,
    params: { query: string; recency?: string },
  ) => {
    const result = await tool.execute('id', params as never, {} as never);
    return result.content.map((part) => ('text' in part ? part.text : '')).join('');
  };

  it('passes the trimmed query and recency through', async () => {
    const seen: Array<{ query: string; recency?: string }> = [];
    const tool = await findWebSearch(async (options) => {
      seen.push(options);
      return 'MU 8月26日高管调整，来源 investors.micron.com';
    });
    expect(await runTool(tool, { query: '  MU 最近消息  ', recency: 'week' })).toContain(
      '高管调整',
    );
    expect(seen).toEqual([{ query: 'MU 最近消息', recency: 'week' }]);
  });

  it('rejects an empty query without running the search', async () => {
    let called = false;
    const tool = await findWebSearch(async () => {
      called = true;
      return '';
    });
    expect(await runTool(tool, { query: '   ' })).toContain('rejected');
    expect(called).toBe(false);
  });

  it('tells the agent to keep going when every backend is missing', async () => {
    const tool = await findWebSearch(async () => {
      throw new Error('No web search backend is available.');
    });
    const text = await runTool(tool, { query: 'anything' });
    expect(text).toContain('No web search backend is available.');
    expect(text).toContain('Continue the analysis without web results');
  });
});

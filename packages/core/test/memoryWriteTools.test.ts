import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMemoryWriteTools,
  MEMORY_FILE_MAX_BYTES,
} from '../src/ai/agents/agentTools/memoryWriteTools.js';

let root: string;
let write: ReturnType<typeof buildMemoryWriteTools>[0];
let patch: ReturnType<typeof buildMemoryWriteTools>[1];

const text = (result: { content: Array<unknown> }): string =>
  (result.content[0] as { text: string }).text;
const patchFor = (path: string, body: string): string =>
  ['*** Begin Patch', `*** Update File: ${path}`, body, '*** End Patch'].join('\n');

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'kansoku-memory-write-'));
  [write, patch] = buildMemoryWriteTools({ name: 'memory', root, include: ['**/*.md'] });
  await fs.writeFile(join(root, 'MEMORY.md'), '- 2026-09-01: 只看成交量结构\n', 'utf8');
});

afterEach(() => fs.rm(root, { recursive: true, force: true }));

describe('memory_write_file', () => {
  it('creates a new markdown file with parent directories and never overwrites', async () => {
    const created = await write.execute('1', {
      path: 'symbols/MU.US.md',
      content: '- 2026-09-03: MU 论点：供给周期\n',
    });
    expect(text(created)).toBe('created memory/symbols/MU.US.md (+2 lines)');
    expect(await fs.readFile(join(root, 'symbols', 'MU.US.md'), 'utf8')).toContain('供给周期');

    const again = await write.execute('2', { path: 'memory/symbols/MU.US.md', content: 'x' });
    expect(text(again)).toContain('already exists; use memory_apply_patch');
    expect(await fs.readFile(join(root, 'symbols', 'MU.US.md'), 'utf8')).toContain('供给周期');
  });

  it('rejects paths outside the mount, non-markdown files, symlinks, and oversized content', async () => {
    expect(text(await write.execute('a', { path: '../outside.md', content: 'x' }))).toContain(
      'escapes the memory mount',
    );
    expect(text(await write.execute('b', { path: 'notes/raw.json', content: '{}' }))).toContain(
      'only Markdown files',
    );
    await fs.symlink(tmpdir(), join(root, 'link'));
    expect(text(await write.execute('c', { path: 'link/x.md', content: 'x' }))).toContain(
      'symbolic links',
    );
    expect(
      text(
        await write.execute('d', {
          path: 'notes/big.md',
          content: 'x'.repeat(MEMORY_FILE_MAX_BYTES + 1),
        }),
      ),
    ).toContain('exceed');
    await expect(fs.lstat(join(root, 'notes', 'big.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('memory_apply_patch', () => {
  it('edits an existing file and reports the line delta', async () => {
    const result = await patch.execute('1', {
      patch: patchFor(
        'MEMORY.md',
        [' - 2026-09-01: 只看成交量结构', '+- 2026-09-03: 持仓周期 2 到 4 周'].join('\n'),
      ),
    });
    expect(text(result)).toBe('edited memory/MEMORY.md (2 → 3 lines)');
    expect(await fs.readFile(join(root, 'MEMORY.md'), 'utf8')).toBe(
      '- 2026-09-01: 只看成交量结构\n- 2026-09-03: 持仓周期 2 到 4 周\n',
    );
  });

  it('applies nothing when any hunk fails and refuses missing files', async () => {
    await fs.mkdir(join(root, 'symbols'));
    await fs.writeFile(join(root, 'symbols', 'MU.US.md'), '- a\n', 'utf8');
    const result = await patch.execute('1', {
      patch: [
        '*** Begin Patch',
        '*** Update File: symbols/MU.US.md',
        '-- a',
        '+- b',
        '*** Update File: MEMORY.md',
        '-- does not exist',
        '+- x',
        '*** End Patch',
      ].join('\n'),
    });
    expect(text(result)).toContain('edit failed: MEMORY.md');
    expect(await fs.readFile(join(root, 'symbols', 'MU.US.md'), 'utf8')).toBe('- a\n');

    expect(
      text(await patch.execute('2', { patch: patchFor('symbols/NVDA.US.md', '-x\n+y') })),
    ).toContain('does not exist; use memory_write_file');
    expect(text(await patch.execute('3', { patch: 'nope' }))).toContain('must start with');
  });
});

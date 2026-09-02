import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { applyChunks, parsePatch, PatchError } from '../../../canvas/applyPatch.js';
import { textResult } from '../dataTools.js';
import { type FsWriteMount, slashPath } from './fsMounts.js';

export const MEMORY_FILE_MAX_BYTES = 64 * 1024;

const writeFileSchema = Type.Object({
  path: Type.String({ minLength: 1, maxLength: 1_000 }),
  content: Type.String({ minLength: 1, maxLength: MEMORY_FILE_MAX_BYTES }),
});

const applyPatchSchema = Type.Object({
  patch: Type.String({ minLength: 1, maxLength: 200_000 }),
});

class MemoryPathError extends Error {}

function resolveMemoryPath(mount: FsWriteMount, rawPath: string): { path: string; rel: string } {
  if (rawPath.includes('\0')) throw new MemoryPathError(`invalid path: ${rawPath}`);
  const trimmed = rawPath.replace(/^\/+/, '').replace(/^memory\//, '');
  const path = resolve(mount.root, trimmed);
  const rel = relative(mount.root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new MemoryPathError(`path escapes the memory mount: ${rawPath}`);
  }
  if (!rel.endsWith('.md'))
    throw new MemoryPathError(`only Markdown files are writable: ${rawPath}`);
  return { path, rel: slashPath(rel) };
}

async function assertNoSymlinkOnPath(mount: FsWriteMount, target: string): Promise<void> {
  const parts = relative(mount.root, target).split(sep).filter(Boolean);
  let current = mount.root;
  for (const part of parts) {
    current = join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) {
        throw new MemoryPathError('symbolic links are not allowed under the memory mount');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

function assertSize(content: string, rel: string): void {
  if (Buffer.byteLength(content, 'utf8') > MEMORY_FILE_MAX_BYTES) {
    throw new MemoryPathError(
      `${rel} would exceed ${MEMORY_FILE_MAX_BYTES / 1024} KB; move detail into notes/`,
    );
  }
}

async function writeAtomic(target: string, content: string): Promise<void> {
  await fs.mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

const lineCount = (text: string): number => (text ? text.split('\n').length : 0);

const failure = (verb: string, error: unknown): ReturnType<typeof textResult> =>
  textResult(`${verb} failed: ${error instanceof Error ? error.message : String(error)}`);

export function buildMemoryWriteTools(mount: FsWriteMount): AgentTool[] {
  const writeFile: AgentTool<typeof writeFileSchema> = {
    name: 'memory_write_file',
    label: '新建记忆文件',
    description:
      'Create a new Markdown file under the memory mount (symbols/<SYMBOL>.md, markets/<MARKET>.md, notes/<slug>.md). Fails if the file already exists; edit existing files with memory_apply_patch. One dated fact per line: "- YYYY-MM-DD: ...".',
    parameters: writeFileSchema,
    execute: async (_id, params) => {
      try {
        const { path, rel } = resolveMemoryPath(mount, params.path);
        await assertNoSymlinkOnPath(mount, path);
        assertSize(params.content, rel);
        await fs.mkdir(dirname(path), { recursive: true });
        await fs.writeFile(path, params.content, { encoding: 'utf8', flag: 'wx' });
        return textResult(`created memory/${rel} (+${lineCount(params.content)} lines)`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          return textResult(`create failed: ${params.path} already exists; use memory_apply_patch`);
        }
        return failure('create', error);
      }
    },
  };

  const applyPatch: AgentTool<typeof applyPatchSchema> = {
    name: 'memory_apply_patch',
    label: '更新记忆',
    description:
      'Apply one patch to existing Markdown files under the memory mount. Format: "*** Begin Patch", then one or more "*** Update File: <path>" sections holding hunks; a hunk may open with "@@ <context line>" to pin its position, and body lines start with " " (unchanged), "-" (remove), or "+" (add). End with "*** End Patch". All hunks apply together or not at all. Paths are relative to the memory mount (MEMORY.md, symbols/MU.US.md). New files go through memory_write_file.',
    parameters: applyPatchSchema,
    execute: async (_id, params) => {
      try {
        const files = parsePatch(params.patch);
        const staged: Array<{ path: string; rel: string; before: number; next: string }> = [];
        for (const file of files) {
          const { path, rel } = resolveMemoryPath(mount, file.path);
          await assertNoSymlinkOnPath(mount, path);
          let source: string;
          try {
            source = await fs.readFile(path, 'utf8');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              return textResult(`edit failed: ${file.path} does not exist; use memory_write_file`);
            }
            throw error;
          }
          let next: string;
          try {
            next = applyChunks(source, file.chunks);
          } catch (error) {
            if (error instanceof PatchError)
              return textResult(`edit failed: ${file.path}: ${error.message}`);
            throw error;
          }
          assertSize(next, rel);
          staged.push({ path, rel, before: lineCount(source), next });
        }
        const lines: string[] = [];
        for (const entry of staged) {
          await writeAtomic(entry.path, entry.next);
          lines.push(
            `edited memory/${entry.rel} (${entry.before} → ${lineCount(entry.next)} lines)`,
          );
        }
        return textResult(lines.join('\n'));
      } catch (error) {
        return failure('edit', error);
      }
    },
  };

  return [writeFile as AgentTool, applyPatch as AgentTool];
}

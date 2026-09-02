import { promises as fs } from 'node:fs';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { textResult } from '../dataTools.js';
import { buildMounts, isAllowedMountFile, isSymlinkSafe, resolveMountedPath } from './fsMounts.js';

const READ_FILE_MAX_CHARS = 100_000;

const readFileSchema = Type.Object({
  path: Type.String({ minLength: 1, maxLength: 2_000 }),
});

export function buildReadFileTool(repoRoot: string): AgentTool<typeof readFileSchema> {
  const mounts = buildMounts(repoRoot);
  return {
    name: 'read_file',
    label: 'Read File',
    description:
      'Read a UTF-8 file from the repository. Paths are relative to the repository root.',
    parameters: readFileSchema,
    execute: async (_id, params) => {
      const rawPath = params.path;
      const resolved = resolveMountedPath(mounts, undefined, rawPath);
      if (!resolved) return textResult(`rejected: path outside repository root: ${rawPath}`);
      if (!isAllowedMountFile(resolved.mount, resolved.path)) {
        return textResult(`rejected: path is not readable: ${rawPath}`);
      }
      try {
        if (!(await isSymlinkSafe(resolved.mount, resolved.path))) {
          return textResult(`rejected: path resolves outside repository root: ${rawPath}`);
        }
        const stat = await fs.stat(resolved.path);
        if (!stat.isFile()) return textResult(`read failed: not a file: ${rawPath}`);
        const content = await fs.readFile(resolved.path, 'utf8');
        return textResult(
          content.length > READ_FILE_MAX_CHARS ? content.slice(0, READ_FILE_MAX_CHARS) : content,
        );
      } catch (err) {
        return textResult(`read failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

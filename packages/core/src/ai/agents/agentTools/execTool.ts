import { exec as nodeExec } from 'node:child_process';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { locateOpencli } from '../../../credentials/opencli.js';
import { locateLongbridgeCli } from '../../../marketdata/longbridgeCli.js';
import {
  resolveAugmentedPath,
  resetUserPathCacheForTests,
} from '../../../platform/userPath.js';
import { textResult } from '../dataTools.js';

const OUTPUT_TRUNCATE_CHARS = 30_000;
const REJECTED_PATTERNS = [/>>?/, /\btee\s/, /\brm\s/, /\bmv\s/, /\bcp\s/];
const BASH_TIMEOUT_MS = 120_000;
const BASH_MAX_BUFFER = 10 * 1024 * 1024;

export type ExecResult = { stdout: string; stderr: string };
export type ExecFn = (command: string) => Promise<ExecResult>;

const nodeExecAsync = promisify(nodeExec);

let cachedExecPathPromise: Promise<string> | null = null;

export function resetExecPathCacheForTests(): void {
  cachedExecPathPromise = null;
  resetUserPathCacheForTests();
}

// Finder-launched Electron inherits a bare PATH (/usr/bin:/bin:...), so CLIs
// installed via n/nvm/homebrew are invisible to plain `sh -c` without help.
function resolveExecPath(): Promise<string> {
  cachedExecPathPromise ??= (async () => {
    const extra: string[] = [];
    try {
      extra.push(dirname(await locateLongbridgeCli()));
    } catch {}
    try {
      const opencli = await locateOpencli();
      if (opencli) extra.push(dirname(opencli));
    } catch {}
    return resolveAugmentedPath({ extraDirs: extra });
  })();
  return cachedExecPathPromise;
}

export function createDefaultExec(repoRoot: string): ExecFn {
  return async (command: string) => {
    const { stdout, stderr } = await nodeExecAsync(command, {
      cwd: repoRoot,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: BASH_MAX_BUFFER,
      env: { ...process.env, PATH: await resolveExecPath() },
    });
    return { stdout, stderr };
  };
}

export function truncateOutput(text: string): string {
  if (text.length <= OUTPUT_TRUNCATE_CHARS) return text;
  return `${text.slice(0, OUTPUT_TRUNCATE_CHARS)}\n...[truncated]`;
}

export function isRejectedCommand(command: string): boolean {
  return REJECTED_PATTERNS.some((re) => re.test(command));
}

const bashSchema = Type.Object({ command: Type.String() });

export function buildBashTool(exec: ExecFn): AgentTool<typeof bashSchema> {
  return {
    name: 'bash',
    label: 'Bash',
    description: 'Run a shell command (cwd = repo root). Read-only commands only; no file writes.',
    parameters: bashSchema,
    execute: async (_id, params) => {
      const command = params.command;
      if (isRejectedCommand(command)) {
        return textResult(`rejected: command "${command}" matches a disallowed write pattern`);
      }
      try {
        const { stdout, stderr } = await exec(command);
        return textResult(truncateOutput(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`));
      } catch (err) {
        return textResult(`command failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

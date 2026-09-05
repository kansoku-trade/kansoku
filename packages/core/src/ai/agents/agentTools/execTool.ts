import { exec as nodeExec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { locateOpencli } from '../../../credentials/opencli.js';
import { locateLongbridgeCli } from '../../../marketdata/longbridgeCli.js';
import { resolveAugmentedPath, resetUserPathCacheForTests } from '../../../platform/userPath.js';
import { textResult } from '../dataTools.js';

const OUTPUT_TRUNCATE_CHARS = 30_000;
const OUTPUT_PREVIEW_CHARS = 12_000;
const REJECTED_PATTERNS = [/>>?/, /\btee\s/, /\brm\s/, /\bmv\s/, /\bcp\s/];
const BASH_TIMEOUT_MS = 120_000;
const BASH_MAX_BUFFER = 10 * 1024 * 1024;
const TRANSCRIPT_PAGE_CHARS = 20_000;
const TRANSCRIPT_MAX_PAGE_CHARS = 30_000;
const TRANSCRIPT_TTL_MS = 24 * 60 * 60_000;
const TRANSCRIPT_ID_RE = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
const TRANSCRIPT_DIR = join(tmpdir(), 'kansoku', 'bash');

export type ExecResult = { stdout: string; stderr: string; exitCode?: number };
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
    const options = {
      cwd: repoRoot,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: BASH_MAX_BUFFER,
      env: {
        ...process.env,
        KANSOKU_APP_SKILLS_DIR:
          process.env.TRADE_SKILLS_DIR ?? join(repoRoot, 'packages', 'core', 'skills'),
        KANSOKU_SKILLS_DIR: process.env.TRADE_SKILLS_DIR ?? join(repoRoot, '.claude', 'skills'),
        PATH: await resolveExecPath(),
      },
    };
    try {
      const { stdout, stderr } = await nodeExecAsync(command, options);
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      const failed = error as Error & { code?: unknown; stdout?: unknown; stderr?: unknown };
      if (typeof failed.code !== 'number') throw error;
      return {
        stdout: typeof failed.stdout === 'string' ? failed.stdout : '',
        stderr: typeof failed.stderr === 'string' ? failed.stderr : '',
        exitCode: failed.code,
      };
    }
  };
}

async function cleanupOldTranscripts(now = Date.now()): Promise<void> {
  let entries;
  try {
    entries = await readdir(TRANSCRIPT_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
      .map(async (entry) => {
        const path = join(TRANSCRIPT_DIR, entry.name);
        try {
          if (now - (await stat(path)).mtimeMs > TRANSCRIPT_TTL_MS) await rm(path);
        } catch {
          // Another process may have cleaned the same transcript first.
        }
      }),
  );
}

async function saveTranscript(text: string): Promise<{ id: string; path: string }> {
  await mkdir(TRANSCRIPT_DIR, { recursive: true, mode: 0o700 });
  await cleanupOldTranscripts();
  const id = randomUUID();
  const path = join(TRANSCRIPT_DIR, `${id}.log`);
  await writeFile(path, text, { encoding: 'utf8', mode: 0o600 });
  return { id, path };
}

export function isRejectedCommand(command: string): boolean {
  return REJECTED_PATTERNS.some((re) => re.test(command));
}

const bashSchema = Type.Object({ command: Type.String() });
const transcriptSchema = Type.Object({
  transcript_id: Type.String(),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: TRANSCRIPT_MAX_PAGE_CHARS })),
});

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
        const { stdout, stderr, exitCode = 0 } = await exec(command);
        const output = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`;
        const status = exitCode === 0 ? '' : `[exit_code ${exitCode}]\n`;
        if (output.length <= OUTPUT_TRUNCATE_CHARS) return textResult(`${status}${output}`);
        const transcript = await saveTranscript(output);
        return textResult(
          [
            `${status}Output is too large to return inline. The complete output was saved without truncation.`,
            `transcript_id=${transcript.id}`,
            `transcript_path=${transcript.path}`,
            `chars=${output.length} bytes=${Buffer.byteLength(output, 'utf8')} lines=${output.split('\n').length}`,
            'Use bash with rg/grep on transcript_path for targeted lookup. Use read_bash_transcript with transcript_id for lossless sequential reading.',
            '',
            '[preview]',
            output.slice(0, OUTPUT_PREVIEW_CHARS),
          ].join('\n'),
        );
      } catch (err) {
        return textResult(`command failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export function buildReadBashTranscriptTool(): AgentTool<typeof transcriptSchema> {
  return {
    name: 'read_bash_transcript',
    label: 'Read Bash Transcript',
    description:
      'Read a lossless page from a complete Bash output saved in /tmp. Continue with next_offset until eof=true. Prefer rg or grep through bash when looking for specific text.',
    parameters: transcriptSchema,
    execute: async (_id, params) => {
      if (!TRANSCRIPT_ID_RE.test(params.transcript_id)) {
        return textResult('rejected: invalid transcript_id');
      }
      try {
        const text = await readFile(join(TRANSCRIPT_DIR, `${params.transcript_id}.log`), 'utf8');
        const offset = params.offset ?? 0;
        if (offset > text.length) return textResult('rejected: offset exceeds transcript length');
        const nextOffset = Math.min(text.length, offset + (params.limit ?? TRANSCRIPT_PAGE_CHARS));
        return textResult(
          JSON.stringify({
            transcript_id: params.transcript_id,
            offset,
            next_offset: nextOffset,
            eof: nextOffset === text.length,
            text: text.slice(offset, nextOffset),
          }),
        );
      } catch (error) {
        return textResult(
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'transcript not found or expired'
            : `transcript read failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

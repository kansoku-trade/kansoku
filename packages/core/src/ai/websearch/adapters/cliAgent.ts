import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveAugmentedPath } from '../../../platform/userPath.js';
import {
  SearchAdapterError,
  type SearchAdapter,
  type SearchRequest,
  type SearchResponse,
} from '../types.js';

// stdin must be closed the moment the child starts: `codex exec` treats an open pipe as
// "more prompt is coming" ("Reading additional input from stdin...") and blocks until the
// timeout kills it. promisify(execFile) hides the child, so the callback form is required.
const execFileClosedStdin: CliRunner = (bin, args, opts) =>
  new Promise((resolve, reject) => {
    const child = execFile(bin, args, opts, (error, stdout) =>
      error ? reject(error) : resolve({ stdout }),
    );
    child.stdin?.end();
  });

const VERSION_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 8 * 1024 * 1024;

const PREAMBLE = [
  'Answer strictly from web search results. Never read local files and never run commands other than web search.',
  'Report only what the sources say; add no market opinion and no trading advice of your own.',
  'Every fact carries its publication date and its source URL. When the search finds nothing, say so plainly instead of guessing.',
  'Answer in modern vernacular Chinese (中文白话).',
].join('\n');

const RECENCY_INSTRUCTIONS = {
  day: 'Only use sources published within the last 24 hours.',
  week: 'Only use sources published within the last 7 days.',
  month: 'Only use sources published within the last 30 days.',
  year: 'Only use sources published within the last 12 months.',
} as const;

export function buildPrompt(request: SearchRequest): string {
  const lines = [PREAMBLE];
  if (request.recency) lines.push(RECENCY_INSTRUCTIONS[request.recency]);
  lines.push('', 'Request:', request.query);
  return lines.join('\n');
}

export type CliRunner = (
  bin: string,
  args: string[],
  opts: {
    cwd: string;
    timeout: number;
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  },
) => Promise<{ stdout: string }>;

export interface CliAgentAdapterSpec {
  id: string;
  label: string;
  bin: string;
  versionArgs: string[];
  /** `outFile` is a scratch path the CLI may write its answer to; adapters that print to stdout ignore it. */
  searchArgs: (prompt: string, outFile: string) => string[];
  readAnswer: (stdout: string, outFile: string) => Promise<string>;
}

export async function readOutFile(_stdout: string, outFile: string): Promise<string> {
  return (await readFile(outFile, 'utf8')).trim();
}

export function createCliAgentAdapter(
  spec: CliAgentAdapterSpec,
  run: CliRunner = execFileClosedStdin,
): SearchAdapter {
  let installed: Promise<boolean> | null = null;

  const probe = async (): Promise<boolean> => {
    try {
      await run(spec.bin, spec.versionArgs, {
        cwd: tmpdir(),
        timeout: VERSION_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, PATH: await resolveAugmentedPath() },
      });
      return true;
    } catch {
      return false;
    }
  };

  return {
    id: spec.id,
    label: spec.label,
    // A negative probe is never cached: the desktop app stays up for days, and a CLI installed
    // mid-session must become usable without a restart.
    async isAvailable() {
      installed ??= probe();
      if (await installed) return true;
      installed = null;
      return false;
    },
    async search(request: SearchRequest): Promise<SearchResponse> {
      const dir = await mkdtemp(path.join(tmpdir(), `kansoku-websearch-${spec.id}-`));
      const outFile = path.join(dir, 'answer.md');
      try {
        const { stdout } = await run(spec.bin, spec.searchArgs(buildPrompt(request), outFile), {
          cwd: dir,
          timeout: request.timeoutMs,
          maxBuffer: MAX_BUFFER,
          env: { ...process.env, PATH: await resolveAugmentedPath() },
          signal: request.signal,
        });
        const answer = await spec.readAnswer(stdout, outFile);
        if (!answer) throw new SearchAdapterError(spec.id, `${spec.label} returned no answer.`);
        return { provider: spec.id, answer, sources: [] };
      } catch (error) {
        if (error instanceof SearchAdapterError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new SearchAdapterError(spec.id, `${spec.label} failed: ${message}`);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

// `--ignore-user-config` keeps a user's own codex hooks and model overrides out of the search run;
// auth still resolves through CODEX_HOME, so a signed-in CLI keeps working.
export const codexAdapterSpec: CliAgentAdapterSpec = {
  id: 'codex',
  label: 'Codex CLI',
  bin: 'codex',
  versionArgs: ['--version'],
  searchArgs: (prompt, outFile) => [
    'exec',
    '--ignore-user-config',
    '-c',
    'tools.web_search=true',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    '--ephemeral',
    '--color',
    'never',
    '-o',
    outFile,
    prompt,
  ],
  readAnswer: readOutFile,
};

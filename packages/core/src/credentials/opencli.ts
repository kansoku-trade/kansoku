import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import type { OpencliStatus } from '../contract/credentials.js';
import {
  homeExtraBinDirs,
  resolveHomeDir,
  staticAugmentedPath,
  SYSTEM_EXTRA_BIN_DIRS,
  type PathExec,
} from '../platform/userPath.js';

const execFileAsync = promisify(execFile);
const DOCTOR_TIMEOUT_MS = 20_000;
const PROFILE_TIMEOUT_MS = 30_000;
const MAX_ERROR_LENGTH = 200;

export interface OpencliDeps {
  env?: NodeJS.ProcessEnv;
  exec?: PathExec;
  shell?: string;
  standardPaths?: string[];
  homeBinDirs?: string[];
}

let cachedCliPath: string | null = null;

export function resetOpencliCacheForTests(): void {
  cachedCliPath = null;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(env: NodeJS.ProcessEnv, deps: OpencliDeps): string[] {
  const home = resolveHomeDir(env);
  const homeBins = deps.homeBinDirs ?? homeExtraBinDirs(home);
  const standardPaths =
    deps.standardPaths ??
    [...SYSTEM_EXTRA_BIN_DIRS.map((dir) => join(dir, 'opencli')), '/usr/bin/opencli'];
  const pathEntries = (env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, 'opencli'));
  const homeEntries = homeBins.map((dir) => join(dir, 'opencli'));
  return [env.OPENCLI_PATH, ...pathEntries, ...standardPaths, ...homeEntries].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

async function shellCommandCandidate(
  deps: OpencliDeps,
  command: string,
): Promise<string | null> {
  const exec = deps.exec ?? execFileAsync;
  const env = deps.env ?? process.env;
  const shell = deps.shell ?? env.SHELL ?? process.env.SHELL ?? '/bin/zsh';
  try {
    const { stdout } = await exec(shell, ['-lic', command], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
      env: { ...env, TERM: 'dumb' },
    });
    const candidate = stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .find((line) => isAbsolute(line));
    return candidate ?? null;
  } catch {
    return null;
  }
}

export async function locateOpencli(deps: OpencliDeps = {}): Promise<string | null> {
  if (cachedCliPath && (await isExecutable(cachedCliPath))) return cachedCliPath;
  const env = deps.env ?? process.env;
  const seen = new Set<string>();
  for (const candidate of pathCandidates(env, deps)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await isExecutable(candidate)) {
      cachedCliPath = candidate;
      return candidate;
    }
  }
  const shellCandidate = await shellCommandCandidate(deps, 'command -v opencli');
  if (shellCandidate && (await isExecutable(shellCandidate))) {
    cachedCliPath = shellCandidate;
    return shellCandidate;
  }
  return null;
}

function truncate(message: string): string {
  const firstLine = message.trim().split('\n')[0] ?? '';
  return firstLine.length > MAX_ERROR_LENGTH
    ? `${firstLine.slice(0, MAX_ERROR_LENGTH)}…`
    : firstLine;
}

function firstFailingDoctorLine(stdout: string): string | null {
  return (
    stdout
      .split('\n')
      .find((line) =>
        /^\[(FAIL|WARN|MISSING)]\s*(Extension|Connectivity):/.test(line.trim()),
      )
      ?.trim() ?? null
  );
}

function runEnvForCli(cliPath: string, deps: OpencliDeps): NodeJS.ProcessEnv {
  const env = deps.env ?? process.env;
  return {
    ...env,
    PATH: staticAugmentedPath(env.PATH, resolveHomeDir(env), [dirname(cliPath)]),
  };
}

export async function probeOpencli(deps: OpencliDeps = {}): Promise<OpencliStatus> {
  const cliPath = await locateOpencli(deps);
  if (!cliPath) {
    return { state: 'not_installed', cliPath: null, lastError: '未找到 opencli CLI' };
  }

  const exec = deps.exec ?? execFileAsync;
  const runEnv = runEnvForCli(cliPath, deps);
  let doctorStdout: string;
  let doctorError: unknown = null;
  try {
    const { stdout } = await exec(cliPath, ['doctor'], {
      timeout: DOCTOR_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: runEnv,
    });
    doctorStdout = stdout;
  } catch (error) {
    const { stdout, killed, signal } = error as {
      stdout?: string;
      killed?: boolean;
      signal?: string | null;
    };
    const timedOut = killed === true || Boolean(signal);
    if (!timedOut && typeof stdout === 'string' && stdout.length > 0) {
      doctorStdout = stdout;
      doctorError = error;
    } else {
      return { state: 'not_installed', cliPath, lastError: truncate(errorMessage(error)) };
    }
  }

  const hasOkExtension = /^\[OK]\s*Extension:/m.test(doctorStdout);
  const hasOkConnectivity = /^\[OK]\s*Connectivity:/m.test(doctorStdout);
  if (doctorError || !hasOkExtension || !hasOkConnectivity) {
    const failingLine = firstFailingDoctorLine(doctorStdout);
    const lastError =
      failingLine ??
      (doctorError ? errorMessage(doctorError) : 'opencli doctor 未返回预期的健康状态');
    return { state: 'extension_missing', cliPath, lastError: truncate(lastError) };
  }

  try {
    await exec(cliPath, ['twitter', 'profile'], {
      timeout: PROFILE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: runEnv,
    });
    return { state: 'ready', cliPath, lastError: null };
  } catch (error) {
    return { state: 'no_session', cliPath, lastError: truncate(errorMessage(error)) };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as { stderr?: string }).stderr;
    if (typeof stderr === 'string' && stderr.trim().length > 0) return stderr;
    return error.message;
  }
  return String(error);
}

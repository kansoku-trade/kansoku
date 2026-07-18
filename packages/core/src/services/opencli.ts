import { execFile } from "node:child_process";
import { access, constants, stat } from "node:fs/promises";
import { delimiter, isAbsolute } from "node:path";
import { promisify } from "node:util";
import type { OpencliStatus } from "../contract/credentials.js";

const execFileAsync = promisify(execFile);
const DOCTOR_TIMEOUT_MS = 20_000;
const PROFILE_TIMEOUT_MS = 30_000;
const MAX_ERROR_LENGTH = 200;
const STANDARD_PATHS = ["/opt/homebrew/bin/opencli", "/usr/local/bin/opencli", "/usr/bin/opencli"];

export interface OpencliDeps {
  env?: NodeJS.ProcessEnv;
  exec?: typeof execFileAsync;
  shell?: string;
  standardPaths?: string[];
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

function pathCandidates(env: NodeJS.ProcessEnv, standardPaths: string[]): string[] {
  const entries = (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => `${dir}/opencli`);
  return [env.OPENCLI_PATH, ...entries, ...standardPaths].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

async function loginShellCandidate(deps: OpencliDeps): Promise<string | null> {
  const exec = deps.exec ?? execFileAsync;
  const shell = deps.shell ?? deps.env?.SHELL ?? process.env.SHELL ?? "/bin/zsh";
  try {
    const { stdout } = await exec(shell, ["-lc", "command -v opencli"], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    const candidate = stdout.trim().split("\n")[0];
    return candidate && isAbsolute(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function locateOpencli(deps: OpencliDeps): Promise<string | null> {
  if (cachedCliPath && (await isExecutable(cachedCliPath))) return cachedCliPath;
  const env = deps.env ?? process.env;
  const seen = new Set<string>();
  for (const candidate of pathCandidates(env, deps.standardPaths ?? STANDARD_PATHS)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await isExecutable(candidate)) {
      cachedCliPath = candidate;
      return candidate;
    }
  }
  const shellCandidate = await loginShellCandidate(deps);
  if (shellCandidate && (await isExecutable(shellCandidate))) {
    cachedCliPath = shellCandidate;
    return shellCandidate;
  }
  return null;
}

function truncate(message: string): string {
  const firstLine = message.trim().split("\n")[0] ?? "";
  return firstLine.length > MAX_ERROR_LENGTH ? `${firstLine.slice(0, MAX_ERROR_LENGTH)}…` : firstLine;
}

function firstFailingDoctorLine(stdout: string): string | null {
  return (
    stdout
      .split("\n")
      .find((line) => /^\[(FAIL|WARN)\]\s*(Extension|Connectivity):/.test(line.trim()))
      ?.trim() ?? null
  );
}

export async function probeOpencli(deps: OpencliDeps = {}): Promise<OpencliStatus> {
  const cliPath = await locateOpencli(deps);
  if (!cliPath) {
    return { state: "not_installed", cliPath: null, lastError: "未找到 opencli CLI" };
  }

  const exec = deps.exec ?? execFileAsync;
  let doctorStdout: string;
  let doctorError: unknown = null;
  try {
    const { stdout } = await exec(cliPath, ["doctor"], {
      timeout: DOCTOR_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: deps.env ?? process.env,
    });
    doctorStdout = stdout;
  } catch (error) {
    const { stdout, killed, signal } = error as { stdout?: string; killed?: boolean; signal?: string | null };
    const timedOut = killed === true || Boolean(signal);
    if (!timedOut && typeof stdout === "string" && stdout.length > 0) {
      doctorStdout = stdout;
      doctorError = error;
    } else {
      return { state: "not_installed", cliPath, lastError: truncate(errorMessage(error)) };
    }
  }

  const hasOkExtension = /^\[OK\]\s*Extension:/m.test(doctorStdout);
  const hasOkConnectivity = /^\[OK\]\s*Connectivity:/m.test(doctorStdout);
  if (doctorError || !hasOkExtension || !hasOkConnectivity) {
    const failingLine = firstFailingDoctorLine(doctorStdout);
    const lastError =
      failingLine ?? (doctorError ? errorMessage(doctorError) : "opencli doctor 未返回预期的健康状态");
    return { state: "extension_missing", cliPath, lastError: truncate(lastError) };
  }

  try {
    await exec(cliPath, ["twitter", "profile"], {
      timeout: PROFILE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: deps.env ?? process.env,
    });
    return { state: "ready", cliPath, lastError: null };
  } catch (error) {
    return { state: "no_session", cliPath, lastError: truncate(errorMessage(error)) };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as { stderr?: string }).stderr;
    if (typeof stderr === "string" && stderr.trim().length > 0) return stderr;
    return error.message;
  }
  return String(error);
}

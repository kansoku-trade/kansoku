import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

export type WorkspaceMode =
  { mode: 'local' } | { mode: 'icloud'; workspacePath: string; updatedAt: string };

export function workspaceModePath(userDataPath: string): string {
  return join(userDataPath, 'State', 'workspace-mode.json');
}

export function readWorkspaceModeSync(userDataPath: string): WorkspaceMode {
  const path = workspaceModePath(userDataPath);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorkspaceMode>;
    if (parsed.mode === 'local') return { mode: 'local' };
    if (
      parsed.mode === 'icloud' &&
      typeof parsed.workspacePath === 'string' &&
      isAbsolute(parsed.workspacePath) &&
      typeof parsed.updatedAt === 'string'
    ) {
      return parsed as WorkspaceMode;
    }
    throw new Error('字段无效');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { mode: 'local' };
    throw new Error(`Workspace 模式配置损坏：${path}`, { cause: error });
  }
}

export function writeWorkspaceModeSync(userDataPath: string, mode: WorkspaceMode): void {
  const path = workspaceModePath(userDataPath);
  const tempPath = `${path}.${randomUUID()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(tempPath, `${JSON.stringify(mode, null, 2)}\n`, { mode: 0o600 });
    renameSync(tempPath, path);
    process.env.TRADE_PROJECT_ROOT =
      mode.mode === 'icloud' ? mode.workspacePath : join(userDataPath, 'Workspace');
  } finally {
    rmSync(tempPath, { force: true });
  }
}

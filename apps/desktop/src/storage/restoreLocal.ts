import { randomUUID } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { scaffoldDataRoot } from '../boot/paths.js';
import { copyUserContentSafely } from './migration.js';
import { writeWorkspaceModeSync } from './workspaceMode.js';

export async function restoreWorkspaceToLocal(input: {
  sourceRoot: string;
  userDataPath: string;
  now?: () => Date;
}): Promise<{ localWorkspace: string; backupPath: string | null }> {
  const startedAt = (input.now ?? (() => new Date()))().toISOString();
  const localWorkspace = join(input.userDataPath, 'Workspace');
  const tempWorkspace = join(input.userDataPath, `Workspace.restore-${randomUUID()}`);
  const backupPath = join(
    input.userDataPath,
    `Workspace.before-icloud-restore-${startedAt.replaceAll(/[-:.]/g, '')}`,
  );

  scaffoldDataRoot(tempWorkspace);
  const files = await copyUserContentSafely({
    sourceRoot: input.sourceRoot,
    workspaceRoot: tempWorkspace,
    startedAt,
  });
  if (files.failed.length > 0) {
    await rm(tempWorkspace, { recursive: true, force: true });
    throw new Error(`有 ${files.failed.length} 个 iCloud 文件无法复制，本地恢复已取消`);
  }

  let preservedLocal = false;
  try {
    try {
      await rename(localWorkspace, backupPath);
      preservedLocal = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(tempWorkspace, localWorkspace);
    writeWorkspaceModeSync(input.userDataPath, { mode: 'local' });
    return { localWorkspace, backupPath: preservedLocal ? backupPath : null };
  } catch (error) {
    if (preservedLocal) {
      try {
        await rename(backupPath, localWorkspace);
      } catch {
        // Both locations are preserved for manual recovery if the rollback cannot rename them.
      }
    }
    throw error;
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
}

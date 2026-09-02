import { app, dialog, shell } from 'electron';
import { dataRoot, databasePath, prepareDesktopStorage, userDataPath } from '../boot/env.js';
import { StorageMigrationError, type StorageMigrationResult } from './migration.js';

export async function prepareDesktopStorageWithRecovery(): Promise<boolean> {
  let sourceRootOverride: string | undefined;

  while (true) {
    try {
      const result = await prepareDesktopStorage({ sourceRootOverride });
      await showMigrationSummary(result);
      return true;
    } catch (error) {
      const action = await chooseRecoveryAction(error);
      if (action.kind === 'retry') continue;
      if (action.kind === 'locate') {
        sourceRootOverride = action.path;
        continue;
      }
      if (action.kind === 'start-empty') {
        await prepareDesktopStorage({ skipMigration: true });
        return true;
      }
      app.quit();
      return false;
    }
  }
}

async function chooseRecoveryAction(
  error: unknown,
): Promise<
  { kind: 'retry' } | { kind: 'locate'; path: string } | { kind: 'start-empty' } | { kind: 'quit' }
> {
  if (error instanceof StorageMigrationError && error.code === 'source-unavailable') {
    const choice = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['重新选择旧目录…', '本次使用空 Workspace', '退出'],
      defaultId: 0,
      cancelId: 2,
      title: '需要迁移旧数据',
      message: 'Kansoku 找不到升级前的数据目录。',
      detail: `${error.sourceRoot}\n\n在找到旧数据或明确选择空 Workspace 前，App 不会静默打开一套空数据。`,
    });
    if (choice.response === 0) {
      const picked = await dialog.showOpenDialog({
        title: '选择升级前的 Kansoku 数据目录',
        properties: ['openDirectory'],
      });
      return picked.canceled || picked.filePaths.length === 0
        ? { kind: 'retry' }
        : { kind: 'locate', path: picked.filePaths[0] };
    }
    if (choice.response === 1) {
      const confirm = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '确认本次使用空 Workspace'],
        defaultId: 0,
        cancelId: 0,
        title: '确认使用空 Workspace',
        message: '旧目录记录会保留，下次启动仍会提示迁移。',
        detail: `本次新数据会写入：\n${dataRoot}`,
      });
      return confirm.response === 1 ? { kind: 'start-empty' } : { kind: 'retry' };
    }
    return { kind: 'quit' };
  }

  const message = error instanceof Error ? error.message : String(error);
  const choice = await dialog.showMessageBox({
    type: 'error',
    buttons: ['重试', '退出'],
    defaultId: 0,
    cancelId: 1,
    title: 'Kansoku 数据迁移失败',
    message,
    detail: `Workspace：${dataRoot}\n数据库：${databasePath}`,
  });
  return choice.response === 0 ? { kind: 'retry' } : { kind: 'quit' };
}

async function showMigrationSummary(result: StorageMigrationResult | null): Promise<void> {
  if (!result?.performed || result.state.sourceRoot === userDataPath) return;
  const { files } = result.state;
  const choice = await dialog.showMessageBox({
    type: files.conflicts.length > 0 || files.skippedSymlinks.length > 0 ? 'warning' : 'info',
    buttons: ['打开旧目录', '打开 Agent Workspace', '完成'],
    defaultId: 2,
    cancelId: 2,
    title: '数据迁移完成',
    message: `已复制到新的 Agent Workspace：\n${dataRoot}`,
    detail: [
      `旧目录仍保留：${result.state.sourceRoot}`,
      `复制 ${files.copied} 个，内容相同 ${files.identical} 个。`,
      files.conflicts.length > 0 ? `保留 ${files.conflicts.length} 个冲突副本。` : '',
      files.skippedSymlinks.length > 0
        ? `跳过 ${files.skippedSymlinks.length} 个符号链接，原文件仍在旧目录。`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  if (choice.response === 0) await shell.openPath(result.state.sourceRoot);
  if (choice.response === 1) await shell.openPath(dataRoot);
}

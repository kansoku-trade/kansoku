import type { BrowserWindow } from 'electron';
import { app, dialog } from 'electron';
import type { ChartIndexRefreshResult } from '@kansoku/core/charts/store';
import { dataRoot } from '../../boot/env.js';
import { importUserContent, validateImportSource } from './manifest.js';

function messageBox(
  win: BrowserWindow | null,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function openDialog(
  win: BrowserWindow | null,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

async function runImportFromRepoFlowUnsafe(win: BrowserWindow | null): Promise<void> {
  if (!app.isPackaged) {
    await messageBox(win, {
      type: 'info',
      title: '导入 Kansoku 数据',
      message: '开发模式下 Agent Workspace 本身就是仓库，无需导入。',
    });
    return;
  }

  const picked = await openDialog(win, {
    title: '选择旧的 Kansoku 数据目录或 trade 仓库',
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return;
  const sourceRoot = picked.filePaths[0];

  const validation = validateImportSource(sourceRoot, dataRoot);
  if (!validation.ok) {
    const messages: Record<typeof validation.reason, string> = {
      'self': '所选目录就是当前 Agent Workspace，无需导入。',
      'missing-content': '所选目录里找不到 journal/ 或 stocks/。',
      'empty': '所选目录里没有可导入的用户文件。',
    };
    await messageBox(win, {
      type: 'warning',
      title: '导入 Kansoku 数据',
      message: messages[validation.reason],
    });
    return;
  }

  const result = await importUserContent(sourceRoot, dataRoot);
  let indexResult: ChartIndexRefreshResult | null = null;
  let indexError: string | null = null;
  try {
    const { refreshChartIndex } = await import('@kansoku/core/charts/store');
    indexResult = await refreshChartIndex();
  } catch (error) {
    indexError = error instanceof Error ? error.message : String(error);
  }

  const summaryLines = [
    `导入完成：复制 ${result.copied} 个文件，内容相同 ${result.identical} 个。`,
  ];
  if (result.conflicts.length > 0) {
    summaryLines.push(`保留 ${result.conflicts.length} 个同名冲突副本，没有覆盖现有文件。`);
  }
  if (result.skippedSymlinks.length > 0) {
    summaryLines.push(`跳过 ${result.skippedSymlinks.length} 个符号链接。`);
  }
  if (indexResult) {
    summaryLines.push(
      `图表索引已同步：识别 ${indexResult.indexed} 个，忽略 ${indexResult.skipped} 个。`,
    );
    if (indexResult.failures.length > 0) {
      summaryLines.push(
        ...indexResult.failures.slice(0, 5).map((failure) => `- ${failure.file}: ${failure.error}`),
      );
      if (indexResult.failures.length > 5) {
        summaryLines.push(`- 另有 ${indexResult.failures.length - 5} 个文件未进入索引。`);
      }
    }
  } else if (indexError) {
    summaryLines.push(`文件已经复制，但图表索引同步失败：${indexError}`);
  }
  if (result.failed.length > 0) {
    summaryLines.push(`有 ${result.failed.length} 个文件复制失败：`);
    summaryLines.push(...result.failed.map((failure) => `- ${failure.path}: ${failure.error}`));
  }
  await messageBox(win, {
    type:
      result.failed.length > 0 ||
      result.conflicts.length > 0 ||
      result.skippedSymlinks.length > 0 ||
      indexError ||
      (indexResult?.skipped ?? 0) > 0
        ? 'warning'
        : 'info',
    title: '导入 Kansoku 数据',
    message: summaryLines.join('\n'),
  });
}

// Validation can throw on unreadable dirs or a source deleted mid-flow; this
// guard keeps the menu click promise from rejecting unhandled.
export async function runImportFromRepoFlow(win: BrowserWindow | null): Promise<void> {
  try {
    await runImportFromRepoFlowUnsafe(win);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[desktop] import-from-repo failed', error);
    await messageBox(win, {
      type: 'error',
      title: '导入 Kansoku 数据',
      message: `导入失败：${message}`,
    });
  }
}

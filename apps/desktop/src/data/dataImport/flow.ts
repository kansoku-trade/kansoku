import type { BrowserWindow } from 'electron';
import { app, dialog } from 'electron';
import type { ChartIndexRefreshResult } from '@kansoku/core/charts/store';
import { dataRoot } from '../../boot/env.js';
import { buildImportManifest, copyImportManifest, validateImportSource } from './manifest.js';

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
      title: '从 repo 导入数据',
      message: '开发模式下数据目录本身就是仓库，无需导入。',
    });
    return;
  }

  const picked = await openDialog(win, {
    title: '选择 trade 仓库目录',
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return;
  const sourceRoot = picked.filePaths[0];

  const validation = validateImportSource(sourceRoot, dataRoot);
  if (!validation.ok) {
    const messages: Record<typeof validation.reason, string> = {
      'self': '所选目录就是当前数据目录，无需导入。',
      'missing-journal': '所选目录不像 trade 仓库：找不到 journal/charts/data。',
      'empty': '所选目录的 journal/charts/data 里没有可导入的图表文件。',
    };
    await messageBox(win, {
      type: 'warning',
      title: '从 repo 导入数据',
      message: messages[validation.reason],
    });
    return;
  }

  const manifest = buildImportManifest(sourceRoot, dataRoot);
  let overwrite = false;
  if (manifest.collisionCount > 0) {
    const choice = await messageBox(win, {
      type: 'question',
      buttons: ['取消', '跳过已存在的文件', '覆盖已存在的文件'],
      defaultId: 1,
      cancelId: 0,
      title: '从 repo 导入数据',
      message: `有 ${manifest.collisionCount} 个文件在当前数据目录中已存在，如何处理？`,
    });
    if (choice.response === 0) return;
    overwrite = choice.response === 2;
  }

  const result = copyImportManifest(manifest, { overwrite });
  let indexResult: ChartIndexRefreshResult | null = null;
  let indexError: string | null = null;
  try {
    const { refreshChartIndex } = await import('@kansoku/core/charts/store');
    indexResult = await refreshChartIndex();
  } catch (error) {
    indexError = error instanceof Error ? error.message : String(error);
  }

  const summaryLines = [`导入完成：复制 ${result.copied} 个文件，跳过 ${result.skipped} 个。`];
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
  if (result.failed > 0) {
    summaryLines.push(`有 ${result.failed} 个文件复制失败：`);
    summaryLines.push(
      ...result.failures.map((failure) => `- ${failure.relPath}: ${failure.error}`),
    );
  }
  await messageBox(win, {
    type: result.failed > 0 || indexError || (indexResult?.skipped ?? 0) > 0 ? 'warning' : 'info',
    title: '从 repo 导入数据',
    message: summaryLines.join('\n'),
  });
}

// buildImportManifest/validateImportSource can throw on unreadable dirs
// (permissions, a source deleted mid-flow), and copyImportManifest already
// reports its own per-file failures without throwing — this outer guard
// only exists to catch the former and make sure the promise this hands to
// the menu's click handler never rejects unhandled.
export async function runImportFromRepoFlow(win: BrowserWindow | null): Promise<void> {
  try {
    await runImportFromRepoFlowUnsafe(win);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[desktop] import-from-repo failed', error);
    await messageBox(win, {
      type: 'error',
      title: '从 repo 导入数据',
      message: `导入失败：${message}`,
    });
  }
}

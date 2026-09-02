import { shell } from 'electron';
import { dataRoot } from '../boot/env.js';

export async function openAgentWorkspace(): Promise<void> {
  const error = await shell.openPath(dataRoot);
  if (error) throw new Error(`无法打开 Agent Workspace：${error}`);
}

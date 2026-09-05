import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { createDefaultExec } from '@kansoku/core/ai/agents/agentTools/execTool';

export interface OnboardingState {
  completed: boolean;
  ripgrepAvailable: boolean;
}

export interface OnboardingStore {
  getState(): Promise<OnboardingState>;
  complete(): Promise<OnboardingState>;
}

async function detectRipgrep(): Promise<boolean> {
  try {
    const result = await createDefaultExec(process.env.TRADE_PROJECT_ROOT ?? process.cwd())(
      'command -v rg',
    );
    return (result.exitCode ?? 0) === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export function createOnboardingFileStore(
  filePath: string,
  ripgrepProbe: () => Promise<boolean> = detectRipgrep,
): OnboardingStore {
  async function readCompleted(): Promise<boolean> {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return parsed.completed === true;
    } catch {
      return false;
    }
  }

  async function state(completed: boolean): Promise<OnboardingState> {
    return { completed, ripgrepAvailable: await ripgrepProbe() };
  }

  return {
    async getState() {
      return state(await readCompleted());
    },
    async complete() {
      await writeFile(filePath, JSON.stringify({ completed: true }), { mode: 0o600 });
      await chmod(filePath, 0o600);
      return state(true);
    },
  };
}

export function createOnboardingStore(): OnboardingStore {
  return createOnboardingFileStore(join(app.getPath('userData'), 'onboarding-state.json'));
}

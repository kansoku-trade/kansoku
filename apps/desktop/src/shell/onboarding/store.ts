import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

export interface OnboardingState {
  completed: boolean;
  longbridgeSkipped: boolean;
}

export interface OnboardingStore {
  getState(): Promise<OnboardingState>;
  complete(): Promise<OnboardingState>;
  skipLongbridge(): Promise<OnboardingState>;
}

export function createOnboardingFileStore(filePath: string): OnboardingStore {
  async function read(): Promise<OnboardingState> {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return {
        completed: parsed.completed === true,
        longbridgeSkipped: parsed.longbridgeSkipped === true,
      };
    } catch {
      return { completed: false, longbridgeSkipped: false };
    }
  }

  async function write(state: OnboardingState): Promise<OnboardingState> {
    await writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
    await chmod(filePath, 0o600);
    return state;
  }

  return {
    getState: read,
    async complete() {
      const current = await read();
      return write({ ...current, completed: true });
    },
    async skipLongbridge() {
      const current = await read();
      return write({ ...current, longbridgeSkipped: true });
    },
  };
}

export function createOnboardingStore(): OnboardingStore {
  return createOnboardingFileStore(join(app.getPath('userData'), 'onboarding-state.json'));
}

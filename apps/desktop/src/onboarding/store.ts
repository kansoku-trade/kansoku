import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";

export interface OnboardingState {
  completed: boolean;
}

export interface OnboardingStore {
  getState(): Promise<OnboardingState>;
  complete(): Promise<OnboardingState>;
}

export function createOnboardingFileStore(filePath: string): OnboardingStore {
  async function read(): Promise<OnboardingState> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return { completed: parsed.completed === true };
    } catch {
      return { completed: false };
    }
  }

  return {
    getState: read,
    async complete() {
      const state: OnboardingState = { completed: true };
      await writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
      await chmod(filePath, 0o600);
      return state;
    },
  };
}

export function createOnboardingStore(): OnboardingStore {
  return createOnboardingFileStore(join(app.getPath("userData"), "onboarding-state.json"));
}

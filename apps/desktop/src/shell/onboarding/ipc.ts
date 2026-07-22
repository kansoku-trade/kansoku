import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import type { OnboardingStore } from './store.js';

// Same privileged-origin gate as credentials: the preload only exposes
// rpc.invoke to app:// (and the dev renderer), so these handlers don't
// re-check the sender.
export class OnboardingIpc extends IpcService {
  static readonly groupName = 'onboarding';

  constructor(private readonly store: OnboardingStore) {
    super();
  }

  @IpcMethod()
  getState() {
    return this.store.getState();
  }

  @IpcMethod()
  complete() {
    return this.store.complete();
  }

  @IpcMethod()
  skipLongbridge() {
    return this.store.skipLongbridge();
  }
}

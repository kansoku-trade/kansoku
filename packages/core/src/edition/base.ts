import type { CoreEditionHost, DesktopEditionHost, ServerEditionHost } from './host.js';
import type { ServerBuilder } from './serverBuilder.js';

export abstract class BaseEdition<THost extends CoreEditionHost> {
  private initialized = false;
  private initializing = false;
  private initializePromise: Promise<void> | null = null;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(protected readonly host: THost) {}

  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) {
      throw new Error(`${this.constructor.name}: already initialized`);
    }
    this.initializing = true;
    const promise = (async () => {
      try {
        await this.onInitialize();
        this.initialized = true;
      } finally {
        this.initializing = false;
        this.initializePromise = null;
      }
    })();
    this.initializePromise = promise;
    return promise;
  }

  async start(): Promise<void> {
    if (this.disposed) {
      throw new Error(`${this.constructor.name}: cannot start after dispose`);
    }
    if (!this.initialized) {
      throw new Error(`${this.constructor.name}: must initialize before start`);
    }
    if (this.started) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      try {
        await this.onStart();
        this.started = true;
      } finally {
        this.startPromise = null;
      }
    })();
    return this.startPromise;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.initializePromise) {
      await this.initializePromise.catch(() => {});
    }
    if (this.startPromise) {
      await this.startPromise.catch(() => {});
    }
    await this.onDispose();
  }

  protected onInitialize(): Promise<void> | void {}
  protected onStart(): Promise<void> | void {}
  protected onDispose(): Promise<void> | void {}
}

export abstract class BaseServerEdition extends BaseEdition<ServerEditionHost> {
  configureServer(builder: ServerBuilder): void {
    builder.addPublicModules();
  }
}
export abstract class BaseDesktopEdition extends BaseEdition<DesktopEditionHost> {}

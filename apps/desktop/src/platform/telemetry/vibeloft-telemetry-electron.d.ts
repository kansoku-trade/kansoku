declare module '@vibeloft/telemetry-electron' {
  export interface VibeLoftTelemetryAppLike {
    getPath?: (name: string) => string;
    getLocale?: () => string;
  }

  export interface VibeLoftTelemetryOptions {
    productId: string;
    authKey: string;
    appId: string;
    endpoint?: string;
    storagePath?: string;
    app?: VibeLoftTelemetryAppLike;
    locale?: string;
    disabled?: boolean;
    maxEventAgeMs?: number;
    requestTimeoutMs?: number;
  }

  export class VibeLoftTelemetry {
    static create(options: VibeLoftTelemetryOptions): Promise<VibeLoftTelemetry>;
    readonly pendingCount: number;
    trackScreen(name: string, occurredAt?: Date): string | null;
    flush(): Promise<boolean>;
    close(options?: { flushPending?: boolean }): Promise<void>;
  }
}

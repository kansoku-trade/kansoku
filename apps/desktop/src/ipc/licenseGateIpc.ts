import type { IpcServiceConstructor } from "electron-ipc-decorator";

const LICENSE_REQUIRED_ENVELOPE = {
  ok: false,
  error: "AI features require an active license",
  code: "LICENSE_REQUIRED",
  status: 403,
} as const;

export function gateLicensedIpc<T extends IpcServiceConstructor>(
  Ctor: T,
  isLicensed: () => boolean,
  methods?: string[],
): T {
  const proto = Ctor.prototype as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === "constructor") continue;
    if (methods && !methods.includes(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    const original = descriptor.value as (...args: unknown[]) => unknown;
    Object.defineProperty(proto, key, {
      ...descriptor,
      value(this: unknown, ...args: unknown[]) {
        if (!isLicensed()) return LICENSE_REQUIRED_ENVELOPE;
        return original.apply(this, args);
      },
    });
  }
  return Ctor;
}

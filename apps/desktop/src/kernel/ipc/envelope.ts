import type { TransportEnvelope } from '@kansoku/core/contract/index';
import { ClientError } from '@kansoku/core/platform/errors';

export type WrapEnvelope<Api> = {
  [K in keyof Api]: Api[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<TransportEnvelope<Awaited<R>>>
    : never;
};

function errorEnvelope(
  error: string,
  code: string | undefined,
  hint: string | undefined,
  status: number,
): TransportEnvelope<never> {
  return {
    ok: false,
    error,
    ...(code !== undefined ? { code } : {}),
    ...(hint !== undefined ? { hint } : {}),
    status,
  };
}

let loggedFirstCall = false;

export async function toEnvelope<T>(
  channel: string,
  fn: () => Promise<T> | T,
): Promise<TransportEnvelope<T>> {
  try {
    const data = await fn();
    if (!loggedFirstCall) {
      loggedFirstCall = true;
      console.log('[desktop] ipc first call ok:', channel);
    }
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ClientError) {
      return errorEnvelope(error.message, error.code, error.hint, error.status);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(err);
    return errorEnvelope(err.message, undefined, undefined, 500);
  }
}

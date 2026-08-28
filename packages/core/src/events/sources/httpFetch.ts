// Every outbound read in this folder talks to a third party we do not control, on a
// schedule nobody is watching. Three leashes make that safe: a deadline, a byte cap,
// and the caller's own abort signal so a shutdown does not leave requests running
// against a collector that no longer exists.

export interface CappedFetchOptions {
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  // The runtime's per-source signal. Aborting it must stop the request, not just
  // stop us from caring about the answer.
  signal?: AbortSignal;
}

export const DEFAULT_TIMEOUT_MS = 10_000;
// Government feeds run tens of kilobytes and EDGAR's ticker map a few megabytes;
// past that we are reading something that is not what we asked for.
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

function abortError(url: string, signal: AbortSignal | undefined, timeoutMs: number): Error {
  return new Error(
    signal?.aborted ? `${url} aborted by the collector` : `${url} timed out after ${timeoutMs}ms`,
  );
}

async function readCapped(response: Response, url: string, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`${url} response too large: ${declared} bytes exceeds the ${maxBytes} cap`);
  }
  const body = response.body;
  // A test double, or any Response built without a stream: reading it whole is the
  // only option, so the cap is checked after the fact rather than during.
  if (!body) {
    const text = await response.text();
    const size = new TextEncoder().encode(text).byteLength;
    if (size > maxBytes) {
      throw new Error(`${url} response too large: ${size} bytes exceeds the ${maxBytes} cap`);
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Cancelled rather than drained: the point of a cap is to stop paying for the
        // rest of it.
        await reader.cancel().catch(() => {});
        throw new Error(`${url} response too large: exceeded the ${maxBytes} byte cap`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function fetchTextCapped(url: string, options: CappedFetchOptions = {}): Promise<string> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  // Already called off before we started: there is no point opening the connection at
  // all, and a request nobody is waiting for is exactly what this cap exists to stop.
  if (options.signal?.aborted) throw abortError(url, options.signal, timeoutMs);

  const controller = new AbortController();
  const onOuterAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A pending deadline is not work the process owes anyone; it must not be the reason
  // a host refuses to exit.
  (timer as unknown as { unref?: () => void }).unref?.();

  try {
    const response = await fetchImpl(url, {
      ...(options.headers ? { headers: options.headers } : {}),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return await readCapped(response, url, maxBytes);
  } catch (error) {
    // Whoever pulled the leash gets named: "aborted" alone tells the user nothing
    // about whether we hung up or they did.
    if (controller.signal.aborted) throw abortError(url, options.signal, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

export async function fetchJsonCapped(
  url: string,
  options: CappedFetchOptions = {},
): Promise<unknown> {
  const text = await fetchTextCapped(url, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
  });
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `${url} did not return JSON: ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }
}

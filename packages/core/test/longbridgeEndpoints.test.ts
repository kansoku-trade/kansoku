import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureLongbridgeEndpoints,
  reportLongbridgeEndpointFailure,
  resetLongbridgeEndpointsForTests,
  resolveLongbridgeEndpoints,
  type LongbridgeRegionPreference,
} from '../src/marketdata/longbridgeEndpoints.js';

const COM_HTTP = 'https://openapi.longbridge.com';
const COM_WS = 'wss://openapi-quote.longbridge.com/v2';
const CN_HTTP = 'https://openapi.longbridge.cn';
const CN_WS = 'wss://openapi-quote.longbridge.cn/v2';

function ok(status = 200): Response {
  return new Response(null, { status });
}

afterEach(() => {
  resetLongbridgeEndpointsForTests();
});

describe('resolveLongbridgeEndpoints', () => {
  it('manual cn preference skips the probe entirely', async () => {
    const fetchImpl = vi.fn();
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
      getRegionPreference: () => 'cn',
    });

    const result = await resolveLongbridgeEndpoints();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ http: CN_HTTP, ws: CN_WS, region: 'cn' });
  });

  it('races both regions on first auto resolve, then caches the winner', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === CN_HTTP) await new Promise((resolve) => setTimeout(resolve, 15));
      return ok();
    });
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
      getRegionPreference: () => 'auto',
    });

    const first = await resolveLongbridgeEndpoints();
    expect(first).toEqual({ http: COM_HTTP, ws: COM_WS, region: 'com' });
    expect(calls.sort()).toEqual([CN_HTTP, COM_HTTP].sort());

    calls.length = 0;
    const second = await resolveLongbridgeEndpoints();
    expect(second).toEqual({ http: COM_HTTP, ws: COM_WS, region: 'com' });
    expect(calls).toHaveLength(0);
  });

  it('treats a 4xx response as reachable, not a failure', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === CN_HTTP) return ok(404);
      throw new Error('network error');
    });
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
      getRegionPreference: () => 'auto',
    });

    const result = await resolveLongbridgeEndpoints();

    expect(result).toEqual({ http: CN_HTTP, ws: CN_WS, region: 'cn' });
  });

  it('falls back to com without caching when both regions are unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network error');
    });
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
      getRegionPreference: () => 'auto',
    });

    const first = await resolveLongbridgeEndpoints();
    expect(first.region).toBe('com');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const second = await resolveLongbridgeEndpoints();
    expect(second.region).toBe('com');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('resolves ws via region probing when only LONGBRIDGE_HTTP_URL is set', async () => {
    const fetchImpl = vi.fn(async () => ok());
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { LONGBRIDGE_HTTP_URL: 'https://custom.example.com' },
      getRegionPreference: () => 'auto',
    });

    const result = await resolveLongbridgeEndpoints();

    expect(result.http).toBe('https://custom.example.com');
    expect([COM_WS, CN_WS]).toContain(result.ws);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('short-circuits the probe entirely when both env vars are set', async () => {
    const fetchImpl = vi.fn();
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        LONGBRIDGE_HTTP_URL: 'https://custom.example.com',
        LONGBRIDGE_QUOTE_WS_URL: 'wss://custom.example.com/v2',
      },
      getRegionPreference: () => 'auto',
    });

    const result = await resolveLongbridgeEndpoints();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({
      http: 'https://custom.example.com',
      ws: 'wss://custom.example.com/v2',
      region: null,
    });
  });
});

describe('reportLongbridgeEndpointFailure', () => {
  it('clears the cache and prefers the other region on the next resolve', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === CN_HTTP) await new Promise((resolve) => setTimeout(resolve, 15));
      return ok();
    });
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
      getRegionPreference: () => 'auto',
    });

    const first = await resolveLongbridgeEndpoints();
    expect(first.region).toBe('com');

    reportLongbridgeEndpointFailure();
    calls.length = 0;

    const second = await resolveLongbridgeEndpoints();
    expect(calls).toEqual([CN_HTTP]);
    expect(second.region).toBe('cn');
  });

  it('is a no-op under a manual region preference', async () => {
    let preference: LongbridgeRegionPreference = 'com';
    const fetchImpl = vi.fn(async () => ok());
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
      getRegionPreference: () => preference,
    });

    await resolveLongbridgeEndpoints();
    reportLongbridgeEndpointFailure();

    preference = 'auto';
    fetchImpl.mockClear();
    await resolveLongbridgeEndpoints();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when both env vars are set', async () => {
    const fetchImpl = vi.fn();
    configureLongbridgeEndpoints({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        LONGBRIDGE_HTTP_URL: 'https://custom.example.com',
        LONGBRIDGE_QUOTE_WS_URL: 'wss://custom.example.com/v2',
      },
      getRegionPreference: () => 'auto',
    });

    await resolveLongbridgeEndpoints();
    expect(() => reportLongbridgeEndpointFailure()).not.toThrow();
  });
});

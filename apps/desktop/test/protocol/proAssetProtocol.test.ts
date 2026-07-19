import { describe, expect, it } from 'vitest';
import {
  createProAssetProtocolHandler,
  lookupProAssetMimeType,
  resolveProAssetPath,
} from '@desktop/protocol/proAssetProtocol.js';
import type { EditionWebManifestResult } from '@kansoku/core/pro/webManifest';

function absentManifest(): EditionWebManifestResult {
  return { state: 'absent', files: null, entryPath: null, errorCode: null };
}

function lockedManifest(): EditionWebManifestResult {
  return { state: 'locked', files: null, entryPath: null, errorCode: null };
}

function incompatibleManifest(): EditionWebManifestResult {
  return { state: 'incompatible', files: null, entryPath: null, errorCode: 'PRO_EDITION_ABI_MISMATCH' };
}

function activeManifest(files: Record<string, string | Buffer> = {}): EditionWebManifestResult {
  const map = new Map<string, Buffer>(
    Object.entries(files).map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(v)]),
  );
  return { state: 'active', files: map, entryPath: 'web/index.mjs', errorCode: null };
}

describe('resolveProAssetPath', () => {
  it('resolves the host + guarded pathname into a manifest key', () => {
    expect(resolveProAssetPath('pro-asset://web/index.mjs')).toBe('web/index.mjs');
    expect(resolveProAssetPath('pro-asset://web/assets/xyz.mjs')).toBe('web/assets/xyz.mjs');
  });

  it('blocks encoded traversal attempts', () => {
    expect(resolveProAssetPath('pro-asset://web/%2e%2e%2f%2e%2e%2fsecret')).toBeNull();
  });

  it('blocks malformed percent-encoding instead of throwing', () => {
    expect(resolveProAssetPath('pro-asset://web/%zz')).toBeNull();
  });
});

describe('lookupProAssetMimeType', () => {
  it('maps .mjs to application/javascript', () => {
    expect(lookupProAssetMimeType('/web/index.mjs')).toBe('application/javascript; charset=utf-8');
  });

  it('falls through to the shared static MIME table for other extensions', () => {
    expect(lookupProAssetMimeType('/web/assets/logo.png')).toBe('image/png');
    expect(lookupProAssetMimeType('/web/assets/app.css')).toBe('text/css; charset=utf-8');
  });
});

describe('createProAssetProtocolHandler — non-active states never touch webManifest.files', () => {
  for (const [label, manifest] of [
    ['absent', absentManifest()],
    ['locked', lockedManifest()],
    ['incompatible', incompatibleManifest()],
  ] as const) {
    it(`state=${label}: returns 404 for every path without reading files (which is null)`, async () => {
      const handler = createProAssetProtocolHandler(manifest);

      expect(manifest.files).toBeNull();

      const response = await handler(new Request('pro-asset://web/index.mjs'));
      expect(response.status).toBe(404);

      const responseOther = await handler(new Request('pro-asset://web/anything/else.mjs'));
      expect(responseOther.status).toBe(404);
    });
  }
});

describe('createProAssetProtocolHandler — active state', () => {
  it('serves the exact fixture bytes with the correct content-type', async () => {
    const bytes = Buffer.from('export const abiVersion = 1;');
    const handler = createProAssetProtocolHandler(activeManifest({ 'web/index.mjs': bytes }));

    const response = await handler(new Request('pro-asset://web/index.mjs'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(bytes)).toBe(true);
  });

  it('404s a path not present in the manifest', async () => {
    const handler = createProAssetProtocolHandler(activeManifest({ 'web/index.mjs': 'x' }));
    const response = await handler(new Request('pro-asset://web/missing.mjs'));
    expect(response.status).toBe(404);
  });

  it('blocks encoded traversal with 403', async () => {
    const handler = createProAssetProtocolHandler(activeManifest({ 'web/index.mjs': 'x' }));
    const response = await handler(new Request('pro-asset://web/%2e%2e%2f%2e%2e%2fsecret'));
    expect(response.status).toBe(403);
  });

  it('rejects non-GET/HEAD requests with 405', async () => {
    const handler = createProAssetProtocolHandler(activeManifest({ 'web/index.mjs': 'x' }));
    const response = await handler(new Request('pro-asset://web/index.mjs', { method: 'POST' }));
    expect(response.status).toBe(405);
  });

  it('405 takes priority even for non-active states (method check runs before state check)', async () => {
    const handler = createProAssetProtocolHandler(absentManifest());
    const response = await handler(new Request('pro-asset://web/index.mjs', { method: 'DELETE' }));
    expect(response.status).toBe(405);
  });

  it('404s pro-asset://server/index.mjs even when the private server entry is present in files', async () => {
    const handler = createProAssetProtocolHandler(
      activeManifest({ 'web/index.mjs': 'x', 'server/index.mjs': 'private server source' }),
    );
    const response = await handler(new Request('pro-asset://server/index.mjs'));
    expect(response.status).toBe(404);
  });

  it('404s pro-asset://desktop/index.mjs even when the private desktop entry is present in files', async () => {
    const handler = createProAssetProtocolHandler(
      activeManifest({ 'web/index.mjs': 'x', 'desktop/index.mjs': 'private desktop source' }),
    );
    const response = await handler(new Request('pro-asset://desktop/index.mjs'));
    expect(response.status).toBe(404);
  });

  it('404s pro-asset:///bundle.json even when bundle.json is present in files', async () => {
    const handler = createProAssetProtocolHandler(activeManifest({ 'web/index.mjs': 'x', 'bundle.json': '{}' }));
    const response = await handler(new Request('pro-asset:///bundle.json'));
    expect(response.status).toBe(404);
  });
});

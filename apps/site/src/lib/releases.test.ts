import { describe, expect, it } from 'vitest';

import type { Release } from './releases';
import { desktopReleases, dmgAsset, releaseVersion } from './releases';

function release(overrides: Partial<Release>): Release {
  return {
    tag_name: 'desktop-v0.1.0',
    body: '',
    published_at: '2026-01-01T00:00:00Z',
    prerelease: false,
    draft: false,
    assets: [],
    ...overrides,
  };
}

describe('desktopReleases', () => {
  it('keeps only stable desktop tags, newest first', () => {
    const result = desktopReleases([
      release({ tag_name: 'desktop-v0.20.0', published_at: '2026-07-20T00:00:00Z' }),
      release({ tag_name: 'nightly-20260720', prerelease: true }),
      release({ tag_name: 'web-preview' }),
      release({ tag_name: 'desktop-v0.21.0', published_at: '2026-07-21T00:00:00Z' }),
      release({ tag_name: 'desktop-v0.9.0', draft: true }),
    ]);
    expect(result.map((r) => r.tag_name)).toEqual(['desktop-v0.21.0', 'desktop-v0.20.0']);
  });
});

describe('releaseVersion', () => {
  it('strips the desktop-v prefix', () => {
    expect(releaseVersion(release({ tag_name: 'desktop-v0.21.0' }))).toBe('0.21.0');
  });
});

describe('dmgAsset', () => {
  it('finds the dmg among assets', () => {
    const dmg = { name: 'Kansoku-0.21.0-arm64.dmg', browser_download_url: 'https://x/dmg' };
    const found = dmgAsset(
      release({
        assets: [{ name: 'appcast.xml', browser_download_url: 'https://x/a' }, dmg],
      }),
    );
    expect(found).toEqual(dmg);
  });

  it('returns undefined when absent', () => {
    expect(dmgAsset(release({}))).toBeUndefined();
  });
});

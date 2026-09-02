import { describe, expect, it } from 'vitest';
import { collectSources } from './collectSources.js';

describe('collectSources', () => {
  it('picks markdown links and skips their href as a bare url', () => {
    expect(
      collectSources('见 [财报](https://example.com/10q) 和后续说明'),
    ).toEqual([{ href: 'https://example.com/10q', title: '财报' }]);
  });

  it('collects a bare url once', () => {
    expect(collectSources('来源 https://example.com/a 再提一次 https://example.com/a')).toEqual([
      { href: 'https://example.com/a', title: 'https://example.com/a' },
    ]);
  });

  it('keeps markdown title and a different bare url', () => {
    expect(collectSources('[SEC](https://sec.gov/a) 以及 https://example.com/b')).toEqual([
      { href: 'https://sec.gov/a', title: 'SEC' },
      { href: 'https://example.com/b', title: 'https://example.com/b' },
    ]);
  });
});

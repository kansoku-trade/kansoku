import { describe, expect, it } from 'vitest';
import { loadProComposition } from '../../src/features/edition/pro';

// Which module resolves here (`pro.ts` vs. the overlay's `pro.pro.ts`) is a
// build-time decision made by @kansoku/build-overlay's resolver plugin, not
// a runtime one — so both outcomes below are valid depending on whether this
// workspace has the pro overlay present.
describe('web loadProComposition', () => {
  it('resolves to null (free build) or a valid WebProComposition (pro build)', async () => {
    const result = await loadProComposition();

    if (result === null) return;

    expect(result).toEqual(
      expect.objectContaining({ routes: expect.any(Object) }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { applyChunks, parsePatch } from '../src/canvas/applyPatch.js';

const file = ['a', 'b', 'c', 'b', 'd', ''].join('\n');

function apply(source: string, body: string): string {
  const [{ chunks }] = parsePatch(`*** Begin Patch\n*** Update File: x\n${body}\n*** End Patch`);
  return applyChunks(source, chunks);
}

describe('parsePatch', () => {
  it('parses several files and hunks', () => {
    const files = parsePatch(
      [
        '*** Begin Patch',
        '*** Update File: one',
        '@@ ctx',
        ' keep',
        '-old',
        '+new',
        '@@',
        '+tail',
        '*** End of File',
        '*** Update File: two',
        '-x',
        '*** End Patch',
      ].join('\n'),
    );
    expect(files).toEqual([
      {
        path: 'one',
        chunks: [
          { anchor: 'ctx', oldLines: ['keep', 'old'], newLines: ['keep', 'new'], atEnd: false },
          { anchor: null, oldLines: [], newLines: ['tail'], atEnd: true },
        ],
      },
      { path: 'two', chunks: [{ anchor: null, oldLines: ['x'], newLines: [], atEnd: false }] },
    ]);
  });

  it('rejects add, delete, and malformed patches', () => {
    expect(() => parsePatch('*** Begin Patch\n*** Add File: x\n+a\n*** End Patch')).toThrow(
      'save_canvas',
    );
    expect(() => parsePatch('*** Begin Patch\n*** Update File: x\n?a\n*** End Patch')).toThrow(
      'must start with',
    );
    expect(() => parsePatch('nope')).toThrow('must start with');
  });
});

describe('applyChunks', () => {
  it('uses the anchor to pick the second duplicate line', () => {
    expect(apply(file, '@@ c\n-b\n+B')).toBe(['a', 'b', 'c', 'B', 'd', ''].join('\n'));
  });

  it('applies hunks in order and matches ignoring whitespace as a fallback', () => {
    expect(apply(file, '-a\n+A\n@@\n-  d  \n+D')).toBe(['A', 'b', 'c', 'b', 'D', ''].join('\n'));
  });

  it('appends at end of file', () => {
    expect(apply('a\nb', '+c\n*** End of File')).toBe('a\nb\nc');
  });

  it('fails when a hunk does not match', () => {
    expect(() => apply(file, '-zzz\n+y')).toThrow('hunk 1: lines not found');
    expect(() => apply(file, '@@ nope\n-a\n+y')).toThrow('context "@@ nope" not found');
  });
});

import { describe, expect, it } from 'vitest';
import { ServerBuilder } from '../src/edition/serverBuilder.js';

class PublicA {}
class PublicB {}
class ExtraA {}
class ExtraB {}

describe('ServerBuilder', () => {
  it('addPublicModules includes the constructor-supplied public list in build()', () => {
    const builder = new ServerBuilder([PublicA, PublicB]);
    builder.addPublicModules();
    expect(builder.build()).toEqual([PublicA, PublicB]);
  });

  it('addModule appends without requiring addPublicModules', () => {
    const builder = new ServerBuilder([PublicA, PublicB]);
    builder.addModule(ExtraA);
    expect(builder.build()).toEqual([ExtraA]);
  });

  it('calling neither yields an empty array', () => {
    const builder = new ServerBuilder([PublicA, PublicB]);
    expect(builder.build()).toEqual([]);
  });

  it('ordering is public-then-extra', () => {
    const builder = new ServerBuilder([PublicA, PublicB]);
    builder.addModule(ExtraA);
    builder.addPublicModules();
    builder.addModule(ExtraB);
    expect(builder.build()).toEqual([PublicA, PublicB, ExtraA, ExtraB]);
  });
});

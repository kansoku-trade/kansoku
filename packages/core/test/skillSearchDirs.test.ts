import { afterEach, describe, expect, it } from 'vitest';
import { skillSearchDirs } from '../src/platform/env.js';

const original = process.env.TRADE_SKILLS_DIR;

afterEach(() => {
  if (original === undefined) delete process.env.TRADE_SKILLS_DIR;
  else process.env.TRADE_SKILLS_DIR = original;
});

describe('skillSearchDirs', () => {
  it('always includes repo .claude/skills', () => {
    delete process.env.TRADE_SKILLS_DIR;
    expect(skillSearchDirs('/data/root')).toEqual(['/data/root/.claude/skills']);
  });

  it('prepends TRADE_SKILLS_DIR when set', () => {
    process.env.TRADE_SKILLS_DIR = '/App/Resources/skills';
    expect(skillSearchDirs('/data/root')).toEqual([
      '/App/Resources/skills',
      '/data/root/.claude/skills',
    ]);
  });
});

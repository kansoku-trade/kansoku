import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { questionSchema, type Question, type RunnerQuestion } from '../../src/schema/question.js';

const fixturePath = fileURLToPath(
  new URL('../fixtures/datasets/v1/swing/swing-TEST-01.json', import.meta.url),
);
const validQuestionFixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<
  string,
  unknown
>;

describe('questionSchema', () => {
  it('accepts a valid question fixture', () => {
    expect(Value.Check(questionSchema, validQuestionFixture)).toBe(true);
  });

  it('rejects a question missing cutoff', () => {
    const { cutoff: _cutoff, ...withoutCutoff } = validQuestionFixture;
    expect(Value.Check(questionSchema, withoutCutoff)).toBe(false);
  });

  it('rejects a question with an unknown top-level key', () => {
    const withExtraKey = { ...validQuestionFixture, unexpectedTopLevelField: true };
    expect(Value.Check(questionSchema, withExtraKey)).toBe(false);
  });

  it('RunnerQuestion type rejects access to replay at compile time', () => {
    const runnerQuestion = validQuestionFixture as unknown as RunnerQuestion;
    // @ts-expect-error replay is structurally absent from RunnerQuestion
    expect(runnerQuestion.replay).toBeDefined();
  });

  it('Question type still has replay', () => {
    const question = validQuestionFixture as unknown as Question;
    expect(question.replay).toBeDefined();
  });

  it('accepts a question with no basePeriod and old-shape day/week rollups', () => {
    const question = {
      ...validQuestionFixture,
      replay: {
        ...(validQuestionFixture.replay as Record<string, unknown>),
        rollups: {
          day: [
            {
              availableAt: '2026-03-23T20:00:00-04:00',
              bar: {
                time: '2026-03-21',
                open: '102',
                high: '104',
                low: '101',
                close: '103',
                volume: '600000',
              },
            },
          ],
          week: [],
        },
      },
    };
    expect(Value.Check(questionSchema, question)).toBe(true);
  });

  it('accepts a question with basePeriod 5m', () => {
    const question = {
      ...validQuestionFixture,
      replay: {
        ...(validQuestionFixture.replay as Record<string, unknown>),
        basePeriod: '5m',
      },
    };
    expect(Value.Check(questionSchema, question)).toBe(true);
  });

  it('rejects a question whose basePeriod is not one of the five base periods', () => {
    const question = {
      ...validQuestionFixture,
      replay: {
        ...(validQuestionFixture.replay as Record<string, unknown>),
        basePeriod: 'day',
      },
    };
    expect(Value.Check(questionSchema, question)).toBe(false);
  });
});

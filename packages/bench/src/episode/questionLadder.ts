import type { RawBar } from '@kansoku/shared/types';
import type { Question, ReplayRollupEntry } from '../schema/question.js';
import {
  episodePeriodLadder,
  type EpisodeBasePeriod,
  type EpisodePeriodLadder,
  type EpisodeViewPeriod,
} from './periods.js';

export function questionBasePeriod(question: Question): EpisodeBasePeriod {
  return question.replay.basePeriod ?? '1h';
}

export function questionLadder(question: Question): EpisodePeriodLadder {
  return episodePeriodLadder(questionBasePeriod(question));
}

export function questionBaseBars(question: Question): RawBar[] {
  return question.fixtures.kline[questionBasePeriod(question)] ?? [];
}

export function questionBarsForPeriod(question: Question, period: EpisodeViewPeriod): RawBar[] {
  return question.fixtures.kline[period] ?? [];
}

export function questionRollupsForPeriod(
  question: Question,
  period: EpisodeViewPeriod,
): ReplayRollupEntry[] {
  return question.replay.rollups?.[period] ?? [];
}

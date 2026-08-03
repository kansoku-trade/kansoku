import type {
  EpisodeReportChartBar,
  EpisodeReportChartPayload,
  EpisodeReportChartTimeframe,
} from '../../types';

function mergeBars(
  base: EpisodeReportChartBar[],
  updates: EpisodeReportChartBar[],
): EpisodeReportChartBar[] {
  const merged = new Map(base.map((bar) => [String(bar.time), bar]));
  updates.forEach((bar) => merged.set(String(bar.time), bar));
  return [...merged.values()].sort((left, right) => {
    if (typeof left.time === 'number' && typeof right.time === 'number') {
      return left.time - right.time;
    }
    return String(left.time).localeCompare(String(right.time));
  });
}

export function rangesForBar(
  payload: EpisodeReportChartPayload,
  barIndex: number,
): Record<EpisodeReportChartTimeframe, EpisodeReportChartBar[]> {
  let day = [...payload.baseRanges.day];
  let week = [...payload.baseRanges.week];
  for (let index = 1; index <= barIndex; index += 1) {
    const patch = payload.snapshotPatches[String(index)];
    if (!patch) continue;
    day = mergeBars(day, patch.day || []);
    week = mergeBars(week, patch.week || []);
  }
  return {
    h1: [...payload.baseRanges.h1, ...payload.replayH1.slice(0, barIndex)],
    day,
    week,
  };
}

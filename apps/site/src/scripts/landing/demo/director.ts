import { scoredJudgments, hitRate } from '../scorecardData';
import { CHAPTERS, type TimelineState } from './timeline';

const TRACE_CALLS = 6;

export interface DirectorRefs {
  root: HTMLElement;
  traceRows: HTMLElement[];
  traceMeta: HTMLElement | null;
  verdict: HTMLElement | null;
  bars: HTMLElement[];
  values: HTMLElement[];
  stamp: HTMLElement | null;
  challenges: HTMLElement[];
  scoreRows: HTMLElement[];
  rateValue: HTMLElement | null;
  toolButtons: HTMLElement[];
  chapterBlocks: HTMLElement[];
  panelViews: HTMLElement[];
}

export const collectRefs = (root: HTMLElement): DirectorRefs => ({
  root,
  traceRows: Array.from(root.querySelectorAll<HTMLElement>('[data-trace-row]')),
  traceMeta: root.querySelector<HTMLElement>('[data-trace-meta]'),
  verdict: root.querySelector<HTMLElement>('[data-demo-verdict]'),
  bars: Array.from(root.querySelectorAll<HTMLElement>('[data-demo-bar]')),
  values: Array.from(root.querySelectorAll<HTMLElement>('[data-demo-value]')),
  stamp: root.querySelector<HTMLElement>('[data-demo-stamp]'),
  challenges: Array.from(root.querySelectorAll<HTMLElement>('[data-demo-challenge]')),
  scoreRows: Array.from(root.querySelectorAll<HTMLElement>('[data-demo-score-row]')),
  rateValue: root.querySelector<HTMLElement>('[data-demo-rate]'),
  toolButtons: Array.from(root.querySelectorAll<HTMLElement>('[data-demo-tool]')),
  chapterBlocks: Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]')),
  panelViews: Array.from(root.querySelectorAll<HTMLElement>('[data-panel-view]')),
});

const PROBABILITIES = [20, 32, 48];
const FINAL_RATE = hitRate(scoredJudgments);

export const applyState = (refs: DirectorRefs, state: TimelineState): void => {
  const id = CHAPTERS[state.chapterIndex].id;
  const index = state.chapterIndex;
  const progress = state.chapterProgress;

  refs.root.dataset.chapter = id;

  refs.chapterBlocks.forEach((block) => {
    block.dataset.active = String(block.dataset.chapter === id);
  });

  refs.panelViews.forEach((view) => {
    const target = view.dataset.panelView;
    const active =
      (id === 'trace' && target === 'trace') ||
      (id === 'score' && target === 'score') ||
      (id === 'tools' && target === 'tools') ||
      ((id === 'verdict' || id === 'archive') && target === 'verdict');
    view.dataset.active = String(active);
  });

  const revealed = id === 'trace' ? Math.round(progress * TRACE_CALLS) : index > 0 ? TRACE_CALLS : 0;
  refs.traceRows.forEach((row, i) => {
    row.dataset.on = String(i < revealed);
  });
  if (refs.traceMeta) {
    const shown = Math.min(TRACE_CALLS, revealed);
    refs.traceMeta.textContent = `${shown} / ${TRACE_CALLS} calls`;
  }

  const verdictOn = index >= 1;
  if (refs.verdict) refs.verdict.dataset.on = String(verdictOn);
  const barProgress = id === 'verdict' ? Math.min(1, progress * 1.6) : verdictOn ? 1 : 0;
  refs.bars.forEach((bar, i) => {
    bar.style.width = `${PROBABILITIES[i] * barProgress}%`;
  });
  refs.values.forEach((value, i) => {
    value.textContent = `${Math.round(PROBABILITIES[i] * barProgress)}%`;
  });

  if (refs.stamp) {
    refs.stamp.dataset.on = String(index >= 2 && (id !== 'archive' || progress > 0.12));
  }

  const challengeCount = refs.challenges.length;
  const challengesShown =
    id === 'archive' ? Math.round(Math.max(0, progress - 0.2) * 1.5 * challengeCount) : index > 2 ? challengeCount : 0;
  refs.challenges.forEach((item, i) => {
    item.dataset.on = String(i < challengesShown);
  });

  const scoreShown =
    id === 'score' ? Math.round(progress * refs.scoreRows.length) : index > 3 ? refs.scoreRows.length : 0;
  let hits = 0;
  refs.scoreRows.forEach((row, i) => {
    const on = i < scoreShown;
    row.dataset.on = String(on);
    if (on && row.dataset.outcome === 'hit') hits += 1;
  });
  if (refs.rateValue) {
    const rate = scoreShown === 0 ? 0 : Math.round((hits / scoreShown) * 100);
    refs.rateValue.textContent = `${index > 3 ? FINAL_RATE : rate}%`;
  }

  if (refs.toolButtons.length) {
    const active =
      id === 'tools' ? Math.min(refs.toolButtons.length - 1, Math.floor(progress * refs.toolButtons.length)) : 0;
    refs.toolButtons.forEach((button, i) => {
      button.dataset.active = String(i === active);
    });
  }
};

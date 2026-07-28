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
  appViews: HTMLElement[];
  appTabs: HTMLElement[];
  sidebar: HTMLElement | null;
  selectTool?: (tool: string) => void;
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
  toolButtons: Array.from(
    root.querySelectorAll<HTMLElement>('[data-app-view="chart"] [data-demo-tool]'),
  ),
  chapterBlocks: Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]')),
  panelViews: Array.from(root.querySelectorAll<HTMLElement>('[data-panel-view]')),
  appViews: Array.from(root.querySelectorAll<HTMLElement>('[data-app-view]')),
  appTabs: Array.from(root.querySelectorAll<HTMLElement>('[data-app-tab]')),
  sidebar: root.querySelector<HTMLElement>('[data-panel-view="verdict"]'),
});

const FINAL_RATE = hitRate(scoredJudgments);

// Each bar carries its own probability so the panel animates to the numbers the snapshot
// actually holds, instead of a second copy that can drift from them.
const probabilityOf = (bar: HTMLElement): number => Number(bar.dataset.prob) || 0;

export const applyState = (refs: DirectorRefs, state: TimelineState): void => {
  const chapter = CHAPTERS[state.chapterIndex];
  const id = chapter.id;
  const index = state.chapterIndex;
  const progress = state.chapterProgress;

  refs.root.dataset.chapter = id;
  refs.root.dataset.view = chapter.view;

  refs.chapterBlocks.forEach((block) => {
    block.dataset.active = String(block.dataset.chapter === id);
  });

  refs.appViews.forEach((view) => {
    view.dataset.active = String(view.dataset.appView === chapter.view);
  });

  refs.appTabs.forEach((tab) => {
    tab.dataset.active = String(tab.dataset.appTab === chapter.view);
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

  const revealed =
    id === 'trace' ? Math.round(progress * TRACE_CALLS) : index > 0 ? TRACE_CALLS : 0;
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
  refs.bars.forEach((bar) => {
    bar.style.width = `${probabilityOf(bar) * barProgress}%`;
  });
  refs.values.forEach((value, i) => {
    const bar = refs.bars[i];
    if (bar) value.textContent = `${Math.round(probabilityOf(bar) * barProgress)}%`;
  });

  if (refs.stamp) {
    refs.stamp.dataset.on = String(index >= 2 && (id !== 'archive' || progress > 0.12));
  }

  // The sidebar is taller than the panel. Rather than let the wheel fight the scroll-driven
  // timeline, the timeline itself pans it: the archive chapter walks from the verdict at the top
  // down to the challenges at the bottom.
  if (refs.sidebar) {
    const span = refs.sidebar.scrollHeight - refs.sidebar.clientHeight;
    const pan = id === 'archive' ? Math.min(1, progress * 1.15) : index > 2 ? 1 : 0;
    refs.sidebar.scrollTop = Math.max(0, span) * pan;
  }

  const challengeCount = refs.challenges.length;
  const challengesShown =
    id === 'archive'
      ? Math.round(Math.max(0, progress - 0.2) * 1.5 * challengeCount)
      : index > 2
        ? challengeCount
        : 0;
  refs.challenges.forEach((item, i) => {
    item.dataset.on = String(i < challengesShown);
  });

  const scoreShown =
    id === 'score'
      ? Math.round(progress * refs.scoreRows.length)
      : index > 3
        ? refs.scoreRows.length
        : 0;
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

  // Once the visitor has picked a tool themselves the toolbar is theirs; scrolling on must not
  // yank it back to whatever the chapter would have shown.
  if (refs.toolButtons.length && refs.root.dataset.toolsOwned !== 'true') {
    const active =
      id === 'tools'
        ? Math.min(refs.toolButtons.length - 1, Math.floor(progress * refs.toolButtons.length))
        : 0;
    const tool = refs.toolButtons[active]?.dataset.demoTool;
    if (tool && refs.root.dataset.tool !== tool) {
      refs.root.dataset.tool = tool;
      refs.selectTool?.(tool);
    }
  }
};

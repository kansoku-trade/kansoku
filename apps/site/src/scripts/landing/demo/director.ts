import { scoredJudgments, hitRate } from '../scorecardData';
import { CHAPTERS, chapterOrder, type TimelineState } from './timeline';

const TRACE_CALLS = 6;
// The verdict chapter opens on the tool-call trace, then hands over to the scenario bars.
const TRACE_SHARE = 0.4;
const VERDICT = chapterOrder('verdict');
const ARCHIVE = chapterOrder('archive');
const SCORE = chapterOrder('score');
const CHAT = chapterOrder('chat');

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
  chatRows: HTMLElement[];
  rateValue: HTMLElement | null;
  toolButtons: HTMLElement[];
  chapterBlocks: HTMLElement[];
  panelViews: HTMLElement[];
  appViews: HTMLElement[];
  appTabs: HTMLElement[];
  sidebar: HTMLElement | null;
  viewport: HTMLElement | null;
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
  chatRows: Array.from(
    root.querySelectorAll<HTMLElement>('[data-chat-session="0"] [data-chat-row]'),
  ),
  rateValue: root.querySelector<HTMLElement>('[data-demo-rate]'),
  toolButtons: Array.from(
    root.querySelectorAll<HTMLElement>('[data-app-view="chart"] [data-demo-tool]'),
  ),
  chapterBlocks: Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]')),
  panelViews: Array.from(root.querySelectorAll<HTMLElement>('[data-panel-view]')),
  appViews: Array.from(root.querySelectorAll<HTMLElement>('[data-app-view]')),
  appTabs: Array.from(root.querySelectorAll<HTMLElement>('[data-app-tab]')),
  sidebar: root.querySelector<HTMLElement>('[data-panel-view="verdict"]'),
  viewport: root.querySelector<HTMLElement>('.demo-viewport'),
});

export type FocusAlign = 'center' | 'start' | 'end';

// A region wider than the viewport can't be centred meaningfully; show its leading edge unless
// the markup asks for the trailing one (e.g. the trainer chart, whose latest bars sit on the right).
export const focusScrollLeft = (
  targetLeft: number,
  targetWidth: number,
  viewportWidth: number,
  overflow: number,
  align: FocusAlign = 'center',
): number => {
  const fits = targetWidth <= viewportWidth;
  const raw =
    fits || align === 'center'
      ? targetLeft + targetWidth / 2 - viewportWidth / 2
      : align === 'end'
        ? targetLeft + targetWidth - viewportWidth
        : targetLeft;
  return Math.max(0, Math.min(overflow, raw));
};

// On narrow screens the app keeps its desktop width and the viewport pans so the chapter's
// focus region sits centred. On wide screens there is no overflow and this is a no-op.
export const panToFocus = (refs: DirectorRefs, chapterId: string): void => {
  const viewport = refs.viewport;
  const app = viewport?.firstElementChild;
  if (!viewport || !app) return;
  const overflow = viewport.scrollWidth - viewport.clientWidth;
  if (overflow <= 0) return;
  const target = refs.root.querySelector<HTMLElement>(`[data-demo-focus~="${chapterId}"]`);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const left = rect.left - app.getBoundingClientRect().left;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  viewport.scrollTo({
    left: focusScrollLeft(
      left,
      rect.width,
      viewport.clientWidth,
      overflow,
      (target.dataset.demoFocusAlign as FocusAlign | undefined) ?? 'start',
    ),
    behavior: reduced ? 'auto' : 'smooth',
  });
};

const FINAL_RATE = hitRate(scoredJudgments);

// Each bar carries its own probability so the panel animates to the numbers the snapshot
// actually holds, instead of a second copy that can drift from them.
const probabilityOf = (bar: HTMLElement): number => Number(bar.dataset.prob) || 0;

export const applyState = (refs: DirectorRefs, state: TimelineState): void => {
  const chapter = CHAPTERS[state.chapterIndex];
  const id = chapter.id;
  const index = state.chapterIndex;
  const progress = state.chapterProgress;

  const chapterChanged = refs.root.dataset.chapter !== id;
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

  if (chapterChanged) panToFocus(refs, id);

  const panel =
    id === 'tools'
      ? 'tools'
      : id === 'verdict' && progress < TRACE_SHARE
        ? 'trace'
        : id === 'score'
          ? 'score'
          : 'verdict';
  refs.panelViews.forEach((view) => {
    view.dataset.active = String(view.dataset.panelView === panel);
  });

  const revealed =
    id === 'verdict'
      ? Math.round(Math.min(1, progress / TRACE_SHARE) * TRACE_CALLS)
      : index > VERDICT
        ? TRACE_CALLS
        : 0;
  refs.traceRows.forEach((row, i) => {
    row.dataset.on = String(i < revealed);
  });
  if (refs.traceMeta) {
    refs.traceMeta.textContent = `${revealed} / ${TRACE_CALLS} calls`;
  }

  const verdictProgress =
    id === 'verdict'
      ? Math.max(0, (progress - TRACE_SHARE) / (1 - TRACE_SHARE))
      : index > VERDICT
        ? 1
        : 0;
  const verdictOn = verdictProgress > 0;
  if (refs.verdict) refs.verdict.dataset.on = String(verdictOn);
  const barProgress = Math.min(1, verdictProgress * 1.6);
  refs.bars.forEach((bar) => {
    bar.style.width = `${probabilityOf(bar) * barProgress}%`;
  });
  refs.values.forEach((value, i) => {
    const bar = refs.bars[i];
    if (bar) value.textContent = `${Math.round(probabilityOf(bar) * barProgress)}%`;
  });

  if (refs.stamp) {
    refs.stamp.dataset.on = String(index > ARCHIVE || (id === 'archive' && progress > 0.12));
  }

  // The sidebar is taller than the panel. Rather than let the wheel fight the scroll-driven
  // timeline, the timeline itself pans it: the archive chapter walks from the verdict at the top
  // down to the challenges at the bottom.
  if (refs.sidebar) {
    const span = refs.sidebar.scrollHeight - refs.sidebar.clientHeight;
    const pan = id === 'archive' ? Math.min(1, progress * 1.15) : index > ARCHIVE ? 1 : 0;
    refs.sidebar.scrollTop = Math.max(0, span) * pan;
  }

  const challengeCount = refs.challenges.length;
  const challengesShown =
    id === 'archive'
      ? Math.round(Math.max(0, progress - 0.2) * 1.5 * challengeCount)
      : index > ARCHIVE
        ? challengeCount
        : 0;
  refs.challenges.forEach((item, i) => {
    item.dataset.on = String(i < challengesShown);
  });

  const scoreShown =
    id === 'score'
      ? Math.round(progress * refs.scoreRows.length)
      : index > SCORE
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
    refs.rateValue.textContent = `${index > SCORE ? FINAL_RATE : rate}%`;
  }

  const chatShown =
    id === 'chat'
      ? Math.ceil(Math.min(1, progress * 1.25) * refs.chatRows.length)
      : index > CHAT
        ? refs.chatRows.length
        : 0;
  refs.chatRows.forEach((row, i) => {
    row.dataset.on = String(i < chatShown);
  });

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

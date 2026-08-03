export type AppView = 'chart' | 'train' | 'research';

export interface Chapter {
  id: string;
  label: string;
  seconds: number;
  view: AppView;
}

export const CHAPTERS: Chapter[] = [
  { id: 'trace', label: '数据', seconds: 6, view: 'chart' },
  { id: 'verdict', label: '判断', seconds: 5, view: 'chart' },
  { id: 'archive', label: '归档', seconds: 6, view: 'chart' },
  { id: 'score', label: '结果', seconds: 5, view: 'chart' },
  { id: 'tools', label: '工具', seconds: 4, view: 'chart' },
  { id: 'train', label: '盲盘训练', seconds: 6, view: 'train' },
  { id: 'research', label: '研究库', seconds: 5, view: 'research' },
];

export const chapterIndexOfView = (view: AppView): number =>
  CHAPTERS.findIndex((chapter) => chapter.view === view);

export const TOTAL_SECONDS = CHAPTERS.reduce((sum, chapter) => sum + chapter.seconds, 0);

export interface TimelineState {
  time: number;
  chapterIndex: number;
  chapterProgress: number;
}

export const chapterStart = (index: number): number => {
  let start = 0;
  for (let i = 0; i < index; i++) start += CHAPTERS[i].seconds;
  return start;
};

const resolve = (time: number): TimelineState => {
  const clamped = Math.min(TOTAL_SECONDS, Math.max(0, time));
  let acc = 0;
  for (let i = 0; i < CHAPTERS.length; i++) {
    const span = CHAPTERS[i].seconds;
    if (clamped < acc + span || i === CHAPTERS.length - 1) {
      return {
        time: clamped,
        chapterIndex: i,
        chapterProgress: Math.min(1, (clamped - acc) / span),
      };
    }
    acc += span;
  }
  return { time: clamped, chapterIndex: 0, chapterProgress: 0 };
};

export interface Timeline {
  seek: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  isPlaying: () => boolean;
  tick: (deltaSeconds: number) => void;
  subscribe: (listener: (state: TimelineState) => void) => () => void;
  state: () => TimelineState;
}

export const createTimeline = (): Timeline => {
  let time = 0;
  let playing = true;
  const listeners = new Set<(state: TimelineState) => void>();

  const emit = (): void => {
    const current = resolve(time);
    for (const listener of listeners) listener(current);
  };

  return {
    seek: (next: number) => {
      time = Math.min(TOTAL_SECONDS, Math.max(0, next));
      emit();
    },
    setPlaying: (next: boolean) => {
      playing = next;
    },
    isPlaying: () => playing,
    tick: (deltaSeconds: number) => {
      if (!playing) return;
      time += deltaSeconds;
      if (time > TOTAL_SECONDS) time = 0;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(resolve(time));
      return () => listeners.delete(listener);
    },
    state: () => resolve(time),
  };
};

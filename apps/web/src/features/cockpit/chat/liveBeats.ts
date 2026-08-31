import type { ChatLiveBeat } from './useChatSession';

export type LiveBeatEvent =
  | { event: 'delta'; text: string }
  | { event: 'tool'; label: string; status: 'start' | 'end'; input?: string; output?: string };

export function applyLiveBeat(
  beats: ChatLiveBeat[],
  event: LiveBeatEvent,
  nextToolId: string,
): ChatLiveBeat[] {
  if (event.event === 'delta') {
    if (!event.text) return beats;
    const last = beats.at(-1);
    if (last?.kind === 'text') {
      return [...beats.slice(0, -1), { kind: 'text', text: last.text + event.text }];
    }
    return [...beats, { kind: 'text', text: event.text }];
  }
  if (event.status === 'start') {
    return [
      ...beats,
      {
        kind: 'tool',
        tool: {
          id: nextToolId,
          label: event.label,
          status: 'start',
          input: event.input,
        },
      },
    ];
  }
  const idx = beats
    .map((beat) => beat.kind === 'tool' && beat.tool.label === event.label && beat.tool.status === 'start')
    .lastIndexOf(true);
  if (idx === -1) return beats;
  return beats.map((beat, index) =>
    index === idx && beat.kind === 'tool'
      ? { kind: 'tool', tool: { ...beat.tool, status: 'end', output: event.output } }
      : beat,
  );
}

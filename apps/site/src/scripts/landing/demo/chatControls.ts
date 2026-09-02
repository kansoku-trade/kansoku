import { canvasIndexOf, DEMO_CANVASES } from '../replica/canvasDocs';

export interface ChatControls {
  destroy: () => void;
}

export const mountChatControls = (root: ParentNode): ChatControls | null => {
  const view = root.querySelector<HTMLElement>('[data-app-view="chat"]');
  const page = view?.querySelector<HTMLElement>('.chat-page');
  if (!view || !page) return null;
  const rows = Array.from(view.querySelectorAll<HTMLElement>('[data-chat-session-row]'));
  const transcripts = Array.from(view.querySelectorAll<HTMLElement>('[data-chat-session]'));
  const heading = view.querySelector<HTMLElement>('[data-chat-head]');
  const panels = Array.from(
    view.querySelectorAll<HTMLElement>('.chat-canvas-pane [data-canvas-panel]'),
  );
  const paneTitle = view.querySelector<HTMLElement>('[data-chat-pane-title]');
  const paneSlug = view.querySelector<HTMLElement>('[data-chat-pane-slug]');
  if (rows.length === 0 || transcripts.length === 0) return null;

  const selectSession = (index: number): void => {
    rows.forEach((row) => {
      row.classList.toggle('active', Number(row.dataset.index) === index);
    });
    transcripts.forEach((transcript) => {
      transcript.dataset.active = String(Number(transcript.dataset.chatSession) === index);
    });
    const title = rows[index]?.querySelector('.chat-session-title')?.textContent;
    if (heading && title) heading.textContent = title;
  };

  const openCanvas = (slug: string): void => {
    const index = canvasIndexOf(slug);
    const canvas = DEMO_CANVASES[index];
    if (!canvas) return;
    panels.forEach((panel) => {
      panel.dataset.active = String(Number(panel.dataset.index) === index);
    });
    if (paneTitle) paneTitle.textContent = canvas.title;
    if (paneSlug) paneSlug.textContent = canvas.slug;
    page.dataset.canvasOpen = 'true';
  };

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-chat-session-row]');
    if (row) {
      selectSession(Number(row.dataset.index));
      return;
    }
    const toolHead = target.closest<HTMLElement>('[data-chat-tool-head]');
    if (toolHead) {
      const group = toolHead.parentElement;
      if (group) group.dataset.open = String(group.dataset.open !== 'true');
      return;
    }
    if (target.closest('[data-chat-pane-close]')) {
      page.dataset.canvasOpen = 'false';
      return;
    }
    const card = target.closest<HTMLElement>('[data-chat-canvas]');
    if (card?.dataset.chatCanvas) openCanvas(card.dataset.chatCanvas);
  };

  view.addEventListener('click', onClick);

  return {
    destroy: () => view.removeEventListener('click', onClick),
  };
};

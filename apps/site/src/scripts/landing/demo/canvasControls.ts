export interface CanvasControls {
  destroy: () => void;
}

export const mountCanvasControls = (root: ParentNode): CanvasControls | null => {
  const view = root.querySelector<HTMLElement>('[data-app-view="canvas"]');
  if (!view) return null;
  const rows = Array.from(view.querySelectorAll<HTMLElement>('[data-canvas-row]'));
  const panels = Array.from(view.querySelectorAll<HTMLElement>('[data-canvas-panel]'));
  const list = rows[0]?.parentElement ?? null;
  if (rows.length === 0 || panels.length === 0 || !list) return null;

  const select = (index: number): void => {
    rows.forEach((row) => {
      const on = Number(row.dataset.index) === index;
      row.setAttribute('aria-pressed', String(on));
      row.classList.toggle('active', on);
    });
    panels.forEach((panel) => {
      panel.dataset.active = String(Number(panel.dataset.index) === index);
    });
  };

  const onList = (event: Event): void => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-canvas-row]');
    if (row) select(Number(row.dataset.index));
  };

  list.addEventListener('click', onList);

  return {
    destroy: () => {
      list.removeEventListener('click', onList);
    },
  };
};

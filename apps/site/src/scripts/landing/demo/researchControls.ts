import { RESEARCH_DOCS } from '../replica/researchDocs';

export interface ResearchControls {
  destroy: () => void;
}

const relatedCount = (index: number): number => {
  const doc = RESEARCH_DOCS[index];
  if (!doc || doc.symbols.length === 0) return 0;
  return RESEARCH_DOCS.filter(
    (other) =>
      other.path !== doc.path && other.symbols.some((symbol) => doc.symbols.includes(symbol)),
  ).length;
};

export const mountResearchControls = (root: ParentNode): ResearchControls | null => {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-research-row]'));
  const docs = Array.from(root.querySelectorAll<HTMLElement>('[data-research-doc]'));
  const list = rows[0]?.parentElement ?? null;
  if (rows.length === 0 || docs.length === 0 || !list) return null;

  const switcher = root.querySelector<HTMLElement>('[data-research-switch]');
  const head = root.querySelector<HTMLElement>('[data-research-head]');
  const count = root.querySelector<HTMLElement>('[data-research-count]');
  const related = root.querySelector<HTMLElement>('[data-research-related]');
  const symbols = root.querySelector<HTMLElement>('[data-research-symbols]');

  const select = (index: number): void => {
    rows.forEach((row) => {
      row.setAttribute('aria-pressed', String(Number(row.dataset.index) === index));
    });
    docs.forEach((doc) => {
      doc.dataset.active = String(Number(doc.dataset.index) === index);
    });
    const doc = RESEARCH_DOCS[index];
    if (related) {
      related.textContent = `关联资料 · ${doc.symbols.length} 个标的 · ${relatedCount(index)} 条相关记录`;
    }
    if (symbols) {
      symbols.innerHTML = '';
      if (doc.symbols.length === 0) {
        const note = document.createElement('span');
        note.className = 'research-context-note';
        note.textContent = '这是一份全局记录，不归属于单一股票。';
        symbols.append(note);
        return;
      }
      for (const symbol of doc.symbols) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = symbol;
        symbols.append(chip);
      }
    }
  };

  const showKind = (kind: string): void => {
    let visible = 0;
    let first = -1;
    rows.forEach((row) => {
      const match = row.dataset.kind === kind;
      row.hidden = !match;
      if (!match) return;
      visible += 1;
      if (first < 0) first = Number(row.dataset.index);
    });
    if (head) head.textContent = kind === 'stock' ? '股票档案' : '研究时间线';
    if (count) count.textContent = String(visible);
    if (first >= 0) select(first);
  };

  const onList = (event: Event): void => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-research-row]');
    if (row) select(Number(row.dataset.index));
  };

  const onSwitch = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-kind]');
    if (!button || !switcher) return;
    for (const other of switcher.querySelectorAll('button')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    showKind(button.dataset.kind ?? 'stock');
  };

  list.addEventListener('click', onList);
  switcher?.addEventListener('click', onSwitch);
  showKind('stock');

  return {
    destroy: () => {
      list.removeEventListener('click', onList);
      switcher?.removeEventListener('click', onSwitch);
    },
  };
};

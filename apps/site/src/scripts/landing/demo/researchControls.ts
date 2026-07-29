import { RESEARCH_DOCS } from '../replica/researchDocs';

export interface ResearchControls {
  destroy: () => void;
}

const relatedDocs = (index: number) => {
  const doc = RESEARCH_DOCS[index];
  if (!doc || doc.symbols.length === 0) return [];
  return RESEARCH_DOCS.filter(
    (other) =>
      other.path !== doc.path && other.symbols.some((symbol) => doc.symbols.includes(symbol)),
  );
};

export const mountResearchControls = (root: ParentNode): ResearchControls | null => {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-research-row]'));
  const docs = Array.from(root.querySelectorAll<HTMLElement>('[data-research-doc]'));
  const list = rows[0]?.parentElement ?? null;
  if (rows.length === 0 || docs.length === 0 || !list) return null;

  const switcher = root.querySelector<HTMLElement>('[data-research-switch]');
  const head = root.querySelector<HTMLElement>('[data-research-head]');
  const count = root.querySelector<HTMLElement>('[data-research-count]');
  const relatedLabel = root.querySelector<HTMLElement>('[data-research-related]');
  const symbols = root.querySelector<HTMLElement>('[data-research-symbols]');
  const relatedList = root.querySelector<HTMLElement>('[data-research-related-list]');
  const relatedToggle = root.querySelector<HTMLElement>('[data-research-related-toggle]');
  const relatedBody = root.querySelector<HTMLElement>('[data-research-related-body]');

  const select = (index: number): void => {
    rows.forEach((row) => {
      const on = Number(row.dataset.index) === index;
      row.setAttribute('aria-pressed', String(on));
      row.classList.toggle('active', on);
    });
    docs.forEach((doc) => {
      doc.dataset.active = String(Number(doc.dataset.index) === index);
    });

    const doc = RESEARCH_DOCS[index];
    if (!doc) return;
    const related = relatedDocs(index);

    if (relatedLabel) {
      relatedLabel.textContent = `关联资料 · ${doc.symbols.length} 个标的 · ${related.length} 条相关记录`;
    }

    if (symbols) {
      symbols.innerHTML = '';
      if (doc.symbols.length === 0) {
        const note = document.createElement('p');
        note.className = 'research-context-note';
        note.textContent = '这是一份全局记录，不归属于单一股票。';
        symbols.append(note);
      } else {
        for (const symbol of doc.symbols) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = symbol;
          symbols.append(chip);
        }
      }
    }

    if (relatedList) {
      relatedList.innerHTML = '';
      if (related.length === 0) {
        const note = document.createElement('p');
        note.className = 'research-context-note';
        note.textContent = '暂时没有通过标的建立的关联记录。';
        relatedList.append(note);
      } else {
        for (const item of related) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.researchRelatedPath = item.path;
          const title = document.createElement('span');
          title.textContent = item.title;
          const meta = document.createElement('small');
          meta.textContent = [item.typeLabel, item.symbols.join(' · ')]
            .filter(Boolean)
            .join(' · ');
          button.append(title, meta);
          relatedList.append(button);
        }
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

  const onRelatedList = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-research-related-path]',
    );
    if (!button) return;
    const path = button.dataset.researchRelatedPath;
    const index = RESEARCH_DOCS.findIndex((doc) => doc.path === path);
    if (index < 0) return;
    const kind = RESEARCH_DOCS[index]?.kind;
    if (kind && switcher) {
      for (const other of switcher.querySelectorAll('button')) {
        const on = other.dataset.kind === kind;
        other.setAttribute('aria-pressed', String(on));
        other.classList.toggle('active', on);
      }
      showKind(kind);
    }
    select(index);
  };

  const onSwitch = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-kind]');
    if (!button || !switcher) return;
    for (const other of switcher.querySelectorAll('button')) {
      const on = other === button;
      other.setAttribute('aria-pressed', String(on));
      other.classList.toggle('active', on);
    }
    showKind(button.dataset.kind ?? 'stock');
  };

  const onRelatedToggle = (): void => {
    if (!relatedToggle || !relatedBody) return;
    const open = relatedToggle.getAttribute('aria-expanded') !== 'true';
    relatedToggle.setAttribute('aria-expanded', String(open));
    relatedBody.hidden = !open;
  };

  list.addEventListener('click', onList);
  relatedList?.addEventListener('click', onRelatedList);
  switcher?.addEventListener('click', onSwitch);
  relatedToggle?.addEventListener('click', onRelatedToggle);
  showKind('stock');

  return {
    destroy: () => {
      list.removeEventListener('click', onList);
      relatedList?.removeEventListener('click', onRelatedList);
      switcher?.removeEventListener('click', onSwitch);
      relatedToggle?.removeEventListener('click', onRelatedToggle);
    },
  };
};

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import type { ResearchDocumentMeta } from '@kansoku/core/contract/index';
import { researchTypeLabel } from './researchModel';

function relatedDocumentSecondary(meta: ResearchDocumentMeta): string {
  if (meta.kind === 'stock') return meta.symbols.join(' · ') || researchTypeLabel(meta.type);
  return [meta.date, researchTypeLabel(meta.type)].filter(Boolean).join(' · ');
}

export function RelatedMaterialsCard({
  selected,
  related,
  onSelect,
}: {
  selected: ResearchDocumentMeta;
  related: ResearchDocumentMeta[];
  onSelect: (document: ResearchDocumentMeta) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="research-related-details">
      <button
        type="button"
        className="research-related-summary"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronRight size={13} />
        <span>
          关联资料 · {selected.symbols.length} 个标的 · {related.length} 条相关记录
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="research-related-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
          >
            <section className="research-context-section">
              <h3>关联标的</h3>
              {selected.symbols.length > 0 ? (
                <div className="research-symbol-links">
                  {selected.symbols.map((symbol) => (
                    <a
                      key={symbol}
                      className="chip"
                      href={`/symbol/${encodeURIComponent(`${symbol}.US`)}`}
                    >
                      {symbol}
                    </a>
                  ))}
                </div>
              ) : (
                <p>这是一份全局记录，不归属于单一股票。</p>
              )}
            </section>
            <section className="research-context-section">
              <h3>相关记录</h3>
              {related.length > 0 ? (
                <div className="research-related-list">
                  {related.map((relatedDocument) => (
                    <button
                      type="button"
                      key={relatedDocument.path}
                      onClick={() => onSelect(relatedDocument)}
                    >
                      <span>{relatedDocument.title}</span>
                      <small>{relatedDocumentSecondary(relatedDocument)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p>暂时没有通过标的建立的关联记录。</p>
              )}
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

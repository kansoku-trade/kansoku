import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import type { ResearchDocumentMeta } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { Chip } from '@web/ui';
import { colors, fontSizes, sizes } from '../../theme/tokens.stylex';
import { researchTypeLabel } from './researchModel';

const styles = stylex.create({
  root: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    padding: '0 10px',
  },
  summary: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    color: colors.textMuted,
    cursor: 'pointer',
    display: 'flex',
    fontSize: fontSizes.xs,
    fontWeight: 600,
    minHeight: sizes.controlHeight,
    padding: 0,
    textAlign: 'left',
    width: '100%',
  },
  summaryIcon: {
    flex: '0 0 auto',
    marginRight: '5px',
    transitionDuration: '150ms',
    transitionProperty: 'transform',
    transitionTimingFunction: 'ease-out',
  },
  summaryIconOpen: {
    transform: 'rotate(90deg)',
  },
  body: {
    overflow: 'hidden',
  },
  contextHeading: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: 600,
    letterSpacing: '0.06em',
    margin: '0 0 9px',
    textTransform: 'uppercase',
  },
  contextParagraph: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 1.55,
    margin: 0,
  },
  symbolLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  bodyLastSection: {
    marginTop: '20px',
    paddingBottom: '10px',
  },
  relatedList: {
    display: 'flex',
    flexDirection: 'column',
  },
  relatedButton: {
    'backgroundColor': 'transparent',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': 1,
    'borderLeftStyle': 'none',
    'borderLeftWidth': 0,
    'borderRightStyle': 'none',
    'borderRightWidth': 0,
    'borderTopStyle': 'none',
    'borderTopWidth': 0,
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'flex',
    'flexDirection': 'column',
    'gap': '3px',
    'minWidth': 0,
    'padding': '9px 0',
    'textAlign': 'left',
    'width': '100%',
    ':last-child': {
      borderBottomWidth: 0,
    },
  },
  relatedButtonHover: {
    ':hover span': {
      color: colors.accent,
    },
  },
  relatedTitle: {
    fontSize: fontSizes.base,
    lineHeight: 1.4,
  },
  relatedSecondary: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
});

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
    <div className={`research-related-details ${stylex.props(styles.root).className}`}>
      <button
        type="button"
        className={`research-related-summary ${stylex.props(styles.summary).className}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronRight
          size={13}
          {...stylex.props(styles.summaryIcon, open && styles.summaryIconOpen)}
        />
        <span>
          关联资料 · {selected.symbols.length} 个标的 · {related.length} 条相关记录
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`research-related-body ${stylex.props(styles.body).className}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
          >
            <section className="research-context-section">
              <h3 className={stylex.props(styles.contextHeading).className}>关联标的</h3>
              {selected.symbols.length > 0 ? (
                <div
                  className={`research-symbol-links ${stylex.props(styles.symbolLinks).className}`}
                >
                  {selected.symbols.map((symbol) => (
                    <Chip
                      key={symbol}
                      className="chip"
                      style={{ borderRadius: 999 }}
                      href={`/symbol/${encodeURIComponent(`${symbol}.US`)}`}
                    >
                      {symbol}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className={stylex.props(styles.contextParagraph).className}>
                  这是一份全局记录，不归属于单一股票。
                </p>
              )}
            </section>
            <section
              className={`research-context-section ${stylex.props(styles.bodyLastSection).className}`}
            >
              <h3 className={stylex.props(styles.contextHeading).className}>相关记录</h3>
              {related.length > 0 ? (
                <div
                  className={`research-related-list ${stylex.props(styles.relatedList).className}`}
                >
                  {related.map((relatedDocument) => (
                    <button
                      type="button"
                      key={relatedDocument.path}
                      {...stylex.props(styles.relatedButton, styles.relatedButtonHover)}
                      onClick={() => onSelect(relatedDocument)}
                    >
                      <span {...stylex.props(styles.relatedTitle)}>{relatedDocument.title}</span>
                      <small {...stylex.props(styles.relatedSecondary)}>
                        {relatedDocumentSecondary(relatedDocument)}
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={stylex.props(styles.contextParagraph).className}>
                  暂时没有通过标的建立的关联记录。
                </p>
              )}
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

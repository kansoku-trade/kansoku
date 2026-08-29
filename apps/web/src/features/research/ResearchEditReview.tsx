import { useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type {
  ResearchDocument,
  ResearchEditOperation,
  ResearchEditProposal,
} from '@kansoku/core/contract/index';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Checkbox, openModal, Spinner } from '@web/ui';
import { colors, fontSizes, fonts, radii, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  summary: {
    alignItems: 'center',
    columnGap: '10px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    rowGap: '7px',
  },
  summaryText: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    margin: 0,
    textWrap: 'pretty',
  },
  summaryPath: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.default,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    gridColumn: '1 / -1',
    overflowWrap: 'anywhere',
    padding: '6px 8px',
  },
  status: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.full,
    color: colors.textSecondary,
    display: 'inline-flex',
    fontSize: fontSizes.xs,
    minHeight: '24px',
    padding: '0 8px',
    whiteSpace: 'nowrap',
  },
  statusPending: {
    backgroundColor: 'rgba(255, 176, 0, 0.1)',
    color: colors.accent,
  },
  statusApplied: {
    backgroundColor: 'rgba(38, 166, 154, 0.1)',
    color: colors.up,
  },
  statusRejected: {
    backgroundColor: 'rgba(239, 83, 80, 0.1)',
    color: colors.down,
  },
  operations: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  operation: {
    backgroundColor: 'rgba(255, 255, 255, 0.018)',
    borderRadius: radii.default,
    boxShadow: `0 0 0 1px ${colors.border}`,
    opacity: 0.58,
    padding: '8px',
    transitionDuration: '150ms',
    transitionProperty: 'opacity, box-shadow',
    transitionTimingFunction: 'ease-out',
  },
  operationSelected: {
    boxShadow: '0 0 0 1px rgba(255, 176, 0, 0.24)',
    opacity: 1,
  },
  operationLabel: {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    gap: '8px',
    minHeight: sizes.controlHeight,
  },
  operationTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: 600,
  },
  pair: {
    'display': 'grid',
    'gap': '8px',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 760px)': {
      gridTemplateColumns: '1fr',
    },
  },
  code: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.default,
    minWidth: 0,
    padding: '8px',
  },
  codeRemoved: {
    backgroundColor: 'rgba(239, 83, 80, 0.07)',
  },
  codeAdded: {
    backgroundColor: 'rgba(38, 166, 154, 0.07)',
  },
  codeLabel: {
    color: colors.textMuted,
    display: 'block',
    fontSize: fontSizes.xs,
    marginBottom: '5px',
  },
  codeText: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    lineHeight: 1.55,
    margin: 0,
    maxHeight: '260px',
    overflow: 'auto',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    paddingTop: '2px',
  },
  action: {
    'alignItems': 'center',
    'display': 'inline-flex',
    'justifyContent': 'center',
    'transitionDuration': '150ms',
    'transitionProperty': 'scale, border-color, background-color',
    'transitionTimingFunction': 'ease-out',
    ':active:not([disabled])': {
      transform: 'scale(0.96)',
    },
  },
  undoConfirm: {
    borderColor: colors.down,
    color: colors.down,
  },
});

export const STATUS_LABEL: Record<ResearchEditProposal['status'], string> = {
  pending: '待审阅',
  applied: '已应用',
  rejected: '已拒绝',
  undone: '已撤销',
  stale: '已失效',
};

function operationLabel(operation: ResearchEditOperation): string {
  if (operation.type === 'replace') return '替换原文';
  if (operation.type === 'insert_after') return '插入段落';
  return '追加章节';
}

function OperationPreview({
  operation,
  index,
  selected,
  disabled,
  onToggle,
}: {
  operation: ResearchEditOperation;
  index: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      className={`research-edit-operation${selected ? ' selected' : ''} ${stylex.props(styles.operation, selected && styles.operationSelected).className}`}
    >
      <header>
        <label className={stylex.props(styles.operationLabel).className}>
          <Checkbox checked={selected} disabled={disabled} onCheckedChange={onToggle} />
          <span className={stylex.props(styles.operationTitle).className}>
            修改 {index + 1} · {operationLabel(operation)}
          </span>
        </label>
      </header>
      {operation.type === 'replace' ? (
        <div className={`research-edit-pair ${stylex.props(styles.pair).className}`}>
          <div
            className={`research-edit-code research-edit-code--removed ${stylex.props(styles.code, styles.codeRemoved).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>原文</span>
            <pre className={stylex.props(styles.codeText).className}>{operation.oldText}</pre>
          </div>
          <div
            className={`research-edit-code research-edit-code--added ${stylex.props(styles.code, styles.codeAdded).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>修改后</span>
            <pre className={stylex.props(styles.codeText).className}>
              {operation.newText || '（删除）'}
            </pre>
          </div>
        </div>
      ) : operation.type === 'insert_after' ? (
        <div className={`research-edit-pair ${stylex.props(styles.pair).className}`}>
          <div
            className={`research-edit-code research-edit-code--context ${stylex.props(styles.code).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>定位原文</span>
            <pre className={stylex.props(styles.codeText).className}>{operation.anchor}</pre>
          </div>
          <div
            className={`research-edit-code research-edit-code--added ${stylex.props(styles.code, styles.codeAdded).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>在其后插入</span>
            <pre className={stylex.props(styles.codeText).className}>{operation.content}</pre>
          </div>
        </div>
      ) : (
        <div
          className={`research-edit-code research-edit-code--added ${stylex.props(styles.code, styles.codeAdded).className}`}
        >
          <span className={stylex.props(styles.codeLabel).className}>文档末尾追加</span>
          <pre className={stylex.props(styles.codeText).className}>{operation.content}</pre>
        </div>
      )}
    </section>
  );
}

function ResearchEditReview({
  proposal,
  close,
  onChanged,
}: {
  proposal: ResearchEditProposal;
  close: () => void;
  onChanged: (document?: ResearchDocument) => void;
}) {
  const editable = proposal.status === 'pending';
  const [selected, setSelected] = useState<number[]>(
    () => proposal.appliedOperationIndexes ?? proposal.operations.map((_, index) => index),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const toggle = (index: number) => {
    if (!editable) return;
    setSelected((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index].sort((a, b) => a - b),
    );
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await client.research.applyEdit({
        id: proposal.id,
        path: proposal.path,
        operationIndexes: selected,
      });
      onChanged(result.document);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.research.rejectEdit({ id: proposal.id, path: proposal.path });
      onChanged();
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!confirmUndo) {
      setConfirmUndo(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await client.research.undoEdit({ id: proposal.id, path: proposal.path });
      onChanged(result.document);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <div className={`research-edit-review ${stylex.props(styles.root).className}`}>
      <div className={`research-edit-review-summary ${stylex.props(styles.summary).className}`}>
        <span
          className={`research-edit-status research-edit-status--${proposal.status} ${stylex.props(styles.status, proposal.status === 'pending' ? styles.statusPending : proposal.status === 'applied' ? styles.statusApplied : proposal.status === 'rejected' || proposal.status === 'stale' ? styles.statusRejected : null).className}`}
        >
          {STATUS_LABEL[proposal.status]}
        </span>
        <p className={stylex.props(styles.summaryText).className}>{proposal.summary}</p>
        <code className={stylex.props(styles.summaryPath).className}>{proposal.path}</code>
      </div>
      <div className={`research-edit-operations ${stylex.props(styles.operations).className}`}>
        {proposal.operations.map((operation, index) => (
          <OperationPreview
            key={`${proposal.id}:${index}`}
            operation={operation}
            index={index}
            selected={selected.includes(index)}
            disabled={!editable || busy}
            onToggle={() => toggle(index)}
          />
        ))}
      </div>
      {error ? (
        <div className="research-assistant-error" role="alert">
          {error}
        </div>
      ) : null}
      <footer className={`research-edit-review-actions ${stylex.props(styles.actions).className}`}>
        {editable ? (
          <>
            <Button
              className={stylex.props(styles.action).className}
              disabled={busy}
              onClick={() => void reject()}
            >
              <X size={14} /> 拒绝全部
            </Button>
            <Button
              accent
              className={stylex.props(styles.action).className}
              disabled={busy || selected.length === 0}
              onClick={() => void apply()}
            >
              {busy ? <Spinner /> : <Check size={14} />}
              应用 {selected.length} 处修改
            </Button>
          </>
        ) : proposal.status === 'applied' ? (
          <Button
            className={`${confirmUndo ? 'research-edit-undo-confirm ' : ''}${stylex.props(styles.action, confirmUndo && styles.undoConfirm).className}`}
            disabled={busy}
            onClick={() => void undo()}
          >
            {busy ? <Spinner /> : <Undo2 size={14} />}
            {confirmUndo ? '再次点击确认撤销' : '撤销本次修改'}
          </Button>
        ) : (
          <Button className={stylex.props(styles.action).className} onClick={close}>
            关闭
          </Button>
        )}
      </footer>
    </div>
  );
}

export function openEditReview(
  proposal: ResearchEditProposal,
  onChanged: (document?: ResearchDocument) => void,
): void {
  openModal({
    title: '审阅文档修改',
    body: (close) => <ResearchEditReview proposal={proposal} close={close} onChanged={onChanged} />,
  });
}

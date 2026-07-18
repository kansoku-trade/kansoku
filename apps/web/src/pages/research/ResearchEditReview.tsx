import { useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import type { ResearchDocument, ResearchEditOperation, ResearchEditProposal } from "@kansoku/core/contract/index";
import { errorMessage } from "@web/api";
import { client } from "@web/client";
import { Button, openModal, Spinner } from "@web/ui";

export const STATUS_LABEL: Record<ResearchEditProposal["status"], string> = {
  pending: "待审阅",
  applied: "已应用",
  rejected: "已拒绝",
  undone: "已撤销",
  stale: "已失效",
};

function operationLabel(operation: ResearchEditOperation): string {
  if (operation.type === "replace") return "替换原文";
  if (operation.type === "insert_after") return "插入段落";
  return "追加章节";
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
    <section className={`research-edit-operation${selected ? " selected" : ""}`}>
      <header>
        <label>
          <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggle} />
          <span className="research-edit-check" aria-hidden="true">{selected ? <Check size={13} /> : null}</span>
          <span>修改 {index + 1} · {operationLabel(operation)}</span>
        </label>
      </header>
      {operation.type === "replace" ? (
        <div className="research-edit-pair">
          <div className="research-edit-code research-edit-code--removed">
            <span>原文</span>
            <pre>{operation.oldText}</pre>
          </div>
          <div className="research-edit-code research-edit-code--added">
            <span>修改后</span>
            <pre>{operation.newText || "（删除）"}</pre>
          </div>
        </div>
      ) : operation.type === "insert_after" ? (
        <div className="research-edit-pair">
          <div className="research-edit-code research-edit-code--context">
            <span>定位原文</span>
            <pre>{operation.anchor}</pre>
          </div>
          <div className="research-edit-code research-edit-code--added">
            <span>在其后插入</span>
            <pre>{operation.content}</pre>
          </div>
        </div>
      ) : (
        <div className="research-edit-code research-edit-code--added">
          <span>文档末尾追加</span>
          <pre>{operation.content}</pre>
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
  const editable = proposal.status === "pending";
  const [selected, setSelected] = useState<number[]>(
    () => proposal.appliedOperationIndexes ?? proposal.operations.map((_, index) => index),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const toggle = (index: number) => {
    if (!editable) return;
    setSelected((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort((a, b) => a - b),
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
    <div className="research-edit-review">
      <div className="research-edit-review-summary">
        <span className={`research-edit-status research-edit-status--${proposal.status}`}>{STATUS_LABEL[proposal.status]}</span>
        <p>{proposal.summary}</p>
        <code>{proposal.path}</code>
      </div>
      <div className="research-edit-operations">
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
      {error ? <div className="research-assistant-error" role="alert">{error}</div> : null}
      <footer className="research-edit-review-actions">
        {editable ? (
          <>
            <Button disabled={busy} onClick={() => void reject()}>
              <X size={14} /> 拒绝全部
            </Button>
            <Button accent disabled={busy || selected.length === 0} onClick={() => void apply()}>
              {busy ? <Spinner /> : <Check size={14} />}
              应用 {selected.length} 处修改
            </Button>
          </>
        ) : proposal.status === "applied" ? (
          <Button className={confirmUndo ? "research-edit-undo-confirm" : ""} disabled={busy} onClick={() => void undo()}>
            {busy ? <Spinner /> : <Undo2 size={14} />}
            {confirmUndo ? "再次点击确认撤销" : "撤销本次修改"}
          </Button>
        ) : (
          <Button onClick={close}>关闭</Button>
        )}
      </footer>
    </div>
  );
}

export function openEditReview(proposal: ResearchEditProposal, onChanged: (document?: ResearchDocument) => void): void {
  openModal({
    title: "审阅文档修改",
    body: (close) => <ResearchEditReview proposal={proposal} close={close} onChanged={onChanged} />,
  });
}

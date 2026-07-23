import { useState } from 'react';
import type { ResearchCreateResult, ResearchKind } from '@kansoku/core/contract/index';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { easternToday } from '@web/lib/easternDate';
import { navigate } from '@web/lib/router';
import { Button, ErrorBox, Input, openModal, SegmentedControl, Spinner } from '@web/ui';
import { researchRoute, viewForKind } from './researchModel';

const KIND_OPTIONS: { label: string; value: ResearchKind }[] = [
  { label: '股票档案', value: 'stock' },
  { label: '研究日志', value: 'journal' },
];

export function CreateResearchDialog({
  initialKind,
  close,
  onCreated,
}: {
  initialKind: ResearchKind;
  close: () => void;
  onCreated: (result: ResearchCreateResult) => void;
}) {
  const [kind, setKind] = useState<ResearchKind>(initialKind);
  const [symbol, setSymbol] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => easternToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedSymbol = symbol.trim();
  const trimmedTitle = title.trim();
  const canSubmit = kind === 'stock' ? trimmedSymbol.length > 0 : trimmedTitle.length > 0;

  const changeKind = (next: ResearchKind) => {
    setKind(next);
    setError(null);
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.research.create(
        kind === 'stock'
          ? { kind: 'stock', symbol: trimmedSymbol }
          : { kind: 'journal', title: trimmedTitle, date },
      );
      navigate(researchRoute(viewForKind(result.document.kind), result.document.path));
      onCreated(result);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <div className="create-research-dialog">
      <SegmentedControl
        ariaLabel="新建研究类型"
        value={kind}
        onChange={changeKind}
        options={KIND_OPTIONS}
      />
      {kind === 'stock' ? (
        <label className="create-research-field">
          <span>股票代码</span>
          <Input
            autoFocus
            className="create-research-symbol-input"
            placeholder="如 MRVL、700.HK"
            value={symbol}
            disabled={busy}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          />
        </label>
      ) : (
        <>
          <label className="create-research-field">
            <span>标题</span>
            <Input
              autoFocus
              placeholder="研究日志标题"
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="create-research-field">
            <span>日期</span>
            <Input
              type="date"
              value={date}
              disabled={busy}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </>
      )}
      {error && (
        <ErrorBox className="create-research-error" role="alert">
          {error}
        </ErrorBox>
      )}
      <div className="create-research-actions">
        <Button disabled={busy} onClick={close}>
          取消
        </Button>
        <Button accent disabled={!canSubmit || busy} onClick={() => void submit()}>
          {busy && <Spinner />}
          {busy && kind === 'stock' ? '正在建立档案并生成 SEPA 仪表盘…' : '建立'}
        </Button>
      </div>
    </div>
  );
}

export function openCreateResearchDialog(
  initialKind: ResearchKind,
  onCreated: (result: ResearchCreateResult) => void,
): void {
  openModal({
    title: '新建研究',
    size: 'sm',
    body: (close) => (
      <CreateResearchDialog initialKind={initialKind} close={close} onCreated={onCreated} />
    ),
  });
}

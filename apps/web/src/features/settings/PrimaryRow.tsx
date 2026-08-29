import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Check, TriangleAlert } from 'lucide-react';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Chip, openModal, Select, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import {
  defaultCustom,
  defaultThinkingLevel,
  firstModelId,
  providerKeyReady,
  providerLabel,
  saveRole,
  selectableProviders,
} from './roleShared';
import { thinkingLabel, type Catalog, type CredentialEntry, type RoleSetting } from './types';
import { useSaveQueue } from './useSaveQueue';

const styles = stylex.create({
  row: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    padding: '11px',
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    minHeight: '28px',
  },
  primaryRoleName: {
    minWidth: '78px',
  },
  roleName: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: 500,
  },
  editor: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
  },
  select: {
    justifyContent: 'space-between',
    minWidth: '112px',
  },
  modelSelect: {
    minWidth: '160px',
  },
  status: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'inline-flex',
    fontSize: fontSizes.xs,
    gap: '5px',
    justifyContent: 'flex-end',
    minWidth: '16px',
  },
  statusRollback: {
    color: colors.down,
  },
  saveError: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElement,
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.down,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '8px',
    justifyContent: 'space-between',
    margin: '0 11px 10px',
    padding: '6px 8px',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
  roleWarning: {
    color: colors.accent,
    fontSize: fontSizes.sm,
  },
  testResult: {
    fontSize: fontSizes.sm,
  },
  testResultOk: {
    color: colors.up,
  },
  testResultFail: {
    color: colors.down,
  },
  icon: {
    verticalAlign: '-2px',
  },
  clear: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'padding': '0 4px',
    ':hover': {
      color: colors.down,
    },
  },
});

export function PrimaryRow({
  initial,
  draft,
  catalog,
  credentials,
  onDraftChange,
}: {
  initial: RoleSetting;
  draft: RoleSetting;
  catalog: Catalog;
  credentials: CredentialEntry[];
  onDraftChange: (next: RoleSetting) => void;
}) {
  const [failure, setFailure] = useState<{ message: string; retrySnapshot: RoleSetting } | null>(
    null,
  );
  const [testState, setTestState] = useState<{
    status: 'idle' | 'busy' | 'ok' | 'fail';
    text?: string;
  }>({
    status: 'idle',
  });

  const queue = useSaveQueue<RoleSetting>({
    initial,
    save: (snapshot) => saveRole('primary', snapshot),
    onError: (err, rolledBackTo, retrySnapshot) => {
      onDraftChange(rolledBackTo ?? initial);
      setFailure({ message: errorMessage(err), retrySnapshot });
    },
  });

  const push = (next: RoleSetting) => {
    onDraftChange(next);
    setFailure(null);
    setTestState({ status: 'idle' });
    queue.push(next);
  };

  const setProvider = (provider: string) => {
    const modelId = firstModelId(catalog, provider);
    push({
      mode: 'custom',
      provider,
      modelId,
      thinkingLevel: defaultThinkingLevel(catalog, provider, modelId),
      stale: false,
    });
  };

  const setModelId = (modelId: string) => {
    push({
      ...draft,
      modelId,
      thinkingLevel: defaultThinkingLevel(catalog, draft.provider ?? '', modelId),
    });
  };

  const setThinkingLevel = (thinkingLevel: string) => {
    push({ ...draft, thinkingLevel });
  };

  const clear = () => {
    openModal({
      title: '清除主模型',
      size: 'sm',
      body: (closeModal) => (
        <div className="settings-reset-confirm">
          <p>清除后，所有「跟随主模型」的用途将变为未配置，直到重新设置主模型。确定继续吗？</p>
          <div className={`settings-cred-actions ${stylex.props(styles.actions).className}`}>
            <Button onClick={closeModal}>取消</Button>
            <Button
              accent
              onClick={() => {
                push({
                  mode: 'disabled',
                  provider: null,
                  modelId: null,
                  thinkingLevel: null,
                  stale: false,
                });
                closeModal();
              }}
            >
              确认清除
            </Button>
          </div>
        </div>
      ),
    });
  };

  const provider = draft.provider ? catalog.providers.find((p) => p.id === draft.provider) : null;
  const models = provider?.models ?? [];
  const model = draft.modelId ? models.find((m) => m.id === draft.modelId) : null;
  const thinkingLevels = model?.thinkingLevels ?? [];
  const computedStale = draft.mode === 'custom' && Boolean(draft.modelId) && !model;
  const keyMissing =
    draft.mode === 'custom' &&
    Boolean(draft.provider) &&
    !providerKeyReady(draft.provider!, credentials, catalog);
  const complete =
    draft.mode === 'custom' &&
    Boolean(draft.provider) &&
    Boolean(draft.modelId) &&
    Boolean(draft.thinkingLevel);

  const runTest = async () => {
    if (!draft.provider || !draft.modelId || !draft.thinkingLevel) return;
    setTestState({ status: 'busy' });
    try {
      const res = await client.settings.testConnection({
        provider: draft.provider,
        modelId: draft.modelId,
        thinkingLevel: draft.thinkingLevel,
      });
      if (!res.ok) throw new Error(res.hint ? `${res.error} (${res.hint})` : res.error);
      setTestState({ status: 'ok', text: `通过 · ${res.latencyMs}ms` });
    } catch (err) {
      setTestState({ status: 'fail', text: errorMessage(err) });
    }
  };

  return (
    <div {...stylex.props(styles.row)} id="settings-role-primary">
      <div {...stylex.props(styles.head)}>
        <span
          className={`settings-role-name ${stylex.props(styles.roleName, styles.primaryRoleName).className}`}
        >
          主模型
        </span>
        {draft.mode !== 'custom' && (
          <Chip onClick={() => push(defaultCustom(catalog))}>设置主模型</Chip>
        )}
        <span
          className={`settings-role-status${failure ? ' settings-role-status--rollback' : ''} ${stylex.props(styles.status, failure && styles.statusRollback).className}`}
          aria-live="polite"
        >
          {queue.flushing() ? (
            <>
              <Spinner /> 保存中
            </>
          ) : failure ? (
            <>
              <TriangleAlert size={12} className={`icon ${stylex.props(styles.icon).className}`} />{' '}
              未保存
            </>
          ) : (
            <>
              <Check size={12} className={`icon ${stylex.props(styles.icon).className}`} /> 已保存
            </>
          )}
        </span>
      </div>

      {draft.mode === 'custom' && (
        <div {...stylex.props(styles.editor)}>
          <Select
            className={stylex.props(styles.select).className}
            value={draft.provider ?? ''}
            options={selectableProviders(catalog, draft.provider).map((p) => ({
              value: p.id,
              label: providerLabel(catalog, p.id),
            }))}
            onChange={setProvider}
          />
          <Select
            className={stylex.props(styles.select, styles.modelSelect).className}
            value={draft.modelId ?? ''}
            options={models.map((m) => ({ value: m.id, label: m.name }))}
            onChange={setModelId}
          />
          <Select
            className={stylex.props(styles.select).className}
            value={draft.thinkingLevel ?? 'off'}
            options={thinkingLevels.map((t) => ({ value: t, label: thinkingLabel(t) }))}
            onChange={setThinkingLevel}
          />
          <Button disabled={!complete || testState.status === 'busy'} onClick={runTest}>
            测试模型
          </Button>
          {testState.status === 'busy' && <Spinner />}
          {testState.status === 'ok' && (
            <span
              className={`settings-test-result settings-test-result--ok ${stylex.props(styles.testResult, styles.testResultOk).className}`}
            >
              {testState.text}
            </span>
          )}
          {testState.status === 'fail' && (
            <span
              className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
            >
              {testState.text}
            </span>
          )}
          <button type="button" {...stylex.props(styles.clear)} onClick={clear}>
            清除
          </button>
        </div>
      )}

      {failure ? (
        <div
          className={`settings-save-error ${stylex.props(styles.saveError).className}`}
          role="alert"
        >
          <span>{failure.message}</span>
          <Button onClick={() => push(failure.retrySnapshot)}>重试</Button>
        </div>
      ) : null}
      {draft.mode !== 'custom' && (
        <div className={`settings-role-warning ${stylex.props(styles.roleWarning).className}`}>
          未设置——所有「跟随主模型」的用途都处于暂停
        </div>
      )}
      {computedStale && (
        <div className={`settings-role-warning ${stylex.props(styles.roleWarning).className}`}>
          模型已不在目录，请改选
        </div>
      )}
      {keyMissing && (
        <div className={`settings-role-warning ${stylex.props(styles.roleWarning).className}`}>
          该 provider 未配 key
        </div>
      )}
    </div>
  );
}

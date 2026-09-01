import { useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Select, Spinner } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { RoleModeControl } from './RoleModeControl';
import {
  defaultCustom,
  defaultThinkingLevel,
  firstModelId,
  providerKeyReady,
  providerLabel,
  saveRole,
  selectableProviders,
} from './roleShared';
import type { RoleView } from './settingsViewModel';
import {
  ROLE_LABEL,
  thinkingLabel,
  type Catalog,
  type CredentialEntry,
  type Role,
  type RoleMode,
  type RoleSetting,
} from './types';
import { useSaveQueue } from './useSaveQueue';

const styles = stylex.create({
  row: {
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    ':last-child': {
      borderBottomStyle: 'none',
    },
  },
  summary: {
    alignItems: 'center',
    display: 'grid',
    gap: {
      'default': '14px',
      '@media (max-width: 560px)': '9px',
    },
    gridTemplateColumns: {
      'default': 'minmax(0, 1fr) auto',
      '@media (max-width: 560px)': '1fr',
    },
    minHeight: '67px',
    padding: '10px 11px',
  },
  copy: {
    minWidth: 0,
  },
  heading: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '10px',
  },
  usage: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  roleName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  disabledName: {
    color: colors.textSecondary,
  },
  effective: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  effectiveMuted: {
    color: colors.textMuted,
  },
  effectiveWarning: {
    color: colors.accent,
  },
  effectiveError: {
    color: colors.down,
  },
  status: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'inline-flex',
    fontSize: fontSizes.sm,
    gap: '5px',
    justifyContent: 'flex-end',
    minWidth: '16px',
  },
  statusRollback: {
    color: colors.down,
  },
  icon: {
    verticalAlign: '-2px',
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    gap: '9px',
    justifyContent: {
      '@media (max-width: 560px)': 'space-between',
    },
  },
  editor: {
    borderLeftColor: colors.borderStrong,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    margin: '0 11px 11px',
    padding: '1px 0 1px 12px',
  },
  editorControls: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  select: {
    justifyContent: 'space-between',
    minWidth: '112px',
  },
  selectModel: {
    minWidth: '160px',
  },
  editorStatus: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    gap: '8px',
    marginTop: '6px',
    minHeight: '16px',
  },
  saveError: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElement,
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.down,
    display: 'flex',
    fontSize: fontSizes.control,
    gap: '8px',
    justifyContent: 'space-between',
    margin: '0 11px 10px',
    padding: '6px 8px',
  },
  roleWarning: {
    color: colors.accent,
    fontSize: fontSizes.control,
  },
  testResult: {
    fontSize: fontSizes.control,
  },
  testResultOk: {
    color: colors.up,
  },
  testResultFail: {
    color: colors.down,
  },
  edit: {
    'appearance': 'none',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'marginLeft': '8px',
    'padding': 0,
    ':hover': {
      color: colors.textPrimary,
    },
    ':disabled': {
      color: colors.textMuted,
      cursor: 'default',
      opacity: 0.5,
    },
  },
  editDone: {
    fontSize: fontSizes.control,
    marginLeft: '2px',
  },
});

export function RoleRow({
  role,
  initial,
  draft,
  catalog,
  credentials,
  view,
  onDraftChange,
}: {
  role: Role;
  initial: RoleSetting;
  draft: RoleSetting;
  catalog: Catalog;
  credentials: CredentialEntry[];
  view: RoleView;
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
  const [editing, setEditing] = useState(
    () =>
      initial.mode === 'custom' &&
      (!initial.provider || !initial.modelId || !initial.thinkingLevel),
  );

  const queue = useSaveQueue<RoleSetting>({
    initial,
    save: (snapshot) => saveRole(role, snapshot),
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

  const setMode = (mode: RoleMode) => {
    if (mode === draft.mode) return;
    setEditing(mode === 'custom');
    if (mode === 'custom' && (!draft.provider || !draft.modelId)) {
      push(defaultCustom(catalog));
      return;
    }
    if (mode !== 'custom') {
      push({ mode, provider: null, modelId: null, thinkingLevel: null, stale: false });
      return;
    }
    push({ ...draft, mode });
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

  const roleNameClassName = stylex.props(
    styles.roleName,
    draft.mode === 'disabled' && styles.disabledName,
  ).className;

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
    <div {...stylex.props(styles.row)} id={'settings-role-' + role}>
      <div {...stylex.props(styles.summary)}>
        <div {...stylex.props(styles.copy)}>
          <div {...stylex.props(styles.heading)}>
            <span className={`settings-role-name ${roleNameClassName}`}>{ROLE_LABEL[role]}</span>
            <span {...stylex.props(styles.usage)}>{view.usageLabel}</span>
          </div>
          <div
            {...stylex.props(
              styles.effective,
              view.tone === 'muted' && styles.effectiveMuted,
              view.tone === 'warning' && styles.effectiveWarning,
              view.tone === 'error' && styles.effectiveError,
            )}
          >
            {view.effectiveLabel}
            {draft.mode === 'custom' && !editing ? (
              <button {...stylex.props(styles.edit)} type="button" onClick={() => setEditing(true)}>
                修改
              </button>
            ) : null}
          </div>
        </div>
        <div {...stylex.props(styles.actions)}>
          <RoleModeControl role={role} value={draft.mode} onChange={setMode} />
          <span
            className={[
              failure
                ? 'settings-role-status settings-role-status--rollback'
                : 'settings-role-status',
              stylex.props(styles.status, failure && styles.statusRollback).className,
            ].join(' ')}
            aria-live="polite"
          >
            {queue.flushing() ? (
              <Spinner aria-label="保存中" />
            ) : failure ? (
              <>
                <TriangleAlert
                  size={12}
                  className={`icon ${stylex.props(styles.icon).className}`}
                />{' '}
                未保存
              </>
            ) : (
              <Check
                size={12}
                className={`icon ${stylex.props(styles.icon).className}`}
                aria-label="已保存"
              />
            )}
          </span>
        </div>
      </div>

      {draft.mode === 'custom' && editing && (
        <div {...stylex.props(styles.editor)}>
          <div {...stylex.props(styles.editorControls)}>
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
              className={`${stylex.props(styles.select).className} ${stylex.props(styles.selectModel).className}`}
              value={draft.modelId ?? ''}
              options={models.map((m) => ({ value: m.id, label: m.name }))}
              onChange={setModelId}
            />
            <Select
              value={draft.thinkingLevel ?? 'off'}
              options={thinkingLevels.map((t) => ({ value: t, label: thinkingLabel(t) }))}
              onChange={setThinkingLevel}
            />
            <Button disabled={!complete || testState.status === 'busy'} onClick={runTest}>
              测试模型
            </Button>
            <button
              {...stylex.props(styles.edit, styles.editDone)}
              type="button"
              disabled={!complete}
              onClick={() => setEditing(false)}
            >
              完成
            </button>
          </div>
          <div {...stylex.props(styles.editorStatus)} aria-live="polite">
            {testState.status === 'busy' ? <Spinner aria-label="测试中" /> : null}
            {testState.status === 'ok' ? (
              <span
                className={`settings-test-result settings-test-result--ok ${stylex.props(styles.testResult, styles.testResultOk).className}`}
              >
                {testState.text}
              </span>
            ) : null}
            {testState.status === 'fail' ? (
              <span
                className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
              >
                {testState.text}
              </span>
            ) : null}
            {computedStale ? (
              <span
                className={`settings-role-warning ${stylex.props(styles.roleWarning).className}`}
              >
                模型已不在目录，请改选
              </span>
            ) : null}
            {keyMissing ? (
              <span
                className={`settings-role-warning ${stylex.props(styles.roleWarning).className}`}
              >
                该 Provider 未配置认证
              </span>
            ) : null}
          </div>
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
    </div>
  );
}

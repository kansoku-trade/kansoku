import * as stylex from '@stylexjs/stylex';
import { Button, Dot, Input } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { ProviderBaseUrlField } from './ProviderBaseUrlField';
import type { CatalogProvider, CredentialEntry } from './types';

const styles = stylex.create({
  row: {
    'borderTopColor': colors.border,
    'borderTopStyle': 'solid',
    'borderTopWidth': '1px',
    'padding': '10px 11px',
    ':first-child': {
      borderTopStyle: 'none',
    },
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: 500,
  },
  state: {
    alignItems: 'center',
    display: 'inline-flex',
    fontSize: fontSizes.xs,
    gap: '5px',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  stateUp: { color: colors.up },
  stateAccent: { color: colors.accent },
  stateMuted: { color: colors.textMuted },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  controls: {
    alignItems: 'center',
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  editorButton: {
    '@media (max-width: 560px)': {
      justifyContent: 'center',
    },
  },
  editorInput: {
    flex: 1,
    minWidth: 0,
  },
  error: {
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.down,
    fontSize: fontSizes.sm,
    marginTop: '7px',
    overflowWrap: 'anywhere',
    paddingLeft: '7px',
  },
});

function credentialMeta(credential: CredentialEntry | undefined): string {
  if (!credential) return '尚未保存 API key';
  if (!credential.ok) return '已存凭据无法解密';
  return (credential.masked ?? '已保存') + ' · 更新于 ' + credential.updatedAt.slice(0, 10);
}

function providerState(credential: CredentialEntry | undefined): {
  label: string;
  tone: 'up' | 'accent' | 'muted';
} {
  if (!credential) return { label: '未配置', tone: 'muted' };
  if (!credential.ok) return { label: '需重新填写', tone: 'accent' };
  return { label: '已保存', tone: 'up' };
}

export function ProviderAuthRow({
  provider,
  credential,
  baseUrl,
  editing,
  editKey,
  busy,
  error,
  onStartEdit,
  onEditKey,
  onSave,
  onCancel,
  onDelete,
  onChanged,
}: {
  provider: CatalogProvider;
  credential: CredentialEntry | undefined;
  baseUrl: string | null;
  editing: boolean;
  editKey: string;
  busy: boolean;
  error: string | null;
  onStartEdit: () => void;
  onEditKey: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const state = providerState(credential);
  const stateStyle =
    state.tone === 'up'
      ? styles.stateUp
      : state.tone === 'accent'
        ? styles.stateAccent
        : styles.stateMuted;

  return (
    <div
      className={`settings-provider-row ${stylex.props(styles.row).className}`}
      id={'settings-provider-' + provider.id}
    >
      <div className={`settings-provider-head ${stylex.props(styles.head).className}`}>
        <span className={`settings-provider-name ${stylex.props(styles.name).className}`}>
          {provider.name}
        </span>
        <span
          className={`settings-provider-state settings-provider-state--${state.tone} ${stylex.props(styles.state, stateStyle).className}`}
        >
          <Dot tone={state.tone === 'muted' ? undefined : state.tone} />
          {state.label}
        </span>
      </div>
      <div className={`settings-provider-meta ${stylex.props(styles.meta).className}`}>
        {credentialMeta(credential)}
      </div>
      {editing ? (
        <div className={`settings-provider-editor ${stylex.props(styles.controls).className}`}>
          <Input
            className={stylex.props(styles.editorInput).className}
            autoComplete="off"
            type="password"
            value={editKey}
            onChange={(event) => onEditKey(event.target.value)}
            placeholder="API key"
          />
          <Button
            className={stylex.props(styles.editorButton).className}
            disabled={busy || !editKey}
            onClick={onSave}
          >
            {busy ? '保存中…' : '保存'}
          </Button>
          <Button
            className={stylex.props(styles.editorButton).className}
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </Button>
        </div>
      ) : (
        <div className={`settings-provider-actions ${stylex.props(styles.controls).className}`}>
          <Button onClick={onStartEdit}>{credential ? '更新 key' : '添加 key'}</Button>
          {credential ? (
            <Button disabled={busy} onClick={onDelete}>
              {busy ? '删除中…' : '删除'}
            </Button>
          ) : null}
        </div>
      )}
      <ProviderBaseUrlField
        key={baseUrl ?? ''}
        provider={provider.id}
        baseUrl={baseUrl}
        onChanged={onChanged}
      />
      {error ? (
        <div
          className={`settings-provider-error ${stylex.props(styles.error).className}`}
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

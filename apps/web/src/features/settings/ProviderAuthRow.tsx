import { Button, Dot, Input } from '@web/ui';
import { ProviderBaseUrlField } from './ProviderBaseUrlField';
import type { CatalogProvider, CredentialEntry } from './types';

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

  return (
    <div className="settings-provider-row" id={'settings-provider-' + provider.id}>
      <div className="settings-provider-head">
        <span className="settings-provider-name">{provider.name}</span>
        <span className={'settings-provider-state settings-provider-state--' + state.tone}>
          <Dot tone={state.tone === 'muted' ? undefined : state.tone} />
          {state.label}
        </span>
      </div>
      <div className="settings-provider-meta">{credentialMeta(credential)}</div>
      {editing ? (
        <div className="settings-provider-editor">
          <Input
            autoComplete="off"
            type="password"
            value={editKey}
            onChange={(event) => onEditKey(event.target.value)}
            placeholder="API key"
          />
          <Button disabled={busy || !editKey} onClick={onSave}>
            {busy ? '保存中…' : '保存'}
          </Button>
          <Button disabled={busy} onClick={onCancel}>
            取消
          </Button>
        </div>
      ) : (
        <div className="settings-provider-actions">
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
        <div className="settings-provider-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

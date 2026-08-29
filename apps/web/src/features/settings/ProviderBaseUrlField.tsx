import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Badge, Button, Input } from '@web/ui';

const styles = stylex.create({
  editor: {
    alignItems: 'center',
    display: 'flex',
    gap: 6,
    marginTop: 8,
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  button: {
    flex: 'none',
    whiteSpace: 'nowrap',
    '@media (max-width: 560px)': {
      justifyContent: 'center',
    },
  },
});

export function ProviderBaseUrlField({
  provider,
  baseUrl,
  onChanged,
}: {
  provider: string;
  baseUrl: string | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(baseUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await client.settings.putProviderBaseUrl({ provider, baseUrl: value });
      setValue(result.baseUrl ?? '');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`settings-provider-editor ${stylex.props(styles.editor).className}`}>
        <Input
          autoComplete="off"
          className={stylex.props(styles.input).className}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="默认官方地址，可填中转站地址"
        />
        <Button className={stylex.props(styles.button).className} disabled={busy} onClick={save}>
          {busy ? '保存中…' : '保存'}
        </Button>
        {baseUrl ? <Badge tone="accent">已自定义</Badge> : null}
      </div>
      {error ? (
        <div className="settings-provider-error" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}

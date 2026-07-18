import { useEffect, useState } from 'react';
import type { SymbolFollowStatus } from '@kansoku/core/contract/symbols';
import { errorMessage } from './api';
import { useQuery } from './apiHooks';
import { client } from './client';

export function useSymbolFollow({
  symbol,
  initialFollowing,
  revision,
}: {
  symbol: string;
  initialFollowing?: boolean;
  revision?: string;
}) {
  const needsStatus = initialFollowing === undefined;
  const { data, error, loading } = useQuery<SymbolFollowStatus>(
    needsStatus ? `symbols.followStatus:${symbol}:${revision ?? ''}` : null,
    () => client.symbols.followStatus({ sym: symbol }),
    { cache: false },
  );
  const [following, setFollowing] = useState<boolean | null>(initialFollowing ?? null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setFollowing(initialFollowing ?? null);
    setSaveError(null);
  }, [symbol, initialFollowing, revision]);

  useEffect(() => {
    if (data) setFollowing(data.following);
  }, [data]);

  const change = async (next: boolean) => {
    if (next === following || saving) return;
    const previous = following;
    setFollowing(next);
    setSaving(true);
    setSaveError(null);
    try {
      const result = next
        ? await client.symbols.startFollow({ sym: symbol })
        : await client.symbols.stopFollow({ sym: symbol });
      setFollowing(result.following);
    } catch (err) {
      setFollowing(previous);
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return {
    following,
    busy: (needsStatus && loading) || following === null || saving,
    statusError: saveError ?? error,
    change,
  };
}

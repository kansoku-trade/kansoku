import { useEffect } from 'react';
import { useParams } from 'react-router';
import type { ChartDoc } from '@kansoku/shared/types';
import { chartTargetPath } from '@kansoku/shared/chartUrl';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { navigate } from '@web/lib/router';
import { ErrorBox } from '@web/ui';

function ChartRedirect({ id }: { id: string }) {
  const { data, failure } = useQuery<ChartDoc>(
    `charts.get:${id}`,
    () => client.charts.get({ id }),
    {
      persist: false,
    },
  );

  useEffect(() => {
    if (data) navigate(chartTargetPath(data), { replace: true });
    else if (failure && failure.status === 404)
      navigate('/?notice=chart-not-found', { replace: true });
  }, [data, failure]);

  if (failure && failure.status !== 404) {
    return (
      <div className="page">
        <ErrorBox>{failure.message}</ErrorBox>
      </div>
    );
  }

  return null;
}

export function Component() {
  const { id } = useParams();
  return <ChartRedirect id={decodeURIComponent(id ?? '')} />;
}

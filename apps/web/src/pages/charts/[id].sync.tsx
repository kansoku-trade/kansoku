import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import * as stylex from '@stylexjs/stylex';
import type { ChartDoc } from '@kansoku/shared/types';
import { chartTargetPath } from '@kansoku/shared/chartUrl';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { navigate } from '@web/lib/router';
import { ErrorBox } from '@web/ui';

const styles = stylex.create({
  page: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px 20px 60px',
  },
});

function Page({ children }: { children: ReactNode }) {
  const pageProps = stylex.props(styles.page);
  return (
    <div {...pageProps} className={`page ${pageProps.className}`}>
      {children}
    </div>
  );
}

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
      <Page>
        <ErrorBox>{failure.message}</ErrorBox>
      </Page>
    );
  }

  return null;
}

export function Component() {
  const { id } = useParams();
  return <ChartRedirect id={decodeURIComponent(id ?? '')} />;
}

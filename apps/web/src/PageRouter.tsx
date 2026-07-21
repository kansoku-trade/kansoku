import { useEffect } from 'react';
import type { ChartDoc } from '@kansoku/shared/types';
import { chartTargetPath } from '@kansoku/shared/chartUrl';
import { useQuery } from './lib/apiHooks';
import { client } from './lib/client';
import { useProRoutes } from './features/edition/useProRoutes';
import { symbolFromRoute } from './lib/symbol';
import { AboutPage } from './features/about/AboutPage';
import { AssistantChatPage } from './features/assistant/AssistantChatPage';
import { Home } from './features/home/Home';
import { LogsPage } from './features/logs/LogsPage';
import { PopoutChartWindow } from './features/charts/PopoutChartWindow';
import { ResearchPage } from './features/research/ResearchPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { SymbolCockpit } from './features/cockpit/SymbolCockpit';
import { matchPopoutSymbolRoute, navigate, routePathname, useRoute } from './router';
import { ErrorBox } from './ui';

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
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
      <div className="page">
        <ErrorBox>{failure.message}</ErrorBox>
      </div>
    );
  }

  return null;
}

export function Router() {
  const route = useRoute();
  const pathname = routePathname(route);

  const proRoutes = useProRoutes();
  const ProPage = proRoutes?.[pathname];
  if (ProPage) return <ProPage />;

  if (pathname === '/overview' || pathname === '/charts') {
    return <Redirect to="/" />;
  }
  const popoutSymbol = matchPopoutSymbolRoute(pathname);
  if (popoutSymbol) return <PopoutChartWindow sym={popoutSymbol} />;
  const chartMatch = pathname.match(/^\/charts\/(.+)$/);
  if (chartMatch) {
    return <ChartRedirect id={decodeURIComponent(chartMatch[1])} />;
  }
  const symbol = symbolFromRoute(route);
  if (symbol) return <SymbolCockpit sym={symbol} />;
  if (pathname === '/research') return <ResearchPage />;
  if (pathname === '/chat') return <AssistantChatPage />;
  if (pathname === '/settings') return <SettingsPage />;
  if (pathname === '/about') return <AboutPage />;
  if (pathname === '/logs') return <LogsPage />;
  return <Home />;
}

import { useEffect } from "react";
import type { ChartDoc } from "../../shared/types";
import { chartTargetPath } from "../../shared/chartUrl";
import { useQuery } from "./apiHooks";
import { client } from "./client";
import { symbolFromRoute } from "./lib/symbol";
import { AboutPage } from "./pages/about/AboutPage";
import { AssistantChatPage } from "./pages/assistant/AssistantChatPage";
import { Home } from "./pages/Home";
import { LogsPage } from "./pages/logViewer/LogsPage";
import { PopoutChartWindow } from "./pages/PopoutChartWindow";
import { ResearchPage } from "./pages/research/ResearchPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { SymbolCockpit } from "./pages/SymbolCockpit";
import { matchPopoutSymbolRoute, navigate, routePathname, useRoute } from "./router";
import { ErrorBox } from "./ui";

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function ChartRedirect({ id }: { id: string }) {
  const { data, failure } = useQuery<ChartDoc>(`charts.get:${id}`, () => client.charts.get({ id }), {
    persist: false,
  });

  useEffect(() => {
    if (data) navigate(chartTargetPath(data), { replace: true });
    else if (failure && failure.status === 404) navigate("/?notice=chart-not-found", { replace: true });
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

  if (pathname === "/overview" || pathname === "/charts") {
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
  if (pathname === "/research") return <ResearchPage />;
  if (pathname === "/chat") return <AssistantChatPage />;
  if (pathname === "/settings") return <SettingsPage />;
  if (pathname === "/about") return <AboutPage />;
  if (pathname === "/logs") return <LogsPage />;
  return <Home />;
}

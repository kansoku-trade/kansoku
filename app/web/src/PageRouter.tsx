import { useEffect } from "react";
import type { ChartDoc } from "../../shared/types";
import { chartTargetPath } from "../../shared/chartUrl";
import { useQuery } from "./apiHooks";
import { client } from "./client";
import { Home } from "./pages/Home";
import { LogsPage } from "./pages/logViewer/LogsPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { SymbolCockpit } from "./pages/SymbolCockpit";
import { navigate, routePathname, useRoute } from "./router";
import { ErrorBox } from "./ui";

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function ChartRedirect({ id }: { id: string }) {
  const { data, failure } = useQuery<ChartDoc>(`charts.get:${id}`, () => client.charts.get({ id }));

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
  const chartMatch = pathname.match(/^\/charts\/(.+)$/);
  if (chartMatch) {
    return <ChartRedirect id={decodeURIComponent(chartMatch[1])} />;
  }
  const symbolMatch = pathname.match(/^\/symbol\/(.+)$/);
  if (symbolMatch) return <SymbolCockpit sym={decodeURIComponent(symbolMatch[1])} />;
  if (pathname === "/settings") return <SettingsPage />;
  if (pathname === "/logs") return <LogsPage />;
  return <Home />;
}

import { useEffect } from "react";
import type { ChartDoc } from "../../shared/types";
import { chartTargetPath } from "../../shared/chartUrl";
import { useQuery } from "./apiHooks";
import { Home } from "./pages/Home";
import { SymbolCockpit } from "./pages/SymbolCockpit";
import { navigate, useRoute } from "./router";
import { ModalHost } from "./ui";

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function ChartRedirect({ id }: { id: string }) {
  const { data, failure } = useQuery<ChartDoc>(`/api/charts/${encodeURIComponent(id)}`);

  useEffect(() => {
    if (data) navigate(chartTargetPath(data), { replace: true });
    else if (failure) navigate("/?notice=chart-not-found", { replace: true });
  }, [data, failure]);

  return null;
}

function Router() {
  const route = useRoute();

  if (route === "/overview" || route === "/charts") {
    return <Redirect to="/" />;
  }
  const chartMatch = route.match(/^\/charts\/(.+)$/);
  if (chartMatch) {
    return <ChartRedirect id={decodeURIComponent(chartMatch[1])} />;
  }
  const symbolMatch = route.match(/^\/symbol\/(.+)$/);
  if (symbolMatch) return <SymbolCockpit sym={decodeURIComponent(symbolMatch[1])} />;
  return <Home />;
}

export function App() {
  return (
    <>
      <Router />
      <ModalHost />
    </>
  );
}

import { useEffect } from "react";
import { Settings } from "lucide-react";
import type { ChartDoc } from "../../shared/types";
import { chartTargetPath } from "../../shared/chartUrl";
import { useQuery } from "./apiHooks";
import { Home } from "./pages/Home";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { SymbolCockpit } from "./pages/SymbolCockpit";
import { navigate, useRoute } from "./router";
import { ErrorBox, ModalHost } from "./ui";

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function ChartRedirect({ id }: { id: string }) {
  const { data, failure } = useQuery<ChartDoc>(`/api/charts/${encodeURIComponent(id)}`);

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
  if (route === "/settings") return <SettingsPage />;
  return <Home />;
}

function GlobalTopbar() {
  const route = useRoute();
  if (route === "/settings") return null;
  return (
    <a className="global-settings-link" href="/settings" aria-label="设置">
      <Settings size={16} />
    </a>
  );
}

export function App() {
  return (
    <>
      <GlobalTopbar />
      <Router />
      <ModalHost />
    </>
  );
}

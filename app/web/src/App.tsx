import { useEffect } from "react";
import { ChartDetail } from "./pages/ChartDetail";
import { ChartList } from "./pages/ChartList";
import { Home } from "./pages/Home";
import { SymbolCockpit } from "./pages/SymbolCockpit";
import { navigate, useHashRoute } from "./router";

function RedirectHome() {
  useEffect(() => navigate("/"), []);
  return null;
}

export function App() {
  const route = useHashRoute();

  if (route === "/overview") {
    return <RedirectHome />;
  }
  if (route === "/charts") {
    return <ChartList />;
  }
  const chartMatch = route.match(/^\/charts\/(.+)$/);
  if (chartMatch) {
    return <ChartDetail id={decodeURIComponent(chartMatch[1])} />;
  }
  const symbolMatch = route.match(/^\/symbol\/(.+)$/);
  if (symbolMatch) {
    return <SymbolCockpit sym={decodeURIComponent(symbolMatch[1])} />;
  }
  return <Home />;
}

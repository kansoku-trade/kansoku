import { ChartDetail } from "./pages/ChartDetail";
import { ChartList } from "./pages/ChartList";
import { SymbolCockpit } from "./pages/SymbolCockpit";
import { useHashRoute } from "./router";

export function App() {
  const route = useHashRoute();

  const chartMatch = route.match(/^\/charts\/(.+)$/);
  if (chartMatch) {
    return <ChartDetail id={decodeURIComponent(chartMatch[1])} />;
  }
  const symbolMatch = route.match(/^\/symbol\/(.+)$/);
  if (symbolMatch) {
    return <SymbolCockpit sym={decodeURIComponent(symbolMatch[1])} />;
  }
  return <ChartList />;
}

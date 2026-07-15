import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { persistOptions, queryClient } from "./queryClient";
import { installRouter } from "./router";
import "./styles.css";

installRouter();
createRoot(document.getElementById("root")!).render(
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <App />
  </PersistQueryClientProvider>,
);

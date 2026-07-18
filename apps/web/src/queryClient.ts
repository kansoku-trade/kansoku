import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Query } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { persist?: boolean };
  }
}

export const DEFAULT_GC_TIME = 1000 * 60 * 60 * 24;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      gcTime: DEFAULT_GC_TIME,
    },
  },
});

const noopPersister: Persister = {
  persistClient: async () => {},
  restoreClient: async () => undefined as PersistedClient | undefined,
  removeClient: async () => {},
};

function createPersister(): Persister {
  try {
    return createSyncStoragePersister({ storage: window.localStorage });
  } catch {
    return noopPersister;
  }
}

export const persister = createPersister();

export const PERSIST_BUSTER = "v1";

export const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 7,
  buster: PERSIST_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) => query.state.status === "success" && query.meta?.persist !== false,
  },
};

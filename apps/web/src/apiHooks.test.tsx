// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { usePollingQuery, useQuery, type QueryState } from "./apiHooks";

afterEach(() => {
  cleanup();
});

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function Probe<T>({
  stateRef,
  queryKey,
  fetch,
  cache,
  persist,
}: {
  stateRef: { current: QueryState<T> | null };
  queryKey: string | null;
  fetch: () => Promise<T>;
  cache?: boolean;
  persist?: boolean;
}) {
  stateRef.current = useQuery<T>(queryKey, fetch, { cache, persist });
  return null;
}

function PollingProbe<T>({
  stateRef,
  queryKey,
  fetch,
  ms,
}: {
  stateRef: { current: QueryState<T> | null };
  queryKey: string | null;
  fetch: () => Promise<T>;
  ms: number;
}) {
  stateRef.current = usePollingQuery<T>(queryKey, fetch, ms);
  return null;
}

describe("useQuery", () => {
  it("renders cached data with loading:false and updates it after a background refetch", async () => {
    const client = createClient();
    client.setQueryData(["k1"], "old", { updatedAt: Date.now() - 60_000 });
    const fetch = vi.fn(() => Promise.resolve("new"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k1" fetch={fetch} />
      </QueryClientProvider>,
    );

    expect(stateRef.current).toMatchObject({ data: "old", loading: false });

    await waitFor(() => expect(stateRef.current?.data).toBe("new"));
  });

  it("starts with loading:true when cache is disabled", async () => {
    const client = createClient();
    let resolveFetch!: (value: string) => void;
    const fetch = vi.fn(() => new Promise<string>((resolve) => (resolveFetch = resolve)));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k2" fetch={fetch} cache={false} />
      </QueryClientProvider>,
    );

    expect(stateRef.current?.loading).toBe(true);
    expect(stateRef.current?.data).toBeNull();

    resolveFetch("done");
    await waitFor(() => expect(stateRef.current?.data).toBe("done"));
  });

  it("maps a failure to failure.message and failure.status", async () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.reject(new ApiError("nope", 503)));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k3" fetch={fetch} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(stateRef.current?.failure).not.toBeNull());
    expect(stateRef.current?.failure).toEqual({ message: "nope", status: 503 });
    expect(stateRef.current?.error).toBe("nope");
  });

  it("flips refreshed to true only after the first successful fetch completes", async () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.resolve("value"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k4" fetch={fetch} />
      </QueryClientProvider>,
    );

    expect(stateRef.current?.refreshed).toBe(false);

    await waitFor(() => expect(stateRef.current?.refreshed).toBe(true));
  });

  it("marks meta.persist false when persist:false is passed while cache stays at its default gcTime", async () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.resolve("value"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k6" fetch={fetch} persist={false} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(stateRef.current?.data).toBe("value"));

    const state = client.getQueryState(["k6"]);
    expect(state?.fetchStatus).toBe("idle");

    const query = client.getQueryCache().find({ queryKey: ["k6"] });
    expect(query?.meta).toEqual({ persist: false });
    expect(query?.options.gcTime).toBeUndefined();
  });

  it("leaves meta.persist unset when persist is omitted (defaults to persisted)", async () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.resolve("value"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k7" fetch={fetch} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(stateRef.current?.data).toBe("value"));

    const query = client.getQueryCache().find({ queryKey: ["k7"] });
    expect(query?.meta).toBeUndefined();
  });

  it("forces meta.persist false when cache:false even if persist is not explicitly set", async () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.resolve("value"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k8" fetch={fetch} cache={false} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(stateRef.current?.data).toBe("value"));

    const query = client.getQueryCache().find({ queryKey: ["k8"] });
    expect(query?.meta).toEqual({ persist: false });
    expect(query?.options.gcTime).toBe(0);
  });

  it("returns the disabled state when key is null", () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.resolve("unused"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey={null} fetch={fetch} />
      </QueryClientProvider>,
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(stateRef.current).toMatchObject({ data: null, loading: false, error: null, failure: null });
  });

  it("does not fetch when reload is called on a disabled query", () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.resolve("unused"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey={null} fetch={fetch} />
      </QueryClientProvider>,
    );

    stateRef.current?.reload();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps dataUpdatedAt null until data lands, then reports a number", async () => {
    const client = createClient();
    const fetch = vi.fn(() => Promise.resolve("value"));
    const stateRef: { current: QueryState<string> | null } = { current: null };

    render(
      <QueryClientProvider client={client}>
        <Probe stateRef={stateRef} queryKey="k9" fetch={fetch} />
      </QueryClientProvider>,
    );

    expect(stateRef.current?.dataUpdatedAt).toBeNull();

    await waitFor(() => expect(stateRef.current?.data).toBe("value"));
    expect(typeof stateRef.current?.dataUpdatedAt).toBe("number");
  });
});

describe("usePollingQuery", () => {
  it("maps the interval to refetchInterval and refetches on schedule", async () => {
    vi.useFakeTimers();
    try {
      const client = createClient();
      const fetch = vi.fn(() => Promise.resolve("tick"));
      const stateRef: { current: QueryState<string> | null } = { current: null };

      render(
        <QueryClientProvider client={client}>
          <PollingProbe stateRef={stateRef} queryKey="k5" fetch={fetch} ms={1000} />
        </QueryClientProvider>,
      );

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

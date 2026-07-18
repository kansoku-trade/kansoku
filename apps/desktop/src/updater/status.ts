export type UpdaterUiStatus =
  | { kind: "unknown" }
  | { kind: "up-to-date"; current: string; latest: string }
  | { kind: "available"; version: string; htmlUrl: string }
  | { kind: "error"; message: string };

export type CheckResultForStatus =
  | { kind: "throttled" }
  | { kind: "fetch-failed"; message: string }
  | { kind: "no-release" }
  | { kind: "up-to-date"; current: string; latest: string }
  | { kind: "available"; release: { version: string; htmlUrl: string } };

export function applyCheckResult(
  prev: UpdaterUiStatus,
  result: CheckResultForStatus,
): UpdaterUiStatus {
  switch (result.kind) {
    case "available":
      return {
        kind: "available",
        version: result.release.version,
        htmlUrl: result.release.htmlUrl,
      };
    case "up-to-date":
      return {
        kind: "up-to-date",
        current: result.current,
        latest: result.latest,
      };
    case "throttled":
    case "fetch-failed":
    case "no-release":
      return prev;
  }
}

export type UpdaterStatusStore = {
  get: () => UpdaterUiStatus;
  set: (next: UpdaterUiStatus) => void;
  applyResult: (result: CheckResultForStatus) => void;
  on: (cb: (status: UpdaterUiStatus) => void) => () => void;
};

export function createUpdaterStatusStore(
  initial: UpdaterUiStatus = { kind: "unknown" },
): UpdaterStatusStore {
  let status = initial;
  const listeners = new Set<(status: UpdaterUiStatus) => void>();

  const emit = () => {
    for (const listener of listeners) listener(status);
  };

  return {
    get: () => status,
    set: (next) => {
      if (sameStatus(status, next)) return;
      status = next;
      emit();
    },
    applyResult: (result) => {
      const next = applyCheckResult(status, result);
      if (sameStatus(status, next)) return;
      status = next;
      emit();
    },
    on: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

function sameStatus(a: UpdaterUiStatus, b: UpdaterUiStatus): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "unknown":
      return true;
    case "up-to-date":
      return b.kind === "up-to-date" && a.current === b.current && a.latest === b.latest;
    case "available":
      return b.kind === "available" && a.version === b.version && a.htmlUrl === b.htmlUrl;
    case "error":
      return b.kind === "error" && a.message === b.message;
  }
}

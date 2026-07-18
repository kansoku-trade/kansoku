import { useSyncExternalStore } from "react";
import { getHubStatus, subscribeHubStatus, type HubStatus } from "./wsHub.js";

export function useHubStatus(): HubStatus {
  return useSyncExternalStore(subscribeHubStatus, getHubStatus);
}

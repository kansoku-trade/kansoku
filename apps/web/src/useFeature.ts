import type { FeatureKey, FeatureState } from "@kansoku/pro-api/features";
import { useCapabilities } from "./capabilitiesStore";
import { openLicenseModal } from "./licenseModalStore";

export function useFeature(key: FeatureKey): {
  state: FeatureState;
  active: boolean;
  locked: boolean;
  guard: (action: () => void) => void;
} {
  const { features } = useCapabilities();
  const state = features?.[key] ?? "absent";
  const active = state === "active";
  const locked = state === "locked";

  const guard = (action: () => void): void => {
    if (active) {
      action();
      return;
    }
    if (locked) openLicenseModal("guard");
  };

  return { state, active, locked, guard };
}

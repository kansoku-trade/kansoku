import { useCapabilities } from "./capabilitiesStore";
import { openLicenseModal } from "./licenseModalStore";

export function useFeatureGuard(): { locked: boolean; guard: (action: () => void) => void } {
  const { pro, licensed } = useCapabilities();
  const locked = pro === true && !licensed;

  const guard = (action: () => void): void => {
    if (pro === true && licensed) {
      action();
      return;
    }
    if (locked) openLicenseModal("guard");
  };

  return { locked, guard };
}

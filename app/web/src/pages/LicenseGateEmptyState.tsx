import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { openLicenseModal } from "../licenseModalStore";
import { navigate } from "../router";
import { Empty } from "../ui";

export function LicenseGateEmptyState() {
  useEffect(() => {
    openLicenseModal("guard");
  }, []);

  return (
    <div className="page">
      <a
        className="settings-back-link"
        href="/"
        onClick={(event) => {
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          navigate("/");
        }}
      >
        <ArrowLeft className="icon" size={13} /> 返回
      </a>
      <Empty>需要有效授权才能使用该功能</Empty>
    </div>
  );
}

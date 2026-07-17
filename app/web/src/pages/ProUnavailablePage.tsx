import { ArrowLeft } from "lucide-react";
import { navigate } from "../router";
import { ErrorBox } from "../ui";

export function ProUnavailablePage() {
  return (
    <div className="page">
      <ErrorBox>此构建不含 AI 功能</ErrorBox>
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
    </div>
  );
}

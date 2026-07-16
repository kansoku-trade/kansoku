import { ArrowLeft } from "lucide-react";
import { CREDITS } from "../../../../shared/credits";
import { LICENSE_TEXT } from "../../../../shared/licenseText";
import { navigate } from "../../router";
import { Card, SectionTitle } from "../../ui";
import { useTitle } from "../../useTitle";

function AboutBackLink() {
  return (
    <a
      className="settings-back-link"
      href="/"
      onClick={(event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (window.history.length > 1) window.history.back();
        else navigate("/");
      }}
    >
      <ArrowLeft className="icon" size={13} /> 返回
    </a>
  );
}

export function AboutPage() {
  useTitle("关于");

  return (
    <div className="page about-page">
      <AboutBackLink />
      <div className="about-hero">
        <img className="about-icon" src="/brand/kansoku-icon.svg" alt="Kansoku" width={72} height={72} />
        <h1>Kansoku</h1>
        <div className="about-version">版本 {__APP_VERSION__}</div>
        <div className="about-copyright">© 2026 Innei · AGPL-3.0 + Commons Clause</div>
        <div className="about-links">
          <a href="https://github.com/Innei/kansoku" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </div>

      <Card className="about-card">
        <SectionTitle>许可证</SectionTitle>
        <p className="about-license-summary">
          本软件按 AGPL-3.0 授权，并附加 Commons Clause 条款：允许使用、修改和分发，但禁止把本软件本体作为收费产品或收费服务出售。
        </p>
        <details className="about-details">
          <summary>查看完整许可证文本</summary>
          <pre className="about-license-text">{LICENSE_TEXT}</pre>
        </details>
      </Card>

      <Card className="about-card">
        <SectionTitle>第三方开源组件</SectionTitle>
        <details className="about-details">
          <summary>共 {CREDITS.length} 个组件</summary>
          <ul className="about-credits">
            {CREDITS.map((entry) => (
              <li key={`${entry.name}@${entry.version}`}>
                <span className="about-credit-name">{entry.name}</span>
                <span className="about-credit-version">{entry.version}</span>
                <span className="about-credit-license">{entry.license}</span>
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";

export function externalLinkHref(href: string | null): string | null {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return href;
}

export function truncateUrl(url: string, max = 100): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 31)}…${url.slice(-30)}`;
}

export function LinkHoverStatus() {
  const [url, setUrl] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onOver = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") ?? null;
      const next = externalLinkHref(anchor?.getAttribute("href") ?? null);
      if (next) {
        setUrl(next);
        setVisible(true);
      } else {
        setVisible(false);
      }
    };
    const onLeave = () => setVisible(false);
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className={`link-hover-status${visible ? " link-hover-status--visible" : ""}`} aria-hidden>
      {truncateUrl(url)}
    </div>
  );
}

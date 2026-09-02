export interface ChatSource {
  href: string;
  title: string;
}

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /(?<!\]\()https?:\/\/[^\s)]+/g;

export function collectSources(text: string): ChatSource[] {
  const out: ChatSource[] = [];
  const seen = new Set<string>();
  const push = (href: string, title: string) => {
    if (seen.has(href)) return;
    seen.add(href);
    out.push({ href, title });
  };

  for (const match of text.matchAll(MARKDOWN_LINK)) {
    push(match[2], match[1].trim() || match[2]);
  }
  for (const match of text.matchAll(BARE_URL)) {
    push(match[0], match[0]);
  }
  return out;
}

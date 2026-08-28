// A deliberately small RSS/Atom reader. The feeds this consumes are three
// government press channels with a fixed shape; a full XML parser would be a new
// dependency (and a new attack surface) for markup we can describe in a page.

export interface FeedItem {
  title: string;
  // The feed's own identity for this entry. Null means the link has to stand in.
  id: string | null;
  link: string | null;
  publishedAt: string | null;
  // The feed's literal date text. Normalizing is what makes the timeline sortable;
  // keeping the original is what makes a later "when did they say it" answerable.
  rawPublishedAt: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00A0',
  quot: '"',
};

// One pass, so `&amp;amp;` decodes to `&amp;` and not to a bare `&`: decoding
// twice would turn escaped markup in a headline into markup.
export function decodeXmlEntities(text: string): string {
  return text.replaceAll(
    /&(#\d+|#[Xx][\dA-Fa-f]+|[A-Za-z][\dA-Za-z]*);/g,
    (match, entity: string) => {
      if (entity.startsWith('#')) {
        const hex = entity[1] === 'x' || entity[1] === 'X';
        const code = Number.parseInt(hex ? entity.slice(2) : entity.slice(1), hex ? 16 : 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
      }
      // An entity we do not know stays as written: silently dropping it would edit
      // the source's words.
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

function clean(raw: string | null): string | null {
  if (raw === null) return null;
  const unwrapped = raw.replaceAll(/<!\[CDATA\[([\S\s]*?)]]>/g, '$1');
  const text = decodeXmlEntities(unwrapped).trim();
  return text === '' ? null : text;
}

function tagText(block: string, name: string): string | null {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, 'i').exec(block);
  return match ? clean(match[1]) : null;
}

// Atom puts the URL in an attribute and ships several of them; the alternate link
// is the human-readable page, which is what a citation needs.
function atomLink(block: string): string | null {
  let fallback: string | null = null;
  for (const match of block.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = match[1];
    const href =
      /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /href\s*=\s*'([^']*)'/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /rel\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /rel\s*=\s*'([^']*)'/i.exec(attrs)?.[1];
    if (!rel || rel.toLowerCase() === 'alternate') return clean(href);
    fallback ??= clean(href);
  }
  return fallback;
}

function dateOf(block: string): { instant: string; raw: string } | null {
  for (const tag of ['pubDate', 'dc:date', 'published', 'updated']) {
    const raw = tagText(block, tag);
    if (!raw) continue;
    const at = Date.parse(raw);
    if (Number.isFinite(at)) return { instant: new Date(at).toISOString(), raw };
  }
  return null;
}

// Feeds ship root-relative hrefs, and a citation the user cannot click is not a
// citation. Only http(s) survives: a "link" that turns out to be a javascript: or
// data: URL is a payload, not a source.
function resolveLink(href: string | null, baseUrl: string | undefined): string | null {
  if (href === null) return null;
  let url: URL;
  try {
    url = baseUrl === undefined ? new URL(href) : new URL(href, baseUrl);
  } catch {
    // Unparseable and no base to resolve against: kept verbatim, since the feed's
    // own text is still better evidence than nothing.
    return baseUrl === undefined ? href : null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
}

// A complete feed document announces itself and closes its root element. Anything
// else — an HTML maintenance page served with status 200, an empty body, a response
// cut off mid-stream — is a broken read, and a broken read that parses to zero items
// would be reported as "the government published nothing today".
export function feedDocumentError(xml: string): string | null {
  const text = xml.trim();
  if (text === '') return 'empty feed document';
  for (const root of ['rss', 'feed', 'rdf:RDF']) {
    if (!new RegExp(`<${root}\\b`, 'i').test(text)) continue;
    return new RegExp(`</${root}\\s*>\\s*$`, 'i').test(text)
      ? null
      : `truncated feed document: <${root}> is never closed`;
  }
  return 'not a feed document: no <rss>, <feed> or <rdf:RDF> root';
}

export function parseFeed(xml: string, baseUrl?: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const match of xml.matchAll(/<(item|entry)\b[^>]*>([\S\s]*?)<\/\1\s*>/gi)) {
    const block = match[2];
    const title = tagText(block, 'title');
    if (!title) continue;
    const date = dateOf(block);
    items.push({
      id: tagText(block, 'guid') ?? tagText(block, 'id'),
      link: resolveLink(tagText(block, 'link') ?? atomLink(block), baseUrl),
      publishedAt: date?.instant ?? null,
      rawPublishedAt: date?.raw ?? null,
      title,
    });
  }
  return items;
}

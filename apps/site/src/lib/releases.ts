import snapshot from '../data/releases.json';

const REPO = 'kansoku-trade/kansoku';

// A release asset served off the CDN, not the REST API — it has no rate limit and always resolves
// to the newest published release. The API 403s on shared CI egress IPs; this does not.
const APPCAST_URL = `https://github.com/${REPO}/releases/latest/download/appcast.xml`;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: ReleaseAsset[];
}

export interface LatestDesktop {
  version: string;
  downloadUrl: string;
  publishedAt: string;
  source: 'appcast' | 'api' | 'snapshot';
}

export function desktopReleases(all: Release[]): Release[] {
  return all
    .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith('desktop-v'))
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
}

export function releaseVersion(release: Release): string {
  return release.tag_name.replace(/^desktop-v/, '');
}

export function dmgAsset(release: Release): ReleaseAsset | undefined {
  return release.assets.find((a) => a.name.endsWith('.dmg'));
}

export function dmgUrlFor(version: string): string {
  return `https://github.com/${REPO}/releases/download/desktop-v${version}/Kansoku-${version}-arm64.dmg`;
}

export function parseAppcast(xml: string): { version: string; publishedAt: string } | null {
  const version = /<sparkle:version>([^<]+)<\/sparkle:version>/.exec(xml)?.[1]?.trim();
  if (!version) return null;
  const pubDate = /<pubDate>([^<]+)<\/pubDate>/.exec(xml)?.[1]?.trim();
  const parsed = pubDate ? new Date(pubDate) : null;
  return {
    version,
    publishedAt:
      parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString(),
  };
}

const snapshotReleases = (): Release[] => desktopReleases(snapshot.releases as Release[]);

async function fetchFromApi(): Promise<Release[] | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const pages: Release[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) return null;
      const batch = (await res.json()) as Release[];
      pages.push(...batch);
      if (batch.length < 100) break;
    }
    const desktop = desktopReleases(pages);
    return desktop.length > 0 ? desktop : null;
  } catch {
    return null;
  }
}

async function fetchFromAppcast(): Promise<LatestDesktop | null> {
  try {
    const res = await fetch(APPCAST_URL);
    if (!res.ok) return null;
    const parsed = parseAppcast(await res.text());
    if (!parsed) return null;
    return {
      version: parsed.version,
      downloadUrl: dmgUrlFor(parsed.version),
      publishedAt: parsed.publishedAt,
      source: 'appcast',
    };
  } catch {
    return null;
  }
}

let latestInflight: Promise<LatestDesktop> | undefined;
let listInflight: Promise<Release[]> | undefined;

/**
 * The headline version and download button. Never throws: the appcast is the live source, the
 * committed snapshot is the floor. A build with no network still produces a working page.
 */
export function latestDesktop(): Promise<LatestDesktop> {
  latestInflight ??= (async () => {
    const live = await fetchFromAppcast();
    if (live) return live;
    const latest = snapshotReleases()[0];
    const version = releaseVersion(latest);
    return {
      version,
      downloadUrl: dmgAsset(latest)?.browser_download_url ?? dmgUrlFor(version),
      publishedAt: latest.published_at,
      source: 'snapshot' as const,
    };
  })();
  return latestInflight;
}

/** Full history for the changelog. Never throws; falls back to the committed snapshot. */
export function fetchDesktopReleases(): Promise<Release[]> {
  listInflight ??= (async () => (await fetchFromApi()) ?? snapshotReleases())();
  return listInflight;
}

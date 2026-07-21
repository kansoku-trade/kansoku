const REPO = 'kansoku-trade/kansoku';

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

async function fetchAll(): Promise<Release[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const pages: Release[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub releases API ${res.status}`);
    const batch = (await res.json()) as Release[];
    pages.push(...batch);
    if (batch.length < 100) break;
  }
  const desktop = desktopReleases(pages);
  if (desktop.length === 0) throw new Error('no desktop-v* releases found');
  return desktop;
}

let inflight: Promise<Release[]> | undefined;

export function fetchDesktopReleases(): Promise<Release[]> {
  inflight ??= fetchAll().catch((error: unknown) => {
    inflight = undefined;
    throw error;
  });
  return inflight;
}

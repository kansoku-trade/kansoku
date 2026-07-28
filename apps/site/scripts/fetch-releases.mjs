#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/releases.json');
const REPO = 'kansoku-trade/kansoku';
const KEEP = 30;

const token = () => {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const auth = token();
if (!auth) {
  console.error(
    'no GITHUB_TOKEN and `gh auth token` failed — unauthenticated pulls hit the 60/hr limit',
  );
}

const headers = { accept: 'application/vnd.github+json' };
if (auth) headers.authorization = `Bearer ${auth}`;

const all = [];
for (let page = 1; page <= 10; page++) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,
    {
      headers,
    },
  );
  if (!res.ok) throw new Error(`GitHub releases API ${res.status}`);
  const batch = await res.json();
  all.push(...batch);
  if (batch.length < 100) break;
}

const desktop = all
  .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith('desktop-v'))
  .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))
  .slice(0, KEEP)
  .map((r) => ({
    tag_name: r.tag_name,
    body: r.body ?? '',
    published_at: r.published_at,
    prerelease: false,
    draft: false,
    assets: r.assets
      .filter((a) => a.name.endsWith('.dmg'))
      .map((a) => ({ name: a.name, browser_download_url: a.browser_download_url })),
  }));

if (desktop.length === 0) throw new Error('no desktop-v* releases found');

writeFileSync(
  OUT,
  `${JSON.stringify({ capturedAt: new Date().toISOString(), releases: desktop }, null, 2)}\n`,
);

console.log(`wrote ${OUT}`);
console.log(`  ${desktop.length} releases, latest ${desktop[0].tag_name}`);

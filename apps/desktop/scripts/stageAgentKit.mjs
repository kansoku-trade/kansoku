import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function kitVersion(pkgVersion, now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${pkgVersion}+${yyyy}${mm}${dd}`;
}

export function stageAgentKit({ srcRoot, destRoot, pkg }) {
  rmSync(destRoot, { recursive: true, force: true });
  cpSync(join(srcRoot, 'templates'), join(destRoot, 'templates'), { recursive: true });
  cpSync(join(srcRoot, 'bin'), join(destRoot, 'bin'), { recursive: true });

  const shimPath = join(destRoot, 'bin', 'kansoku-cli');
  if ((statSync(shimPath).mode & 0o111) !== 0o111) {
    chmodSync(shimPath, 0o755);
  }

  const manifest = JSON.parse(readFileSync(join(srcRoot, 'manifest.template.json'), 'utf8'));
  const renderVersion = JSON.parse(readFileSync(join(srcRoot, 'render-version.json'), 'utf8'));
  const version = kitVersion(pkg.version);
  manifest.kitVersion = version;
  manifest.appVersion = pkg.version;

  let templateCount = 0;
  for (const entry of manifest.templates) {
    if (entry.source === 'app-config') {
      entry.sha256 = renderVersion.personalMd;
      continue;
    }
    const filePath = join(srcRoot, entry.path);
    if (!existsSync(filePath)) {
      throw new Error(
        `stageAgentKit: manifest entry "${entry.path}" has no real file at ${filePath} — did the manifest drift from agent-kit-src/templates/?`,
      );
    }
    entry.sha256 = sha256File(filePath);
    templateCount += 1;
  }

  writeFileSync(join(destRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`agent-kit staged (${templateCount} templates, kitVersion=${version})`);

  return manifest;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const srcRoot = join(desktopDir, 'agent-kit-src');
  const destRoot = join(desktopDir, 'dist-agent-kit');
  const pkg = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'));
  stageAgentKit({ srcRoot, destRoot, pkg });
}

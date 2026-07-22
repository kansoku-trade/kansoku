import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stageAgentKit } from '../stageAgentKit.mjs';

const temps = [];

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function buildFixtureSrc() {
  const srcRoot = tempDir('agent-kit-src-');
  mkdirSync(join(srcRoot, 'templates'), { recursive: true });
  mkdirSync(join(srcRoot, 'bin'), { recursive: true });

  writeFileSync(join(srcRoot, 'templates', 'CLAUDE.md.tpl'), '# CLAUDE\nhello\n');
  writeFileSync(join(srcRoot, 'templates', 'AGENTS.md.tpl'), '# CLAUDE\nhello\n');
  writeFileSync(join(srcRoot, 'templates', 'env.tpl'), 'FRED_API_KEY=\n');
  writeFileSync(
    join(srcRoot, 'render-version.json'),
    `${JSON.stringify({ personalMd: 'app-config-v1' }, null, 2)}\n`,
  );

  const shimPath = join(srcRoot, 'bin', 'kansoku-cli');
  writeFileSync(shimPath, '#!/bin/sh\necho hi\n');
  chmodSync(shimPath, 0o755);

  writeFileSync(
    join(srcRoot, 'manifest.template.json'),
    `${JSON.stringify(
      {
        kitVersion: '__KIT_VERSION__',
        appVersion: '__APP_VERSION__',
        templates: [
          { path: 'templates/CLAUDE.md.tpl', dest: 'CLAUDE.md', sha256: '__SHA_CLAUDE__' },
          { path: 'templates/AGENTS.md.tpl', dest: 'AGENTS.md', sha256: '__SHA_AGENTS__' },
          { path: 'templates/env.tpl', dest: '.env', sha256: '__SHA_ENV__' },
          {
            path: '<runtime>',
            dest: 'journal/personal.md',
            sha256: '__RENDER_VERSION__',
            source: 'app-config',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  return srcRoot;
}

function buildFixtureSrcWithMissingTemplate() {
  const srcRoot = buildFixtureSrc();
  const manifestPath = join(srcRoot, 'manifest.template.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.templates.push({
    path: 'templates/nonexistent.md.tpl',
    dest: 'NONEXISTENT.md',
    sha256: '__SHA_MISSING__',
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return srcRoot;
}

function hashTree(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  };
  walk(root);

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(root, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

describe('stageAgentKit', () => {
  it('stages templates, preserves the shim executable bit, and fills sha256 placeholders', () => {
    const srcRoot = buildFixtureSrc();
    const destRoot = tempDir('agent-kit-dist-');
    const pkg = { version: '1.2.3' };

    stageAgentKit({ srcRoot, destRoot, pkg });

    const manifest = JSON.parse(readFileSync(join(destRoot, 'manifest.json'), 'utf8'));

    const shimMode = statSync(join(destRoot, 'bin', 'kansoku-cli')).mode & 0o777;
    expect(shimMode & 0o111).toBe(0o111);

    const claudeHash = createHash('sha256')
      .update(readFileSync(join(srcRoot, 'templates', 'CLAUDE.md.tpl')))
      .digest('hex');
    const agentsHash = createHash('sha256')
      .update(readFileSync(join(srcRoot, 'templates', 'AGENTS.md.tpl')))
      .digest('hex');
    const envHash = createHash('sha256')
      .update(readFileSync(join(srcRoot, 'templates', 'env.tpl')))
      .digest('hex');

    expect(manifest.templates.find((t) => t.dest === 'CLAUDE.md').sha256).toBe(claudeHash);
    expect(manifest.templates.find((t) => t.dest === 'AGENTS.md').sha256).toBe(agentsHash);
    expect(manifest.templates.find((t) => t.dest === '.env').sha256).toBe(envHash);
  });

  it('produces byte-identical output across two consecutive stages', () => {
    const srcRoot = buildFixtureSrc();
    const destRoot = tempDir('agent-kit-dist-');
    const pkg = { version: '1.2.3' };

    stageAgentKit({ srcRoot, destRoot, pkg });
    const firstHash = hashTree(destRoot);

    stageAgentKit({ srcRoot, destRoot, pkg });
    const secondHash = hashTree(destRoot);

    expect(secondHash).toBe(firstHash);
  });

  it('leaves the personal.md manifest entry as the app-config sentinel', () => {
    const srcRoot = buildFixtureSrc();
    const destRoot = tempDir('agent-kit-dist-');
    const pkg = { version: '1.2.3' };

    stageAgentKit({ srcRoot, destRoot, pkg });

    const manifest = JSON.parse(readFileSync(join(destRoot, 'manifest.json'), 'utf8'));
    const personal = manifest.templates.find((t) => t.dest === 'journal/personal.md');

    expect(personal.source).toBe('app-config');
    expect(personal.sha256).toBe('app-config-v1');
  });

  it('formats kitVersion as semver plus a UTC YYYYMMDD suffix', () => {
    const srcRoot = buildFixtureSrc();
    const destRoot = tempDir('agent-kit-dist-');
    const pkg = { version: '1.2.3-beta.1' };

    stageAgentKit({ srcRoot, destRoot, pkg });

    const manifest = JSON.parse(readFileSync(join(destRoot, 'manifest.json'), 'utf8'));
    expect(manifest.kitVersion).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?\+\d{8}$/);
    expect(manifest.appVersion).toBe(pkg.version);
  });

  it('throws when a non-app-config manifest entry has no real file', () => {
    const srcRoot = buildFixtureSrcWithMissingTemplate();
    const destRoot = tempDir('agent-kit-dist-');
    const pkg = { version: '1.2.3' };

    expect(() => stageAgentKit({ srcRoot, destRoot, pkg })).toThrow(
      join(srcRoot, 'templates', 'nonexistent.md.tpl'),
    );
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import { overlayPlugin } from '../eslint/plugin.mjs';

const { dirname, join } = path;

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
});

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

interface Fixture {
  manifestPath: string;
  overlayRoot: string;
  publicRoot: string;
}

function makeFixture(): Fixture {
  const root = makeRoot('kansoku-eslint-');
  const publicRoot = join(root, 'public');
  const overlayRoot = join(publicRoot, 'apps', 'pro', 'overlays');
  mkdirSync(overlayRoot, { recursive: true });
  return {
    manifestPath: join(publicRoot, 'apps', 'pro', 'overlay.private-only.json'),
    overlayRoot,
    publicRoot,
  };
}

function writeFile(filePath: string, content = ''): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function writeManifest(fixture: Fixture, files: string[]): void {
  writeFile(fixture.manifestPath, JSON.stringify({ files }));
}

ruleTester.run('no-explicit-pro-import', overlayPlugin.rules['no-explicit-pro-import'], {
  invalid: [
    {
      code: "import { Edition } from './edition.pro.js';",
      errors: [{ data: { source: './edition.pro.js' }, messageId: 'explicitPro' }],
      filename: '/repo/pkg/entry.ts',
    },
    {
      code: "export * from './widgets.pro.js';",
      errors: [{ messageId: 'explicitPro' }],
      filename: '/repo/pkg/entry.ts',
    },
    {
      code: "export { proFeatureLabel } from './proFeature.pro.ts';",
      errors: [{ messageId: 'explicitPro' }],
      filename: '/repo/pkg/entry.ts',
    },
    {
      code: "const feature = require('./proFeature.pro.js');",
      errors: [{ messageId: 'explicitPro' }],
      filename: '/repo/pkg/entry.ts',
    },
    {
      code: "import { Edition } from './edition.pro';",
      errors: [{ data: { source: './edition.pro' }, messageId: 'explicitPro' }],
      filename: '/repo/pkg/entry.ts',
    },
  ],
  valid: [
    { code: "import { Edition } from './edition.js';", filename: '/repo/pkg/entry.ts' },
    { code: "export { widgets } from './widgets.js';", filename: '/repo/pkg/entry.ts' },
    { code: "const tools = require('./proTools.js');", filename: '/repo/pkg/entry.ts' },
    { code: "import { x } from './x.protocol.js';", filename: '/repo/pkg/entry.ts' },
    { code: "import { x } from 'some.pro';", filename: '/repo/pkg/entry.ts' },
  ],
});

ruleTester.run('no-apps-pro-import', overlayPlugin.rules['no-apps-pro-import'], {
  invalid: [
    {
      code: "import { edition } from '../../apps/pro/overlays/edition.js';",
      errors: [{ messageId: 'appsPro' }],
      filename: '/repo/packages/build-overlay/src/foo.ts',
      options: [{ publicRoot: '/repo' }],
    },
    {
      code: "import { bar } from '../pro/bar.js';",
      errors: [{ data: { source: '../pro/bar.js' }, messageId: 'appsPro' }],
      filename: '/repo/apps/other/foo.ts',
      options: [{ publicRoot: '/repo' }],
    },
  ],
  valid: [
    {
      code: "import { x } from '../other.js';",
      filename: '/repo/packages/core/src/foo.ts',
      options: [{ publicRoot: '/repo' }],
    },
    {
      code: "import { edition } from './edition.pro.js';",
      filename: '/repo/apps/pro/overlays/edition.pro.ts',
      options: [{ publicRoot: '/repo' }],
    },
    {
      code: "import { edition } from '@pro/edition.js';",
      filename: '/repo/apps/pro/overlays/edition.ts',
      options: [{ overlayRoot: '/repo/apps/pro/overlays', publicRoot: '/repo' }],
    },
  ],
});

ruleTester.run('no-self-default-import', overlayPlugin.rules['no-self-default-import'], {
  invalid: [
    {
      code: "import { Edition } from './edition.js';",
      errors: [{ data: { source: './edition.js' }, messageId: 'selfDefault' }],
      filename: '/repo/pkg/edition.pro.ts',
    },
    {
      code: "import { Edition } from './edition';",
      errors: [{ messageId: 'selfDefault' }],
      filename: '/repo/pkg/edition.pro.ts',
    },
    {
      code: "import { Edition } from './edition.js';",
      errors: [{ data: { source: './edition.js' }, messageId: 'selfDefault' }],
      filename: '/repo/apps/pro/overlays/pkg/edition.ts',
      options: [{ overlayRoot: '/repo/apps/pro/overlays', publicRoot: '/repo' }],
    },
    {
      code: "import { Edition } from './edition';",
      errors: [{ messageId: 'selfDefault' }],
      filename: '/repo/apps/pro/overlays/pkg/edition.ts',
      options: [{ overlayRoot: '/repo/apps/pro/overlays', publicRoot: '/repo' }],
    },
  ],
  valid: [
    {
      code: "import { BaseEdition } from './edition/base.js';",
      filename: '/repo/pkg/edition.pro.ts',
    },
    {
      code: "import { proFeatureLabel } from './proFeature.js';",
      filename: '/repo/pkg/edition.pro.ts',
    },
    {
      code: "import { Edition } from './edition.js';",
      filename: '/repo/pkg/edition.ts',
    },
    {
      code: "import { BaseEdition } from './edition/base.js';",
      filename: '/repo/apps/pro/overlays/pkg/edition.ts',
      options: [{ overlayRoot: '/repo/apps/pro/overlays', publicRoot: '/repo' }],
    },
  ],
});

ruleTester.run('no-escaping-import', overlayPlugin.rules['no-escaping-import'], {
  invalid: [
    {
      code: "import { x } from '/etc/passwd';",
      errors: [{ data: { source: '/etc/passwd' }, messageId: 'absolutePath' }],
      filename: '/repo/pkg/entry.ts',
      options: [{ publicRoot: '/repo' }],
    },
    {
      code: "import { x } from '../outside.js';",
      errors: [{ messageId: 'escapesPublicRoot' }],
      filename: '/repo/entry.ts',
      options: [{ publicRoot: '/repo' }],
    },
    {
      code: "import { x } from '../../../../outside.js';",
      errors: [{ data: { source: '../../../../outside.js' }, messageId: 'escapesPublicRoot' }],
      filename: '/repo/apps/pro/overlays/packages/build-overlay/legacy/edition.ts',
      options: [{ overlayRoot: '/repo/apps/pro/overlays', publicRoot: '/repo' }],
    },
  ],
  valid: [
    {
      code: "import { x } from '../shared/util.js';",
      filename: '/repo/pkg/deep/entry.ts',
      options: [{ publicRoot: '/repo' }],
    },
    {
      code: "import { x } from './sibling.js';",
      filename: '/repo/pkg/entry.ts',
    },
    {
      code: "import { x } from '../../../shared/util.js';",
      filename: '/repo/apps/pro/overlays/packages/build-overlay/legacy/edition.ts',
      options: [{ overlayRoot: '/repo/apps/pro/overlays', publicRoot: '/repo' }],
    },
  ],
});

describe('no-pro-only-resolution (fs fixtures)', () => {
  const fixture = makeFixture();
  const pkgDir = join(fixture.publicRoot, 'pkg');
  writeFile(join(pkgDir, 'sibling.ts'));
  writeFile(join(pkgDir, 'onlyPro.pro.ts'));
  writeFile(join(pkgDir, 'widgets', 'index.pro.ts'));
  writeFile(join(pkgDir, 'widgets2', 'index.ts'));
  writeFile(join(pkgDir, 'widgets2', 'index.pro.ts'));

  ruleTester.run('no-pro-only-resolution', overlayPlugin.rules['no-pro-only-resolution'], {
    invalid: [
      {
        code: "import { onlyPro } from './onlyPro.js';",
        errors: [{ data: { source: './onlyPro.js' }, messageId: 'proOnlyResolution' }],
        filename: join(pkgDir, 'entry2.ts'),
        options: [{ publicRoot: fixture.publicRoot }],
      },
      {
        code: "import { w } from './widgets';",
        errors: [{ messageId: 'proOnlyResolution' }],
        filename: join(pkgDir, 'entry4.ts'),
        options: [{ publicRoot: fixture.publicRoot }],
      },
    ],
    valid: [
      {
        code: "import { x } from './sibling.js';",
        filename: join(pkgDir, 'entry.ts'),
        options: [{ publicRoot: fixture.publicRoot }],
      },
      {
        code: "import { z } from './totallyMissing.js';",
        filename: join(pkgDir, 'entry3.ts'),
        options: [{ publicRoot: fixture.publicRoot }],
      },
      {
        code: "import { w2 } from './widgets2';",
        filename: join(pkgDir, 'entry5.ts'),
        options: [{ publicRoot: fixture.publicRoot }],
      },
      {
        code: "import { onlyPro } from './onlyPro.js';",
        filename: join(fixture.overlayRoot, 'pkg', 'entry.ts'),
        options: [{ overlayRoot: fixture.overlayRoot, publicRoot: fixture.publicRoot }],
      },
    ],
  });
});

describe('no-overlay-relative-escape (fs fixtures)', () => {
  const fixture = makeFixture();
  writeFile(join(fixture.overlayRoot, 'apps', 'web', 'src', 'pages', 'Page.tsx'));
  const options = [{ overlayRoot: fixture.overlayRoot, publicRoot: fixture.publicRoot }];

  ruleTester.run('no-overlay-relative-escape', overlayPlugin.rules['no-overlay-relative-escape'], {
    invalid: [
      {
        code: "import { s } from '../../../pro/src/ai/scheduler.js';",
        errors: [
          { data: { source: '../../../pro/src/ai/scheduler.js' }, messageId: 'useProAlias' },
        ],
        filename: join(fixture.overlayRoot, 'apps', 'desktop', 'src', 'edition', 'pro.ts'),
        options,
      },
      {
        code: "import { T } from './types.js';",
        errors: [{ data: { source: './types.js' }, messageId: 'useHostAlias' }],
        filename: join(fixture.overlayRoot, 'apps', 'desktop', 'src', 'edition', 'pro.ts'),
        options,
      },
    ],
    valid: [
      {
        code: "import { P } from '../pages/Page';",
        filename: join(fixture.overlayRoot, 'apps', 'web', 'src', 'edition', 'pro.ts'),
        options,
      },
      {
        code: "import { s } from '@pro/ai/scheduler.js';",
        filename: join(fixture.overlayRoot, 'apps', 'desktop', 'src', 'edition', 'pro.ts'),
        options,
      },
      {
        code: "import { x } from './anything.js';",
        filename: '/repo/pkg/edition.pro.ts',
        options,
      },
    ],
  });
});

describe('overlay-manifest-consistency (fs fixtures)', () => {
  const fixture = makeFixture();
  writeFile(join(fixture.publicRoot, 'pkg', 'a.ts'));
  writeFile(join(fixture.publicRoot, 'pkg', 'd.ts'));
  writeFile(join(fixture.publicRoot, 'packages', 'build-overlay', 'legacy', 'e.ts'));
  writeManifest(fixture, ['pkg/b.ts', 'pkg/d.ts']);

  const corruptFixture = makeFixture();
  writeFile(join(corruptFixture.publicRoot, 'pkg', 'a.ts'));
  writeFile(corruptFixture.manifestPath, 'not json{');

  const missingManifestFixture = makeFixture();

  const options = [
    {
      manifestPath: fixture.manifestPath,
      overlayRoot: fixture.overlayRoot,
      publicRoot: fixture.publicRoot,
    },
  ];

  ruleTester.run(
    'overlay-manifest-consistency',
    overlayPlugin.rules['overlay-manifest-consistency'],
    {
      invalid: [
        {
          code: 'export const c = 1;',
          errors: [{ data: { relPath: 'pkg/c.ts' }, messageId: 'unregisteredProOnly' }],
          filename: join(fixture.overlayRoot, 'pkg', 'c.ts'),
          options,
        },
        {
          code: 'export const d = 1;',
          errors: [{ data: { relPath: 'pkg/d.ts' }, messageId: 'misregisteredReplacement' }],
          filename: join(fixture.overlayRoot, 'pkg', 'd.ts'),
          options,
        },
        {
          code: 'export const missing = 1;',
          errors: [{ messageId: 'unregisteredProOnly' }],
          filename: join(missingManifestFixture.overlayRoot, 'pkg', 'missing.ts'),
          options: [
            {
              manifestPath: missingManifestFixture.manifestPath,
              overlayRoot: missingManifestFixture.overlayRoot,
              publicRoot: missingManifestFixture.publicRoot,
            },
          ],
        },
      ],
      valid: [
        {
          code: 'export const a = 1;',
          filename: join(fixture.overlayRoot, 'pkg', 'a.ts'),
          options,
        },
        {
          code: 'export const b = 1;',
          filename: join(fixture.overlayRoot, 'pkg', 'b.ts'),
          options,
        },
        {
          code: 'export const e = 1;',
          filename: join(fixture.overlayRoot, 'packages', 'build-overlay', 'legacy', 'e.ts'),
          options,
        },
        {
          code: 'export const a = 1;',
          filename: join(corruptFixture.overlayRoot, 'pkg', 'a.ts'),
          options: [
            {
              manifestPath: corruptFixture.manifestPath,
              overlayRoot: corruptFixture.overlayRoot,
              publicRoot: corruptFixture.publicRoot,
            },
          ],
        },
        { code: 'export const notOverlay = 1;', filename: '/repo/pkg/notOverlay.pro.ts', options },
      ],
    },
  );
});

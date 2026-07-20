import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const proFilePattern = /\.pro\.(?:[cm]?ts|tsx)$/;
const sourceExtensionPattern = /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;

const defaultExtensionCandidates = {
  '': ['.ts', '.tsx', '.mts', '.cts'],
  '.cjs': ['.cts'],
  '.cts': ['.cts'],
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.mts': ['.mts'],
  '.ts': ['.ts'],
  '.tsx': ['.tsx'],
};

const optionsSchema = [
  {
    additionalProperties: false,
    properties: {
      manifestPath: { type: 'string' },
      overlayRoot: { type: 'string' },
      publicRoot: { type: 'string' },
    },
    type: 'object',
  },
];

function isProFile(filename) {
  return proFilePattern.test(filename);
}

function within(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function effectiveDir(filename, options) {
  const dir = path.dirname(filename);
  const { overlayRoot, publicRoot } = options;
  if (overlayRoot && publicRoot && within(overlayRoot, filename)) {
    return path.join(publicRoot, path.relative(overlayRoot, dir));
  }
  return dir;
}

function splitSpecifierExtension(specifier) {
  const match = sourceExtensionPattern.exec(specifier);
  if (!match) return { ext: '', stem: specifier };
  return { ext: match[0], stem: specifier.slice(0, -match[0].length) };
}

function candidateStems(absoluteStem, ext) {
  const stems = [absoluteStem];
  if (ext === '') stems.push(path.join(absoluteStem, 'index'));
  return stems;
}

function defaultCandidatePaths(absoluteStem, ext) {
  const suffixes = defaultExtensionCandidates[ext];
  if (!suffixes) return null;
  const paths = [];
  for (const stem of candidateStems(absoluteStem, ext)) {
    for (const suffix of suffixes) paths.push(`${stem}${suffix}`);
  }
  return paths;
}

function proCandidatePaths(absoluteStem, ext) {
  const suffixes = defaultExtensionCandidates[ext];
  if (!suffixes) return null;
  const paths = [];
  for (const stem of candidateStems(absoluteStem, ext)) {
    for (const suffix of suffixes) paths.push(`${stem}.pro${suffix}`);
  }
  return paths;
}

function hasAppsProSegment(source) {
  const segments = source.split('/');
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] === 'apps' && segments[index + 1] === 'pro') return true;
  }
  return false;
}

const existsCache = new Map();
function cachedExists(target) {
  if (existsCache.has(target)) return existsCache.get(target);
  const result = existsSync(target);
  existsCache.set(target, result);
  return result;
}

const manifestCache = new Map();
function readManifestFiles(manifestPath) {
  if (!manifestPath) return [];
  if (manifestCache.has(manifestPath)) return manifestCache.get(manifestPath);
  let files = [];
  try {
    if (existsSync(manifestPath)) {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (parsed && Array.isArray(parsed.files)) files = parsed.files;
    }
  } catch {
    files = [];
  }
  manifestCache.set(manifestPath, files);
  return files;
}

function createSourceVisitor(handleSource) {
  return {
    CallExpression(node) {
      const [firstArgument] = node.arguments;
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        firstArgument?.type === 'Literal' &&
        typeof firstArgument.value === 'string'
      ) {
        handleSource(firstArgument);
      }
    },
    ExportAllDeclaration(node) {
      handleSource(node.source);
    },
    ExportNamedDeclaration(node) {
      if (node.source) handleSource(node.source);
    },
    ImportDeclaration(node) {
      handleSource(node.source);
    },
  };
}

const noExplicitProImport = {
  create(context) {
    return createSourceVisitor((sourceNode) => {
      const value = sourceNode.value;
      if (typeof value !== 'string') return;
      const isRelative = value.startsWith('.');
      if (value.includes('.pro.') || (isRelative && value.endsWith('.pro'))) {
        context.report({ data: { source: value }, messageId: 'explicitPro', node: sourceNode });
      }
    });
  },
  meta: {
    docs: { description: 'Forbid explicit imports/exports/requires of ".pro" overlay sources.' },
    messages: { explicitPro: 'Explicit ".pro" source is forbidden: {{source}}' },
    schema: optionsSchema,
    type: 'problem',
  },
};

const noAppsProImport = {
  create(context) {
    const filename = context.filename;
    if (isProFile(filename)) return {};
    const options = context.options[0] ?? {};
    const appsProRoot = options.publicRoot ? path.join(options.publicRoot, 'apps', 'pro') : null;
    return createSourceVisitor((sourceNode) => {
      const value = sourceNode.value;
      if (typeof value !== 'string' || (!value.startsWith('.') && !value.startsWith('/'))) return;
      if (hasAppsProSegment(value)) {
        context.report({ data: { source: value }, messageId: 'appsPro', node: sourceNode });
        return;
      }
      if (!value.startsWith('.') || !appsProRoot) return;
      const resolved = path.resolve(effectiveDir(filename, options), value);
      if (within(appsProRoot, resolved)) {
        context.report({ data: { source: value }, messageId: 'appsPro', node: sourceNode });
      }
    });
  },
  meta: {
    docs: { description: 'Forbid default files from importing apps/pro.' },
    messages: { appsPro: 'Importing apps/pro from a default file is forbidden: {{source}}' },
    schema: optionsSchema,
    type: 'problem',
  },
};

const noProOnlyResolution = {
  create(context) {
    const filename = context.filename;
    if (isProFile(filename)) return {};
    const options = context.options[0] ?? {};
    return createSourceVisitor((sourceNode) => {
      const value = sourceNode.value;
      if (typeof value !== 'string' || !value.startsWith('.')) return;
      const { ext, stem } = splitSpecifierExtension(value);
      const absoluteStem = path.resolve(effectiveDir(filename, options), stem);
      const defaults = defaultCandidatePaths(absoluteStem, ext);
      if (!defaults || defaults.some(cachedExists)) return;
      const pros = proCandidatePaths(absoluteStem, ext);
      if (pros?.some(cachedExists)) {
        context.report({ data: { source: value }, messageId: 'proOnlyResolution', node: sourceNode });
      }
    });
  },
  meta: {
    docs: { description: 'Forbid default files from resolving only to a .pro overlay.' },
    messages: {
      proOnlyResolution: 'Resolves only to a .pro overlay, not a default source: {{source}}',
    },
    schema: optionsSchema,
    type: 'problem',
  },
};

const noSelfDefaultImport = {
  create(context) {
    const filename = context.filename;
    if (!isProFile(filename)) return {};
    const ownStem = filename.replace(proFilePattern, '');
    return createSourceVisitor((sourceNode) => {
      const value = sourceNode.value;
      if (typeof value !== 'string' || !value.startsWith('.')) return;
      const { stem } = splitSpecifierExtension(value);
      const absoluteStem = path.resolve(path.dirname(filename), stem);
      if (absoluteStem === ownStem) {
        context.report({ data: { source: value }, messageId: 'selfDefault', node: sourceNode });
      }
    });
  },
  meta: {
    docs: { description: 'Forbid a .pro overlay from importing its own logical default.' },
    messages: { selfDefault: 'A .pro overlay must not import its own logical default: {{source}}' },
    schema: optionsSchema,
    type: 'problem',
  },
};

const overlayManifestConsistency = {
  create(context) {
    const filename = context.filename;
    const options = context.options[0] ?? {};
    const { manifestPath, overlayRoot, publicRoot } = options;
    if (!isProFile(filename) || !overlayRoot || !publicRoot || !within(overlayRoot, filename)) {
      return {};
    }
    return {
      Program(node) {
        const relPath = path.relative(overlayRoot, filename).split(path.sep).join('/');
        const defaultSibling = path
          .join(publicRoot, relPath)
          .replace(/\.pro(\.(?:[cm]?ts|tsx))$/, '$1');
        const hasDefault = cachedExists(defaultSibling);
        const inManifest = readManifestFiles(manifestPath).includes(relPath);
        if (!hasDefault && !inManifest) {
          context.report({ data: { relPath }, messageId: 'unregisteredProOnly', node });
        } else if (hasDefault && inManifest) {
          context.report({ data: { relPath }, messageId: 'misregisteredReplacement', node });
        }
      },
    };
  },
  meta: {
    docs: { description: 'Keep .pro overlays consistent with the private-only manifest.' },
    messages: {
      misregisteredReplacement:
        'Overlay has a default sibling but is registered as private-only: {{relPath}}',
      unregisteredProOnly:
        'Overlay has no default sibling and is not registered as private-only: {{relPath}}',
    },
    schema: optionsSchema,
    type: 'problem',
  },
};

const noEscapingImport = {
  create(context) {
    const filename = context.filename;
    const options = context.options[0] ?? {};
    const { publicRoot } = options;
    return createSourceVisitor((sourceNode) => {
      const value = sourceNode.value;
      if (typeof value !== 'string') return;
      if (path.isAbsolute(value)) {
        context.report({ data: { source: value }, messageId: 'absolutePath', node: sourceNode });
        return;
      }
      if (!value.startsWith('.') || !publicRoot) return;
      const resolved = path.resolve(effectiveDir(filename, options), value);
      if (!within(publicRoot, resolved)) {
        context.report({ data: { source: value }, messageId: 'escapesPublicRoot', node: sourceNode });
      }
    });
  },
  meta: {
    docs: {
      description: 'Forbid absolute-path import sources and relative sources that escape publicRoot.',
    },
    messages: {
      absolutePath: 'Absolute-path import sources are forbidden: {{source}}',
      escapesPublicRoot: 'Relative import escapes the workspace root: {{source}}',
    },
    schema: optionsSchema,
    type: 'problem',
  },
};

export const overlayPlugin = {
  meta: { name: '@kansoku/build-overlay-eslint', version: '0.0.0' },
  rules: {
    'no-apps-pro-import': noAppsProImport,
    'no-escaping-import': noEscapingImport,
    'no-explicit-pro-import': noExplicitProImport,
    'no-pro-only-resolution': noProOnlyResolution,
    'no-self-default-import': noSelfDefaultImport,
    'overlay-manifest-consistency': overlayManifestConsistency,
  },
};

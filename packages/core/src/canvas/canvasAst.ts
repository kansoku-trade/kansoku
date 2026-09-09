import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { skillSearchDirs } from '../platform/env.js';

type AstNode = { type: string; [key: string]: unknown };

export type CanvasAst = { ok: true; ast: AstNode } | { ok: false; error: string };

export function parseCanvasTsx(source: string): CanvasAst {
  try {
    return {
      ok: true,
      ast: parse(source, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      }) as unknown as AstNode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message.split('\n')[0] ?? message };
  }
}

export function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (!node || typeof node !== 'object') return;
  const current = node as AstNode;
  if (typeof current.type === 'string') visit(current);
  for (const value of Object.values(current)) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit);
    } else {
      walk(value, visit);
    }
  }
}

export function canvasImportBindings(ast: AstNode): {
  issues: string[];
  locals: Map<string, string>;
} {
  const issues: string[] = [];
  const locals = new Map<string, string>();
  walk(ast, (node) => {
    if (node.type !== 'ImportDeclaration') return;
    const source = stringLiteral(node.source);
    if (source !== '@kansoku/canvas') return;
    if (node.importKind === 'type') return;
    const specifiers = asNodes(node.specifiers);
    if (specifiers.some((spec) => spec.type === 'ImportNamespaceSpecifier')) {
      issues.push('import * from @kansoku/canvas is not allowed; use named imports');
      return;
    }
    if (specifiers.some((spec) => spec.type === 'ImportDefaultSpecifier')) {
      issues.push('default import from @kansoku/canvas is not allowed; use named imports');
      return;
    }
    for (const spec of specifiers) {
      if (spec.type !== 'ImportSpecifier' || spec.importKind === 'type') continue;
      const exported = identifierName(spec.imported) ?? identifierName(spec.local);
      const local = identifierName(spec.local);
      if (!exported || !local) continue;
      locals.set(local, exported);
    }
  });
  return { issues, locals };
}

export function jsxElements(ast: AstNode): { local: string; props: string[]; values: Record<string, unknown> }[] {
  const elements: { local: string; props: string[]; values: Record<string, unknown> }[] = [];
  walk(ast, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    const local = jsxTagName(node.name);
    if (!local || local === local.toLowerCase()) return;
    const props: string[] = [];
    const values: Record<string, unknown> = {};
    for (const attr of asNodes(node.attributes)) {
      if (attr.type !== 'JSXAttribute') continue;
      const name = jsxTagName(attr.name);
      if (!name) continue;
      props.push(name);
      values[name] = literalValue(attr.value);
    }
    elements.push({ local, props, values });
  });
  return elements;
}

export function sdkComponentProps(): Record<string, string[]> {
  if (cachedProps) return cachedProps;
  const aliases = new Map<string, AstNode>();
  const props: Record<string, string[]> = {};
  for (const file of sdkDeclarationFiles()) {
    const ast = parseDeclarationFile(file);
    if (!ast) continue;
    collectAliases(ast, aliases);
    collectFunctions(ast, aliases, props);
  }
  cachedProps = props;
  return props;
}

let cachedProps: Record<string, string[]> | undefined;

function sdkDeclarationFiles(): string[] {
  for (const dir of skillSearchDirs()) {
    const sdk = join(dir, 'canvas', 'sdk');
    if (!existsSync(sdk)) continue;
    return readdirSync(sdk)
      .filter((name) => name.endsWith('.d.ts') && name !== 'index.d.ts' && name !== 'names.d.ts')
      .map((name) => join(sdk, name));
  }
  return [];
}

function parseDeclarationFile(path: string): AstNode | undefined {
  try {
    return parse(readFileSync(path, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript'],
    }) as unknown as AstNode;
  } catch {
    return undefined;
  }
}

function collectAliases(ast: AstNode, aliases: Map<string, AstNode>): void {
  walk(ast, (node) => {
    if (node.type === 'TSTypeAliasDeclaration') {
      const name = identifierName(node.id);
      const type = asNode(node.typeAnnotation);
      if (name && type) aliases.set(name, type);
      return;
    }
    if (node.type === 'TSInterfaceDeclaration') {
      const name = identifierName(node.id);
      const body = asNode(node.body);
      if (name && body) aliases.set(name, body);
    }
  });
}

function collectFunctions(
  ast: AstNode,
  aliases: Map<string, AstNode>,
  props: Record<string, string[]>,
): void {
  walk(ast, (node) => {
    if (node.type !== 'TSDeclareFunction' && node.type !== 'FunctionDeclaration') return;
    const name = identifierName(node.id);
    if (!name || !/^[A-Z]/.test(name)) return;
    const params = asNodes(node.params);
    if (params.length === 0) {
      props[name] = [];
      return;
    }
    const type = paramType(params[0]);
    props[name] = unique(propNamesFromType(type, aliases, new Set()));
  });
}

function paramType(param: AstNode): AstNode | undefined {
  const annotation = asNode(param.typeAnnotation);
  return annotation ? asNode(annotation.typeAnnotation) : undefined;
}

function propNamesFromType(
  node: AstNode | undefined,
  aliases: Map<string, AstNode>,
  seen: Set<string>,
): string[] {
  if (!node) return [];
  if (node.type === 'TSTypeLiteral' || node.type === 'TSInterfaceBody') {
    const names: string[] = [];
    for (const member of asNodes(node.type === 'TSInterfaceBody' ? node.body : node.members)) {
      if (member.type !== 'TSPropertySignature') continue;
      const name = identifierName(member.key);
      if (name) names.push(name);
    }
    return names;
  }
  if (node.type === 'TSIntersectionType') {
    return asNodes(node.types).flatMap((type) => propNamesFromType(type, aliases, seen));
  }
  if (node.type === 'TSTypeReference') {
    const name = identifierName(node.typeName);
    if (!name || seen.has(name)) return [];
    const alias = aliases.get(name);
    if (!alias) return [];
    seen.add(name);
    return propNamesFromType(alias, aliases, seen);
  }
  return [];
}

function jsxTagName(node: unknown): string | undefined {
  const current = asNode(node);
  if (!current) return undefined;
  if (current.type === 'JSXIdentifier') return identifierName(current);
  if (current.type === 'Identifier') return identifierName(current);
  return undefined;
}

function identifierName(node: unknown): string | undefined {
  const current = asNode(node);
  return current && typeof current.name === 'string' ? current.name : undefined;
}

function stringLiteral(node: unknown): string | undefined {
  const current = asNode(node);
  return current && typeof current.value === 'string' ? current.value : undefined;
}

function literalValue(node: unknown): unknown {
  const current = asNode(node);
  if (!current) return true;
  if (current.type === 'StringLiteral' || current.type === 'NumericLiteral' || current.type === 'BooleanLiteral') {
    return current.value;
  }
  if (current.type === 'JSXExpressionContainer') return literalValue(current.expression);
  return undefined;
}

function asNode(node: unknown): AstNode | undefined {
  return node && typeof node === 'object' && typeof (node as AstNode).type === 'string'
    ? (node as AstNode)
    : undefined;
}

function asNodes(node: unknown): AstNode[] {
  return Array.isArray(node) ? node.filter((item): item is AstNode => asNode(item) !== undefined) : [];
}

function unique(names: string[]): string[] {
  return [...new Set(names)];
}

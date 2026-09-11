import { checkCanvasSource } from './check.js';
import { compileCanvasSource } from './compile.js';
import { instantiateCanvas } from './instantiate.js';
import { reviewCanvasBindings, reviewCanvasStructure } from './review.js';

export async function validateCanvasSource(source: string): Promise<string[]> {
  const issues = [
    ...checkCanvasSource(source),
    ...reviewCanvasStructure(source),
    ...reviewCanvasBindings(source),
  ];
  if (issues.length) return issues;
  const compiled = await compileCanvasSource(source);
  if (!compiled.ok) return compiled.issues;
  try {
    instantiateCanvas(compiled.code, {}, {}, {});
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  return [];
}

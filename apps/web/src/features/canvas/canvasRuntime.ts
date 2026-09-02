import * as canvasSdk from '@kansoku/canvas';
import * as React from 'react';
import { compileCanvasSource, instantiateCanvas } from '@kansoku/core/canvas/compile';

export type LoadCanvasResult =
  { ok: true; Component: React.ComponentType } | { ok: false; issues: string[] };

export function loadCanvasComponent(
  source: string,
  data: Record<string, unknown> = {},
): LoadCanvasResult {
  const compiled = compileCanvasSource(source);
  if (!compiled.ok) return compiled;
  try {
    const Component = instantiateCanvas(compiled.code, canvasSdk, React, data);
    if (typeof Component !== 'function') {
      return { ok: false, issues: ['compiled canvas did not export a component'] };
    }
    return { ok: true, Component: Component as React.ComponentType };
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

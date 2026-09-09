import * as canvasSdk from '@kansoku/canvas';
import * as React from 'react';
import { instantiateCanvas } from '@kansoku/core/canvas/instantiate';

export type LoadCanvasResult =
  { ok: true; Component: React.ComponentType } | { ok: false; issues: string[] };

export function runCompiledCanvas(
  code: string,
  data: Record<string, unknown> = {},
): LoadCanvasResult {
  try {
    const Component = instantiateCanvas(code, canvasSdk, React, data);
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

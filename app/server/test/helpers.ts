import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createKernel, type Kernel } from "../src/bootstrap.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

let kernelPromise: Promise<Kernel> | undefined;

export async function tsukiRequest(path: string, init?: RequestInit): Promise<Response> {
  kernelPromise ??= createKernel();
  const { app } = await kernelPromise;
  return app.getInstance().request(path, init);
}

export function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8")) as T;
}

const ATOL = 1e-8;
const RTOL = 1e-8;

export function approxDiff(actual: unknown, expected: unknown, path = "$"): string | null {
  if (expected === null || expected === undefined) {
    if (actual === null || actual === undefined) return null;
    return `${path}: expected ${expected}, got ${JSON.stringify(actual)}`;
  }
  if (typeof expected === "number") {
    if (typeof actual !== "number") return `${path}: expected number ${expected}, got ${JSON.stringify(actual)}`;
    if (Math.abs(actual - expected) <= ATOL + RTOL * Math.abs(expected)) return null;
    return `${path}: expected ${expected}, got ${actual}`;
  }
  if (typeof expected === "string" || typeof expected === "boolean") {
    return Object.is(actual, expected) ? null : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: expected array, got ${typeof actual}`;
    if (actual.length !== expected.length) return `${path}: expected length ${expected.length}, got ${actual.length}`;
    for (let i = 0; i < expected.length; i++) {
      const d = approxDiff(actual[i], expected[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (typeof expected === "object") {
    if (typeof actual !== "object" || actual === null) return `${path}: expected object, got ${JSON.stringify(actual)}`;
    for (const key of Object.keys(expected as Record<string, unknown>)) {
      const d = approxDiff(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (d) return d;
    }
    return null;
  }
  return `${path}: unsupported expected type ${typeof expected}`;
}

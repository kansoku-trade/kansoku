#!/usr/bin/env node
import { readFileSync } from "node:fs";

const KNOWN_FAILURES = new Set([
  "GET /:id/built clamps count to 1000",
]);

const resultsPath = process.argv[2];
if (!resultsPath) {
  console.error("usage: assert-known-test-failures.mjs <vitest-json-report-path>");
  process.exit(2);
}

const report = JSON.parse(readFileSync(resultsPath, "utf8"));
const failed = new Set();
for (const testFile of report.testResults ?? []) {
  for (const assertion of testFile.assertionResults ?? []) {
    if (assertion.status === "failed") failed.add(assertion.fullName);
  }
}

const newFailures = [...failed].filter((name) => !KNOWN_FAILURES.has(name));
const nowPassing = [...KNOWN_FAILURES].filter((name) => !failed.has(name));

if (newFailures.length > 0) {
  console.error(`server test gate FAILED: ${newFailures.length} new failure(s) not in the known-failure allowlist:`);
  for (const name of newFailures) console.error(`  - ${name}`);
  process.exit(1);
}

if (nowPassing.length > 0) {
  console.error(
    `server test gate FAILED: ${nowPassing.length} previously-known failure(s) now pass — the allowlist is stale. Remove them from KNOWN_FAILURES in this file (a conscious edit, not an auto-fix) and re-run:`,
  );
  for (const name of nowPassing) console.error(`  - ${name}`);
  process.exit(1);
}

console.log(`server test gate OK: ${failed.size} failing test(s), exactly matching the known-failure allowlist.`);

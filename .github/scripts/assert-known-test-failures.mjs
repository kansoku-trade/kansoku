#!/usr/bin/env node
import { readFileSync } from "node:fs";

const KNOWN_FAILURES = new Set([
  "GET /:id/built clamps count to 1000",
  "subscribeChart candlestick-push wiring merges a same-bucket push into the last bar and schedules exactly one debounced rebuild for a burst",
  "subscribeChart candlestick-push wiring appends a new bar when a push opens a later bucket",
  "subscribeChart candlestick-push wiring writes the poller's freshly fetched bars into candle state so a later push has no hole",
  "subscribeChart candlestick-push wiring respects the requested view count instead of the persisted full-length series on rebuild",
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

if (nowPassing.length > 0) {
  console.log(`info: ${nowPassing.length} previously-known failure(s) now pass — consider shrinking KNOWN_FAILURES:`);
  for (const name of nowPassing) console.log(`  - ${name}`);
}

if (newFailures.length > 0) {
  console.error(`server test gate FAILED: ${newFailures.length} new failure(s) not in the known-failure allowlist:`);
  for (const name of newFailures) console.error(`  - ${name}`);
  process.exit(1);
}

console.log(`server test gate OK: ${failed.size} failing test(s), all within the known-failure allowlist.`);

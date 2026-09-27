#!/usr/bin/env node
// Fails CI when any test run skipped a test: a skipped test checked nothing.
// Report formats and exit codes — USAGE below (printed when called without arguments).
import { readFileSync } from 'node:fs';

const USAGE = `usage: node scripts/assert-no-skips.mjs <report> [<report> ...]
Each report is detected by content:
  Vitest --reporter=json      numTotalTests + testResults[].assertionResults[]
  Playwright --reporter=json  stats + suites[]
  cargo test log              every "test result: ... N ignored ..." line
exit 0  every report ran >= 1 test, none skipped/todo/pending/ignored
exit 1  a skip, or a report that ran 0 tests
exit 2  no arguments, unreadable file, unrecognised format`;

const NOT_RUN = new Set(['skipped', 'pending', 'todo', 'disabled']);

function checkVitest(report) {
  const skipped = [];
  for (const file of report.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (NOT_RUN.has(a.status)) skipped.push(`${a.status}: ${a.fullName ?? a.title} (${file.name})`);
    }
  }
  // The counters catch skips the per-test list may not carry (e.g. a suite skipped as a whole).
  const counted = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
  for (let i = skipped.length; i < counted; i++) skipped.push('skipped test counted in numPendingTests/numTodoTests');
  return { kind: 'vitest', ran: (report.numTotalTests ?? 0) - counted, skipped };
}

function checkPlaywright(report) {
  const skipped = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.status === 'skipped') skipped.push(`skipped: ${spec.title} (${spec.file ?? suite.file ?? '?'})`);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  const s = report.stats ?? {};
  for (let i = skipped.length; i < (s.skipped ?? 0); i++) skipped.push('skipped test counted in stats.skipped');
  return { kind: 'playwright', ran: (s.expected ?? 0) + (s.unexpected ?? 0) + (s.flaky ?? 0), skipped };
}

function checkCargo(text) {
  const skipped = [];
  let ran = 0;
  const results = [...text.matchAll(/^test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored;/gm)];
  for (const [line, passed, failed, ignored] of results) {
    ran += Number(passed) + Number(failed);
    if (Number(ignored) > 0) skipped.push(line);
  }
  return { kind: 'cargo', ran, skipped, results: results.length };
}

function check(path) {
  const text = readFileSync(path, 'utf8');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (json && typeof json === 'object') {
    if (typeof json.numTotalTests === 'number') return checkVitest(json);
    if (json.stats && Array.isArray(json.suites)) return checkPlaywright(json);
    return null;
  }
  const cargo = checkCargo(text);
  return cargo.results > 0 ? cargo : null;
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error(USAGE);
  process.exit(2);
}

let failed = false;
for (const path of paths) {
  let result;
  try {
    result = check(path);
  } catch (e) {
    console.error(`assert-no-skips: cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  if (!result) {
    console.error(`assert-no-skips: ${path} is not a Vitest/Playwright JSON report or a cargo test log`);
    process.exit(2);
  }
  if (result.ran === 0) {
    console.error(`assert-no-skips: ${path} (${result.kind}) ran 0 tests`);
    failed = true;
  }
  if (result.skipped.length > 0) {
    console.error(`assert-no-skips: ${path} (${result.kind}) has ${result.skipped.length} not-run test(s):`);
    for (const s of result.skipped) console.error(`  ${s}`);
    failed = true;
  }
  if (result.ran > 0 && result.skipped.length === 0) {
    console.log(`assert-no-skips: ${path} (${result.kind}) ran ${result.ran}, skipped 0`);
  }
}
process.exit(failed ? 1 : 0);

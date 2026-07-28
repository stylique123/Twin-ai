#!/usr/bin/env node
// Prove the harness before trusting its verdict.
//
// The expected database was just built by applying the committed migrations, so
// its manifest MUST resolve every ledger entry. If it does not — a renamed
// object, a broken identity key, an empty census — then the guard would compare
// two empty documents and report a match. That is precisely how the previous
// implementation passed 10/10 while testing nothing, so it is checked explicitly
// and it is checked FIRST.

import { readFileSync } from 'node:fs';
import { readManifest, assertExpectedIsSane, HarnessError, redact } from './guard.mjs';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1]; };
const expectedDsn = arg('expected');
const ledgerPath = arg('ledger');
if (!expectedDsn || !ledgerPath) {
  console.error('usage: selfcheck.mjs --expected <dsn> --ledger <ledger.json>');
  process.exit(2);
}

try {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const m = readManifest(expectedDsn, JSON.stringify(ledger));
  assertExpectedIsSane(m);

  // Every ledger entry must be REPRESENTED in the manifest. A ledger key the
  // manifest silently ignores is a hole the comparison can never see through.
  const problems = [];
  if (m.tables.length !== ledger.owned_tables.length) {
    problems.push(`ledger lists ${ledger.owned_tables.length} owned tables, manifest rendered ${m.tables.length}`);
  }
  if (m.functions.length !== ledger.owned_functions.length) {
    problems.push(`ledger lists ${ledger.owned_functions.length} owned functions, manifest rendered ${m.functions.length}`);
  }
  for (const k of ['scoped_columns', 'scoped_constraints', 'scoped_policies', 'scoped_indexes']) {
    if ((m[k] || []).length !== (ledger[k] || []).length) {
      problems.push(`ledger lists ${(ledger[k] || []).length} ${k}, manifest rendered ${(m[k] || []).length}`);
    }
  }
  for (const t of ledger.scoped_triggers || []) {
    if (!(m.owned_function_triggers || []).some((x) => x.key === t)) {
      problems.push(`scoped trigger ${t} is not covered by owned_function_triggers`);
    }
  }
  // The surface must be non-trivial. An accidentally-empty manifest compares
  // equal to another accidentally-empty manifest.
  if (m.tables.length < 1 || m.functions.length < 5) {
    problems.push(`owned surface is implausibly small (${m.tables.length} tables, ${m.functions.length} functions)`);
  }
  if (problems.length) {
    console.error('SELF-CHECK FAILED:\n  - ' + problems.join('\n  - '));
    process.exit(2);
  }

  const counts = {
    tables: m.tables.length,
    columns: m.tables.reduce((a, t) => a + t.columns.length, 0),
    constraints: m.tables.reduce((a, t) => a + t.constraints.length, 0),
    indexes: m.tables.reduce((a, t) => a + t.indexes.length, 0),
    policies: m.tables.reduce((a, t) => a + t.policies.length, 0),
    table_grants: m.tables.reduce((a, t) => a + t.acl.length, 0),
    functions: m.functions.length,
    function_grants: m.functions.reduce((a, f) => a + f.acl.length, 0),
    owned_fn_triggers: m.owned_function_triggers.length,
    scoped_columns: m.scoped_columns.length,
    scoped_constraints: m.scoped_constraints.length,
    absence_assertions: m.absent_functions.length,
  };
  console.log('   self-check OK — manifest surface: ' +
    Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
} catch (err) {
  console.error(`SELF-CHECK FAILED: ${redact(err instanceof HarnessError ? err.message : (err.stack || err.message))}`);
  process.exit(2);
}

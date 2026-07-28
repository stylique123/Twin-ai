#!/usr/bin/env node
// ===========================================================================
// HOSTILE SUITE — drives the REAL guard end-to-end.
// ===========================================================================
// For every case:
//   1. clone the expected database (CREATE DATABASE ... TEMPLATE), so the target
//      starts byte-identical to a correct one;
//   2. apply the case's divergence with real DDL;
//   3. capture the clone's manifest  -> BEFORE;
//   4. run the ACTUAL guard entry point (lib/guard.mjs runGuard) against it;
//   5. assert it REJECTED, and rejected for the DECLARED reason;
//   6. capture the clone's manifest  -> AFTER;
//   7. assert BEFORE == AFTER byte-for-byte — the READ-ONLY PROOF.
//
// Plus three MUTATION CONTROLS (see runMutationControls). A suite that cannot
// fail is worse than no suite; that is exactly how the previous implementation
// scored 10/10 while never executing its own algorithm.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGuard, readManifest, compareManifests, HarnessError } from '../lib/guard.mjs';
import { cases, positiveControl } from './cases.mjs';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function cliArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}
const EXPECTED_DB = cliArg('expected-db') || 'mr_expected';
const LEDGER = cliArg('ledger');
if (!LEDGER) { console.error('hostile: --ledger is required'); process.exit(2); }

// All databases live in the disposable local cluster reached over the unix socket
// in PGHOST. There is no code path here that can address a remote server.
const dsn = (db) => `postgresql:///${db}?host=${encodeURIComponent(process.env.PGHOST)}&user=postgres`;
const EXPECTED_DSN = dsn(EXPECTED_DB);

function admin(sql, db = 'postgres') {
  return execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql, dsn(db)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function adminScript(sql, db) {
  return execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', dsn(db)],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function makeClone(name) {
  admin(`drop database if exists ${name}`);
  admin(`create database ${name} template ${EXPECTED_DB}`);
  // Per-database settings are NOT copied by TEMPLATE; restore Supabase's
  // search_path so the clone resolves identically to the original.
  admin(`alter database ${name} set search_path = pg_catalog, public, extensions`);
}
function dropClone(name) { try { admin(`drop database if exists ${name}`); } catch { /* best effort */ } }

const ledgerJson = readFileSync(LEDGER, 'utf8');
const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

const results = [];
let failures = 0;

function report(ok, id, detail) {
  results.push({ ok, id, detail });
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Assertions on a guard result.
// ---------------------------------------------------------------------------
function checkRejection(c, result) {
  if (result.ok) return `guard ACCEPTED a divergent database (expected rejection)`;
  const severities = new Set(result.findings.map((f) => f.severity));
  for (const s of c.expect.severities || []) {
    if (!severities.has(s)) {
      return `rejected, but with no ${s} finding (got: ${[...severities].join(', ') || 'none'})`;
    }
  }
  for (const m of c.expect.mentions || []) {
    if (!result.findings.some((f) => `${f.object} ${f.field}`.includes(m))) {
      return `rejected, but no finding mentions "${m}" — rejected for the wrong reason`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Case execution, including the read-only proof.
// ---------------------------------------------------------------------------
function runCase(c, i, { compare = compareManifests } = {}) {
  const db = `mr_h_${i}`;
  makeClone(db);
  try {
    if (c.sql && c.sql.trim()) adminScript(c.sql, db);

    // (3) BEFORE the guard touches it.
    const before = readManifest(dsn(db), ledgerJson);

    // (4) THE REAL GUARD. Same entry point production uses.
    const result = runGuard({
      expectedDsn: EXPECTED_DSN,
      observedDsn: dsn(db),
      ledgerPath: LEDGER,
      observedLabel: db,
      compare,
    });

    // (6) AFTER.
    const after = readManifest(dsn(db), ledgerJson);

    // (7) READ-ONLY PROOF: the guard must not have changed the target at all.
    const readOnly = sha(before) === sha(after);

    return { result, readOnly, beforeSha: sha(before), afterSha: sha(after) };
  } finally {
    dropClone(db);
  }
}

// ===========================================================================
console.log('== hostile cases: each sets up a divergent database and runs the REAL guard ==');
const caseOutcomes = [];
cases.forEach((c, i) => {
  let out;
  try {
    out = runCase(c, i);
  } catch (err) {
    report(false, c.id, `harness error: ${err instanceof HarnessError ? err.message : (err.stack || err.message)}`);
    caseOutcomes.push({ c, rejected: false });
    return;
  }
  caseOutcomes.push({ c, rejected: !out.result.ok });

  const problem = checkRejection(c, out.result);
  if (problem) { report(false, c.id, problem); return; }
  if (!out.readOnly) {
    report(false, c.id, `guard MUTATED the target database (manifest ${out.beforeSha.slice(0, 12)} -> ${out.afterSha.slice(0, 12)})`);
    return;
  }
  report(true, c.id,
    `rejected (${out.result.findings.length} findings: ${[...new Set(out.result.findings.map((f) => f.severity))].join('/')}) · target provably unchanged`);
});

// ---------------------------------------------------------------------------
console.log('\n== positive control: the guard must still ACCEPT a correct database ==');
try {
  const out = runCase(positiveControl, 900);
  if (!out.result.ok) {
    report(false, positiveControl.id,
      `guard REJECTED an untouched clone — it would reject everything, making the 24 hostile passes meaningless:\n` +
      out.result.findings.slice(0, 5).map((f) => `      [${f.severity}] ${f.object} :: ${f.field}`).join('\n'));
  } else if (!out.readOnly) {
    report(false, positiveControl.id, 'guard mutated an untouched clone');
  } else {
    report(true, positiveControl.id, 'accepted an untouched clone · target provably unchanged');
  }
} catch (err) {
  report(false, positiveControl.id, `harness error: ${err.message}`);
}

// ===========================================================================
// MUTATION CONTROLS
// ===========================================================================
console.log('\n== mutation controls: prove this suite FAILS when the guard is removed ==');

// CONTROL 1 — neuter the comparison. Every hostile case must stop rejecting.
// If a case still "passes" with the comparison gone, that case was never testing
// the guard.
{
  const neutered = () => ({ items: [], truncated: 0, length: 0 });
  let stillRejects = [];
  let survived = [];
  cases.forEach((c, i) => {
    try {
      const out = runCase(c, 1000 + i, { compare: neutered });
      if (!out.result.ok) stillRejects.push(c.id);
      // With no comparison, checkRejection must report a problem for every case.
      if (checkRejection(c, out.result) === null) survived.push(c.id);
    } catch (err) {
      // A harness error is not evidence the case has teeth; treat as survival.
      survived.push(`${c.id} (harness error: ${err.message})`);
    }
  });
  if (stillRejects.length || survived.length) {
    report(false, 'mutation-control/neutered-comparison',
      `with the comparison removed, ${survived.length} case(s) still reported PASS: ${survived.slice(0, 6).join(', ')}`);
  } else {
    report(true, 'mutation-control/neutered-comparison',
      `all ${cases.length} cases stop rejecting when compareManifests is removed — every case depends on the real guard`);
  }
}

// CONTROL 2 — neuter ONE dimension of the comparison at a time and prove the
// matching case notices. A guard that compared only names would pass a suite that
// only ever asserted "rejected"; this proves the specific fields carry the weight.
{
  const blind = (fields) => (expected, observed) => {
    const strip = (o) => JSON.parse(JSON.stringify(o), (k, v) => (fields.includes(k) ? undefined : v));
    return compareManifests(strip(expected), strip(observed));
  };
  const dimensions = [
    { fields: ['enabled'], caseId: 'disabled-trigger' },
    { fields: ['permissive'], caseId: 'permissiveness-change' },
    { fields: ['rls_enabled'], caseId: 'disabled-rls' },
    { fields: ['rls_forced'], caseId: 'forced-rls' },
    { fields: ['body', 'body_sha256'], caseId: 'changed-function' },
    { fields: ['security_definer'], caseId: 'changed-function-security-mode' },
    { fields: ['config'], caseId: 'changed-function-search-path' },
    { fields: ['not_null'], caseId: 'changed-nullability' },
    { fields: ['default'], caseId: 'changed-default' },
  ];
  const leaky = [];
  for (const d of dimensions) {
    const idx = cases.findIndex((c) => c.id === d.caseId);
    if (idx === -1) { leaky.push(`${d.caseId} (case not found)`); continue; }
    const c = cases[idx];
    try {
      const out = runCase(c, 2000 + idx, { compare: blind(d.fields) });
      // With that field blinded, this case must NO LONGER be detectable.
      if (checkRejection(c, out.result) === null) leaky.push(`${d.caseId} still passes without [${d.fields.join(',')}]`);
    } catch (err) {
      leaky.push(`${d.caseId} (harness error: ${err.message})`);
    }
  }
  if (leaky.length) {
    report(false, 'mutation-control/field-blinding',
      `${leaky.length} case(s) do not actually depend on the field they claim to test: ${leaky.join('; ')}`);
  } else {
    report(true, 'mutation-control/field-blinding',
      `${dimensions.length} manifest dimensions each proven load-bearing (blinding the field makes its case undetectable)`);
  }
}

// CONTROL 3 — prove the READ-ONLY proof itself can fail. Mutate the clone
// BETWEEN the two snapshots; the before/after equality check must trip. Without
// this, "target provably unchanged" on all 25 cases might just mean the check is
// a no-op.
{
  const db = 'mr_h_rocontrol';
  try {
    makeClone(db);
    const before = readManifest(dsn(db), ledgerJson);
    adminScript(`alter table public.source_capture_intents add column injected_by_control text;`, db);
    const after = readManifest(dsn(db), ledgerJson);
    if (sha(before) === sha(after)) {
      report(false, 'mutation-control/read-only-proof',
        'the before/after manifest comparison did NOT notice a real schema change — the read-only proof is a no-op');
    } else {
      report(true, 'mutation-control/read-only-proof',
        'a change made between the two snapshots IS detected — the read-only proof has teeth');
    }
  } catch (err) {
    report(false, 'mutation-control/read-only-proof', `harness error: ${err.message}`);
  } finally {
    dropClone(db);
  }
}

// ===========================================================================
console.log('');
const total = results.length;
const passed = total - failures;
if (failures === 0) {
  console.log(`HOSTILE-SUITE-PASSED (${passed}/${total}) — ${cases.length} divergences rejected by the real guard, ` +
              `1 positive control accepted, 3 mutation controls proved the suite can fail.`);
  process.exit(0);
}
console.log(`HOSTILE SUITE FAILED (${passed}/${total})`);
for (const r of results.filter((x) => !x.ok)) console.log(`  FAIL ${r.id}: ${r.detail}`);
process.exit(1);

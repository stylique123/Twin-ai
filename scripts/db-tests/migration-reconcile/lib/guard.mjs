#!/usr/bin/env node
// ===========================================================================
// THE MIGRATION-RECONCILE GUARD — the real algorithm.
// ===========================================================================
// Reads the canonical semantic manifest from an EXPECTED database and an
// OBSERVED database, compares them, and FAILS CLOSED on any difference:
// missing, modified, OR ADDITIVE.
//
// This is the entry point. The hostile suite drives THIS function end-to-end
// against real divergent databases — it does not poke a fingerprint helper. The
// previous guard's tests mutated a fixture and asserted a hash changed, which is
// how it scored 10/10 while never once executing its own comparison.
//
// READ-ONLY BY CONSTRUCTION:
//   * the only SQL this module ever sends is sql/30_manifest.sql, one SELECT;
//   * every psql invocation sets default_transaction_read_only = on, so the
//     SERVER rejects a write even if the file were tampered with;
//   * hostile/run.mjs additionally captures a manifest before and after each
//     guard run and asserts byte equality, proving the guard changed nothing.
//
// Exit codes: 0 exact match | 1 drift (fail closed) | 2 harness/config error.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_SQL = path.join(HERE, '..', 'sql', '30_manifest.sql');

export const EXIT_MATCH = 0;
export const EXIT_DRIFT = 1;
export const EXIT_HARNESS = 2;

// Bounds on the emitted diff, so a wholly-unrelated database produces a readable
// report instead of a megabyte of noise.
const MAX_FINDINGS = 60;
const MAX_VALUE_CHARS = 240;

// ---------------------------------------------------------------------------
// Manifest acquisition — read-only, identical SQL on both sides.
// ---------------------------------------------------------------------------
export function readManifest(dsn, ledgerJson) {
  let out;
  try {
    out = execFileSync(
      'psql',
      [
        '-X',                       // ignore ~/.psqlrc: no user setting may alter the read
        '-q', '-tA',
        '-v', 'ON_ERROR_STOP=1',
        '-v', `ledger=${ledgerJson}`,
        '-f', MANIFEST_SQL,
        dsn,
      ],
      {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: {
          ...process.env,
          // The server refuses any write in this session, whatever the SQL says.
          PGOPTIONS: `${process.env.PGOPTIONS ? process.env.PGOPTIONS + ' ' : ''}-c default_transaction_read_only=on`,
          PGCLIENTENCODING: 'UTF8',
          LC_ALL: 'C',
          LANG: 'C',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (err) {
    // NEVER echo the DSN — it carries the staging password.
    const stderr = String(err.stderr || err.message || '');
    throw new HarnessError(`failed to read manifest: ${redact(stderr).slice(0, 800)}`);
  }
  try {
    return JSON.parse(out);
  } catch {
    throw new HarnessError('manifest query did not return parseable JSON');
  }
}

export class HarnessError extends Error {}

// Defence in depth against a stack trace or a psql error leaking a credential or
// the staging endpoint. Applied to EVERY error path that can reach stdout/stderr.
export function redact(s) {
  return String(s)
    .replace(/postgres(?:ql)?:\/\/[^\s'"]*/gi, 'postgresql://[REDACTED]')
    .replace(/password=[^\s'"]*/gi, 'password=[REDACTED]')
    // psql spells the endpoint out in connection errors ("could not translate
    // host name \"...\"", "connection to server at \"...\""). Not a credential,
    // but not something to print into a CI log either.
    .replace(/(host name|server at|host)\s+"[^"]*"/gi, '$1 "[REDACTED]"')
    // Supabase tokens / JWTs.
    .replace(/\b(sb[a-z]*_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_.-]{20,})\b/g, '[REDACTED]');
}

// ---------------------------------------------------------------------------
// Comparison. Every collection is compared BY KEY, never by position, so a
// finding names the object rather than an array index.
// ---------------------------------------------------------------------------
const MISSING = 'MISSING';    // in expected, absent from observed
const ADDITIVE = 'ADDITIVE';  // in observed, absent from expected
const MODIFIED = 'MODIFIED';  // in both, semantically different

function clip(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s === undefined) return 'undefined';
  return s.length > MAX_VALUE_CHARS ? `${s.slice(0, MAX_VALUE_CHARS)}… (${s.length} chars)` : s;
}

class Findings {
  constructor() { this.items = []; this.truncated = 0; }
  add(severity, object, field, expected, observed) {
    if (this.items.length >= MAX_FINDINGS) { this.truncated += 1; return; }
    this.items.push({ severity, object, field, expected: clip(expected), observed: clip(observed) });
  }
  get length() { return this.items.length + this.truncated; }
}

// Compare two keyed collections. `keyFn` extracts the identity; `fields` are the
// scalar fields compared when a key exists on both sides; `nested` describes
// sub-collections to recurse into.
function diffKeyed(f, label, expList, obsList, keyFn, fields, nested = []) {
  const e = new Map((expList || []).map((x) => [keyFn(x), x]));
  const o = new Map((obsList || []).map((x) => [keyFn(x), x]));
  for (const [k, ev] of e) {
    if (!o.has(k)) { f.add(MISSING, `${label} ${k}`, '(object)', 'present', 'ABSENT'); continue; }
    const ov = o.get(k);
    for (const field of fields) {
      const a = ev[field], b = ov[field];
      if (JSON.stringify(a) !== JSON.stringify(b)) f.add(MODIFIED, `${label} ${k}`, field, a, b);
    }
    for (const n of nested) {
      diffKeyed(f, `${label} ${k} › ${n.label}`, ev[n.prop], ov[n.prop], n.key, n.fields, n.nested || []);
    }
  }
  for (const k of o.keys()) {
    if (!e.has(k)) f.add(ADDITIVE, `${label} ${k}`, '(object)', 'ABSENT', 'PRESENT — not created by any committed migration');
  }
}

const byName = (x) => x.name;
const byKey = (x) => x.key;
const aclKey = (x) => `${x.grantee}:${x.privilege}`;

export function compareManifests(expected, observed) {
  const f = new Findings();

  if (expected.manifest_version !== observed.manifest_version) {
    f.add(MODIFIED, 'manifest', 'manifest_version', expected.manifest_version, observed.manifest_version);
  }

  // Schemas hosting owned objects: ownership and ACL.
  diffKeyed(f, 'schema', expected.schemas, observed.schemas, byName, ['owner'], [
    { label: 'grant', prop: 'acl', key: aclKey, fields: ['grantee', 'privilege'] },
  ]);

  // ZONE A — owned tables, complete surface, additive-strict.
  diffKeyed(
    f, 'table',
    expected.tables, observed.tables,
    (t) => `${t.schema}.${t.table}`,
    ['owner', 'persistence', 'rls_enabled', 'rls_forced', 'replica_identity'],
    [
      { label: 'column', prop: 'columns', key: byName,
        fields: ['type', 'not_null', 'default', 'identity', 'generated', 'collation'] },
      { label: 'constraint', prop: 'constraints', key: byName,
        fields: ['type', 'definition', 'deferrable', 'deferred', 'validated'] },
      { label: 'index', prop: 'indexes', key: byName,
        fields: ['definition', 'unique', 'primary', 'valid', 'replica_identity'] },
      { label: 'policy', prop: 'policies', key: byName,
        fields: ['command', 'permissive', 'roles', 'using', 'with_check'] },
      { label: 'trigger', prop: 'triggers', key: byName,
        fields: ['definition', 'function', 'enabled'] },
      { label: 'grant', prop: 'acl', key: aclKey,
        fields: ['grantee', 'grantor', 'privilege', 'grantable'] },
    ],
  );

  // Owned functions: identity, signature, body, and every security-relevant flag.
  diffKeyed(
    f, 'function',
    expected.functions, observed.functions,
    (x) => x.identity,
    ['identity_args', 'result', 'language', 'owner', 'volatility', 'parallel', 'strict',
     'returns_set', 'security_definer', 'leakproof', 'config', 'body_sha256'],
    [{ label: 'grant', prop: 'acl', key: aclKey, fields: ['grantee', 'privilege', 'grantable'] }],
  );

  // ZONE B — named attachments on pre-existing tables.
  diffKeyed(f, 'scoped column', expected.scoped_columns, observed.scoped_columns, byKey,
    ['present', 'type', 'not_null', 'default', 'identity', 'generated']);
  diffKeyed(f, 'scoped constraint', expected.scoped_constraints, observed.scoped_constraints, byKey,
    ['present', 'type', 'definition', 'validated']);
  diffKeyed(f, 'scoped policy', expected.scoped_policies, observed.scoped_policies, byKey,
    ['present', 'command', 'permissive', 'roles', 'using', 'with_check']);
  diffKeyed(f, 'scoped index', expected.scoped_indexes, observed.scoped_indexes, byKey,
    ['present', 'definition', 'unique', 'valid']);

  // CROSS-ZONE — every trigger anywhere bound to an owned function. This is the
  // rule that catches an EXTRA trigger on a pre-existing table.
  diffKeyed(f, 'owned-function trigger', expected.owned_function_triggers, observed.owned_function_triggers,
    byKey, ['definition', 'function', 'enabled']);

  diffKeyed(f, 'sequence', expected.sequences, observed.sequences, byKey,
    ['present', 'owner', 'data_type', 'start', 'increment', 'min', 'max', 'cache', 'cycle', 'owned_by', 'acl']);

  // Objects the migrations dropped and must stay dropped. Classified ADDITIVE
  // rather than MODIFIED: a resurrected one-shot helper IS an extra object, and
  // an auditor scanning severities should see it grouped with the other additive
  // drift rather than buried among field changes.
  {
    const eAbs = new Map((expected.absent_functions || []).map((x) => [x.key, x]));
    const oAbs = new Map((observed.absent_functions || []).map((x) => [x.key, x]));
    for (const [k, ev] of eAbs) {
      const ov = oAbs.get(k);
      if (!ov) { f.add(MISSING, `absent-function assertion ${k}`, '(assertion)', 'evaluated', 'NOT EVALUATED'); continue; }
      if (ev.present !== ov.present) {
        f.add(ov.present ? ADDITIVE : MISSING, `function ${k}`, '(dropped by migration)',
          ev.present ? 'present' : 'ABSENT — dropped by 0091 after use',
          ov.present ? 'PRESENT — a function the migration drops still exists' : 'ABSENT');
      }
    }
  }

  // Unresolvable ledger entries on the observed side are MISSING objects.
  for (const t of observed.missing_tables || []) {
    f.add(MISSING, `table ${t}`, '(object)', 'present', 'ABSENT — owned table does not exist');
  }
  for (const fn of observed.missing_functions || []) {
    f.add(MISSING, `function ${fn}`, '(object)', 'present', 'ABSENT — owned function does not exist');
  }
  // Extra overloads of an owned function name.
  for (const fn of observed.extra_function_overloads || []) {
    if (!(expected.extra_function_overloads || []).includes(fn)) {
      f.add(ADDITIVE, `function ${fn}`, '(overload)', 'ABSENT', 'PRESENT — extra overload of an owned function name');
    }
  }

  return f;
}

// ---------------------------------------------------------------------------
// Internal consistency: the EXPECTED manifest was just built by applying the
// committed migrations, so it MUST be self-consistent. If it is not, the harness
// is broken — and a broken harness that reports "match" is exactly the failure
// this rewrite exists to eliminate. Distinguish it from real drift.
// ---------------------------------------------------------------------------
export function assertExpectedIsSane(expected) {
  const problems = [];
  if ((expected.missing_tables || []).length) problems.push(`missing_tables: ${expected.missing_tables.join(', ')}`);
  if ((expected.missing_functions || []).length) problems.push(`missing_functions: ${expected.missing_functions.join(', ')}`);
  if (!expected.tables?.length) problems.push('no owned tables in the expected manifest');
  if (!expected.functions?.length) problems.push('no owned functions in the expected manifest');
  for (const c of expected.scoped_columns || []) if (!c.present) problems.push(`scoped column absent after apply: ${c.key}`);
  for (const c of expected.scoped_constraints || []) if (!c.present) problems.push(`scoped constraint absent after apply: ${c.key}`);
  for (const a of expected.absent_functions || []) if (a.present) problems.push(`function asserted absent still exists after apply: ${a.key}`);
  if (problems.length) {
    throw new HarnessError(`the EXPECTED manifest is not self-consistent:\n  - ${problems.join('\n  - ')}`);
  }
}

// ---------------------------------------------------------------------------
// The guard.
// ---------------------------------------------------------------------------
// `compare` is injectable for ONE reason: the hostile suite's mutation control
// re-runs every case with the comparison NEUTERED, to prove each case's rejection
// actually comes from this guard and not from something incidental. Production
// callers never pass it.
export function runGuard({ expectedDsn, observedDsn, ledgerPath, observedLabel = 'observed',
                           compare = compareManifests }) {
  const ledgerJson = readFileSync(ledgerPath, 'utf8');

  const expected = readManifest(expectedDsn, ledgerJson);
  assertExpectedIsSane(expected);

  const observed = readManifest(observedDsn, ledgerJson);

  const findings = compare(expected, observed);
  return {
    ok: findings.length === 0,
    findings: findings.items,
    truncated: findings.truncated,
    observedLabel,
    expected,
    observed,
  };
}

export function formatReport(result) {
  const lines = [];
  if (result.ok) {
    lines.push(`EXACT MATCH — the ${result.observedLabel} database matches the committed migrations 0090-0093.`);
    lines.push(`  owned tables:    ${result.expected.tables.length}`);
    lines.push(`  owned functions: ${result.expected.functions.length}`);
    lines.push(`  owned-fn triggers: ${result.expected.owned_function_triggers.length}`);
    return lines.join('\n');
  }
  const by = (s) => result.findings.filter((x) => x.severity === s).length;
  lines.push(`DRIFT DETECTED — refusing to repair the ledger.`);
  lines.push(`  ${by(MISSING)} missing, ${by(MODIFIED)} modified, ${by(ADDITIVE)} additive` +
             (result.truncated ? ` (+${result.truncated} more, report truncated)` : ''));
  lines.push('');
  for (const x of result.findings) {
    lines.push(`  [${x.severity}] ${x.object} :: ${x.field}`);
    lines.push(`      expected: ${x.expected}`);
    lines.push(`      observed: ${x.observed}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function cliArg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const expectedDsn = cliArg('expected');
  const observedDsn = cliArg('observed');
  const ledgerPath = cliArg('ledger');
  const jsonOut = cliArg('json');
  const label = cliArg('label', 'observed');
  if (!expectedDsn || !observedDsn || !ledgerPath) {
    console.error('usage: guard.mjs --expected <dsn> --observed <dsn> --ledger <ledger.json> [--json out.json] [--label name]');
    process.exit(EXIT_HARNESS);
  }
  try {
    const result = runGuard({ expectedDsn, observedDsn, ledgerPath, observedLabel: label });
    console.log(formatReport(result));
    if (jsonOut) {
      writeFileSync(jsonOut, JSON.stringify(
        { ok: result.ok, findings: result.findings, truncated: result.truncated }, null, 2) + '\n');
    }
    process.exit(result.ok ? EXIT_MATCH : EXIT_DRIFT);
  } catch (err) {
    if (err instanceof HarnessError) {
      console.error(`HARNESS ERROR: ${redact(err.message)}`);
      process.exit(EXIT_HARNESS);
    }
    console.error(`HARNESS ERROR: ${redact(err.stack || err.message)}`);
    process.exit(EXIT_HARNESS);
  }
}

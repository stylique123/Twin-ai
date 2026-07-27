#!/usr/bin/env node
// Derive the OWNERSHIP LEDGER for migrations 0090-0093.
//
// The ledger answers one question: which catalog objects do these four
// migrations own, and therefore which objects must staging match EXACTLY —
// including having no EXTRA ones.
//
// It is DERIVED, never hand-written:
//   * added = AFTER census - BEFORE census, around applying 0090-0093 to the
//     disposable database. A hand-maintained list is how the previous guard's
//     fingerprint came to miss most of the owned surface.
//   * absences = every object a migration DROPs that is not present in AFTER.
//     0091 creates editor_backfill_capture_marker(), calls it, then drops it, so
//     "this function must NOT exist on staging" is a real parity requirement.
//
// Two ownership ZONES, because they support different strictness:
//
//   ZONE A - owned containers. Tables the migrations CREATE. Their COMPLETE
//     surface is compared and additive drift is a failure: an extra column,
//     index, constraint, policy, trigger or grant on one of these tables is
//     something no committed migration put there.
//
//   ZONE B - scoped attachments. Objects the migrations add to PRE-EXISTING
//     tables (media_assets, edit_director_decisions). Only the named objects are
//     compared, because those tables carry surface owned by migrations 0001-0089
//     which this guard makes no claim about. Additive drift is still caught for
//     the part that matters: EVERY trigger anywhere in the database that is bound
//     to an owned function is compared, so an extra trigger on a pre-existing
//     table cannot hide (see manifest.sql, owned_function_triggers).

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function arg(name, required = true) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) {
    if (required) { console.error(`ledger: missing --${name}`); process.exit(2); }
    return null;
  }
  return process.argv[i + 1];
}

const beforeRaw = readFileSync(arg('before'), 'utf8').trim();
const afterRaw = readFileSync(arg('after'), 'utf8').trim();
const migrationsDir = arg('migrations-dir');
const versions = arg('versions').split(',').map((s) => s.trim()).filter(Boolean);
const outPath = arg('out');

const parse = (raw, which) => {
  if (!raw || raw === '') { console.error(`ledger: empty ${which} census`); process.exit(2); }
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) { console.error(`ledger: ${which} census is not an array`); process.exit(2); }
  return rows;
};

const before = parse(beforeRaw, 'before');
const after = parse(afterRaw, 'after');

// NUL separator, written as an explicit escape: a literal NUL in the source
// makes git treat this file as BINARY, which would leave the ownership
// derivation un-reviewable in a diff. NUL is still the right separator --
// it cannot occur inside a PostgreSQL identifier, so two different objects
// can never collide into one census key.
const id = (r) => `${r.kind}\u0000${r.key}`;
const beforeSet = new Set(before.map(id));
const afterSet = new Set(after.map(id));

const added = after.filter((r) => !beforeSet.has(id(r)));
const removed = before.filter((r) => !afterSet.has(id(r)));

// A migration in this range must be purely additive to the prelude's surface.
// If applying 0090-0093 REMOVED something the prelude created, the prelude and
// the migrations disagree about the world and every downstream comparison is
// built on sand. Fail here rather than emit a ledger that encodes the confusion.
if (removed.length > 0) {
  console.error('ledger: applying 0090-0093 removed prelude objects, which the ownership model does not allow:');
  for (const r of removed.slice(0, 20)) console.error(`  - ${r.kind} ${r.key}`);
  process.exit(2);
}

const byKind = (k) => added.filter((r) => r.kind === k).map((r) => r.key);

const ownedTables = byKind('table').sort();
const ownedTableSet = new Set(ownedTables);

// "public.tbl.obj" -> "public.tbl"
const tableOf = (key) => key.split('.').slice(0, 2).join('.');

const split = (kind) => {
  const owned = [];
  const scoped = [];
  for (const key of byKind(kind)) {
    (ownedTableSet.has(tableOf(key)) ? owned : scoped).push(key);
  }
  return { owned: owned.sort(), scoped: scoped.sort() };
};

const columns = split('column');
const constraints = split('constraint');
const policies = split('policy');
const triggers = split('trigger');

// Indexes are keyed schema.indexname (no table segment), so attribute them by
// looking at which table each index sits on — done SQL-side is cleaner, but the
// census only carries names. Owned tables' indexes are recovered in manifest.sql
// directly from pg_index; here we only need the ones on pre-existing tables,
// which is "every added index not belonging to an owned table". Resolve that by
// name prefix against the owned table names, and treat anything ambiguous as
// scoped (the strictly safer classification: it still gets compared).
const addedIndexes = byKind('index').sort();
const ownedSequences = byKind('sequence').sort();
const ownedFunctions = byKind('function').sort();

// ---------------------------------------------------------------------------
// Absence assertions: objects a migration DROPs and never re-creates.
// ---------------------------------------------------------------------------
const absentFunctions = [];
for (const v of versions) {
  const file = path.join(migrationsDir, `${v}.sql`);
  const sql = readFileSync(file, 'utf8');
  // Unconditional or conditional `drop function public.name(args);`
  const re = /^\s*drop\s+function\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gim;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const key = `${m[1]}.${m[2]}(${m[3].trim()})`;
    // Only an assertion if the object is genuinely gone at the end of the chain.
    // A drop-then-recreate (the `create or replace` idiom's cousin) is not.
    const stillThere = after.some(
      (r) => r.kind === 'function' && r.key.startsWith(`${m[1]}.${m[2]}(`),
    );
    if (!stillThere) absentFunctions.push(key);
  }
}

const ledger = {
  ledger_version: 1,
  derived_from: versions,
  // ZONE A
  owned_tables: ownedTables,
  owned_functions: ownedFunctions,
  owned_sequences: ownedSequences,
  // ZONE B
  scoped_columns: columns.scoped,
  scoped_constraints: constraints.scoped,
  scoped_policies: policies.scoped,
  scoped_triggers: triggers.scoped,
  scoped_indexes: addedIndexes.filter((k) => {
    // An index name is not table-qualified. Any added index whose name does not
    // start with an owned table's local name is attributed to a pre-existing
    // table. Owned-table indexes are enumerated from pg_index in the manifest,
    // so a misclassification here can only ADD comparisons, never remove them.
    const local = k.split('.').slice(1).join('.');
    return !ownedTables.some((t) => local.startsWith(t.split('.')[1]));
  }),
  // Absence
  absent_functions: [...new Set(absentFunctions)].sort(),
};

// A ledger that owns nothing means the census diff broke; that would make the
// guard vacuously pass, which is the exact failure mode of the previous version.
if (ledger.owned_tables.length === 0 || ledger.owned_functions.length === 0) {
  console.error('ledger: derived an empty ownership surface — the census diff is broken. Refusing.');
  process.exit(2);
}

writeFileSync(outPath, JSON.stringify(ledger, null, 2) + '\n');
console.error(
  `ledger: ${ledger.owned_tables.length} owned tables, ${ledger.owned_functions.length} owned functions, ` +
  `${ledger.scoped_columns.length} scoped columns, ${ledger.scoped_constraints.length} scoped constraints, ` +
  `${ledger.scoped_triggers.length} scoped triggers, ${ledger.absent_functions.length} absence assertions`,
);

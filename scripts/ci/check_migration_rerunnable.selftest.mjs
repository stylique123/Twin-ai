#!/usr/bin/env node
// The guard's own falsification suite. Every case is a spelling that either
// appeared in this repo or would have been reported wrongly by an earlier
// version of the scanner.
import { findingsIn, guardedNames, stripComments, scanAll } from './migration_rerunnable_scan.mjs'
import { reconcile, loadDebt } from './check_migration_rerunnable.mjs'

let pass = 0, fail = 0
const eq = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : (fail++, console.error(`FAIL ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`))
}
const found = (sql) => findingsIn(sql).map((f) => `${f.kind}:${f.name}`)

// ── the defect, in all three of its names ────────────────────────────────────
eq('bare add constraint', found(`alter table public.t add constraint c check (x > 0);`), ['constraint:c'])
eq('bare create trigger', found(`create trigger g before update on public.t for each row execute function f();`), ['trigger:g'])
eq('bare create policy', found(`create policy "own rows read" on public.t for select using (true);`), ['policy:own rows read'])
eq('bare create policy, unquoted', found(`create policy own_read on public.t for select using (true);`), ['policy:own_read'])

// ── the rescues ──────────────────────────────────────────────────────────────
eq('constraint drop-then-add',
  found(`alter table public.t drop constraint if exists c;
         alter table public.t add constraint c check (x > 0);`), [])
eq('trigger drop-then-create',
  found(`drop trigger if exists g on public.t;
         create trigger g before update on public.t for each row execute function f();`), [])
eq('policy drop-then-create',
  found(`drop policy if exists "own rows read" on public.t;
         create policy "own rows read" on public.t for select using (true);`), [])

// ⚠️ `create or replace trigger` IS re-runnable. Reporting it would push people
// toward a needless drop, and looks enough like an oversight to be worth a test.
eq('create or replace trigger is not an offence',
  found(`create or replace trigger g before update on public.t for each row execute function f();`), [])

// ⚠️ ORDER IS THE WHOLE POINT. A drop AFTER the create rescues nothing -- the
// create has already raised. An offset-blind check calls this clean.
eq('a drop AFTER the create rescues nothing',
  found(`alter table public.t add constraint c check (x > 0);
         alter table public.t drop constraint if exists c;`), ['constraint:c'])
eq('a drop for a DIFFERENT name rescues nothing',
  found(`drop policy if exists "other" on public.t;
         create policy "own rows read" on public.t for select using (true);`), ['policy:own rows read'])
eq('drop without IF EXISTS rescues nothing',
  found(`alter table public.t drop constraint c;
         alter table public.t add constraint c check (x > 0);`), ['constraint:c'])

// ── the two do-block guard spellings, both real in this repo ─────────────────
eq('0030 spelling: pg_constraint where conname',
  found(`do $$ begin
           if not exists (select 1 from pg_constraint where conname = 'c') then
             alter table public.t add constraint c check (x > 0);
           end if;
         end $$;`), [])
// ⚠️ REPORTED AS A DEFECT BY THE FIRST REGEX, which required `where` directly
// before `conname`. 0138 is real and correct.
eq('0138 spelling: conrelid AND conname',
  found(`do $$ begin
           if exists (select 1 from pg_constraint
                       where conrelid = 'public.t'::regclass and conname = 'c') then
             return;
           end if;
           alter table public.t add constraint c foreign key (a) references b(id);
         end $$;`), [])
// ⚖️ AND THE BROADENING MUST NOT BECOME A LOOPHOLE.
eq('conname compared without pg_constraint is not a guard',
  found(`select conname = 'c' from something_else;
         alter table public.t add constraint c check (x > 0);`), ['constraint:c'])

// ── comments are not SQL ─────────────────────────────────────────────────────
eq('a commented-out create is not an offence',
  found(`-- create policy "own rows read" on public.t for select using (true);`), [])
eq('a commented-out drop does not rescue a real create',
  found(`-- drop policy if exists "own rows read" on public.t;
         create policy "own rows read" on public.t for select using (true);`), ['policy:own rows read'])
eq('a block comment is not SQL', found(`/* alter table public.t add constraint c check (1=1); */`), [])
// ⚠️ A `--` INSIDE A LITERAL IS NOT A COMMENT. Truncating there swallows the
// rest of a real statement and hides whatever followed it.
eq('a double dash inside a literal does not truncate',
  found(`alter table public.t add constraint c check (note <> 'a--b');
         alter table public.t add constraint d check (x > 0);`), ['constraint:c', 'constraint:d'])

// ── the ratchet itself ───────────────────────────────────────────────────────
const f = (key) => ({ key, kind: 'policy', name: 'n', file: 'x.sql' })
eq('a recorded finding is allowed',
  reconcile([f('a')], new Set(['a'])), { added: [], stale: [] })
eq('an UNRECORDED finding is new debt',
  reconcile([f('b')], new Set(['a'])).added.map((x) => x.key), ['b'])
// ⚖️ AN EXEMPTION THAT OUTLIVES ITS DEFECT IS A HOLE WITH A PLAUSIBLE NAME.
eq('a recorded entry matching nothing is stale',
  reconcile([], new Set(['a'])).stale, ['a'])
eq('the inventory does not silently absorb a new finding',
  reconcile([f('a'), f('b')], new Set(['a'])).added.map((x) => x.key), ['b'])

// ── helpers keep their own contracts ─────────────────────────────────────────
eq('stripComments leaves the statement',
  stripComments(`alter table t -- why\n  add constraint c check (1=1);`).includes('add constraint c'), true)
eq('guardedNames is empty without pg_constraint', [...guardedNames(`conname = 'c'`)], [])

// ── and the repo reconciles exactly ──────────────────────────────────────────
const { scanned, findings } = scanAll()
const { added, stale } = reconcile(findings, loadDebt())
eq('no new bare creates in the repo', added.map((a) => a.key), [])
eq('no stale entries in the inventory', stale, [])
// ⚠️ THE CONSTRAINT CLASS IS CLOSED AND MUST STAY CLOSED. If a constraint ever
// appears in the inventory, the ratchet has been used to re-open a finished
// class rather than to hold a line.
eq('zero constraints outstanding', findings.filter((x) => x.kind === 'constraint').map((x) => x.key), [])
if (scanned < 100) { fail++; console.error(`FAIL scan found only ${scanned} migrations -- is the path right?`) } else pass++

console.log(`migration-rerunnable selftest: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

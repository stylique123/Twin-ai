#!/usr/bin/env node
// The guard's own falsification suite. Every case is a spelling that either
// appeared in this repo or would have been reported wrongly by an earlier
// version of the regex.
import { unrescuedConstraints, guardedNames, stripComments, scan } from './check_migration_rerunnable.mjs'

let pass = 0, fail = 0
const names = (sql) => unrescuedConstraints(sql).map((b) => b.name)
const eq = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : (fail++, console.error(`FAIL ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`))
}

// --- the defect itself -------------------------------------------------------
eq('a bare add is an offence',
  names(`alter table public.t add constraint c check (x > 0);`), ['c'])

eq('drop-then-add is re-runnable',
  names(`alter table public.t drop constraint if exists c;
         alter table public.t add constraint c check (x > 0);`), [])

// ⚠️ ORDER IS THE WHOLE POINT. A drop after the add rescues nothing -- the add
// has already raised. An offset-blind check would call this clean.
eq('a drop AFTER the add rescues nothing',
  names(`alter table public.t add constraint c check (x > 0);
         alter table public.t drop constraint if exists c;`), ['c'])

eq('a drop for a DIFFERENT name rescues nothing',
  names(`alter table public.t drop constraint if exists other;
         alter table public.t add constraint c check (x > 0);`), ['c'])

eq('drop without IF EXISTS rescues nothing',
  names(`alter table public.t drop constraint c;
         alter table public.t add constraint c check (x > 0);`), ['c'])

// --- the two guard-block spellings, both real in this repo -------------------
eq('0030 spelling: pg_constraint where conname',
  names(`do $$ begin
           if not exists (select 1 from pg_constraint where conname = 'c') then
             alter table public.t add constraint c check (x > 0);
           end if;
         end $$;`), [])

// ⚠️ THIS ONE WAS REPORTED AS A DEFECT BY THE FIRST VERSION OF THE REGEX,
// which required `where` immediately before `conname`. 0138 is real and correct.
eq('0138 spelling: conrelid AND conname',
  names(`do $$ begin
           if exists (select 1 from pg_constraint
                       where conrelid = 'public.t'::regclass and conname = 'c') then
             return;
           end if;
           alter table public.t add constraint c foreign key (a) references b(id);
         end $$;`), [])

// ⚖️ AND THE BROADENING MUST NOT BECOME A LOOPHOLE. `conname = 'c'` in a file
// that never consults pg_constraint is not a guard -- it is a coincidence.
eq('conname compared without pg_constraint is not a guard',
  names(`-- see also conname = 'c' in the docs
         select conname = 'c' from something_else;
         alter table public.t add constraint c check (x > 0);`), ['c'])

// --- comments are not SQL ----------------------------------------------------
eq('a commented-out add is not an offence',
  names(`-- alter table public.t add constraint c check (x > 0);`), [])

eq('a commented-out drop does not rescue a real add',
  names(`-- alter table public.t drop constraint if exists c;
         alter table public.t add constraint c check (x > 0);`), ['c'])

eq('a block comment is not SQL',
  names(`/* alter table public.t add constraint c check (x > 0); */`), [])

// ⚠️ A `--` INSIDE A STRING LITERAL IS NOT A COMMENT. Truncating there would
// swallow the rest of a real statement and hide whatever followed it.
eq('a double dash inside a literal does not truncate',
  names(`alter table public.t add constraint c check (note <> 'a--b');
         alter table public.t add constraint d check (x > 0);`), ['c', 'd'])

// --- helpers keep their own contracts ---------------------------------------
eq('stripComments leaves the statement',
  stripComments(`alter table t -- why\n  add constraint c check (1=1);`).includes('add constraint c'), true)
eq('guardedNames is empty without pg_constraint',
  [...guardedNames(`conname = 'c'`)], [])

// --- and the repo itself is clean -------------------------------------------
const { scanned, offenders } = scan()
eq('every migration in this repo is re-runnable', offenders.map((o) => o.file), [])
if (scanned < 100) { fail++; console.error(`FAIL scan found only ${scanned} migrations — is the path right?`) } else pass++

console.log(`migration-rerunnable selftest: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

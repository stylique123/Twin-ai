// A SECURITY DEFINER FUNCTION IS CALLABLE BY anon UNLESS A MIGRATION SAYS OTHERWISE.
//
// `revoke all on function ... from public` does NOT remove a role grant, and
// Supabase grants EXECUTE on every new function in `public` to anon and
// authenticated by default privilege. So the omission is SILENT: the migration
// looks locked down, `\df+` shows a revoke, and the function is still reachable
// with the anon key. SECURITY DEFINER then bypasses RLS, so the owner_id filter
// on the table is not in the path.
//
// MEASURED in production on 2026-10-01 with `set local role anon`:
// `niche_research_due(30)` returned a row, and `panel_answers_pending(5)` — whose
// body has no auth.uid() filter and which returns owner_id plus the full
// blueprint for every creator — executed without error. A direct select on
// `generations` as anon returned 0, so RLS itself was intact. The functions were
// the hole. Fixed by 0264; this guard is why it cannot come back.
//
// WHAT THIS ENFORCES: every SECURITY DEFINER function a migration creates must
// either be revoked from anon by some migration, or be listed in
// DELIBERATELY_PUBLIC with the reason it is safe. Trigger functions are exempt —
// PostgREST does not expose a function returning `trigger`, and revoking EXECUTE
// on one can break the DML that fires it.
//
// It reads SOURCE TEXT, so it must tell a mention from a statement: whole-line
// `--` comments are dropped, and never everything after `--`, or a real revoke
// sitting after an inline comment would disappear and the guard would stop
// catching the thing it exists for.
//
//   node scripts/ci/check_definer_functions_not_public.mjs            # live
//   node scripts/ci/check_definer_functions_not_public.mjs --selftest # fixtures
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const MIGRATIONS = join(REPO, 'supabase', 'migrations')

/**
 * Functions anon is MEANT to reach, each with what stands in for a session.
 *
 * "The app happens to call it" is not a reason — authenticated covers that.
 * A function belongs here only when an unauthenticated caller is the point.
 */
export const DELIBERATELY_PUBLIC = {
  brand_report:
    'The public brand share report (0035). The unguessable share token passed as '
    + 'p_token IS the access control, and the function resolves the token to one '
    + 'owner before reading anything — mirrored by the review edge function.',
}

/**
 * Functions anon can CALL but gets nothing from, because the body filters on
 * `auth.uid()` — which is null for anon, so it matches no row.
 *
 * This is a weaker position than removing the grant and it is recorded, not
 * waved through: the guard VERIFIES the body still contains `auth.uid()`. Take
 * that filter out and the entry stops excusing anything. Two of these
 * (is_platform_admin, is_superadmin) are called from RLS policies as the
 * calling role, so revoking EXECUTE from authenticated would break the policies
 * that depend on them — which is why they are here rather than revoked.
 */
export const GUARDED_BY_SESSION = {
  accept_workspace_invite: 'Binds the invite to auth.uid() (0049).',
  answer_panel_question: 'Reads the test row by owner_id = auth.uid() before filing an answer (0257).',
  brand_stats: 'Scoped to the caller\'s brands via auth.uid() (0059).',
  create_workspace_invite: 'Checks the caller owns the workspace via auth.uid() (0049).',
  ensure_brand_share_token: 'Mints a token only for a brand auth.uid() owns (0035).',
  gallery_for_me: 'Ranks only the caller\'s own gallery via auth.uid() (0258/0262).',
  is_platform_admin:
    'An RLS predicate whose guard is the SIGNATURE — `p_user uuid default auth.uid()` (0003). '
    + '0003 grants it to authenticated and service_role only, and production carries no anon grant on it. '
    + 'Policies call it as the calling role, so revoking EXECUTE from authenticated would break them.',
  is_superadmin:
    'Same shape as is_platform_admin: the guard is `p_user uuid default auth.uid()` (0003), granted to '
    + 'authenticated and service_role only, and called from the roster policies as the calling role.',
  voice_ownership_conflicts: 'Scoped to auth.uid() (0221).',
  workspace_peers: 'Scoped to the caller\'s workspace via auth.uid() (0049).',
}

/** Drop WHOLE-LINE `--` comments only. Never everything after `--`. */
export function stripLineComments(sql) {
  return sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n')
}

/**
 * Every `create [or replace] function` in one file, as
 * { name, isDefiner, returnsTrigger }. The chunk for each definition runs to the
 * next definition or end of file, which is enough to see `security definer` and
 * the return type without parsing SQL.
 */
export function definitionsIn(sql) {
  const text = stripLineComments(sql)
  const starts = [...text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi)]
  return starts.map((m, i) => {
    const chunk = text.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : text.length)
    return {
      name: m[1].toLowerCase(),
      isDefiner: /security\s+definer/i.test(chunk),
      returnsTrigger: /returns\s+trigger\b/i.test(chunk),
      // THE FUNCTION'S OWN TEXT ONLY — signature through body close. The chunk
      // runs to the next definition, so crediting it whole would let an
      // auth.uid() in a FOLLOWING statement (a policy, a grant) vouch for a
      // function that has none: a false pass, the one error that matters here.
      // The signature counts because `p_user uuid default auth.uid()` IS the
      // session guard in 0003, and reading the body alone called it missing.
      hasSessionGuard: /auth\.uid\(\)/i.test(definitionTextOf(chunk)),
    }
  })
}

/** One definition's own text: signature through the close of its body. */
export function definitionTextOf(chunk) {
  const open = chunk.match(/\$([a-z_]*)\$/i)
  if (!open) {
    const end = chunk.indexOf(';')
    return end === -1 ? chunk : chunk.slice(0, end + 1)
  }
  const from = open.index + open[0].length
  const close = chunk.indexOf(open[0], from)
  return close === -1 ? chunk : chunk.slice(0, close + open[0].length)
}

/** Function names some migration revokes EXECUTE on from anon. */
export function revokedFromAnon(sql) {
  const text = stripLineComments(sql)
  const found = new Set()
  for (const m of text.matchAll(/revoke\s+(?:all|execute)[^;]*?\son\s+function\s+([^;]*?)\sfrom\s+([^;]+);/gi)) {
    const roles = m[2].toLowerCase()
    if (!/\banon\b/.test(roles)) continue
    for (const n of m[1].matchAll(/(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi)) found.add(n[1].toLowerCase())
  }
  return found
}

export function problemsFor(files, publicList = DELIBERATELY_PUBLIC, guardedList = GUARDED_BY_SESSION) {
  const definers = new Map() // name -> file it was last defined in
  const revoked = new Set()
  for (const { name: file, sql } of files) {
    for (const d of definitionsIn(sql)) {
      if (d.isDefiner && !d.returnsTrigger) definers.set(d.name, { file, hasSessionGuard: d.hasSessionGuard })
      // A later definition that is no longer SECURITY DEFINER clears the debt.
      if (!d.isDefiner) definers.delete(d.name)
    }
    for (const n of revokedFromAnon(sql)) revoked.add(n)
  }
  const problems = []
  for (const [name, { file, hasSessionGuard }] of [...definers].sort()) {
    if (revoked.has(name)) continue
    if (Object.prototype.hasOwnProperty.call(publicList, name)) continue
    if (Object.prototype.hasOwnProperty.call(guardedList, name)) {
      if (hasSessionGuard) continue
      problems.push(
        `${name}() is listed in GUARDED_BY_SESSION, but its body in ${file} no longer contains auth.uid(). `
        + 'The entry claimed the session filter was the protection and it is gone. Restore the filter, '
        + 'or revoke EXECUTE from anon.',
      )
      continue
    }
    problems.push(
      `${name}() is SECURITY DEFINER (${file}) and no migration revokes EXECUTE on it from anon. `
      + 'Add `revoke execute on function public.' + name + '(...) from anon, authenticated;` to a migration, '
      + 'or list it in DELIBERATELY_PUBLIC with the reason an unauthenticated caller is the point.',
    )
  }
  for (const [label, list] of [['DELIBERATELY_PUBLIC', publicList], ['GUARDED_BY_SESSION', guardedList]]) {
    for (const name of Object.keys(list)) {
      if (!definers.has(name) && !revoked.has(name)) {
        problems.push(`${label} names ${name}(), which no migration defines as SECURITY DEFINER. Remove the entry.`)
      }
    }
  }
  return problems
}

function liveFiles() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(MIGRATIONS, f), 'utf8') }))
}

if (process.argv.includes('--selftest')) {
  const cases = []
  const ok = (label, cond) => cases.push({ label, pass: cond })

  // A genuinely broken case: definer, no revoke at all.
  ok('an unrevoked definer function fails', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.leaky(p int) returns int language sql security definer as $$ select 1 $$;' },
  ], {}, {}).length === 1)

  // revoke from public ALONE is the real defect and must still fail.
  ok('revoke from public alone is not enough', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.leaky(p int) returns int language sql security definer as $$ select 1 $$;\nrevoke all on function public.leaky(int) from public;' },
  ], {}, {}).length === 1)

  ok('revoke from anon clears it', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.tight(p int) returns int language sql security definer as $$ select 1 $$;\nrevoke all on function public.tight(int) from public, anon, authenticated;' },
  ], {}, {}).length === 0)

  ok('a LATER migration may do the revoking', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.late(p int) returns int language sql security definer as $$ select 1 $$;' },
    { name: '0002_y.sql', sql: 'revoke execute on function public.late(int) from anon, authenticated;' },
  ], {}, {}).length === 0)

  ok('a trigger function is exempt', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.stamp() returns trigger language plpgsql security definer as $$ begin return new; end $$;' },
  ], {}, {}).length === 0)

  ok('a SECURITY INVOKER function is not demanded', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.plain(p int) returns int language sql as $$ select 1 $$;' },
  ], {}, {}).length === 0)

  // The mention-vs-statement lesson, both directions.
  ok('a COMMENTED-OUT revoke does not count', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.leaky(p int) returns int language sql security definer as $$ select 1 $$;\n-- revoke execute on function public.leaky(int) from anon;' },
  ], {}, {}).length === 1)

  ok('a revoke after an INLINE comment still counts', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.tight(p int) returns int language sql security definer as $$ select 1 $$;\nrevoke execute on function public.tight(int) from anon; -- see https://example.com/why\n' },
  ], {}, {}).length === 0)

  ok('redefining it as INVOKER clears the debt', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.flip(p int) returns int language sql security definer as $$ select 1 $$;' },
    { name: '0002_y.sql', sql: 'create or replace function public.flip(p int) returns int language sql as $$ select 1 $$;' },
  ], {}, {}).length === 0)

  ok('a stale DELIBERATELY_PUBLIC entry is reported', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.brand_report(p_token text) returns jsonb language sql as $$ select null::jsonb $$;' },
  ], { brand_report: 'x' }, {}).some((p) => p.includes('Remove the entry')))

  // GUARDED_BY_SESSION is a VERIFIED claim, not a waiver.
  ok('a GUARDED_BY_SESSION entry whose body filters on auth.uid() passes', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.scoped(p int) returns int language sql security definer as $fn$ select 1 from t where owner_id = auth.uid() $fn$;' },
  ], {}, { scoped: 'scoped to the caller' }).length === 0)

  ok('a GUARDED_BY_SESSION entry whose filter is GONE fails', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.scoped(p int) returns int language sql security definer as $fn$ select 1 from t $fn$;' },
  ], {}, { scoped: 'scoped to the caller' }).some((m) => m.includes('no longer contains auth.uid()')))

  // The false pass that bodyOf() exists to prevent.
  ok('auth.uid() in a FOLLOWING statement does not vouch for the function', problemsFor([
    { name: '0001_x.sql', sql: 'create function public.scoped(p int) returns int language sql security definer as $fn$ select 1 from t $fn$;\ncreate policy q on t using (owner_id = auth.uid());' },
  ], {}, { scoped: 'scoped to the caller' }).some((m) => m.includes('no longer contains auth.uid()')))

  const failed = cases.filter((c) => !c.pass)
  for (const c of cases) console.log(`${c.pass ? 'ok  ' : 'FAIL'} ${c.label}`)
  console.log(`\n${cases.length - failed.length}/${cases.length} selftests passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}

const problems = problemsFor(liveFiles())
if (problems.length > 0) {
  console.error('SECURITY DEFINER functions reachable by anon:\n')
  for (const p of problems) console.error(`  · ${p}`)
  console.error(`\n${problems.length} problem(s). See the header of ${'scripts/ci/check_definer_functions_not_public.mjs'}.`)
  process.exit(1)
}
console.log('every SECURITY DEFINER function in a migration is revoked from anon or declared deliberately public')

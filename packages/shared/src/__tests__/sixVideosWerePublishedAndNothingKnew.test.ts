// SIX VIDEOS WERE PUBLISHED AND NOTHING WROTE IT DOWN.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14:
//
//   posts rows                             7   (all carry a generation_id)
//   distinct generations posted            6
//   generation_outcomes rows              36
//   outcomes whose generation was posted   1
//   was_published answered                 0
//
// `was_published` has existed since 0191 and NOTHING WRITES IT. So Loop B
// cannot tell a script that was published from one that was never filmed —
// the two ends of its own funnel.
//
// ⚠️ WHOLE-LINE SQL COMMENTS ARE STRIPPED BEFORE MATCHING, because this
// migration argues for each of these properties in prose and a naive match
// would be satisfied by the argument rather than the code. `--` lines only.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations',
    '0212_six_videos_were_published_and_nothing_knew.sql'), 'utf8')
  .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
const WORKFLOW = readFileSync(
  join(REPO, '.github', 'workflows', 'staging-integration.yml'), 'utf8')

describe('publication reaches the outcome row', () => {
  it('a trigger on posts carries it — not a second client call', () => {
    // ⚠️ THE READER-REMOVAL ASSERTION. Without the trigger the column stays
    // null forever while `posts` fills up, which is the state this fixes.
    expect(SQL).toMatch(/create trigger posts_mark_outcome_published/)
    expect(SQL).toMatch(/after insert on public\.posts/)
    expect(SQL).toMatch(/execute function public\.mark_outcome_published\(\)/)
  })

  it('sets TRUE and never FALSE', () => {
    // ⚠️⚠️ THE LOAD-BEARING ONE. A post proves publication; the ABSENCE of a
    // post proves nothing — she may have posted from the native app. Writing
    // false on that absence would fabricate the one negative signal Loop B has.
    expect(SQL).toMatch(/set was_published = true/)
    expect(SQL).not.toMatch(/was_published\s*=\s*false/)
  })

  it('creates no outcome row', () => {
    // Five of the six posted generations have NO outcome row. Inserting here
    // would invent five outcomes whose every other dimension is null.
    const fn = SQL.slice(SQL.indexOf('create or replace function public.mark_outcome_published'))
    const body = fn.slice(0, fn.indexOf('$fn$;') + 5)
    expect(body).not.toMatch(/insert\s+into/i)
  })

  it('is idempotent — re-posting does not churn the row', () => {
    // ⚠️ BOUNDED TO THE TRIGGER BODY, AND MY FIRST VERSION WAS NOT. The same
    // guard appears in the one-time backfill at the bottom, so a whole-file
    // match was satisfied by the backfill's copy while the trigger's own guard
    // was deleted — a mutant survived on exactly that. Third time today that an
    // unbounded match let something live; bound it to what it describes.
    const fn = SQL.slice(SQL.indexOf('create or replace function public.mark_outcome_published'))
    const body = fn.slice(0, fn.indexOf('$fn$;') + 5)
    expect(body).toMatch(/was_published is distinct from true/)
    // And the backfill has its own, separately.
    const backfill = SQL.slice(SQL.indexOf('update public.generation_outcomes o'))
    expect(backfill).toMatch(/was_published is distinct from true/)
  })

  it('cannot cost a creator their post', () => {
    // An `after insert` trigger that raises ABORTS the insert. A failure here
    // must never lose her record of publishing.
    const fn = SQL.slice(SQL.indexOf('create or replace function public.mark_outcome_published'))
    const body = fn.slice(0, fn.indexOf('$fn$;') + 5)
    expect(body).toMatch(/exception when others then/)
    // And the handler must not re-raise.
    const handler = body.slice(body.indexOf('exception when others then'))
    expect(handler).not.toMatch(/\braise\b/)
  })

  it('runs as the definer with a pinned search_path', () => {
    // It writes a table the caller cannot write directly; an unpinned
    // search_path on a definer function is how one of those becomes a hole.
    expect(SQL).toMatch(/security definer/)
    expect(SQL).toMatch(/set search_path = public/)
  })

  it('no client may call the function directly', () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(SQL).toMatch(
        new RegExp(`revoke all on function public\\.mark_outcome_published\\(\\) from ${role}`))
    }
  })

  it('backfills the one row that already qualifies, and only via a join', () => {
    // Six generations are posted; exactly ONE has an outcome row, so this
    // updates 1. Quoting six would be counting posts and reporting outcomes.
    expect(SQL).toMatch(/update public\.generation_outcomes o/)
    expect(SQL).toMatch(/from public\.posts p where p\.generation_id = o\.generation_id/)
  })

  it('is registered as APPLIED in the staging matrix, not excluded', () => {
    // ⚠️ A migration staging has not got cannot be exercised, and the gate goes
    // green anyway. Excluding it would be making the check do less.
    expect(WORKFLOW).toContain('0212_six_videos_were_published_and_nothing_knew')
    const excludedBlock = WORKFLOW.slice(WORKFLOW.indexOf('EXCLUDED'))
    expect(excludedBlock).not.toContain('0212_six_videos_were_published')
  })
})

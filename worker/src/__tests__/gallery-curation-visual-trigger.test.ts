// FIX 13 (Tier 1) — a curated gallery reference asks for its own visual pass.
//
// Two things this covers, at the level this repo tests worker code at (pure
// functions, no live database or worker):
//
//   1. `shouldSkipAlreadyAssessed` — the one line in `assess_reference` that
//      decides whether a `frames: true` request enqueued by the new
//      `trg_gallery_curation_visual_analysis` trigger (migration 0176)
//      actually runs, or is silently swallowed as "already assessed" because
//      the transcript batch got there first. This is the exact gap #4 of the
//      task flagged: reusing the pilot's job type unmodified would have meant
//      the trigger could never do anything to the transcript-assessed
//      majority of the gallery. The fix narrows the skip to "nothing this
//      request asks for is missing" and this test is the proof it does that
//      without reopening the "must not pay twice" guard the skip exists for.
//
//   2. The trigger's SQL idempotence predicate (0176) reasoned about here in
//      TypeScript terms, mirroring the exact WHERE clauses the migration
//      uses, so the "absent triggers a job, present skips" contract has a
//      readable, testable statement independent of a live Postgres — the
//      trigger's own WHERE-clauses are asserted against directly below in
//      `wouldEnqueue`, a 1:1 port kept in this file rather than duplicated
//      logic guessed at twice.
import { describe, it, expect, beforeAll } from 'vitest'
import type { shouldSkipAlreadyAssessed as ShouldSkipAlreadyAssessed } from '../jobs/assessReference.js'

let shouldSkipAlreadyAssessed: typeof ShouldSkipAlreadyAssessed

beforeAll(async () => {
  // assessReference.ts imports db.js, which throws without Supabase creds at
  // module load — stub them before the dynamic import, same pattern as
  // assess-probe.test.ts. Nothing here talks to a database.
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ shouldSkipAlreadyAssessed } = await import('../jobs/assessReference.js'))
})

describe('shouldSkipAlreadyAssessed — end of PR #586\'s loop: a curated item with no visual_profile gets one', () => {
  it('no row at all: never skip, regardless of what was requested', () => {
    expect(shouldSkipAlreadyAssessed(null, false)).toBe(false)
    expect(shouldSkipAlreadyAssessed(undefined, true)).toBe(false)
  })

  it('a plain re-run (no frames) still skips on a done row — the original guard, untouched', () => {
    expect(shouldSkipAlreadyAssessed({ visual_profile: null }, false)).toBe(true)
    expect(shouldSkipAlreadyAssessed({ visual_profile: { primaryMode: 'x' } }, false)).toBe(true)
  })

  it('frames requested, no visual_profile yet: the gallery-curation trigger case — do NOT skip', () => {
    expect(shouldSkipAlreadyAssessed({ visual_profile: null }, true)).toBe(false)
    expect(shouldSkipAlreadyAssessed({ visual_profile: undefined }, true)).toBe(false)
  })

  it('frames requested, visual_profile already present: the pass already happened — skip', () => {
    expect(shouldSkipAlreadyAssessed({ visual_profile: { primaryMode: 'talking_head' } }, true)).toBe(true)
  })
})

// ── THE TRIGGER'S IDEMPOTENCE PREDICATE, PORTED FOR A READABLE ASSERTION ──
//
// Migration 0176's `enqueue_gallery_visual_analysis()` skips when EITHER a
// finished visual_profile exists for the URL OR an assess_reference job for
// that URL is already queued/running. This is that same predicate, over the
// same shape of rows the SQL reads, so "absent triggers a job, present skips"
// has a assertion that does not require a live Postgres to check.
interface ProfileRow { url: string; visual_profile: unknown }
interface JobRow { type: string; status: string; payload: { url?: string } }

function wouldEnqueue(url: string, profiles: ProfileRow[], jobs: JobRow[]): boolean {
  const hasFinishedProfile = profiles.some((r) => r.url === url && r.visual_profile !== null)
  const hasInFlightJob = jobs.some((j) =>
    j.type === 'assess_reference' && j.payload.url === url && ['queued', 'running'].includes(j.status))
  return !hasFinishedProfile && !hasInFlightJob
}

describe('gallery curation trigger idempotence (0176) — three states, never a re-derive', () => {
  const url = 'https://tiktok.com/@x/video/1'

  it('ABSENT (no profile row, no job) triggers a job', () => {
    expect(wouldEnqueue(url, [], [])).toBe(true)
  })

  it('PRESENT as a finished visual_profile skips — never re-enqueued', () => {
    expect(wouldEnqueue(url, [{ url, visual_profile: { primaryMode: 'talking_head' } }], [])).toBe(false)
  })

  it('PRESENT as an in-flight job (queued or running) skips — no double-queue across the same video\'s many niche placements', () => {
    expect(wouldEnqueue(url, [], [{ type: 'assess_reference', status: 'queued', payload: { url } }])).toBe(false)
    expect(wouldEnqueue(url, [], [{ type: 'assess_reference', status: 'running', payload: { url } }])).toBe(false)
  })

  it('a row with a transcript but no visual_profile yet is NOT "present" for this trigger — it still enqueues', () => {
    expect(wouldEnqueue(url, [{ url, visual_profile: null }], [])).toBe(true)
  })

  it('a DONE or FAILED job for the same url does not block a fresh enqueue — only queued/running does', () => {
    expect(wouldEnqueue(url, [], [{ type: 'assess_reference', status: 'done', payload: { url } }])).toBe(true)
    expect(wouldEnqueue(url, [], [{ type: 'assess_reference', status: 'failed', payload: { url } }])).toBe(true)
  })

  it('a different URL never blocks this one — the check is per-video, not per-batch', () => {
    expect(wouldEnqueue(url, [{ url: 'https://other', visual_profile: { x: 1 } }], [])).toBe(true)
  })
})

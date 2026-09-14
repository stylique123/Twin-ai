// THE GUARD ALREADY EXISTED. THIS PATH NEVER CALLED IT.
//
// ⚠️⚠️ THE PROJECT'S SIGNATURE DEFECT IN ITS PUREST FORM. `isTranscribable` was
// written for exactly this case and says so in its own header: "689 of the 692
// Instagram rows are instagram.com/explore/tags/... hashtag pages — no video, no
// transcript ... Sampling them would spend real calls to discover they cannot be
// read." The pilot sampler calls it. The enqueue trigger never has.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-13 — 115 Instagram assess_reference jobs:
// 109 hashtag BROWSE PAGES across 57 distinct urls, 6 `/p/` posts, and ZERO
// `/reel/` urls. None produced a transcript.
//
// ⚠️⚠️ AND IT CORRECTS A DIAGNOSIS ON THE RECORD. The 100%-identical-error
// failure was read as a CONTRACT MISMATCH — "the actor's response shape no
// longer carries the field we read". It does not. The Actor correctly reports
// `no audio url found` for a page that has no video, and our code reads that
// message out of the field it expects. We have been feeding it browse pages.
//
// ⚖️ AND NOTE WHAT THE NUMBERS DO NOT SAY: zero reels have EVER been assessed,
// so there is no evidence either way about reels. Absent is not zero.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { isTranscribable } from '../pilotSample'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SQL = readFileSync(join(ROOT, 'supabase', 'migrations',
  '0206_a_hashtag_page_is_not_a_video_and_never_was.sql'), 'utf8')

/**
 * ⚠️⚠️ BUILT FROM THE MIGRATION'S OWN TEXT, NOT HAND-COPIED. A test that
 * re-typed the rule in JavaScript would be a second implementation agreeing with
 * a third — it would pass forever while the SQL drifted. This PARSES the
 * predicate out of the shipped migration, so editing the SQL changes what this
 * evaluates, which is the only way a mirror test means anything.
 */
function sqlRefusesUrl(): (url: string | null) => boolean {
  const open = SQL.indexOf('if new.url is null')
  const close = SQL.indexOf('then', open)
  expect(open, 'the non-video check must be findable').toBeGreaterThan(-1)
  expect(close).toBeGreaterThan(open)
  const pred = SQL.slice(open, close)

  const substrings = [...pred.matchAll(/position\('([^']+)' in lower\(new\.url\)\) > 0/g)]
    .map((m) => m[1])
  const notMatches = [...pred.matchAll(/lower\(new\.url\) !~ '([^']+)'/g)].map((m) => m[1])
  const checksNull = /new\.url is null/.test(pred)

  // If the parse found nothing, the evaluator would refuse nothing and every
  // case below would "agree" vacuously. Refuse to run on an empty parse.
  expect(substrings.length, 'parsed no substring conditions from the SQL')
    .toBeGreaterThan(0)
  expect(notMatches.length, 'parsed no regex condition from the SQL').toBeGreaterThan(0)
  expect(checksNull).toBe(true)

  return (url: string | null): boolean => {
    if (url === null) return true
    const u = url.toLowerCase()
    if (substrings.some((s) => u.includes(s))) return true
    if (notMatches.some((r) => !new RegExp(r).test(u))) return true
    return false
  }
}
const sqlRefuses = sqlRefusesUrl()

const CASES: string[] = [
  // The real shapes, taken from production rows.
  'https://www.instagram.com/explore/tags/successfullentrepreneur',
  'https://www.instagram.com/explore/tags/salesforcee',
  'https://www.instagram.com/explore/people/',
  'https://www.instagram.com/reel/abc123',
  'https://www.instagram.com/p/abc123',
  'https://www.tiktok.com/@someone/video/7123456789',
  'https://www.youtube.com/watch?v=abc',
  'https://youtu.be/abc',
  // Casing, because a url arrives as typed.
  'HTTPS://WWW.INSTAGRAM.COM/EXPLORE/TAGS/Thing',
  'https://www.instagram.com/EXPLORE/TAGS/Thing',
  // Not urls at all.
  'ftp://example.com/x', 'instagram.com/reel/abc', '', 'not a url',
]

describe('the trigger and isTranscribable agree on every url', () => {
  for (const url of CASES) {
    it(`agrees on ${JSON.stringify(url)}`, () => {
      const shared = !isTranscribable({ url, platform: 'instagram', niche: 'n' })
      expect(sqlRefuses(url)).toBe(shared)
    })
  }

  it('the table contains BOTH outcomes, or a mirror that refuses everything passes', () => {
    const refused = CASES.filter((u) => sqlRefuses(u))
    const allowed = CASES.filter((u) => !sqlRefuses(u))
    expect(refused.length).toBeGreaterThan(0)
    expect(allowed.length).toBeGreaterThan(0)
  })

  it('a hashtag page is refused and a reel is not — the case this exists for', () => {
    expect(sqlRefuses('https://www.instagram.com/explore/tags/x')).toBe(true)
    expect(sqlRefuses('https://www.instagram.com/reel/abc')).toBe(false)
  })

  it('SQL also refuses a null url, which isTranscribable never receives', () => {
    // ⚖️ NOT A DISAGREEMENT. `SampleCandidate.url` is typed non-null, so the
    // shared rule has no null case to state; a trigger can genuinely be handed
    // one. Asserted separately rather than smuggled into the parity table.
    expect(sqlRefuses(null)).toBe(true)
  })
})

describe('the check runs before the three that assume a video', () => {
  it('it is the FIRST check in the function body', () => {
    const body = SQL.slice(SQL.indexOf('begin'))
    const nonVideo = body.indexOf('if new.url is null')
    const success = body.indexOf('visual_profile is not null')
    const inFlight = body.indexOf("status in ('queued', 'running')")
    const cooldown = body.indexOf("interval '7 days'")
    for (const later of [success, inFlight, cooldown]) expect(later).toBeGreaterThan(nonVideo)
  })

  it('and it returns without enqueueing — exclusion, never deletion', () => {
    const open = SQL.indexOf('if new.url is null')
    const close = SQL.indexOf('end if;', open)
    const block = SQL.slice(open, close)
    expect(block).toMatch(/return new;/)
    expect(block).not.toMatch(/\bdelete\b/i)
    expect(block).not.toMatch(/insert into/i)
  })
})

describe('0205’s cooldown fix is carried forward, not dropped', () => {
  it('the corrected predicate is still present', () => {
    // ⚠️ THIS REPLACES THE SAME FUNCTION 0205 REPLACED. Re-stating the function
    // without its cooldown fix would silently revert 0205 — the kind of loss a
    // `create or replace` makes easy and invisible.
    expect(SQL).toMatch(/result ->> 'error' is not null/)
    expect(SQL).toMatch(/status = 'failed' or j\.result/)
    expect(SQL).toMatch(/interval '7 days'/)
  })
})

describe('the migration is applied by staging, never excluded', () => {
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'staging-integration.yml'), 'utf8')
  it('it is in the APPLIED list, after 0205', () => {
    expect(wf).toContain('0206_a_hashtag_page_is_not_a_video_and_never_was')
    expect(wf.indexOf('0205_the_cooldown_looked_for_a_status_the_job_never_takes'))
      .toBeLessThan(wf.indexOf('0206_a_hashtag_page_is_not_a_video_and_never_was'))
  })
})

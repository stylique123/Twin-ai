// Nobody has ever measured a video this creator made.
//
// MEASURED 2026-09-14, on all 891 finished visual profiles in production:
//
//   from `gallery_items` (what we scraped) ........... 891
//   from PASTED REFERENCES (what she chose) ............ 0
//   from HER OWN POSTS ................................. 0
//
// The pass is not broken — 2,949 of 4,089 `assess_reference` jobs requested
// `frames: true` and 2,887 completed. `enqueue_gallery_visual_analysis` is the
// only thing that has ever asked for one, and it fires on `gallery_items` and
// nothing else. So the machine works and the aim was wrong.
//
// ⚠️ THIS FILE IS A READER-REMOVAL TEST BEFORE IT IS ANYTHING ELSE. A SQL
// function nothing calls is the most common defect in this repository —
// seventeen fields this month were built, correct, and read by nothing. The
// migration is asserted to exist AND the worker is asserted to call it; delete
// either and this goes red.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
// ⚠️ COMMENTS STRIPPED FROM THE SQL TOO, AND THIS FILE'S FIRST DRAFT DID NOT.
// The migration's own prose reads "`union` (not `union all`)" while explaining
// the choice — so the assertion that `union all` is ABSENT failed on the
// comment defending its absence. Exactly the mention-versus-code trap, caught
// in the test that exists to catch it. Whole `--` lines only.
const SQL_ALL = readFileSync(
  join(REPO, 'supabase/migrations/0209_nobody_ever_looked_at_her_own_videos.sql'), 'utf8',
)
const SQL = SQL_ALL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
// ⚠️ WHOLE-LINE COMMENTS STRIPPED, AND ONLY WHOLE LINES. Both files explain the
// rule in prose that names every symbol asserted below, so a naive match would
// be satisfied by the documentation rather than the code — the
// mention-versus-call trap this repo has hit twice. Stripping everything after
// `//` instead would delete a real read that follows a string containing a URL.
const WORKER = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the function exists and asks for the right thing', () => {
  it('requests a FRAMES pass — without it this is a transcript job', () => {
    // `frames` is opt-in and exactly `true` because it costs a second download.
    // Omitting it would enqueue work that can never produce a visual profile.
    expect(SQL).toContain("'frames', true")
    expect(SQL).toContain("'assess_reference'")
  })

  it('ranks on her OWN median, never an absolute view count', () => {
    expect(SQL).toContain('percentile_cont(0.5)')
    expect(SQL).toMatch(/plays \/ v_median/)
  })

  it('takes twenty — ten by performance and ten at the median', () => {
    // The comparison is the point: "what is different about her good ones"
    // needs both halves. One half is a list, not a comparison.
    const limits = SQL.match(/limit 10/g) ?? []
    expect(limits.length).toBe(2)
    expect(SQL).toMatch(/order by \(plays \/ v_median\) desc/)
    expect(SQL).toMatch(/order by abs\(\(plays \/ v_median\) - 1\) asc/)
  })

  it('unions rather than union all, so one video is not paid for twice', () => {
    expect(SQL).toMatch(/\bunion\b(?!\s+all)/)
    expect(SQL).not.toMatch(/\bunion\s+all\b/)
  })

  it('an unknown median queues NOTHING — absent is not zero', () => {
    // Ranking against an unknown baseline would pick ten arbitrary videos and
    // call them her best.
    expect(SQL).toMatch(/if v_median is null or v_median <= 0 then return 0; end if;/)
  })

  it('carries the same four guards as the gallery rule', () => {
    expect(SQL).toContain("position('/explore/tags/' in lower(v_url))")
    expect(SQL).toContain('rcp.visual_profile is not null')
    expect(SQL).toContain("j.status in ('queued', 'running')")
    expect(SQL).toContain("j.result ->> 'error' is not null")
  })

  it('is the worker\'s to call and nobody else\'s — a frames pass is a spend', () => {
    expect(SQL).toMatch(/grant execute on function public\.enqueue_own_post_visual_analysis\(uuid\) to service_role/)
    expect(SQL).toMatch(/revoke all on function public\.enqueue_own_post_visual_analysis\(uuid\) from anon/)
  })
})

describe('⚠️ and the worker actually calls it', () => {
  it('calls the RPC by name, in code and not in a comment', () => {
    expect(WORKER).toContain("rpc('enqueue_own_post_visual_analysis'")
  })

  it('passes the voice whose median is being computed', () => {
    expect(WORKER).toMatch(/p_voice_id: voiceId/)
  })

  it('records the outcome, so a silent failure is not silent', () => {
    // `stage` is how every other write on this path reports. A call whose
    // failure nobody records is a call nobody can tell ran.
    expect(WORKER).toContain("stage('own_posts_visual'")
  })

  it('cannot fail the scan — enrichment, never a gate', () => {
    const at = WORKER.indexOf("rpc('enqueue_own_post_visual_analysis'")
    expect(at).toBeGreaterThan(-1)
    // The call sits inside a try whose catch stages a failure rather than
    // rethrowing: a creator whose visual pass fails still gets her voice.
    expect(WORKER.slice(Math.max(0, at - 400), at)).toContain('try {')
  })
})

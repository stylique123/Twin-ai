// THE EXACT HOOK BOUNDARY — the third alignment consumer, landed FROZEN OFF.
//
// The Director chooses `hookStartWordIndex`, the spoken word to open on,
// dropping everything before it. Its only evidence about the opening has been
// `matchedTokenRatio`: an UNORDERED multiset overlap between the script's hook
// tokens and the words spoken in the first few seconds. That says how MUCH of
// the hook was said and cannot say WHERE — which is the one thing an index
// needs.
//
// `scriptStartSpokenIndex` says where: the spoken word at which the SCRIPT
// actually starts. Everything before it is preamble — settling into frame, "hey
// guys welcome back", clearing the throat.
//
// THE LOAD-BEARING TEST IN THIS FILE IS THE BYTE-IDENTICAL ONE. Adding a field
// to `summaries` changes the envelope, therefore envelopeSha256, therefore what
// the model sees — and that is what the director-eval harness and the quality
// gate exist to judge. So this lands with DIRECTOR_SEES_ALIGNMENT false and the
// envelope provably unchanged. Flipping the flag IS the eval.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// editorDirector pulls in db.ts, which requires real env. The repo's convention
// for touching it from a test is a stub before the dynamic import.
process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const { scriptStartSpokenIndex } = await import('../jobs/scriptAlignment.js')
const { buildDirectorSummaries, DIRECTOR_SEES_ALIGNMENT } = await import('../jobs/editorDirector.js')

const words = (...starts: number[]) => starts.map((startMs) => ({ startMs }))
const timing = (startMs: number | null) => ({ startMs, endMs: startMs === null ? null : startMs + 400 })

describe('scriptStartSpokenIndex — where the script actually begins', () => {
  it('finds the spoken word the script starts on, past the preamble', () => {
    // "hey guys" then the script. The first two spoken words belong to neither
    // a script word nor anything else — they are insertions, so the first
    // TIMED script word lands at spoken index 2.
    expect(scriptStartSpokenIndex([timing(1000)], words(0, 500, 1000, 1500))).toBe(2)
  })

  it('skips not_spoken script words rather than interpolating a time', () => {
    // A skipped word carries nulls. Guessing a time for it would put the
    // boundary on a word the creator never said.
    expect(scriptStartSpokenIndex([timing(null), timing(null), timing(1500)], words(0, 500, 1000, 1500))).toBe(3)
  })

  it('a script spoken from the very first word gives index 0', () => {
    expect(scriptStartSpokenIndex([timing(0)], words(0, 500))).toBe(0)
  })

  it('null when there is no alignment at all', () => {
    // An upload, a take with no captured script, a project pinned before
    // alignment existed. The Director simply does not get the hint.
    expect(scriptStartSpokenIndex([], words(0, 500))).toBeNull()
    expect(scriptStartSpokenIndex([timing(null)], words(0, 500))).toBeNull()
  })

  it('null when no spoken word carries that start — never a nearest match', () => {
    expect(scriptStartSpokenIndex([timing(7777)], words(0, 500, 1000))).toBeNull()
  })

  it('AMBIGUOUS is null, not a guess — an index on the wrong word opens the video wrong', () => {
    expect(scriptStartSpokenIndex([timing(1000)], words(0, 1000, 1000))).toBeNull()
  })

  it('malformed input degrades to null rather than throwing', () => {
    for (const bad of [null, undefined, 'nope', 7]) {
      expect(scriptStartSpokenIndex(bad as never, words(0))).toBeNull()
      expect(scriptStartSpokenIndex([timing(0)], bad as never)).toBeNull()
    }
  })
})

describe('the flag is FROZEN OFF, and the envelope is unchanged because of it', () => {
  const hook = { spokenOpening: { firstWordStartMs: 120, wordCount: 9 }, scriptAlignment: { matchedTokenRatio: 0.8 } }
  const align = { scriptWordTimings: [timing(1000)] }
  const w = words(0, 500, 1000)

  it('DIRECTOR_SEES_ALIGNMENT is false', () => {
    expect(DIRECTOR_SEES_ALIGNMENT).toBe(false)
  })

  it('BYTE-IDENTICAL summaries with and without the alignment component', () => {
    // The whole safety property. If these ever differ while the flag is false,
    // the envelope hash moves, every recorded decision's identity moves with
    // it, and a change nobody evaluated has reached the model.
    const without = buildDirectorSummaries('brand', null, null, hook, [])
    const with_ = buildDirectorSummaries('brand', null, null, hook, [], align, w)
    expect(JSON.stringify(with_)).toBe(JSON.stringify(without))
  })

  it('the field is OMITTED, not set to null — a null key still changes the bytes', () => {
    const s = buildDirectorSummaries('brand', null, null, hook, [], align, w) as { hook: Record<string, unknown> }
    expect('scriptStartWordIndex' in s.hook).toBe(false)
  })

  it('the existing hook facts are untouched', () => {
    const s = buildDirectorSummaries('brand', null, null, hook, [], align, w) as { hook: Record<string, unknown> }
    expect(s.hook.firstWordStartMs).toBe(120)
    expect(s.hook.wordCount).toBe(9)
    expect(s.hook.matchedTokenRatio).toBe(0.8)
  })

  it('the catalog agrees: alignment is NOT consumed by the Director while the flag is off', () => {
    // The two must move together. consumedByDirector says whether the Director
    // reads this component; the flag says whether it is given it. Drift in
    // either direction makes the catalog a claim nobody checks.
    const catalog = JSON.parse(
      readFileSync(new URL('../../../scripts/ci/analysis_components.json', import.meta.url), 'utf8'),
    ) as { components: Array<{ name: string; consumedByDirector: boolean }> }
    const alignment = catalog.components.find((c) => c.name === 'alignment')
    expect(alignment).toBeDefined()
    expect(alignment?.consumedByDirector).toBe(DIRECTOR_SEES_ALIGNMENT)
  })
})

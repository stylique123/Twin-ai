// AN UNFILLED TEMPLATE IS NOT A SCRIPT.
//
// ⚠️ THESE WERE COUNTED AND SHIPPED. `dropSpokenPlaceholders` removes templated
// HOOKS — five are generated, so discarding one costs nothing — and for script
// lines it only set `linesAffected`. The line went out to the creator:
//
//     "You've probably been doing [tech task] wrong your whole life."
//     "First, do [step 1]. Then, [step 2]. And finally, [step 3]."
//
// Measured across three 112-case runs: 5-17 lines in 3-6 scripts — roughly one
// script in twenty to thirty. A creator panel reading these did not react in
// proportion to that rate: one occurrence destroyed trust in the whole
// document, because every other line then has to be read as possibly fake.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isBillableScript } from '../generationReadiness'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('a bracketed beat is ASKED, not shipped', () => {
  it('escalates to needs_user rather than deleting or inventing', () => {
    // ⚖️ THE ORIGINAL REASONING WAS RIGHT AND ITS CONCLUSION WAS WRONG. A script
    // line "has no alternates, so it is reported and never invented over" —
    // correct, we must not invent one. But there was a third option all along,
    // and this file already uses it everywhere else: ASK.
    const block = EDGE.slice(EDGE.indexOf('AN UNFILLED TEMPLATE IS NOT A SCRIPT'))
    const scoped = block.slice(0, block.indexOf('placeholder_beats_asked') + 40)
    expect(scoped).toMatch(/SPOKEN_PLACEHOLDER\.test\(b\.line\)/)
    expect(scoped).toMatch(/b\.substance = 'needs_user'/)
    // Never deleted — a script shorter than the hook promised breaks the count
    // contract that exists precisely to stop that.
    expect(scoped).not.toMatch(/\.splice\(|delete declared/)
  })

  it('runs AFTER the entitlement escalation, so both reasons can fire', () => {
    expect(EDGE.indexOf('entitlement_unrepaired'))
      .toBeLessThan(EDGE.indexOf('placeholder_beats_asked'))
  })

  it('joins the same question list the client already renders', () => {
    const block = EDGE.slice(EDGE.indexOf('AN UNFILLED TEMPLATE IS NOT A SCRIPT'))
    expect(block.slice(0, 4000)).toMatch(/creatorQuestions\.push\(q\)/)
  })

  it('and the script stops being billable, which is the right economics', () => {
    // ⚖️ A script asking the creator to fill in its own blanks is a preflight
    // question, not a delivered creation. `needs_user` beats already drive this.
    // ⚠️ THE EXACT STRING THE EDGE WRITES. A first draft used fresh wording
    // and this assertion failed: `isBillableScript` detects our asks by
    // AUTHORSHIP, so a paraphrase is invisible to it and the creator gets
    // charged for a script full of our own questions.
    const r = isBillableScript(['a', 'b',
      'Only you can supply this. This beat came back as an unfilled template — what would you actually say here?'], 1)
    expect(r.billable).toBe(false)
    expect(r.reason).toBe('script_asks_creator_for_context')
  })
})

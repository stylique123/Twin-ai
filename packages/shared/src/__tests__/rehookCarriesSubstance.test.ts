// THE EMPTY BEATS WERE ORDERED BY OUR OWN PROMPT.
//
// ⚠️ THE FINDING. Across two matrix runs, ~23% of beats declared `substance:
// none` — a share that got WORSE as knowledge improved, because knowledge was
// never the cause. `KILL THE BORING MIDDLE` instructed the writer to place a
// re-hook beat and illustrated it with pure tease — "but here is the part nobody
// tells you" — which carries no factual claim by construction. The writer obeyed,
// declared `none`, and the metric counted it as filler.
//
// ⚖️ AND CREATOR PANELS INDEPENDENTLY REJECTED THE OUTPUT. Reading real scripts,
// they flagged four near-identical progress checks across four different
// creators — "Still with me?", "You're halfway there!", "Are you ready for the
// last two?", "If you're still watching" — and called them dead weight that
// "neither creator talks like this". The prompt asked for a stall; the stall got
// written; the creators refused it.
//
// So the re-hook now has to CARRY the next item rather than announce it, and
// progress checks are named and banned. This is a prompt rule rather than a
// contract check because there is nothing decidable here — a beat that promises
// content is legal JSON — and the honest place for an un-decidable rule is the
// instruction, with a test pinning that the instruction still says it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the re-hook is part of a real beat, not a beat of its own', () => {
  it('requires the re-hook to carry substance', () => {
    expect(EDGE).toMatch(/THE RE-HOOK CARRIES SUBSTANCE/)
    expect(EDGE).toMatch(/ESCALATE INTO the next real item/)
  })

  it('no longer illustrates the re-hook with a contentless tease', () => {
    // ⚠️ THE EXACT STRING THAT CAUSED IT. The old rule offered this as a model
    // re-hook, and the writer produced beats containing nothing else.
    expect(EDGE).not.toContain('"but here is the part nobody tells you"')
  })

  it('names and bans the progress checks the panels rejected', () => {
    for (const phrase of ['Still with me?', 'You are halfway there', 'Ready for the last two?']) {
      expect(EDGE, phrase).toContain(phrase)
    }
    expect(EDGE).toMatch(/NEVER WRITE A PROGRESS CHECK/)
  })

  it('the harness still lifts this block rather than paraphrasing it', () => {
    // The QA harness lifts `- SUBSTANCE BEFORE PROSE.` … `- KILL THE BORING
    // MIDDLE.` out of this file, so the rule change reaches the matrix with no
    // second copy to drift. Renaming either marker silently detaches the harness
    // from production, which is the defect the lift convention exists to prevent.
    const HARNESS = readFileSync(join(REPO, 'scripts/qa/run-eval.mjs'), 'utf8')
    expect(HARNESS).toContain("'- SUBSTANCE BEFORE PROSE.'")
    expect(HARNESS).toContain("'- KILL THE BORING MIDDLE.'")
    expect(EDGE).toContain('- SUBSTANCE BEFORE PROSE.')
    expect(EDGE).toContain('- KILL THE BORING MIDDLE.')
  })
})

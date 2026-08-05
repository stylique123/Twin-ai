// A CROSSFADE MADE THE CAPTION TIMELINE RUN BACKWARDS.
//
// Found by the staging matrix's Phase 8 — the only step that renders real
// speech — and by nothing else, for two days. It failed the compile outright:
//
//   edit_plan_invalid: captions.cues[2]: overlaps or unsorted
//
// No output asset, no video, a permanently failed project. Every unit test in
// this repository passed throughout.
//
// WHY THE FIXTURES MISSED IT. `buildTimeMap` places a transition by starting
// the next piece EARLY (`outputStart[i] = outputEnd[i-1] - overlap`), which is
// correct: both pieces really are on screen during the fade. But it means a
// word at the START of the next piece maps to an earlier output time than a
// word at the END of the previous one. Removals are SILENCE, so a real cut
// lands flush against the words either side of it — precisely where the two
// spans collide. A synthetic fixture with a comfortable gap around every cut
// never collides, which is why this needed real ASR timings to appear.
import { describe, it, expect, beforeAll } from 'vitest'
import { baseInput, policy } from './fixtures/editPlanFixture.js'

let compileEditPlan: typeof import('../jobs/editorCompile.js').compileEditPlan

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ compileEditPlan } = await import('../jobs/editorCompile.js'))
})

/** The fixture's two accepted windows meet at 20000/25000. A word flush against
 *  each side is what silence-trimmed speech actually produces. */
function inputWithWordsFlushAgainstTheCut(transitionPolicy: 'hard_cuts_only' | 'restrained') {
  const input = baseInput()
  input.decision.transitionPolicy = transitionPolicy
  const words = input.evidence.words as Array<{ text: string; startMs: number; endMs: number; confidence: number }>
  words.push({ text: 'edge', startMs: 19600, endMs: 20000, confidence: 0.9 })
  words.push({ text: 'next', startMs: 25000, endMs: 25400, confidence: 0.9 })
  words.sort((a, b) => a.startMs - b.startMs)
  return { ...input, policy: policy() }
}

describe('captions survive a transition', () => {
  it('compiles a crossfade with words flush against the cut', () => {
    // THE REGRESSION. Before the clamp this threw `captions.cues[n]: overlaps
    // or unsorted` and the creator got no video at all.
    expect(() => compileEditPlan(inputWithWordsFlushAgainstTheCut('restrained'))).not.toThrow()
  })

  it('produces a strictly ordered, non-overlapping caption timeline', () => {
    // The plan's own validator enforces this, so the assertion is really "the
    // compiler no longer builds a document its validator refuses" — stated
    // here directly so a future change that breaks ordering says WHICH pair.
    const { plan } = compileEditPlan(inputWithWordsFlushAgainstTheCut('restrained'))
    expect(plan.video.transitions.length).toBeGreaterThan(0)
    for (let i = 1; i < plan.captions.cues.length; i++) {
      const prev = plan.captions.cues[i - 1]
      const cur = plan.captions.cues[i]
      expect(cur.outputStartMs).toBeGreaterThanOrEqual(prev.outputEndMs)
    }
  })

  it('loses no caption to the fade — the incoming one WAITS', () => {
    // The clamp delays a caption by at most the overlap; it must not drop one.
    // Both readings are equally true during a fade, and shortening the outgoing
    // cue would retract a caption already on screen.
    const hard = compileEditPlan(inputWithWordsFlushAgainstTheCut('hard_cuts_only')).plan
    const soft = compileEditPlan(inputWithWordsFlushAgainstTheCut('restrained')).plan
    expect(soft.captions.cues.length).toBe(hard.captions.cues.length)
  })

  it('a take with no transition is byte-identical to before the clamp', () => {
    // The clamp only ever fires inside an overlap, and a hard-cut plan has
    // none. Every already-shipped plan must be unmoved.
    const a = compileEditPlan(inputWithWordsFlushAgainstTheCut('hard_cuts_only'))
    const b = compileEditPlan(inputWithWordsFlushAgainstTheCut('hard_cuts_only'))
    expect(a.planSha256).toBe(b.planSha256)
    expect(a.plan.video.transitions).toEqual([])
  })
})

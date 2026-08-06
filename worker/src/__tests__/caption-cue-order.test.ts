// THE RE-QUEUED WORD THAT JUMPED THE QUEUE.
//
// Reproduced from the exact data of staging project 90eeb742, which failed the
// real render twice with:
//
//   edit_plan_invalid: captions.cues[2]: overlaps or unsorted
//
// A permanently failed project, no output asset, and nothing on screen saying
// why. Every unit test in this repository passed throughout, because the shape
// that triggers it needs real ASR timings AND a caption group too wide to lay
// out — the fixtures have neither together.
//
// THE MECHANISM. `flush()` gives the tail of an over-long cue back to `pending`
// so the words it could not lay out start the next cue rather than being
// dropped. The loop took the next word off `pending` BEFORE calling `flush()`,
// so the word it was holding jumped ahead of the re-queued tail:
//
//   [0]  0-940     "Stop scrolling"
//   [1]  3160-3540 "I"             <- held in `w`
//   [2]  1760-2420 "everything."   <- re-queued, and EARLIER in the take
//
// Two separate harms, and the second is the quieter one: the cues came out in
// the wrong order (which at least failed loudly), and words were LOST — "this
// change and" and "today." never reached the plan at all.
import { describe, it, expect, beforeAll } from 'vitest'
import { policy } from './fixtures/editPlanFixture.js'

let compileEditPlan: typeof import('../jobs/editorCompile.js').compileEditPlan

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ compileEditPlan } = await import('../jobs/editorCompile.js'))
})

/** Whisper's actual output for the Phase-8 fixture, word for word. */
const WORDS: Array<[string, number, number]> = [
  ['Stop', 0, 300], ['scrolling', 300, 940], ['this', 940, 1220], ['change', 1220, 1600],
  ['and', 1600, 1760], ['everything.', 1760, 2360], ['I', 4740, 5120], ['recorded', 5120, 5620],
  ['this', 5620, 6000], ['take', 6000, 6300], ['for', 6300, 6540], ['the', 6540, 6680],
  ['happy', 6680, 7000], ['scenario', 7000, 7500], ['today.', 7500, 8020],
]
const sha = (c: string) => c.repeat(64)

/** The real project's inputs: an upload, two selected silences, and one visual
 *  waste removal that OVERLAPS the first silence — which is what produces the
 *  two-piece time map the words then straddle. */
function stagingProject90eeb742() {
  return {
    identity: {
      projectId: '11111111-1111-1111-1111-111111111111',
      generationId: '22222222-2222-2222-2222-222222222222',
      sourceAssetId: '33333333-3333-3333-3333-333333333333',
      sourceChecksum: sha('a'), bootManifestSha: sha('b'),
      scriptSnapshotSha: sha('c'), decisionSha256: sha('d'),
    },
    source: { origin: 'upload' as const, durationMs: 15012, acceptedWindows: [] },
    evidence: {
      words: WORDS.map(([text, startMs, endMs]) => ({ text, startMs, endMs, confidence: 0.9 })),
      candidates: [
        { kind: 'silence' as const, startMs: 2724, endMs: 4956, wordIndices: [], confidence: 'high' as const, selectionEnabled: 1 as const },
        { kind: 'silence' as const, startMs: 8420, endMs: 15018, wordIndices: [], confidence: 'high' as const, selectionEnabled: 1 as const },
      ],
      visualWaste: [{ startMs: 2000, endMs: 4000, classCode: 0, selectionEnabled: 1 as const }],
      audio: { snrDbMilli: 26000, earlyEnergyRatioMilli: 120 },
      faces: [],
    },
    decision: {
      selections: [0, 1], visualWasteSelections: [0], emphasisWordIndices: [],
      hookTreatment: 'keep' as const, hookStartWordIndex: null,
      captionPresetId: 'caption-clean-keyword-v1' as const,
      transitionPolicy: 'hard_cuts_only' as const,
      zoomRequests: [
        { anchorWordIndex: 0, intensity: 'subtle' as const, reasonCode: 'scene_open' as const },
        { anchorWordIndex: 5, intensity: 'medium' as const, reasonCode: 'emphasis_word' as const },
      ],
    },
    policy: policy(),
  }
}

describe('the real render that produced no video', () => {
  it('compiles at all', () => {
    // THE REGRESSION. Before the fix this threw and the creator got nothing.
    expect(() => compileEditPlan(stagingProject90eeb742() as never)).not.toThrow()
  })

  it('emits cues in output order, non-overlapping', () => {
    const { plan } = compileEditPlan(stagingProject90eeb742() as never)
    for (let i = 1; i < plan.captions.cues.length; i++) {
      const prev = plan.captions.cues[i - 1]
      const cur = plan.captions.cues[i]
      expect(cur.outputStartMs).toBeGreaterThanOrEqual(prev.outputEndMs)
    }
  })

  it('LOSES NO WORD — the quieter half of the same defect', () => {
    // "this change and" and "today." were absent from the plan entirely. A
    // caption the creator spoke and never saw is exactly the silent degradation
    // this compiler keeps being written against, and it would have survived a
    // fix that only restored the ordering.
    const { plan } = compileEditPlan(stagingProject90eeb742() as never)
    const captioned = plan.captions.cues.flatMap((c) => c.lines.join(' ').split(/\s+/)).join(' ')
    for (const [text] of WORDS) expect(captioned).toContain(text)
  })

  it('keeps every cue inside a single kept piece', () => {
    // The property the grouping rule exists for: a cue that spanned a cut would
    // promise a caption over time that was removed.
    const { plan } = compileEditPlan(stagingProject90eeb742() as never)
    for (const cue of plan.captions.cues) {
      const inside = plan.timeline.segments.some(
        (s) => cue.outputStartMs >= s.outputStartMs && cue.outputEndMs <= s.outputEndMs,
      )
      expect(inside).toBe(true)
    }
  })
})

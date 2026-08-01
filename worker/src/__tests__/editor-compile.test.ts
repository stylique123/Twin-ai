// The Decision -> EditPlan compiler.
//
// Every guard here carries a MUTATION CONTROL (Gate-0 §8.1). The control form
// used throughout is the strongest one available to an in-process test: the
// compiler takes its frozen policy as an argument, so a control can DISABLE the
// guard for real — by moving the threshold it depends on — and assert that the
// outcome flips. That proves the fixture genuinely reaches the guard, which a
// green assertion on its own never does.
import { describe, it, expect } from 'vitest'
import { compileEditPlan, buildTimeMap, type CompileInput } from '../jobs/editorCompile.js'
import {
  EditPlanError, validateEditPlan,
  MAX_CUES, MAX_ZOOMS, MAX_SEGMENTS, MAX_REMOVALS,
} from '../jobs/editPlanContract.js'
import {
  baseInput, policy, shippedPolicy, EXPECTED, WINDOW_A, WINDOW_B, SOURCE_DURATION_MS,
} from './fixtures/editPlanFixture.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}

// A deliberately tiny source whose word list includes ONE word inside the
// rejected stretch between two accepted takes. The word is real and in
// chronological order, so any rejection of it is about the allowed domain and
// nothing else.
function offDomainWordInput(): CompileInput {
  const input = baseInput()
  input.source = {
    origin: 'teleprompter', durationMs: 30000,
    acceptedWindows: [{ startMs: 0, endMs: 10000 }, { startMs: 20000, endMs: 30000 }],
  }
  input.evidence = {
    words: [1000, 3000, 5000, 15000, 21000, 23000].map((startMs, i) => (
      { text: `t${i}`, startMs, endMs: startMs + 400, confidence: 0.9 })),
    candidates: [], visualWaste: [], audio: null,
  }
  input.decision = {
    ...input.decision,
    selections: [], visualWasteSelections: [], emphasisWordIndices: [],
    hookTreatment: 'keep', hookStartWordIndex: null, zoomRequests: [],
    transitionPolicy: 'hard_cuts_only',
  }
  return input
}

describe('allowed-domain selection', () => {
  it('teleprompter: the domain is EXACTLY the pinned accepted windows', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.source.allowedWindows).toEqual([WINDOW_A, WINDOW_B])
    // Nothing in the rejected takes reaches the timeline.
    for (const seg of plan.timeline.segments) {
      const inside = [WINDOW_A, WINDOW_B].some((w) => seg.sourceStartMs >= w.startMs && seg.sourceEndMs <= w.endMs)
      expect(inside).toBe(true)
    }
    const maxKept = Math.max(...plan.timeline.segments.map((s) => s.sourceEndMs))
    expect(maxKept).toBeLessThanOrEqual(WINDOW_B.endMs)
  })

  it('rejected bytes are unavailable FOREVER — a removal aimed at them is dropped, not honoured', () => {
    const input = baseInput()
    // A visual-waste candidate that lies wholly inside the rejected take.
    input.evidence.visualWaste = [{ startMs: 21000, endMs: 23000, classCode: 0, selectionEnabled: 1 }]
    input.decision.visualWasteSelections = [0]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.warnings.map((w) => w.code)).toContain('removal_outside_allowed_domain')
    for (const r of plan.timeline.removals) expect(r.sourceStartMs).toBeLessThan(20000)
  })

  it('upload: the domain is the whole file and accepted windows are forbidden', () => {
    const input = baseInput()
    input.source = { origin: 'upload', durationMs: SOURCE_DURATION_MS, acceptedWindows: [] }
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.source.allowedWindows).toEqual([{ startMs: 0, endMs: SOURCE_DURATION_MS }])

    const contradictory = baseInput()
    contradictory.source = { origin: 'upload', durationMs: SOURCE_DURATION_MS, acceptedWindows: [{ ...WINDOW_A }] }
    expect(codeOf(() => compileEditPlan({ ...contradictory, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('a teleprompter source with no accepted windows has no media at all', () => {
    const input = baseInput()
    input.source = { origin: 'teleprompter', durationMs: SOURCE_DURATION_MS, acceptedWindows: [] }
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_no_kept_media')
  })

  it('CONTROL: the domain restriction is load-bearing — an upload of the same source keeps the rejected bytes', () => {
    const tele = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const asUpload = baseInput()
    asUpload.source = { origin: 'upload', durationMs: SOURCE_DURATION_MS, acceptedWindows: [] }
    const up = compileEditPlan({ ...asUpload, policy: policy() }).plan
    // Same decision, same evidence: the ONLY difference is the allowed domain,
    // and it changes the output length by the rejected takes. If the domain were
    // ignored, these two would agree.
    expect(up.output.durationMs).toBeGreaterThan(tele.output.durationMs)
    expect(up.timeline.segments.some((s) => s.sourceEndMs > WINDOW_B.endMs)).toBe(true)
  })
})

describe('removal resolution', () => {
  it('produces exactly the hand-derived kept segments and time map', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.timeline.segments.map((s) => ({
      sourceStartMs: s.sourceStartMs, sourceEndMs: s.sourceEndMs,
      outputStartMs: s.outputStartMs, outputEndMs: s.outputEndMs,
    }))).toEqual(EXPECTED.keptSegments)
    expect(plan.timeline.removals.map((r) => ({ sourceStartMs: r.sourceStartMs, sourceEndMs: r.sourceEndMs })))
      .toEqual(EXPECTED.removals)
    expect(plan.output.durationMs).toBe(EXPECTED.outputDurationMs)
  })

  it('rejects an unknown candidate index', () => {
    const input = baseInput()
    input.decision.selections = [99]
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('rejects a duplicated candidate index', () => {
    const input = baseInput()
    input.decision.selections = [0, 0]
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('rejects a candidate whose word reference does not exist', () => {
    const input = baseInput()
    input.evidence.candidates[2].wordIndices = [12, 9999]
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('rejects selectionEnabled != 1', () => {
    const input = baseInput()
    input.evidence.candidates[2].selectionEnabled = 0
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_unsafe_cut')
  })

  it('rejects a filler candidate UNCONDITIONALLY', () => {
    const input = baseInput()
    input.decision.selections = [1]
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_filler_disabled')
  })

  it('CONTROL: filler rejection is not an accident of selectionEnabled', () => {
    // Make the filler candidate look perfectly selectable in every OTHER way.
    // If the filler check were really the selectionEnabled check wearing a
    // different name, this would now compile. It must still fail, with the
    // filler-specific code.
    const input = baseInput()
    input.evidence.candidates[1] = {
      ...input.evidence.candidates[1], selectionEnabled: 1, safeToConsider: true, confidence: 'high',
    }
    input.decision.selections = [1]
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_filler_disabled')

    // And the same candidate under any NON-filler kind compiles fine, proving
    // the fixture reaches the removal path and only the kind stops it.
    const asFalseStart = baseInput()
    asFalseStart.evidence.candidates[1] = {
      ...asFalseStart.evidence.candidates[1], kind: 'false_start', selectionEnabled: 1,
    }
    asFalseStart.decision.selections = [1]
    expect(() => compileEditPlan({ ...asFalseStart, policy: policy() })).not.toThrow()
  })

  it('keeps content for an unsafe candidate and says so', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.warnings).toContainEqual({ code: 'removal_skipped_unsafe_candidate', detail: 'candidate_4' })
    // Candidate 4 spans [30500,32500); nothing there was cut on its account.
    expect(plan.timeline.removals.some((r) => r.reasonCode === 'speech_silence' && r.sourceStartMs === 30500))
      .toBe(false)
  })

  it('keeps content for a low-confidence candidate and says so', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.warnings).toContainEqual({ code: 'removal_skipped_uncertain_candidate', detail: 'candidate_3' })
    const kept = plan.timeline.segments.some((s) => s.sourceStartMs <= 17000 && s.sourceEndMs >= 18400)
    expect(kept).toBe(true)
  })

  it('CONTROL: flipping safeToConsider/confidence flips the outcome', () => {
    const input = baseInput()
    input.evidence.candidates[3].confidence = 'high'
    input.evidence.candidates[4].safeToConsider = true
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.warnings.map((w) => w.code)).not.toContain('removal_skipped_uncertain_candidate')
    expect(plan.warnings.map((w) => w.code)).not.toContain('removal_skipped_unsafe_candidate')
    // Candidate 3's span is now genuinely cut — so the two assertions above are
    // testing a branch the fixture really reaches.
    const cut = plan.timeline.removals.some((r) => r.sourceStartMs >= 17000 && r.sourceEndMs <= 18400)
    expect(cut).toBe(true)
  })

  it('rejects a non-selectable visual-waste index and an unknown one', () => {
    const nonSelectable = baseInput()
    nonSelectable.decision.visualWasteSelections = [1]
    expect(codeOf(() => compileEditPlan({ ...nonSelectable, policy: policy() }))).toBe('edit_plan_unsafe_cut')

    const unknown = baseInput()
    unknown.decision.visualWasteSelections = [7]
    expect(codeOf(() => compileEditPlan({ ...unknown, policy: policy() }))).toBe('edit_plan_divergent')
  })
})

describe('protections', () => {
  it('a silence cut SNAPS inward to leave a phoneme handle on the neighbouring words', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    // Word 9 ends at 10400, word 10 starts at 11000, handle is 60 ms.
    const snapped = plan.timeline.removals.find((r) => r.sourceStartMs === 10460)
    expect(snapped).toBeDefined()
    expect(snapped?.sourceEndMs).toBe(10940)
    expect(plan.warnings).toContainEqual({ code: 'removal_snapped_to_safe_span', detail: 'speech_candidate_0' })
  })

  it('CONTROL: with the phoneme handle set to zero the SAME cut takes the whole gap', () => {
    const p = policy()
    p.cuts.minPhonemeHandleMs = 0
    const { plan } = compileEditPlan({ ...baseInput(), policy: p })
    const cut = plan.timeline.removals.find((r) => r.sourceStartMs === 10400)
    expect(cut?.sourceEndMs).toBe(11000)
    expect(plan.warnings.map((w) => w.detail)).not.toContain('speech_candidate_0')
  })

  it('protects words that the selection does not cover', () => {
    const input = baseInput()
    // A candidate that claims a span covering words 5..7 but only names word 6.
    input.evidence.candidates.push({
      kind: 'false_start', startMs: 6000, endMs: 8400, confidence: 'high',
      selectionEnabled: 1, safeToConsider: true, wordIndices: [6],
    })
    input.decision.selections = [5]
    input.decision.visualWasteSelections = []
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    // Words 5 (6000-6400) and 7 (8000-8400) are NOT covered, so their spans plus
    // handles survive; only the middle is removable.
    expect(plan.timeline.removals).toHaveLength(1)
    expect(plan.timeline.removals[0].sourceStartMs).toBe(6460)
    expect(plan.timeline.removals[0].sourceEndMs).toBe(7940)
    expect(plan.warnings.map((w) => w.code)).toContain('removal_snapped_to_safe_span')
  })

  // The emphasis beat: word 25 spans 36000-36400 and is the fixture's emphasis
  // word. A silence cut aimed at the pause right after it must be pushed back by
  // the 350 ms emphasis guard, well beyond the 60 ms handle every word gets.
  const emphasisBeatInput = (): CompileInput => {
    const input = baseInput()
    input.evidence.candidates.push({
      kind: 'silence', startMs: 36400, endMs: 37000, confidence: 'high',
      selectionEnabled: 1, safeToConsider: true, wordIndices: [],
    })
    input.decision.selections = [5]
    input.decision.visualWasteSelections = []
    return input
  }

  it('protects the emphasis beat around an emphasised word', () => {
    const { plan } = compileEditPlan({ ...emphasisBeatInput(), policy: policy() })
    // Guard 350 pushes the cut from 36400 to 36750; word 26 at 37000 keeps its
    // 60 ms handle, so the cut ends at 36940. 190 ms of the requested 600 survive.
    expect(plan.timeline.removals).toHaveLength(1)
    expect(plan.timeline.removals[0].sourceStartMs).toBe(36750)
    expect(plan.timeline.removals[0].sourceEndMs).toBe(36940)
    expect(plan.warnings).toContainEqual({ code: 'removal_snapped_to_safe_span', detail: 'speech_candidate_5' })
  })

  it('CONTROL: with the emphasis guard at zero the SAME cut reaches further back', () => {
    const p = policy()
    p.cuts.emphasisPauseGuardMs = 0
    const { plan } = compileEditPlan({ ...emphasisBeatInput(), policy: p })
    // Only the plain 60 ms word handle now applies, so the cut starts at 36460
    // instead of 36750 — the 290 ms difference IS the emphasis guard.
    expect(plan.timeline.removals).toHaveLength(1)
    expect(plan.timeline.removals[0].sourceStartMs).toBe(36460)
    expect(plan.timeline.removals[0].sourceEndMs).toBe(36940)
  })

  it('an emphasised word can never be removed, even by a selected candidate', () => {
    const input = baseInput()
    input.decision.emphasisWordIndices = [12] // candidate 2 targets words 12 and 13
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    const survives = plan.timeline.segments.some((s) => s.sourceStartMs <= 13000 && s.sourceEndMs >= 13400)
    expect(survives).toBe(true)
  })

  it('CONTROL: without the emphasis mark that same word IS removed', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const survives = plan.timeline.segments.some((s) => s.sourceStartMs <= 13000 && s.sourceEndMs >= 13400)
    expect(survives).toBe(false)
  })

  it('protects the boundaries of an accepted take', () => {
    const input = baseInput()
    // Dead air straddling the very start of window B.
    input.evidence.visualWaste = [{ startMs: 25000, endMs: 25800, classCode: 0, selectionEnabled: 1 }]
    input.decision.visualWasteSelections = [0]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    // The first 120 ms of the accepted take survive.
    expect(plan.timeline.segments.some((s) => s.sourceStartMs === WINDOW_B.startMs)).toBe(true)
  })

  it('CONTROL: with the scene-boundary guard at zero the take start is cut', () => {
    const input = baseInput()
    input.evidence.visualWaste = [{ startMs: 25000, endMs: 25800, classCode: 0, selectionEnabled: 1 }]
    input.decision.visualWasteSelections = [0]
    const p = policy()
    p.cuts.sceneBoundaryGuardMs = 0
    const { plan } = compileEditPlan({ ...input, policy: p })
    expect(plan.timeline.segments.some((s) => s.sourceStartMs === WINDOW_B.startMs)).toBe(false)
    expect(plan.timeline.removals.some((r) => r.sourceStartMs === WINDOW_B.startMs)).toBe(true)
  })

  it('never forces a cut: a fully protected removal keeps the content and warns', () => {
    const input = baseInput()
    // A "silence" sitting exactly on top of word 3 — every millisecond protected.
    input.evidence.candidates.push({
      kind: 'silence', startMs: 4000, endMs: 4400, confidence: 'high',
      selectionEnabled: 1, safeToConsider: true, wordIndices: [],
    })
    input.decision.selections = [5]
    input.decision.visualWasteSelections = []
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.warnings).toContainEqual({ code: 'removal_kept_protected_content', detail: 'speech_candidate_5' })
    expect(plan.timeline.removals).toHaveLength(0)
    // Nothing was cut, so the timeline is exactly the two accepted takes.
    expect(plan.timeline.segments.map((s) => [s.sourceStartMs, s.sourceEndMs]))
      .toEqual([[0, 20000], [25000, 50000]])
  })

  it('gives a removal back when it would leave a kept fragment below the minimum', () => {
    const input = baseInput()
    input.source = { origin: 'upload', durationMs: 10000, acceptedWindows: [] }
    input.evidence.words = []
    input.evidence.visualWaste = [
      { startMs: 1000, endMs: 2000, classCode: 0, selectionEnabled: 1 },
      { startMs: 2100, endMs: 3000, classCode: 0, selectionEnabled: 1 },
    ]
    input.evidence.candidates = []
    input.decision.selections = []
    input.decision.emphasisWordIndices = []
    input.decision.zoomRequests = []
    input.decision.visualWasteSelections = [0, 1]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    // Applying both would leave a 100 ms island at [2000,2100); minKeptSegmentMs
    // is 400, so one removal is reverted and the content stays.
    expect(plan.warnings.map((w) => w.code)).toContain('removal_reverted_min_segment')
    for (const seg of plan.timeline.segments) {
      expect(seg.sourceEndMs - seg.sourceStartMs).toBeGreaterThanOrEqual(400)
    }
  })

  it('CONTROL: with minKeptSegmentMs at 1 the island survives and both cuts are made', () => {
    const input = baseInput()
    input.source = { origin: 'upload', durationMs: 10000, acceptedWindows: [] }
    input.evidence.words = []
    input.evidence.visualWaste = [
      { startMs: 1000, endMs: 2000, classCode: 0, selectionEnabled: 1 },
      { startMs: 2100, endMs: 3000, classCode: 0, selectionEnabled: 1 },
    ]
    input.evidence.candidates = []
    input.decision.selections = []
    input.decision.emphasisWordIndices = []
    input.decision.zoomRequests = []
    input.decision.visualWasteSelections = [0, 1]
    const p = policy()
    p.cuts.minKeptSegmentMs = 1
    const { plan } = compileEditPlan({ ...input, policy: p })
    expect(plan.warnings.map((w) => w.code)).not.toContain('removal_reverted_min_segment')
    expect(plan.timeline.segments.some((s) => s.sourceStartMs === 2000 && s.sourceEndMs === 2100)).toBe(true)
  })
})

describe('hook treatment', () => {
  it('open_at_word trims to a real pinned word and records the exact source trim', () => {
    const input = baseInput()
    input.decision.hookTreatment = 'open_at_word'
    input.decision.hookStartWordIndex = 5 // starts at 6000
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.hook.treatment).toBe('open_at_word')
    expect(plan.hook.startWordIndex).toBe(5)
    expect(plan.hook.sourceTrimStartMs).toBe(0)
    expect(plan.hook.sourceTrimEndMs).toBe(6000 - 60) // minus the phoneme handle
    expect(plan.timeline.segments[0].sourceStartMs).toBe(5940)
    expect(plan.timeline.segments[0].outputStartMs).toBe(0)
    // No word was invented and nothing was reordered.
    for (let i = 1; i < plan.timeline.segments.length; i++) {
      expect(plan.timeline.segments[i].sourceStartMs)
        .toBeGreaterThanOrEqual(plan.timeline.segments[i - 1].sourceEndMs)
    }
  })

  it('the hook is applied BEFORE candidate subtraction', () => {
    const input = baseInput()
    input.decision.hookTreatment = 'open_at_word'
    input.decision.hookStartWordIndex = 12 // 13000 — inside candidate 2's span
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    // Candidate 2 ([13000,14400)) now falls inside the hook trim's shadow: the
    // trim reaches 12940, and the candidate is clipped to what is left.
    expect(plan.hook.sourceTrimEndMs).toBe(12940)
    expect(plan.timeline.segments[0].sourceStartMs).toBe(12940)
    // The earlier silence cut at [10460,10940) is GONE — it was inside the
    // trimmed region, which only holds if the hook ran first.
    expect(plan.timeline.removals.some((r) => r.sourceStartMs === 10460)).toBe(false)
  })

  it('refuses a hook word outside the allowed domain rather than moving it', () => {
    // Word 3 (15000) sits in the REJECTED stretch between the two accepted
    // takes. It is a real, in-order word — so the compiler must reject it for
    // being outside the domain, not for being malformed.
    const input = offDomainWordInput()
    input.decision.hookTreatment = 'open_at_word'
    input.decision.hookStartWordIndex = 3
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_unsafe_cut')
  })

  it('CONTROL: the SAME hook request on an in-domain word succeeds', () => {
    const input = offDomainWordInput()
    input.decision.hookTreatment = 'open_at_word'
    input.decision.hookStartWordIndex = 2 // 5000, inside the first accepted take
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.hook.startWordIndex).toBe(2)
    expect(plan.hook.sourceTrimEndMs).toBe(4940)
  })

  it('refuses a fabricated hook word index', () => {
    const input = baseInput()
    input.decision.hookTreatment = 'open_at_word'
    input.decision.hookStartWordIndex = 4242
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('keep trims nothing', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.hook.treatment).toBe('keep')
    expect(plan.hook.sourceTrimStartMs).toBe(plan.hook.sourceTrimEndMs)
    expect(plan.hook.startWordIndex).toBeNull()
  })

  it('CONTROL: the hook genuinely shortens the output', () => {
    const kept = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const input = baseInput()
    input.decision.hookTreatment = 'open_at_word'
    input.decision.hookStartWordIndex = 5
    const hooked = compileEditPlan({ ...input, policy: policy() }).plan
    expect(kept.output.durationMs - hooked.output.durationMs).toBe(5940)
  })
})

describe('transitions', () => {
  it('restrained is honoured only at a verified scene boundary with handles', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.video.transitionPolicy).toBe('restrained')
    expect(plan.video.transitions).toEqual([
      { index: 0, atSegmentIndex: EXPECTED.transitionAtSegmentIndex, kind: 'crossfade', overlapMs: EXPECTED.transitionOverlapMs },
    ])
    // The overlap is counted once, in the time map, and nowhere else.
    const seg = plan.timeline.segments[EXPECTED.transitionAtSegmentIndex]
    expect(seg.transitionInOverlapMs).toBe(EXPECTED.transitionOverlapMs)
    expect(seg.outputStartMs).toBe(plan.timeline.segments[2].outputEndMs - EXPECTED.transitionOverlapMs)
  })

  it('an upload never gets a transition — it has no verified scene boundary', () => {
    const input = baseInput()
    input.source = { origin: 'upload', durationMs: SOURCE_DURATION_MS, acceptedWindows: [] }
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.video.transitions).toEqual([])
    expect(plan.video.transitionPolicy).toBe('hard_cuts_only')
    expect(plan.warnings).toContainEqual({ code: 'transition_policy_downgraded', detail: 'upload_has_no_scene_boundary' })
  })

  it('hard_cuts_only produces no transitions and no overlap anywhere', () => {
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.video.transitions).toEqual([])
    for (const s of plan.timeline.segments) expect(s.transitionInOverlapMs).toBe(0)
    // Without the overlap the timeline is exactly 120 ms longer.
    expect(plan.output.durationMs).toBe(EXPECTED.outputDurationMs + EXPECTED.transitionOverlapMs)
  })

  it('CONTROL: raising the handle requirement removes the transition', () => {
    const p = policy()
    p.transitions.minHandleMs = 100000
    const { plan } = compileEditPlan({ ...baseInput(), policy: p })
    expect(plan.video.transitions).toEqual([])
    expect(plan.video.transitionPolicy).toBe('hard_cuts_only')
    expect(plan.warnings.map((w) => w.code)).toContain('transition_skipped_no_handle')
  })
})

describe('captions', () => {
  it('every cue lies inside a kept segment and inside the output', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.captions.cues.length).toBeGreaterThan(0)
    for (const cue of plan.captions.cues) {
      expect(cue.outputEndMs).toBeLessThanOrEqual(plan.output.durationMs)
      const owner = plan.timeline.segments.find(
        (s) => cue.outputStartMs >= s.outputStartMs && cue.outputStartMs < s.outputEndMs)
      expect(owner).toBeDefined()
    }
  })

  it('no removed word appears in any cue', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const captioned = new Set(plan.captions.cues.flatMap((c) => c.lines.flatMap((l) => l.split(' '))))
    // Words 12 and 13 were cut with candidate 2.
    expect(captioned.has('w12')).toBe(false)
    expect(captioned.has('w13')).toBe(false)
    // And words that survived are present, so the assertion is not vacuously
    // true because captions are empty.
    expect(captioned.has('w0')).toBe(true)
    expect(captioned.has('w14')).toBe(true)
  })

  it('honours the frozen preset limits', () => {
    const p = policy()
    const preset = p.captions.presets['caption-clean-keyword-v1']
    const { plan } = compileEditPlan({ ...baseInput(), policy: p })
    for (const cue of plan.captions.cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(p.captions.maxLinesPerCue)
      for (const line of cue.lines) expect(line.length).toBeLessThanOrEqual(preset.maxCharsPerLine)
      const words = cue.lines.join(' ').split(' ').length
      expect(words).toBeLessThanOrEqual(preset.maxWordsPerCue)
      expect(cue.outputEndMs - cue.outputStartMs).toBeLessThanOrEqual(preset.maxCueDurationMs)
    }
  })

  it('a different preset produces a different grouping', () => {
    const punchy = baseInput()
    punchy.decision.captionPresetId = 'caption-punchy-word-v1'
    const a = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const b = compileEditPlan({ ...punchy, policy: policy() }).plan
    expect(b.captions.cues.length).toBeGreaterThan(a.captions.cues.length)
    for (const cue of b.captions.cues) {
      expect(cue.lines.join(' ').split(' ').length).toBeLessThanOrEqual(2)
    }
  })

  it('emphasis appears only on real selected indices', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.captions.cues.flatMap((c) => c.emphasisWordIndices)).toEqual([25])
  })

  it('an emphasis mark on a word outside the allowed domain never reaches a cue', () => {
    // Word 3 lives in the rejected stretch, so it is captioned nowhere and can
    // carry no emphasis — the mark is dropped rather than moved to a neighbour.
    const input = offDomainWordInput()
    input.decision.emphasisWordIndices = [3]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.captions.cues.flatMap((c) => c.emphasisWordIndices)).toEqual([])
    expect(plan.captions.cues.length).toBeGreaterThan(0)
  })

  it('CONTROL: the same mark on an in-domain word DOES reach a cue', () => {
    const input = offDomainWordInput()
    input.decision.emphasisWordIndices = [2]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.captions.cues.flatMap((c) => c.emphasisWordIndices)).toEqual([2])
  })

  it('rejects a fabricated emphasis index', () => {
    const input = baseInput()
    input.decision.emphasisWordIndices = [9999]
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('CONTROL: the "no removed word" assertion is potent — the removal is what excludes them', () => {
    const input = baseInput()
    input.decision.selections = [0, 3, 4] // drop candidate 2, which cut words 12/13
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    const captioned = new Set(plan.captions.cues.flatMap((c) => c.lines.flatMap((l) => l.split(' '))))
    expect(captioned.has('w12')).toBe(true)
    expect(captioned.has('w13')).toBe(true)
  })

  it('a word straddling a cut is dropped rather than half-shown', () => {
    const input = baseInput()
    input.evidence.candidates.push({
      kind: 'false_start', startMs: 7200, endMs: 8600, confidence: 'high',
      selectionEnabled: 1, safeToConsider: true, wordIndices: [6, 7],
    })
    input.decision.selections = [5]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    for (const cue of plan.captions.cues) {
      const owner = plan.timeline.segments.find(
        (s) => cue.outputStartMs >= s.outputStartMs && cue.outputEndMs <= s.outputEndMs)
      expect(owner).toBeDefined()
    }
  })
})

describe('zooms', () => {
  it('anchors to a retained word and stays inside its segment', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.video.zooms).toHaveLength(1)
    const z = plan.video.zooms[0]
    expect(z.anchorWordIndex).toBe(26)
    expect(z.scaleMilli).toBe(1120) // medium
    expect(z.outputStartMs).toBe(27000)
    expect(z.outputEndMs).toBe(28200)
    const owner = plan.timeline.segments.find((s) => z.outputStartMs >= s.outputStartMs && z.outputEndMs <= s.outputEndMs)
    expect(owner).toBeDefined()
  })

  it('drops a zoom whose anchor was removed — and never moves it', () => {
    const input = baseInput()
    input.decision.zoomRequests = [{ anchorWordIndex: 12, intensity: 'subtle', reasonCode: 'emphasis_word' }]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.video.zooms).toEqual([])
    expect(plan.warnings).toContainEqual({ code: 'zoom_dropped_anchor_removed', detail: 'word_12' })
  })

  it('CONTROL: the same zoom request survives when its anchor is not removed', () => {
    const input = baseInput()
    input.decision.selections = [0, 3, 4] // candidate 2 no longer cuts word 12
    input.decision.zoomRequests = [{ anchorWordIndex: 12, intensity: 'subtle', reasonCode: 'emphasis_word' }]
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.video.zooms).toHaveLength(1)
    expect(plan.video.zooms[0].anchorWordIndex).toBe(12)
  })

  it('enforces the minimum separation and the frozen maximum of 20', () => {
    const input = baseInput()
    input.decision.zoomRequests = [23, 24, 25].map((i) => (
      { anchorWordIndex: i, intensity: 'subtle' as const, reasonCode: 'retention_beat' as const }))
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    // Words are 1000 ms apart and the hold is 1200 ms, so consecutive anchors
    // cannot satisfy a 1500 ms separation.
    expect(plan.video.zooms).toHaveLength(1)
    expect(plan.warnings.map((w) => w.code)).toContain('zoom_dropped_min_separation')

    const many = baseInput()
    many.decision.zoomRequests = Array.from({ length: 16 }, (_, k) => (
      { anchorWordIndex: 23 + k, intensity: 'subtle' as const, reasonCode: 'retention_beat' as const }))
    const { plan: p2 } = compileEditPlan({ ...many, policy: policy() })
    expect(p2.video.zooms.length).toBeLessThanOrEqual(20)
  })

  it('CONTROL: with the separation at zero every anchor is accepted', () => {
    const input = baseInput()
    input.decision.zoomRequests = [23, 24, 25].map((i) => (
      { anchorWordIndex: i, intensity: 'subtle' as const, reasonCode: 'retention_beat' as const }))
    const p = policy()
    p.zooms.minSeparationMs = 0
    p.zooms.holdMs = 500
    const { plan } = compileEditPlan({ ...input, policy: p })
    expect(plan.video.zooms).toHaveLength(3)
  })
})

describe('brand caption colors', () => {
  it('with no brandColors passed at all, both plan fields are null', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.captions.brandPrimaryColourAss).toBeNull()
    expect(plan.captions.brandHighlightColourAss).toBeNull()
  })

  it('with brandColors present but both hexes null, both plan fields are null', () => {
    const input = { ...baseInput(), policy: policy(), brandColors: { primaryHex: null, highlightHex: null } }
    const { plan } = compileEditPlan(input)
    expect(plan.captions.brandPrimaryColourAss).toBeNull()
    expect(plan.captions.brandHighlightColourAss).toBeNull()
  })

  it('converts #rrggbb to ASS &H00BBGGRR — bytes reversed, alpha forced opaque', () => {
    const input = {
      ...baseInput(), policy: policy(),
      brandColors: { primaryHex: '#123456', highlightHex: '#abcdef' },
    }
    const { plan } = compileEditPlan(input)
    expect(plan.captions.brandPrimaryColourAss).toBe('&H00563412')
    expect(plan.captions.brandHighlightColourAss).toBe('&H00EFCDAB')
  })

  it('the two colors are independent — one present, one absent', () => {
    const input = {
      ...baseInput(), policy: policy(),
      brandColors: { primaryHex: '#123456', highlightHex: null },
    }
    const { plan } = compileEditPlan(input)
    expect(plan.captions.brandPrimaryColourAss).toBe('&H00563412')
    expect(plan.captions.brandHighlightColourAss).toBeNull()
  })

  it('a plan carrying brand colors still passes the strict validator it did not write', () => {
    const input = {
      ...baseInput(), policy: policy(),
      brandColors: { primaryHex: '#123456', highlightHex: '#abcdef' },
    }
    const { plan } = compileEditPlan(input)
    expect(() => validateEditPlan(JSON.parse(JSON.stringify(plan)))).not.toThrow()
  })
})

describe('the last caption never reaches the last frame', () => {
  // THE REGRESSION. The compiler clamps cues to plan.output.durationMs; the
  // output validator compares them to the MEASURED duration of the encoded
  // file with ZERO tolerance. Those only coexist while something leaves slack
  // at the end, and trailing silence used to. The edge trim removed it: the
  // video now ends 120 ms after the last spoken word and the reading-speed
  // rule extends the final cue into whatever room is left, so the planned cue
  // ended exactly at the planned duration and a file one frame short failed
  // the whole render with `output_caption_invalid`.
  //
  // This suite ran green throughout, because its policy() fixture has the edge
  // trim OFF. Staging found it. So these assert against the SHIPPED policy.
  it('leaves at least the tail guard between the final cue and the end', () => {
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    const { plan } = compileEditPlan({ ...input, policy: shippedPolicy() })
    const last = plan.captions.cues[plan.captions.cues.length - 1]
    expect(plan.output.durationMs - last.outputEndMs).toBeGreaterThanOrEqual(shippedPolicy().captions.tailGuardMs)
  })

  it('holds for EVERY cue, not merely the last one', () => {
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    const { plan } = compileEditPlan({ ...input, policy: shippedPolicy() })
    for (const c of plan.captions.cues) {
      expect(c.outputEndMs).toBeLessThanOrEqual(plan.output.durationMs - shippedPolicy().captions.tailGuardMs)
    }
  })

  it('CONTROL: the ceiling actually BINDS — raising the guard moves the last cue earlier', () => {
    // Worth stating precisely, because my first attempt at this control was
    // wrong. On THIS fixture the final cue already ends 120 ms early — that
    // slack comes from edges.keepMs, not from the guard. What broke staging
    // was a cue the reading-speed rule EXTENDED into the remaining room until
    // it touched the planned duration. So the property to prove is not "the
    // fixture has slack" but "the ceiling is load-bearing when a cue reaches
    // for it": raise the guard and the final cue must move.
    const lastEnd = (tailGuardMs: number): number => {
      const p = shippedPolicy()
      p.captions.tailGuardMs = tailGuardMs
      const input = baseInput()
      input.decision.transitionPolicy = 'hard_cuts_only'
      const { plan } = compileEditPlan({ ...input, policy: p })
      const cues = plan.captions.cues
      return cues[cues.length - 1].outputEndMs
    }
    const loose = lastEnd(0)
    const tight = lastEnd(400)
    expect(tight).toBeLessThan(loose)
    // And it lands exactly on the ceiling, not merely somewhere earlier.
    const { plan } = compileEditPlan({ ...baseInput(), decision: { ...baseInput().decision, transitionPolicy: 'hard_cuts_only' }, policy: shippedPolicy() })
    expect(tight).toBe(plan.output.durationMs - 400)
  })

  it('a cue squeezed out entirely is announced, never silently dropped', () => {
    const p = shippedPolicy()
    // Absurd guard: nothing can fit. The point is that the loss is REPORTED.
    p.captions.tailGuardMs = 10_000_000
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    const { plan, warnings } = compileEditPlan({ ...input, policy: p })
    expect(plan.captions.cues).toHaveLength(0)
    expect(warnings.some((w) => w.code === 'caption_dropped_past_tail_guard')).toBe(true)
  })
})

describe('audio instructions', () => {
  it('chooses a frozen preset from bounded numeric evidence and emits no filter string', () => {
    const clean = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    expect(clean.audio.presetId).toBe('speech-clean-v1')

    const noisyInput = baseInput()
    noisyInput.evidence.audio = { snrDbMilli: 9000, earlyEnergyRatioMilli: 100 }
    expect(compileEditPlan({ ...noisyInput, policy: policy() }).plan.audio.presetId).toBe('speech-noisy-v1')

    // THE ROOMY BRANCH IS UNREACHABLE ON PURPOSE. `earlyEnergyRatio` is the
    // first-3s RMS against the whole-file RMS; reverberation is a decay
    // property. They share a word and nothing else. Equal levels give 1000
    // milli and the old threshold fired above 350, so nearly every recording
    // with speech at the start would have been de-reverbed once the facts
    // actually reached the compiler. See the comment at the branch.
    const roomyInput = baseInput()
    roomyInput.evidence.audio = { snrDbMilli: 30000, earlyEnergyRatioMilli: 900 }
    const roomy = compileEditPlan({ ...roomyInput, policy: policy() })
    expect(roomy.plan.audio.presetId).toBe('speech-clean-v1')
    expect(roomy.warnings.some((w) => w.code === 'audio_roomy_detection_unavailable')).toBe(true)
  })

  it('CONTROL: a clean recording still reaches the compiler as FACTS, not as a missing component', () => {
    // The defect this replaced: readComponentAudioFacts asked for keys the
    // analyzer never wrote, so evidence.audio was null on every render and the
    // plan carried `audio_preset_defaulted/no_audio_component` — a warning
    // that names the wrong cause. Present-and-clean must be distinguishable
    // from absent, or the noisy preset can never fire.
    const { warnings } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(warnings.some((w) => w.code === 'audio_preset_defaulted')).toBe(false)
  })

  it('carries the frozen loudness targets and never a music bed', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.audio.targetLufsMilli).toBe(-14000)
    expect(plan.audio.toleranceLuMilli).toBe(1000)
    expect(plan.audio.truePeakCeilingDbtpMilli).toBe(-1000)
    expect(plan.audio.music).toBeNull()
  })

  it('warns when there is no audio component instead of guessing', () => {
    const input = baseInput()
    input.evidence.audio = null
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.audio.presetId).toBe('speech-clean-v1')
    expect(plan.warnings).toContainEqual({ code: 'audio_preset_defaulted', detail: 'no_audio_component' })
  })
})

describe('cover + duration', () => {
  it('the cover frame goes through the SAME time map', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.cover.outputTimeMs).toBe(1200)
    expect(plan.cover.sourceTimeMs).toBe(1200)
    const seg = plan.timeline.segments.find(
      (s) => plan.cover.sourceTimeMs >= s.sourceStartMs && plan.cover.sourceTimeMs < s.sourceEndMs)
    expect(seg).toBeDefined()
    expect(plan.cover.outputTimeMs)
      .toBe((seg as { outputStartMs: number }).outputStartMs
        + (plan.cover.sourceTimeMs - (seg as { sourceStartMs: number }).sourceStartMs))
  })

  it('the output duration equals the time map end, recomputed independently', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const map = buildTimeMap(
      plan.timeline.segments.map((s) => ({ startMs: s.sourceStartMs, endMs: s.sourceEndMs })),
      plan.timeline.segments.map((s) => s.transitionInOverlapMs))
    expect(plan.output.durationMs).toBe(map.outputDurationMs)
  })

  it('refuses a source longer than the frozen editor maximum', () => {
    const input = baseInput()
    input.source = { origin: 'upload', durationMs: 900001, acceptedWindows: [] }
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('source_too_long_for_editor')
  })

  it('accepts exactly the frozen maximum', () => {
    const input: CompileInput = baseInput()
    input.source = { origin: 'upload', durationMs: 900000, acceptedWindows: [] }
    input.evidence.words = []
    input.evidence.candidates = []
    input.evidence.visualWaste = []
    input.decision.selections = []
    input.decision.visualWasteSelections = []
    input.decision.emphasisWordIndices = []
    input.decision.zoomRequests = []
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    expect(plan.output.durationMs).toBe(900000)
  })
})

describe('determinism + self-validation', () => {
  it('compiling the same input twice is byte-identical', () => {
    const a = compileEditPlan({ ...baseInput(), policy: policy() })
    const b = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(a.canonical).toBe(b.canonical)
    expect(a.planSha256).toBe(b.planSha256)
  })

  it('the compiler output passes the strict validator it did not write', () => {
    const { plan, canonical } = compileEditPlan({ ...baseInput(), policy: policy() })
    const round = validateEditPlan(JSON.parse(canonical))
    expect(round).toEqual(plan)
  })

  it('warnings stay bounded and are all plain codes', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.warnings.length).toBeLessThanOrEqual(200)
    for (const w of plan.warnings) {
      expect(w.code).toMatch(/^[a-z0-9_]+$/)
      expect(w.detail).toMatch(/^[A-Za-z0-9._-]+$/)
    }
  })

  it('complexity counters agree with the document', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.complexity.segmentCount).toBe(plan.timeline.segments.length)
    expect(plan.complexity.removalCount).toBe(plan.timeline.removals.length)
    expect(plan.complexity.cueCount).toBe(plan.captions.cues.length)
    expect(plan.complexity.zoomCount).toBe(plan.video.zooms.length)
    expect(plan.complexity.transitionCount).toBe(plan.video.transitions.length)
    expect(plan.complexity.wordCount).toBe(39)
  })
})

describe('the policy cannot ask for more than the contract will accept', () => {
  // THIS PAIR ALREADY DRIFTED ONCE, and the result was a guaranteed permanent
  // failure rather than a degradation. MAX_CUES was halved to 1000 when
  // lineTokens doubled a cue's worst-case bytes (to keep the plan under the
  // 1 MiB cap by construction) and the policy was left at 2000 — so the
  // compiler was licensed to emit a plan its own validator would reject with
  // `edit_plan_invalid`, no retry, on any take long enough to reach it.
  //
  // Nothing caught it because each number is individually correct and each
  // file is individually consistent. Only the RELATIONSHIP was wrong, and
  // nothing was looking at the relationship.

  it('captions.maxCues never exceeds the contract ceiling', () => {
    const pol = policy()
    expect(pol.captions.maxCues).toBeLessThanOrEqual(MAX_CUES)
  })

  it('every array bound in the policy is within its contract bound', () => {
    const pol = policy()
    expect(pol.zooms.maxCount).toBeLessThanOrEqual(MAX_ZOOMS)
    expect(pol.cuts.maxKeptSegments).toBeLessThanOrEqual(MAX_SEGMENTS)
    expect(pol.cuts.maxRemovals).toBeLessThanOrEqual(MAX_REMOVALS)
  })
})

describe('a word too wide for a line is broken, not run off the frame', () => {
  // THE DEFECT. layoutLines starts a line with a token however long it is
  // (`|| current === ''`), because a token that fits nowhere still has to go
  // somewhere. So a single long word became a LINE wider than the preset — a
  // 30-char word under a 22-char preset renders ~36% past the intended width
  // and off the side of a 1080-wide frame. Nothing caught it: the plan
  // contract bounds a line at 200 chars, which is an anti-absurdity limit, not
  // the typographic width the preset designs for. URLs, handles, hashtags and
  // hyphenated compounds clear these limits routinely.
  const LONG = 'Sonderzeichenverkettungswort' // 28 chars vs the preset's 22

  function planWithLongWord(): ReturnType<typeof compileEditPlan> {
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    input.evidence.words = input.evidence.words.map((w, i) => (i === 0 ? { ...w, text: LONG } : w))
    return compileEditPlan({ ...input, policy: policy() })
  }

  it('no line exceeds the preset width', () => {
    const { plan } = planWithLongWord()
    const maxChars = policy().captions.presets['caption-clean-keyword-v1'].maxCharsPerLine
    for (const cue of plan.captions.cues) {
      for (const line of cue.lines) expect(line.length).toBeLessThanOrEqual(maxChars)
    }
  })

  it('CONTROL: the long word really is present and really is over the limit', () => {
    // Otherwise "no line is too long" could be true because the word never
    // reached a cue at all.
    const { plan } = planWithLongWord()
    const maxChars = policy().captions.presets['caption-clean-keyword-v1'].maxCharsPerLine
    expect(LONG.length).toBeGreaterThan(maxChars)
    const all = plan.captions.cues.flatMap((c) => c.lines).join(' ')
    // Present as fragments that reassemble, not dropped.
    expect(all.replace(/ /g, '')).toContain(LONG)
  })

  it('keeps the validator invariant: joined tokens reproduce the line exactly', () => {
    // The plan validator checks lineTokens[j].join(' ') === lines[j]. Splitting
    // a token is exactly the operation that could break it.
    const { plan } = planWithLongWord()
    for (const cue of plan.captions.cues) {
      cue.lines.forEach((line, j) => expect(cue.lineTokens[j].join(' ')).toBe(line))
      expect(cue.lineEmphasis.length).toBe(cue.lines.length)
      cue.lineTokens.forEach((toks, j) => expect(cue.lineEmphasis[j].length).toBe(toks.length))
    }
  })

  it('the whole plan still validates', () => {
    // The real proof that nothing downstream was broken by the split.
    const { plan } = planWithLongWord()
    expect(() => validateEditPlan(plan)).not.toThrow()
  })

  it('a word too long for EVERY line fills them at the allowed width, and says so', () => {
    // The old fallback emitted one line of maxCharsPerLine * maxLines — the
    // widest line in the system, produced by the branch whose job was handling
    // "too wide to fit".
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    input.evidence.words = input.evidence.words.map((w, i) => (i === 0 ? { ...w, text: 'x'.repeat(300) } : w))
    const { plan, warnings } = compileEditPlan({ ...input, policy: policy() })
    const pol = policy()
    const maxChars = pol.captions.presets['caption-clean-keyword-v1'].maxCharsPerLine
    const first = plan.captions.cues[0]
    expect(first.lines.length).toBeLessThanOrEqual(pol.captions.maxLinesPerCue)
    for (const line of first.lines) expect(line.length).toBeLessThanOrEqual(maxChars)
    expect(warnings.some((w) => w.code === 'caption_line_overflow')).toBe(true)
    expect(() => validateEditPlan(plan)).not.toThrow()
  })

  it('an ordinary cue is untouched — fragmentation only fires on over-wide tokens', () => {
    // CONTROL against the fix being a blunt instrument that reformats
    // everything: normal words must still share a line.
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    expect(plan.captions.cues.some((c) => c.lineTokens.some((t) => t.length > 1))).toBe(true)
  })
})

describe('captions stay clear of the platform UI band', () => {
  // caption-minimal-subtitle-v1 placed its baseline 80px INSIDE the band that
  // TikTok and Reels cover with the caption stack and CTA — declared unsafe by
  // this same policy file, three keys away, and read by nothing.
  it('every preset respects the framing safe area it is shipped alongside', () => {
    const pol = policy()
    for (const [id, preset] of Object.entries(pol.captions.presets)) {
      expect(
        preset.marginVerticalPx,
        `caption preset ${id} sits inside framing.safeBottomPx`,
      ).toBeGreaterThanOrEqual(pol.framing.safeBottomPx)
    }
  })
})

describe('a zoom punches at the subject, not at the geometry', () => {
  // THE DETECTOR HAS ALWAYS RUN AND NOTHING EVER READ IT. Face boxes were
  // produced per sample and reduced to a COUNT before any decision-maker saw
  // them, so every zoom cropped the geometric centre of the frame. A creator
  // sitting low or off to one side — the normal case for a hand-held vertical
  // selfie — got their chin or forehead cropped, or a punch into the wall.

  it('displaces the crop toward an off-centre face', () => {
    // The fixture's subject sits at 380,1240 in 1080x1920 — left of and below
    // the 540,960 centre. So the crop moves left (negative X) and down.
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const z = plan.video.zooms[0]
    expect(z.offsetXPx).toBeLessThan(0)
    expect(z.offsetYPx).toBeGreaterThan(0)
  })

  it('never displaces further than the scale actually reveals', () => {
    // A crop displaced past the edge of the scaled image is one ffmpeg clamps
    // silently, landing the punch somewhere nobody chose. The subject here is
    // 160px left of centre but a 1.12x zoom only reveals 64px of slack.
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const z = plan.video.zooms[0]
    const maxX = Math.floor((plan.output.width * (z.scaleMilli - 1000)) / 2000)
    const maxY = Math.floor((plan.output.height * (z.scaleMilli - 1000)) / 2000)
    expect(Math.abs(z.offsetXPx)).toBeLessThanOrEqual(maxX)
    expect(Math.abs(z.offsetYPx)).toBeLessThanOrEqual(maxY)
    expect(z.offsetXPx).toBe(-maxX) // clamped, because the face is further out
  })

  it('CONTROL: with NO face evidence it centres — chosen, not defaulted', () => {
    const input = baseInput()
    input.evidence.faces = []
    const r = compileEditPlan({ ...input, policy: policy() })
    expect(r.plan.video.zooms[0].offsetXPx).toBe(0)
    expect(r.plan.video.zooms[0].offsetYPx).toBe(0)
    // ...and says so, rather than looking identical to a deliberate centre.
    expect(r.warnings.some((w) => w.code === 'zoom_centred_no_face_evidence')).toBe(true)
  })

  it('CONTROL: a centred subject yields a centred punch', () => {
    const input = baseInput()
    input.evidence.faces = [{ timeMs: 0, centreXPx: 540, centreYPx: 960 }]
    const plan = compileEditPlan({ ...input, policy: policy() }).plan
    expect(plan.video.zooms[0].offsetXPx).toBe(0)
    expect(plan.video.zooms[0].offsetYPx).toBe(0)
  })

  it('uses the face NEAREST the anchor in time, not an average of the take', () => {
    // Where the subject was thirty seconds earlier is not evidence about this
    // moment. The anchor word (index 26) starts at 27000ms in the fixture.
    const input = baseInput()
    input.evidence.faces = [
      { timeMs: 0, centreXPx: 1000, centreYPx: 200 },      // far away in time
      { timeMs: 27000, centreXPx: 540, centreYPx: 960 },   // at the anchor
    ]
    const plan = compileEditPlan({ ...input, policy: policy() }).plan
    expect(plan.video.zooms[0].offsetXPx).toBe(0)
  })

  it('maps through the renderer\'s OWN cover-crop for a non-9:16 source', () => {
    // A 1920x1080 landscape source is cover-scaled and centre-cropped to
    // 1080x1920 before any zoom. A face at the source's centre is still centred
    // afterwards; one off-centre horizontally is mostly cropped away. Getting
    // this transform wrong would move the punch in the wrong direction.
    const input = baseInput()
    input.source = { ...input.source, displayWidthPx: 1920, displayHeightPx: 1080 }
    input.evidence.faces = [{ timeMs: 27000, centreXPx: 960, centreYPx: 540 }]
    const plan = compileEditPlan({ ...input, policy: policy() }).plan
    expect(plan.video.zooms[0].offsetXPx).toBe(0)
    expect(plan.video.zooms[0].offsetYPx).toBe(0)
  })
})

describe('the edges of a recording are always removed', () => {
  // NOT A JUDGEMENT CALL. Before this, whatever sat outside the first and last
  // spoken word came off only if the Director happened to select the silence
  // candidate covering it. So a video could open on someone settling into
  // frame and end on them reaching for the stop button — which the creator is
  // ALWAYS doing, because they are the one operating the camera.
  //
  // These run against shippedPolicy(), NOT the Batch 8.1 baseline, because the
  // rule being tested is the production default.

  it('CONTROL: the SHIPPED policy has the rule on', () => {
    // The baseline fixture disables edges so the hand-derived suites keep their
    // meaning. This is what stops that convenience from hiding a production
    // default that quietly drifted off.
    const p = shippedPolicy()
    expect(p.edges.trimLeading).toBe(true)
    expect(p.edges.trimTrailing).toBe(true)
    expect(p.edges.keepMs).toBeGreaterThan(0)
    expect(p.edges.minTrimMs).toBeGreaterThan(0)
  })

  it('removes the lead-in before the first word and the tail after the last', () => {
    const r = compileEditPlan({ ...baseInput(), policy: shippedPolicy() })
    const edges = r.plan.timeline.removals.filter((x) => x.origin === 'edge_trim')
    expect(edges).toHaveLength(2)
    expect(edges.map((e) => e.reasonCode)).toEqual(['edge_leading', 'edge_trailing'])
  })

  it('leaves a breath, so the first word does not begin on frame one', () => {
    const p = shippedPolicy()
    const input = baseInput()
    const first = input.evidence.words[0]
    const r = compileEditPlan({ ...input, policy: p })
    const lead = r.plan.timeline.removals.find((x) => x.reasonCode === 'edge_leading')!
    expect(lead.sourceEndMs).toBe(first.startMs - p.edges.keepMs)
  })

  it('records the trim as edge_trim, never as a speech candidate', () => {
    // The record has to say WHY. "The Director selected a silence here" and
    // "this is always waste" are different facts about the same seconds, and a
    // removal labelled with the wrong one is a lie in the audit trail.
    const r = compileEditPlan({ ...baseInput(), policy: shippedPolicy() })
    const lead = r.plan.timeline.removals.find((x) => x.sourceStartMs === 0)!
    expect(lead.origin).toBe('edge_trim')
    expect(lead.ref).toBeNull()
  })

  it('shortens the finished video by exactly what it removed', () => {
    const withEdges = compileEditPlan({ ...baseInput(), policy: shippedPolicy() })
    const without = compileEditPlan({ ...baseInput(), policy: policy() })
    const trimmed = withEdges.plan.timeline.removals
      .filter((x) => x.origin === 'edge_trim')
      .reduce((n, x) => n + (x.sourceEndMs - x.sourceStartMs), 0)
    expect(without.plan.output.durationMs - withEdges.plan.output.durationMs).toBe(trimmed)
  })

  it('ignores a sliver — a 40ms shave is a glitch, not an edit', () => {
    const p = shippedPolicy()
    p.edges.minTrimMs = 5000 // above the fixture's real lead-in, so it stops qualifying
    const r = compileEditPlan({ ...baseInput(), policy: p })
    expect(r.plan.timeline.removals.some((x) => x.origin === 'edge_trim')).toBe(false)
  })

  it('a recording with no speech at all is refused, not trimmed to nothing', () => {
    // With zero words there is no first or last word to trim against, so the
    // edge rule cannot fire — the refusal comes from having no speech, which is
    // its own failure with its own code. Asserted so the two stay distinct.
    const input = baseInput()
    input.evidence.words = []
    input.decision.emphasisWordIndices = []
    input.decision.zoomRequests = []
    input.decision.selections = []
    input.decision.visualWasteSelections = []
    input.decision.hookTreatment = 'keep'
    const r = compileEditPlan({ ...input, policy: shippedPolicy() })
    expect(r.plan.timeline.removals.some((x) => x.origin === 'edge_trim')).toBe(false)
  })
})

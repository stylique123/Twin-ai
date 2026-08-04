// THE COMPILE STAGE CONSUMES THE OVERLAY'S SPAN FIELDS — Phase 10 item 4, the
// half `applyReviewOverlay` deliberately could not do.
//
// The decision expresses removals as INDICES INTO THE DIRECTOR'S CANDIDATE LIST,
// and a creator striking an arbitrary sentence is not choosing a candidate —
// there may be no candidate covering those words at all. So `removeWordRanges`
// and `respellWords` are validated at the edge and applied HERE, where the
// compiler already works in spans and already enforces the protections, the
// minimum kept segment, the density ceiling and the plan maxima against them.
//
// Two properties carry this file:
//
//   1. NO OVERLAY CHANGES NOTHING. A compile with no review is byte-identical to
//      one from before the review gate existed. That is what lets this land
//      ahead of the screen with every in-flight project untouched.
//   2. A CREATOR'S EDIT IS NEVER SILENTLY DROPPED. The density cap and the
//      min-segment repair both give removals back; neither may give back a
//      strike. The creator watching the render and finding the sentence they
//      struck still in it is the exact failure the overlay validator refuses at
//      the edge, and it would be reintroduced here by a single ranking.
//
// Every guard carries a mutation control, in the form this suite already uses:
// the policy is an argument, so a control can genuinely disable the guard.
import { describe, expect, it } from 'vitest'
import { compileEditPlan, struckRangeInterval, type CompileInput } from '../jobs/editorCompile.js'
import { EditPlanError, validateEditPlan } from '../jobs/editPlanContract.js'
import { composeReviewedDecision } from '../jobs/editorCompileInput.js'
import { EMPTY_OVERLAY, reviewOverlaySha256, validateReviewOverlay } from '../jobs/reviewOverlay.js'
import { baseInput, buildWords, policy, WINDOW_A } from './fixtures/editPlanFixture.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}

/** The fixture with nothing else going on: no Director cuts, no zooms, no
 *  emphasis — so every removal in the resulting plan is one the creator asked
 *  for, and an assertion about it cannot be satisfied by a Director cut that
 *  happened to land in the same place. */
function quietInput(): CompileInput {
  const input = baseInput()
  input.decision = {
    ...input.decision,
    selections: [], visualWasteSelections: [], emphasisWordIndices: [],
    hookTreatment: 'keep', hookStartWordIndex: null, zoomRequests: [],
    transitionPolicy: 'hard_cuts_only',
  }
  return input
}

const struck = (startWordIndex: number, endWordIndex: number) => ({ startWordIndex, endWordIndex })

describe('NO REVIEW CHANGES NOTHING — the property that lets this land early', () => {
  it('a compile with no overlay is byte-identical to one with an absent field', () => {
    const a = compileEditPlan({ ...baseInput(), policy: policy() })
    const b = compileEditPlan({ ...baseInput(), review: undefined, policy: policy() })
    expect(b.canonical).toBe(a.canonical)
    expect(b.planSha256).toBe(a.planSha256)
  })

  it('an EMPTY overlay composes to the same plan — reviewing without editing is not an edit', () => {
    const withNone = compileEditPlan({ ...baseInput(), policy: policy() })
    const empty = validateReviewOverlay(EMPTY_OVERLAY, buildWords().length)
    const withEmpty = compileEditPlan({
      ...baseInput(),
      review: { removeWordRanges: empty.removeWordRanges, respellWords: empty.respellWords },
      policy: policy(),
    })
    // The TIMELINE and CAPTIONS are identical. The plan HASH is not required to
    // be: identity carries the overlay digest, and "somebody reviewed and
    // changed nothing" is a different fact from "nobody reviewed" — see the
    // identity suite below.
    expect(withEmpty.plan.timeline).toEqual(withNone.plan.timeline)
    expect(withEmpty.plan.captions).toEqual(withNone.plan.captions)
  })

  it('the plan identity records the overlay, and null is the ordinary value', () => {
    const none = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    expect(none.identity.reviewOverlaySha256).toBeNull()

    const sha = reviewOverlaySha256(validateReviewOverlay(EMPTY_OVERLAY, 39))
    const input = baseInput()
    input.identity = { ...input.identity, reviewOverlaySha256: sha }
    const reviewed = compileEditPlan({ ...input, policy: policy() }).plan
    expect(reviewed.identity.reviewOverlaySha256).toBe(sha)
    // And the contract accepts both, refusing anything that is not a digest.
    expect(() => validateEditPlan(reviewed)).not.toThrow()
    expect(codeOf(() => validateEditPlan({
      ...reviewed, identity: { ...reviewed.identity, reviewOverlaySha256: 'not-a-digest' },
    }))).toBe('edit_plan_invalid')
  })

  it('the digest does not depend on the order a client sent the edits in', () => {
    const a = validateReviewOverlay(
      { ...EMPTY_OVERLAY, dropZoomAnchors: [9, 2, 5], keepSelections: [3, 1] }, 100)
    const b = validateReviewOverlay(
      { ...EMPTY_OVERLAY, dropZoomAnchors: [5, 9, 2], keepSelections: [1, 3] }, 100)
    expect(reviewOverlaySha256(b)).toBe(reviewOverlaySha256(a))
  })
})

describe('a struck sentence becomes a removal, attributed to the person', () => {
  it('the struck words are gone from the timeline and the captions', () => {
    // Words 5..7 live at 6000/7000/8000 ms in window A, well inside it.
    const input = quietInput()
    input.review = { removeWordRanges: [struck(5, 7)], respellWords: [] }
    const { plan } = compileEditPlan({ ...input, policy: policy() })

    const removal = plan.timeline.removals.find((r) => r.origin === 'review_edit')
    expect(removal).toBeDefined()
    expect(removal?.reasonCode).toBe('review_struck')
    // The struck span covers the three words themselves...
    expect(removal!.sourceStartMs).toBeLessThanOrEqual(6000)
    expect(removal!.sourceEndMs).toBeGreaterThanOrEqual(8400)
    // ...and nothing outside the surviving neighbours' phoneme handles.
    const handle = policy().cuts.minPhonemeHandleMs
    expect(removal!.sourceStartMs).toBeGreaterThanOrEqual(5400 + handle)
    expect(removal!.sourceEndMs).toBeLessThanOrEqual(9000 - handle)

    const captioned = plan.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))
    for (const w of ['w5', 'w6', 'w7']) expect(captioned).not.toContain(w)
    // The neighbours survive — a strike removes what was struck, not around it.
    for (const w of ['w4', 'w8']) expect(captioned).toContain(w)
  })

  it('CONTROL: the same compile without the overlay keeps every one of those words', () => {
    const { plan } = compileEditPlan({ ...quietInput(), policy: policy() })
    expect(plan.timeline.removals.some((r) => r.origin === 'review_edit')).toBe(false)
    const captioned = plan.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))
    for (const w of ['w5', 'w6', 'w7']) expect(captioned).toContain(w)
  })

  it('the strike takes its surrounding pause with it, and stops at the neighbours', () => {
    // Directly, on the pure function: a hole where a sentence used to be is a
    // glitch, and keeping the pause on BOTH sides leaves a double-length one.
    const words = buildWords()
    const domain = [{ ...WINDOW_A }]
    expect(struckRangeInterval(words, domain, 5, 7))
      .toEqual({ startMs: words[4].endMs, endMs: words[8].startMs })
    // At the head and tail there is no neighbour, so the domain's edge is used
    // rather than an invented one.
    expect(struckRangeInterval(words, domain, 0, 1).startMs).toBe(domain[0].startMs)
    expect(struckRangeInterval(words, domain, words.length - 2, words.length - 1).endMs)
      .toBe(domain[0].endMs)
  })

  it('a strike is subject to the allowed domain — rejected takes stay unavailable', () => {
    // Words 18 and 19 straddle the rejected stretch [20000, 25000): 18 is the
    // last word of window A, 19 the first of window B. The span between them is
    // material the creator already rejected at capture time, and striking
    // across it must not resurrect it.
    const input = quietInput()
    input.review = { removeWordRanges: [struck(18, 19)], respellWords: [] }
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    for (const r of plan.timeline.removals) {
      const insideAllowed = plan.source.allowedWindows.some(
        (w) => r.sourceStartMs >= w.startMs && r.sourceEndMs <= w.endMs)
      expect(insideAllowed).toBe(true)
    }
  })

  it('a strike whose words do not exist is refused, never clamped', () => {
    const input = quietInput()
    input.review = { removeWordRanges: [struck(37, 500)], respellWords: [] }
    // Clamping would strike whatever sentence happens to sit at the end. The
    // overlay and the transcript disagreeing is a divergence, not a bound.
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('the protections still apply — a strike cannot clip the neighbour it kept', () => {
    const input = quietInput()
    input.review = { removeWordRanges: [struck(5, 7)], respellWords: [] }
    const p = policy()
    const { plan } = compileEditPlan({ ...input, policy: p })
    const removal = plan.timeline.removals.find((r) => r.origin === 'review_edit')!
    expect(removal.sourceStartMs - buildWords()[4].endMs).toBe(p.cuts.minPhonemeHandleMs)

    // CONTROL: with no phoneme handle the cut reaches the neighbour's edge, so
    // the assertion above is measuring the protection and not a coincidence.
    const loose = policy()
    loose.cuts.minPhonemeHandleMs = 0
    const wide = compileEditPlan({ ...input, policy: loose }).plan
    const wideRemoval = wide.timeline.removals.find((r) => r.origin === 'review_edit')!
    expect(wideRemoval.sourceStartMs).toBe(buildWords()[4].endMs)
  })
})

describe('A CREATOR EDIT IS NEVER SILENTLY DROPPED', () => {
  /** Ten separate strikes, each one word wide, on a policy whose density
   *  ceiling allows far fewer cuts than that. */
  function manyStrikes(): { input: CompileInput; ranges: number } {
    const input = quietInput()
    const ranges = [1, 3, 5, 7, 9, 11, 13, 15, 17, 24].map((i) => struck(i, i))
    input.review = { removeWordRanges: ranges, respellWords: [] }
    return { input, ranges: ranges.length }
  }

  it('the density ceiling gives back the DIRECTOR\'s cuts and never the creator\'s', () => {
    const { input, ranges } = manyStrikes()
    const p = policy()
    // A ceiling of 1 cut/min against a 45 s domain: room for a single cut.
    p.cuts.maxCutsPerMinuteMilli = 1000
    const { plan, warnings } = compileEditPlan({ ...input, policy: p })
    const kept = plan.timeline.removals.filter((r) => r.origin === 'review_edit')
    expect(kept.length).toBe(ranges)
    expect(warnings.map((w) => w.code)).toContain('review_cuts_over_density_ceiling')
    // Nothing dropped a strike for density.
    for (const w of warnings) {
      if (w.code === 'removal_dropped_cut_density') expect(w.detail.startsWith('review_edit')).toBe(false)
    }
  })

  it('CONTROL: the same ceiling DOES give back a Director cut', () => {
    // The identical policy, with the same spans arriving as candidates instead
    // of strikes. If the exemption were not real these two would agree.
    const input = quietInput()
    input.evidence.candidates = [1, 3, 5, 7, 9].map((i) => ({
      kind: 'silence' as const, startMs: buildWords()[i].endMs + 60, endMs: buildWords()[i + 1].startMs - 60,
      confidence: 'high' as const, selectionEnabled: 1 as const, safeToConsider: true, wordIndices: [],
    }))
    input.decision = { ...input.decision, selections: [0, 1, 2, 3, 4] }
    const p = policy()
    p.cuts.maxCutsPerMinuteMilli = 1000
    const { warnings } = compileEditPlan({ ...input, policy: p })
    expect(warnings.map((w) => w.code)).toContain('removal_dropped_cut_density')
  })

  it('the min-segment repair never un-strikes — it leaves the short clip and says so', () => {
    // Two strikes either side of a single surviving word: the fragment between
    // them is one word long, far under the minimum kept segment. Reverting a
    // strike would put a struck sentence back on screen to fix a pacing
    // artefact; keeping the fragment is the only answer that removes exactly
    // what was struck and nothing that was not.
    const input = quietInput()
    input.review = { removeWordRanges: [struck(3, 5), struck(7, 9)], respellWords: [] }
    const p = policy()
    p.cuts.minKeptSegmentMs = 4000 // far wider than the ~1 s word 6 survives in
    const { plan, warnings } = compileEditPlan({ ...input, policy: p })
    expect(plan.timeline.removals.filter((r) => r.origin === 'review_edit').length).toBe(2)
    expect(warnings.map((w) => w.code)).toContain('kept_segment_below_minimum')
    for (const w of warnings) {
      if (w.code === 'removal_reverted_min_segment') expect(w.detail.startsWith('review_edit')).toBe(false)
    }
    const captioned = plan.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))
    expect(captioned).toContain('w6')
  })

  it('CONTROL: a Director cut in that position IS reverted by the same repair', () => {
    const words = buildWords()
    const input = quietInput()
    input.evidence.candidates = [
      { kind: 'silence', startMs: words[3].startMs, endMs: words[5].endMs, confidence: 'high', selectionEnabled: 1, safeToConsider: true, wordIndices: [3, 4, 5] },
      { kind: 'silence', startMs: words[7].startMs, endMs: words[9].endMs, confidence: 'high', selectionEnabled: 1, safeToConsider: true, wordIndices: [7, 8, 9] },
    ]
    input.decision = { ...input.decision, selections: [0, 1] }
    const p = policy()
    p.cuts.minKeptSegmentMs = 4000
    const { warnings } = compileEditPlan({ ...input, policy: p })
    expect(warnings.map((w) => w.code)).toContain('removal_reverted_min_segment')
  })

  it('an unrepairable fragment no longer suppresses the repairs after it', () => {
    // Before this, the FIRST unrepairable fragment ended the pass, so every
    // later repair was skipped. A creator strike creates that case on purpose.
    const words = buildWords()
    const input = quietInput()
    input.review = { removeWordRanges: [struck(3, 5), struck(7, 9)], respellWords: [] }
    // A Director cut over the LAST four words, which leaves a 600 ms tail —
    // repairable, and far away from the strikes at the head.
    input.evidence.candidates = [{
      kind: 'silence', startMs: words[35].startMs, endMs: words[38].endMs,
      confidence: 'high', selectionEnabled: 1, safeToConsider: true, wordIndices: [35, 36, 37, 38],
    }]
    input.decision = { ...input.decision, selections: [0] }
    const p = policy()
    p.cuts.minKeptSegmentMs = 4000
    const { warnings } = compileEditPlan({ ...input, policy: p })
    // The early fragment is unrepairable (both neighbours are strikes) AND the
    // later Director cut is still reconsidered.
    expect(warnings.map((w) => w.code)).toContain('kept_segment_below_minimum')
    expect(warnings.map((w) => w.code)).toContain('removal_reverted_min_segment')
  })
})

describe('a respelling changes LETTERS and nothing else', () => {
  it('the creator\'s spelling reaches the caption, and is recorded by index', () => {
    const input = quietInput()
    input.review = { removeWordRanges: [], respellWords: [{ wordIndex: 6, text: 'TwinAI' }] }
    const { plan, warnings } = compileEditPlan({ ...input, policy: policy() })
    const captioned = plan.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))
    expect(captioned).toContain('TwinAI')
    expect(captioned).not.toContain('w6')
    expect(warnings).toContainEqual({ code: 'caption_review_respelling_applied', detail: 'word_6' })
  })

  it('it cannot add, drop, reorder or retime a caption word', () => {
    const plain = compileEditPlan({ ...quietInput(), policy: policy() }).plan
    const input = quietInput()
    input.review = { removeWordRanges: [], respellWords: [{ wordIndex: 6, text: 'TwinAI' }] }
    const respelt = compileEditPlan({ ...input, policy: policy() }).plan
    expect(respelt.output.durationMs).toBe(plain.output.durationMs)
    expect(respelt.timeline).toEqual(plain.timeline)
    expect(respelt.captions.cues.length).toBe(plain.captions.cues.length)
    for (let i = 0; i < plain.captions.cues.length; i++) {
      expect(respelt.captions.cues[i].outputStartMs).toBe(plain.captions.cues[i].outputStartMs)
      expect(respelt.captions.cues[i].outputEndMs).toBe(plain.captions.cues[i].outputEndMs)
      const before = plain.captions.cues[i].lines.join(' ').split(' ')
      const after = respelt.captions.cues[i].lines.join(' ').split(' ')
      expect(after.length).toBe(before.length)
    }
  })

  it('a respelling containing whitespace is refused HERE too, not only at the edge', () => {
    // The one door through which a "spelling fix" becomes invented speech.
    // Refused where it arrives AND where it would take effect, because a
    // structure checked only at one entry point acquires a second one.
    const input = quietInput()
    input.review = { removeWordRanges: [], respellWords: [{ wordIndex: 6, text: 'Twin AI and buy my course' }] }
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_invalid')
  })

  it('a respelling of a word that does not exist is refused', () => {
    const input = quietInput()
    input.review = { removeWordRanges: [], respellWords: [{ wordIndex: 900, text: 'x' }] }
    expect(codeOf(() => compileEditPlan({ ...input, policy: policy() }))).toBe('edit_plan_divergent')
  })

  it('THE CREATOR BEATS THE SCRIPT, which beats the ASR', () => {
    const words = buildWords()
    const input = quietInput()
    // The aligner paired word 6 and supplied the script's spelling for it.
    input.evidence.scriptWordTimings = [{
      text: 'Twinai', startMs: words[6].startMs, endMs: words[6].endMs,
      via: 'substitution', similarityMilli: 1000,
    }]
    const fromScript = compileEditPlan({ ...input, policy: policy() }).plan
    expect(fromScript.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))).toContain('Twinai')

    // The creator then fixed it on the review screen. They typed it while
    // looking at the caption that was wrong, having already seen what both the
    // script and the ASR produced.
    input.review = { removeWordRanges: [], respellWords: [{ wordIndex: 6, text: 'TwinAI' }] }
    const fromCreator = compileEditPlan({ ...input, policy: policy() }).plan
    const captioned = fromCreator.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))
    expect(captioned).toContain('TwinAI')
    expect(captioned).not.toContain('Twinai')
  })

  it('a respelling of a STRUCK word simply never appears — the word has no caption', () => {
    const input = quietInput()
    input.review = {
      removeWordRanges: [struck(5, 7)],
      respellWords: [{ wordIndex: 6, text: 'TwinAI' }],
    }
    const { plan } = compileEditPlan({ ...input, policy: policy() })
    const captioned = plan.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))
    expect(captioned).not.toContain('TwinAI')
    expect(captioned).not.toContain('w6')
  })
})

describe('composeReviewedDecision — validation and composition happen together', () => {
  const speech = () => ({
    words: buildWords().map((w, i) => (
      { id: `w${i}`, text: w.text, startMs: w.startMs, endMs: w.endMs, confidence: w.confidence })),
    candidates: [], visualWaste: [],
  })
  const decision = () => ({
    schemaVersion: 1, selections: [{ index: 0 }, { index: 1 }], keptBoundaries: [],
    summary: 's', pacing: 'balanced', music: 'none', emphasisWordIndices: [6],
    hookTreatment: 'keep', hookStartWordIndex: null, visualWasteSelections: [],
    captionPresetId: 'caption-clean-keyword-v1', transitionPolicy: 'hard_cuts_only',
    zoomRequests: [{ anchorWordIndex: 6, intensity: 'subtle', reasonCode: 'emphasis_word' }],
  }) as never

  it('a null overlay returns the SAME decision object and no review edits', () => {
    const d = decision()
    const out = composeReviewedDecision({ decision: d, speech: speech(), overlay: null })
    expect(out.decision).toBe(d)
    expect(out.review).toBeUndefined()
  })

  it('the overlay is validated against THIS recording\'s word count', () => {
    // An overlay written against a longer transcript would otherwise strike
    // whatever sentence now occupies those indices.
    expect(() => composeReviewedDecision({
      decision: decision(), speech: speech(),
      overlay: { ...EMPTY_OVERLAY, removeWordRanges: [struck(500, 501)] },
    })).toThrow(/past the last spoken word/)
  })

  it('composition and pass-through split exactly along what the decision can express', () => {
    const out = composeReviewedDecision({
      decision: decision(), speech: speech(),
      overlay: {
        ...EMPTY_OVERLAY,
        keepSelections: [1],
        dropZoomAnchors: [6],
        removeWordRanges: [struck(6, 6)],
        respellWords: [{ wordIndex: 8, text: 'TwinAI' }],
      },
    })
    // Composed into the decision: a restored selection, a dismissed zoom, and
    // the emphasis on a struck word.
    expect(out.decision.selections.length).toBe(1)
    expect(out.decision.zoomRequests.length).toBe(0)
    expect(out.decision.emphasisWordIndices).toEqual([])
    // Carried to the compiler: the two the decision has no vocabulary for.
    expect(out.review?.removeWordRanges).toEqual([struck(6, 6)])
    expect(out.review?.respellWords).toEqual([{ wordIndex: 8, text: 'TwinAI' }])
  })
})

// Batch 8.5 — assembling CompileInput from persisted evidence.
//
// WHAT THIS SUITE IS DEFENDING. The compiler is pure and already well tested;
// what is new here is the ASSEMBLY step, and its failure mode is not a crash. It
// is a plan built from the wrong numbers — cuts quantised to 10 ms, or word ends
// reconstructed from the next word's start — which renders a video that plays,
// looks nearly right, and is wrong. Nothing downstream complains, because every
// value involved is a plausible integer.
//
// So the tests below are mostly about UNITS AND PROVENANCE rather than logic:
// which field was read, from which object, in which unit. Each guard has a
// mutation control, because a units test that cannot fail is decoration.
import { describe, it, expect } from 'vitest'
import {
  buildCompileInput, readComponentWords, readComponentCandidates,
  readComponentVisualWaste, readComponentAudioFacts, readDecision,
  assertNoCentisecondLeak, readComponentBrandColors,
} from '../jobs/editorCompileInput.js'
import { EditPlanError } from '../jobs/editPlanContract.js'
import type { DirectorDecision } from '../jobs/directorContract.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}
function msgOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as Error).message }
  throw new Error('expected a throw, got none')
}

// Deliberately NOT on 10 ms boundaries: real ASR word timings are not, and the
// whole centisecond hazard is invisible against a fixture that is.
const WORDS = [
  { id: 'w0', text: 'stop', startMs: 1003, endMs: 1287, confidence: 0.94 },
  { id: 'w1', text: 'scrolling', startMs: 1287, endMs: 1731, confidence: 0.91 },
  { id: 'w2', text: 'this', startMs: 1902, endMs: 2044, confidence: 0.88 },
  { id: 'w3', text: 'changes', startMs: 2044, endMs: 2456, confidence: 0.93 },
  { id: 'w4', text: 'everything', startMs: 2456, endMs: 3117, confidence: 0.9 },
]
const CANDIDATES = [
  { id: 'c0', kind: 'silence', wordIds: ['w1', 'w2'], startMs: 1731, endMs: 1902, confidence: 'high',
    evidence: { class: 'pause' } },
  { id: 'c1', kind: 'filler', wordIds: ['w2'], startMs: 1902, endMs: 2044, confidence: 'medium' },
  { id: 'c2', kind: 'repetition', wordIds: ['w3', 'w4'], startMs: 2044, endMs: 3117, confidence: 'low' },
]
const speech = () => ({ words: JSON.parse(JSON.stringify(WORDS)), candidates: JSON.parse(JSON.stringify(CANDIDATES)) })
const visual = () => ({
  blankIntervals: [
    { startMs: 4013, endMs: 4477, classification: 'dead_air' },
    { startMs: 5001, endMs: 5333, classification: 'ambiguous' },
  ],
})
const audio = () => ({ snrDbMilli: 18400, earlyEnergyRatioMilli: 720 })

function decision(over: Partial<DirectorDecision> = {}): DirectorDecision {
  return {
    schemaVersion: 2,
    selections: [
      { candidateIndex: 0, kind: 'silence', selectionEnabled: 1, startCs: 173, endCs: 190 },
      { candidateIndex: 2, kind: 'repetition', selectionEnabled: 1, startCs: 204, endCs: 312 },
    ],
    keptBoundaries: [], summary: 's', pacing: 'balanced', music: 'none',
    emphasisWordIndices: [0, 4],
    hookTreatment: 'keep', hookStartWordIndex: null,
    visualWasteSelections: [{ wasteIndex: 0, classCode: 0, startCs: 401, endCs: 447 }],
    captionPresetId: 'caption-clean-keyword-v1',
    transitionPolicy: 'hard_cuts_only',
    zoomRequests: [{ anchorWordIndex: 4, intensity: 'subtle', reasonCode: 'emphasis_word' }],
    ...over,
  } as DirectorDecision
}
const IDENTITY = {
  projectId: 'p', generationId: 'g', sourceAssetId: 'a',
  sourceChecksum: 'f'.repeat(64), bootManifestSha: 'b', scriptSnapshotSha: 's',
  decisionSha256: 'd'.repeat(64),
}
const SOURCE = { origin: 'upload' as const, durationMs: 9000, acceptedWindows: [{ startMs: 0, endMs: 9000 }] }
const assemble = (over: Partial<Parameters<typeof buildCompileInput>[0]> = {}) =>
  buildCompileInput({ identity: IDENTITY, source: SOURCE, speech: speech(), visual: visual(), audio: audio(), decision: decision(), ...over })

describe('words come from the COMPONENT, with real end times', () => {
  it('reads startMs and endMs verbatim — not reconstructed from the next word', () => {
    const w = readComponentWords(speech())
    expect(w[0]).toEqual({ text: 'stop', startMs: 1003, endMs: 1287, confidence: 0.94 })
    // w1 ends at 1731 but w2 starts at 1902: there is a 171 ms pause between
    // them. Reconstructing ends from the next start would report 1902 and
    // silently swallow the pause into the word.
    expect(w[1].endMs).toBe(1731)
    expect(w[1].endMs).not.toBe(w[2].startMs)
  })

  it('MUTATION: a component word with no endMs is REFUSED, not patched', () => {
    const s = speech() as { words: Array<Record<string, unknown>> }
    delete s.words[2].endMs
    expect(msgOf(() => readComponentWords(s))).toContain('corrupt, not compact')
  })

  it('MUTATION: a positional id mismatch is refused', () => {
    const s = speech() as { words: Array<Record<string, unknown>> }
    s.words[3].id = 'w9'
    expect(msgOf(() => readComponentWords(s))).toContain('positional id mismatch')
  })

  it('MUTATION: a reversed span is refused', () => {
    const s = speech() as { words: Array<Record<string, unknown>> }
    s.words[1].endMs = 10
    expect(msgOf(() => readComponentWords(s))).toContain('span reversed')
  })

  it('a missing words array is refused rather than treated as empty', () => {
    expect(msgOf(() => readComponentWords({}))).toContain('no words array')
    expect(msgOf(() => readComponentWords(null))).toContain('no words array')
  })
})

describe('candidates: filler can never be selection-enabled', () => {
  it('derives the flag from the KIND, not from a stored boolean', () => {
    const c = readComponentCandidates(speech(), WORDS.length)
    expect(c[1].kind).toBe('filler')
    expect(c[1].selectionEnabled).toBe(0)
    expect(c[1].safeToConsider).toBe(false)
    expect(c[0].selectionEnabled).toBe(1)
  })

  it('MUTATION: a component claiming filler IS selectable cannot smuggle it through', () => {
    // Gate-0 §4 freezes filler auto-removal OFF. Deriving rather than trusting
    // is what makes a tampered component harmless here.
    const s = speech() as { candidates: Array<Record<string, unknown>> }
    s.candidates[1].selectionEnabled = 1
    s.candidates[1].safeToConsider = true
    const c = readComponentCandidates(s, WORDS.length)
    expect(c[1].selectionEnabled).toBe(0)
  })

  it('resolves wordIds to indices and requires them strictly ascending', () => {
    const c = readComponentCandidates(speech(), WORDS.length)
    expect(c[0].wordIndices).toEqual([1, 2])
    const s = speech() as { candidates: Array<Record<string, unknown>> }
    s.candidates[0].wordIds = ['w2', 'w1']
    expect(msgOf(() => readComponentCandidates(s, WORDS.length))).toContain('not strictly ascending')
  })

  it('MUTATION: a wordId outside the pinned words is refused', () => {
    const s = speech() as { candidates: Array<Record<string, unknown>> }
    s.candidates[0].wordIds = ['w99']
    expect(msgOf(() => readComponentCandidates(s, WORDS.length))).toContain('out of range')
  })
})

describe('visual waste is read in MILLISECONDS', () => {
  it('takes startMs/endMs straight from the component', () => {
    const v = readComponentVisualWaste(visual())
    expect(v[0]).toEqual({ startMs: 4013, endMs: 4477, classCode: 0, selectionEnabled: 1 })
  })

  it('is NOT the envelope\'s centisecond projection', () => {
    // editorDirector's buildVisualWasteStream divides these by 10 for the model.
    // If that projection were reused here the value would be 401, not 4013.
    const v = readComponentVisualWaste(visual())
    expect(v[0].startMs).toBe(4013)
    expect(v[0].startMs).not.toBe(Math.round(4013 / 10))
  })

  it('skips intervals with an unknown classification rather than guessing one', () => {
    const v = readComponentVisualWaste({ blankIntervals: [{ startMs: 1, endMs: 2, classification: 'wat' }] })
    expect(v).toEqual([])
  })
})

describe('audio facts are all-or-nothing', () => {
  it('reads both integers when present', () => {
    expect(readComponentAudioFacts(audio())).toEqual({ snrDbMilli: 18400, earlyEnergyRatioMilli: 720 })
  })

  it('MUTATION: a PARTIAL audio component yields null, not a defaulted zero', () => {
    // A missing SNR is not zero SNR. A compiler decision made on a defaulted
    // number is a decision nobody made.
    expect(readComponentAudioFacts({ snrDbMilli: 18400 })).toBeNull()
    expect(readComponentAudioFacts(null)).toBeNull()
  })
})

describe('brand colors are read defensively, per field', () => {
  it('reads both hex colors, lowercased, from a real brand snapshot shape', () => {
    const brand = { visual: { primaryHex: '#ABCDEF', highlightHex: '#123456' } }
    expect(readComponentBrandColors(brand)).toEqual({ primaryHex: '#abcdef', highlightHex: '#123456' })
  })

  it('a malformed hex on ONE field does not null out the other — they are independent, unlike audio facts', () => {
    const brand = { visual: { primaryHex: '#abcdef', highlightHex: 'not-a-hex-color' } }
    expect(readComponentBrandColors(brand)).toEqual({ primaryHex: '#abcdef', highlightHex: null })
  })

  it('null, missing visual, and a non-object brand all yield { null, null } — never a crash', () => {
    expect(readComponentBrandColors(null)).toEqual({ primaryHex: null, highlightHex: null })
    expect(readComponentBrandColors({})).toEqual({ primaryHex: null, highlightHex: null })
    expect(readComponentBrandColors({ visual: null })).toEqual({ primaryHex: null, highlightHex: null })
    expect(readComponentBrandColors({ visual: 'not-an-object' } as unknown as Record<string, unknown>))
      .toEqual({ primaryHex: null, highlightHex: null })
  })

  it('MUTATION: a 3-digit shorthand or missing # is rejected, not silently expanded', () => {
    expect(readComponentBrandColors({ visual: { primaryHex: '#abc' } })).toEqual({ primaryHex: null, highlightHex: null })
    expect(readComponentBrandColors({ visual: { primaryHex: 'abcdef' } })).toEqual({ primaryHex: null, highlightHex: null })
  })
})

describe('THE CENTISECOND HAZARD — selections index the component', () => {
  it('maps selections to candidateIndex, never to the startCs on the same object', () => {
    const input = assemble()
    expect(input.decision.selections).toEqual([0, 2])
    // The spans that reach the compiler are the COMPONENT's, in ms.
    expect(input.evidence.candidates[0].startMs).toBe(1731)
    expect(input.evidence.candidates[2].endMs).toBe(3117)
  })

  it('the decision carries 173cs for a span the component puts at 1731ms', () => {
    // This is the trap in one assertion: the two numbers describe the same
    // instant, and 173 * 10 = 1730 is NOT 1731. Reading the wrong field loses
    // the millisecond and every one like it.
    const d = decision()
    expect(d.selections[0].startCs).toBe(173)
    expect(assemble().evidence.candidates[0].startMs).toBe(1731)
    expect(d.selections[0].startCs * 10).not.toBe(1731)
  })

  it('CONTROL: a correctly assembled input passes the leak check', () => {
    const input = assemble()
    expect(() => assertNoCentisecondLeak(input, decision())).not.toThrow()
  })

  it('MUTATION: an input built the WRONG way (startCs*10) is caught', () => {
    // Simulating exactly the defect: an adapter that reached for the span
    // sitting on the selection instead of indexing the component.
    const d = decision()
    const input = assemble()
    const wrong = {
      ...input,
      evidence: {
        ...input.evidence,
        candidates: input.evidence.candidates.map((c, i) => {
          const rec = d.selections.find((s) => s.candidateIndex === i)
          return rec ? { ...c, startMs: rec.startCs * 10, endMs: rec.endCs * 10 } : c
        }),
      },
    }
    // With only two selections the "all on a 10ms boundary" rule needs three, so
    // the consistency arm is what fires here — and it fires because 1730 != 1731.
    expect(() => assertNoCentisecondLeak(wrong, d)).toThrow()
  })

  it('MUTATION: a wholesale centisecond-quantised plan is caught by the boundary rule', () => {
    const d = decision({
      selections: [
        { candidateIndex: 0, kind: 'silence', selectionEnabled: 1, startCs: 173, endCs: 190 },
        { candidateIndex: 1, kind: 'filler', selectionEnabled: 0, startCs: 190, endCs: 204 },
        { candidateIndex: 2, kind: 'repetition', selectionEnabled: 1, startCs: 204, endCs: 312 },
      ],
    } as Partial<DirectorDecision>)
    const input = assemble()
    const wrong = {
      ...input,
      decision: { ...input.decision, selections: [0, 1, 2] },
      evidence: {
        ...input.evidence,
        candidates: input.evidence.candidates.map((c, i) => ({
          ...c, startMs: d.selections[i].startCs * 10, endMs: d.selections[i].endCs * 10,
        })),
      },
    }
    expect(codeOf(() => assertNoCentisecondLeak(wrong, d))).toBe('edit_plan_divergent')
  })

  it('a span that GENUINELY lands on a centisecond is not a false alarm', () => {
    // One-way check: startCs*10 == startMs is allowed, because some spans really
    // do start on a 10ms boundary. Only the systematic case is refused.
    const s = speech() as { candidates: Array<Record<string, unknown>> }
    s.candidates[0].startMs = 1730
    const d = decision()
    const input = buildCompileInput({ identity: IDENTITY, source: SOURCE, speech: s, visual: visual(), audio: audio(), decision: d })
    expect(() => assertNoCentisecondLeak(input, d)).not.toThrow()
  })
})

describe('decision indices are bounds-checked against the pinned evidence', () => {
  it('MUTATION: a candidateIndex beyond the pinned candidates is refused', () => {
    const d = decision({ selections: [{ candidateIndex: 99, kind: 'silence', selectionEnabled: 1, startCs: 0, endCs: 1 }] } as Partial<DirectorDecision>)
    expect(msgOf(() => assemble({ decision: d }))).toContain('outside the 3 pinned candidates')
  })

  it('MUTATION: the same candidate selected twice is refused', () => {
    const d = decision({ selections: [
      { candidateIndex: 0, kind: 'silence', selectionEnabled: 1, startCs: 173, endCs: 190 },
      { candidateIndex: 0, kind: 'silence', selectionEnabled: 1, startCs: 173, endCs: 190 },
    ] } as Partial<DirectorDecision>)
    expect(msgOf(() => assemble({ decision: d }))).toContain('selected twice')
  })

  it('MUTATION: an emphasis word index out of range is refused', () => {
    expect(msgOf(() => assemble({ decision: decision({ emphasisWordIndices: [99] }) }))).toContain('out of range')
  })

  it('MUTATION: a wasteIndex beyond the pinned intervals is refused', () => {
    const d = decision({ visualWasteSelections: [{ wasteIndex: 7, classCode: 0, startCs: 1, endCs: 2 }] } as Partial<DirectorDecision>)
    expect(msgOf(() => assemble({ decision: d }))).toContain('outside the 2 pinned intervals')
  })

  it('MUTATION: open_at_word with no start index is refused', () => {
    const d = decision({ hookTreatment: 'open_at_word', hookStartWordIndex: null })
    expect(msgOf(() => assemble({ decision: d }))).toContain('no hookStartWordIndex')
  })

  it('CONTROL: the untouched decision assembles cleanly', () => {
    expect(() => assemble()).not.toThrow()
  })
})

describe('the assembled input is what the compiler expects', () => {
  it('carries identity, source, evidence and decision through unchanged', () => {
    const input = assemble()
    expect(input.identity).toEqual(IDENTITY)
    expect(input.source).toEqual(SOURCE)
    expect(input.evidence.words.length).toBe(5)
    expect(input.evidence.candidates.length).toBe(3)
    expect(input.evidence.visualWaste.length).toBe(2)
    expect(input.evidence.audio).not.toBeNull()
    expect(input.decision.captionPresetId).toBe('caption-clean-keyword-v1')
    expect(input.decision.transitionPolicy).toBe('hard_cuts_only')
  })

  it('is deterministic — same inputs, identical output', () => {
    expect(JSON.stringify(assemble())).toBe(JSON.stringify(assemble()))
  })
})

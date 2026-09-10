// §1.1's rule, held: every row carries its evidence, and the nine things we
// never look at are ALWAYS shown.
//
// The failure this guards is specific: a shorter list on a reference we happened
// to extract less from would let absence look like completeness — which is the
// thing §1.1 calls "worse than no trust screen".
import { describe, expect, it } from 'vitest'
import {
  KIND_LABEL, NOT_OBSERVED_SOURCE, notObservedRows, transferRows, transferSummary, TYPE_LABEL,
} from '../creativeTransferRows'
import { MISSING_EVIDENCE_TYPES, type NormalizedReferenceEvidenceV1 } from '../referenceEvidence'

const item = (over: Record<string, unknown>) => ({
  evidenceId: 'e1', referenceId: 'r1', analysisId: 'a1',
  type: 'format_label', kind: 'interpreted', value: 'The Trust Builder',
  sourcePath: 'structure.format_label', atSec: null, unknownReason: null, ...over,
})

const set = (items: unknown[]): NormalizedReferenceEvidenceV1 =>
  ({ items, conflicts: [] } as unknown as NormalizedReferenceEvidenceV1)

// ⚠️⚠️ THE COUNT ASSERTIONS BELOW DERIVE FROM `MISSING_EVIDENCE_TYPES.length`,
// WHICH IS RIGHT AND ALSO MEANS THEY CANNOT SEE A DELETION. Two dimensions were
// removed from that list — `caption_layout_cadence` and `transition_types` — and
// the whole suite stayed green, because every assertion tracks the list rather
// than a number. Tidy, and it proved nothing. So the decision gets pinned here.
describe('two dimensions were deleted, and stay deleted', () => {
  // ⚠️ THE REASON, MEASURED BEFORE REMOVING THEM: each appeared in exactly two
  // files, both in this package — the type union and the row-label map — and
  // NOTHING in `worker/` or `supabase/functions/` has ever written either. Both
  // need real frame OCR, which nobody is building. A row that cannot change a
  // scene field, a direction note or an edit decision is furniture, and eight
  // rows reading "we did not look" on every reference for forty runs teaches a
  // creator to ignore the product's honesty layer.
  it('caption design and transitions are not offered as unmeasured rows', () => {
    expect(MISSING_EVIDENCE_TYPES as readonly string[]).not.toContain('caption_layout_cadence')
    expect(MISSING_EVIDENCE_TYPES as readonly string[]).not.toContain('transition_types')
    const labels = transferRows(null).map((r) => r.label)
    expect(labels).not.toContain('Caption design')
    expect(labels).not.toContain('Transitions')
  })

  // ⚖️ AND THE SIX THAT REMAIN ARE STILL THERE. They have no writer either —
  // the same grep returns zero for all of them — but their inputs (VAD, face
  // detection, ffmpeg scene-detect, audio band analysis) are already in this
  // codebase, so a writer is buildable. "Obtainable" is not "written". Deleting
  // them would hide work that is worth doing; deleting the other two removed
  // work nobody can do.
  it('the six buildable dimensions are still shown', () => {
    const labels = transferRows(null).map((r) => r.label)
    for (const l of ['Shot choices', 'Camera work', 'Framing', 'Zooms', 'Music',
      'Pacing of dead space']) {
      expect(labels, `${l} disappeared with the deletion`).toContain(l)
    }
    expect(MISSING_EVIDENCE_TYPES).toHaveLength(6)
  })

  // ⚠️ AND EVERY UNMEASURED DIMENSION MUST HAVE A HUMAN LABEL. Removing a type
  // from the union but leaving it in the gap list — or the reverse — would
  // render a row named by its snake_case identifier, which is the failure this
  // screen exists to avoid.
  it('every unmeasured dimension has a label a creator can read', () => {
    for (const t of MISSING_EVIDENCE_TYPES) {
      expect(TYPE_LABEL[t], `${t} has no human label`).toBeTruthy()
      expect(TYPE_LABEL[t]).not.toMatch(/_/)
    }
  })
})

describe('the gaps are always shown', () => {
  it('with NO evidence at all, every unlooked-at thing still appears', () => {
    const rows = transferRows(null)
    expect(rows).toHaveLength(MISSING_EVIDENCE_TYPES.length)
    expect(rows.every((r) => r.kind === 'unknown')).toBe(true)
    expect(rows.every((r) => r.source === NOT_OBSERVED_SOURCE)).toBe(true)
  })

  it('and they are still all there when plenty WAS extracted', () => {
    const rows = transferRows(set([
      item({}), item({ evidenceId: 'e2', type: 'reference_platform', kind: 'observed', value: 'tiktok' }),
    ]))
    expect(notObservedRows(rows)).toHaveLength(MISSING_EVIDENCE_TYPES.length)
  })

  it('a NOT OBSERVED row never carries a value', () => {
    // A value on a row that says we did not look is the fabricated row.
    for (const r of notObservedRows(transferRows(null))) expect(r.value).toBeNull()
  })
})

describe('the kind is the point, and there are four of them', () => {
  it("a model's reading of the transcript is not labelled OBSERVED", () => {
    // §1.1's own example table says "Story structure OBSERVED from transcript
    // beats". referenceEvidence.ts files narrative_beat as `interpreted`, and
    // the finer distinction is the more honest one — collapsing it back to two
    // states would commit §1.1's over-claim while implementing §1.1.
    const rows = transferRows(set([
      item({ type: 'narrative_beat', kind: 'interpreted', value: 'setup', sourcePath: 'structure.beats[0]' }),
    ]))
    const beat = rows.find((r) => r.type === 'narrative_beat')!
    expect(KIND_LABEL[beat.kind]).toBe('INTERPRETED')
    expect(beat.source).toMatch(/not something we measured/i)
  })

  it('does not claim a transcript when no transcript was read', () => {
    // THE SCREEN USED TO CONTRADICT ITSELF. In pattern mode the banner says "We
    // could not read this video, so the script follows the format instead", and
    // every interpreted row underneath said "a model's reading of the
    // TRANSCRIPT". There was no transcript — the rows asserted evidence the
    // same screen had just denied, in the exact case where the creator most
    // needs to know their reference was not used.
    const rows = transferRows(set([
      item({ type: 'narrative_beat', kind: 'interpreted', value: 'setup', sourcePath: 'structure.beats[0]' }),
    ]), false)
    const beat = rows.find((r) => r.type === 'narrative_beat')!
    expect(beat.source).toMatch(/no transcript was read/i)
    expect(beat.source).not.toMatch(/reading of the transcript/i)
    // Still INTERPRETED: the kind describes what KIND of claim it is, and that
    // has not changed — only what it says about its own basis.
    expect(KIND_LABEL[beat.kind]).toBe('INTERPRETED')
  })

  it('a measured row is unaffected — it never rested on the interpreted path', () => {
    const rows = transferRows(set([
      item({ type: 'reference_platform', kind: 'observed', value: 'youtube', sourcePath: 'transcript.platform' }),
    ]), false)
    expect(rows.find((r) => r.type === 'reference_platform')!.source).toMatch(/read directly from the reference/i)
  })

  it('a computed number says it was computed', () => {
    const rows = transferRows(set([
      item({ type: 'measured_words_per_minute', kind: 'measured', value: 148, sourcePath: 'derived:transcript.words' }),
    ]))
    expect(rows.find((r) => r.type === 'measured_words_per_minute')!.source)
      .toMatch(/computed from the transcript/i)
  })

  it('and a read-off-the-file fact says that instead', () => {
    const rows = transferRows(set([
      item({ type: 'reference_platform', kind: 'observed', value: 'tiktok', sourcePath: 'transcript.platform' }),
    ]))
    expect(rows.find((r) => r.type === 'reference_platform')!.source).toMatch(/read directly/i)
  })

  it('every row has a source sentence — there is no evidence-free row', () => {
    const rows = transferRows(set([item({}), item({ evidenceId: 'e2', type: 'stated_cta', value: 'link in bio' })]))
    for (const r of rows) expect(r.source.length).toBeGreaterThan(10)
  })
})

describe('one row per type', () => {
  it('many beats collapse to one story-structure row', () => {
    const rows = transferRows(set([
      item({ evidenceId: 'e1', type: 'narrative_beat', value: 'hook' }),
      item({ evidenceId: 'e2', type: 'narrative_beat', value: 'setup' }),
      item({ evidenceId: 'e3', type: 'narrative_beat', value: 'payoff' }),
    ]))
    expect(rows.filter((r) => r.type === 'narrative_beat')).toHaveLength(1)
  })
})

describe('the summary counts and never scores', () => {
  it('states what was read and what was not', () => {
    const s = transferSummary(transferRows(set([item({})])))
    expect(s).toMatch(/1 thing read from this reference/)
    expect(s).toMatch(new RegExp(`${MISSING_EVIDENCE_TYPES.length} we did not look at`))
  })

  it('nothing read says so plainly', () => {
    expect(transferSummary(transferRows(null))).toMatch(/have not read anything/i)
  })

  it('no summary reads as a rating', () => {
    // A confidence percentage on a trust screen is the joke that writes itself.
    const bad = /\d+\s*%|\bscore\b|\bconfidence\b/i
    expect(transferSummary(transferRows(null))).not.toMatch(bad)
    expect(transferSummary(transferRows(set([item({})])))).not.toMatch(bad)
  })
})

// THE WRITER IS TOLD WHICH BUSINESS FACTS THE CREATOR STATED AND WHICH TWIN GUESSED.
//
// ── WHAT WAS MEASURED ─────────────────────────────────────────────────────
//
// `generate-blueprint` builds its CREATOR DNA block from flat fallback chains:
//
//   const audience = brief.audience ?? vp?.audience ?? dna.audience ?? 'unspecified'
//   const offer    = brief.offer    ?? vp?.offer    ?? dna.product  ?? 'unspecified'
//   const pain     = vp?.audience_pain ?? dna.pain  ?? ''
//   const dream    = vp?.dream_outcome ?? dna.dream ?? ''
//
// `vp` is the SYNTHESIS OBJECT -- what a model guessed from scraped public
// posts. `brief`/`dna` are what the creator typed. The chain collapses both
// into one string, so by the time the writer reads "Audience pain: ..." there
// is nothing left to say whether a person asserted it or we inferred it.
//
// On production, 2026-08-26 (41 profiles, 40 brand voices):
//
//   offer     creator-stated 13  ·  guessed 28   (`brief.offer` was 0 of 40)
//   audience  creator-stated <=19 ·  guessed ~22
//   pain      creator-stated  0  ·  guessed 34 of 34   -- ALWAYS a guess
//   dream     creator-stated  0  ·  guessed 34 of 34   -- ALWAYS a guess
//
// So every script this system has ever produced described its creator's
// audience pain and dream outcome from a model's inference, presented to the
// writer in the same flat voice as a fact the creator typed.
//
// ── WHY THIS IS A PROJECTION AND NOT A PROMPT TWEAK ───────────────────────
//
// ⚠️ THE SAME PRINCIPLE IS ALREADY LAW ELSEWHERE IN THIS FILE'S CALLER, twice:
// `creatorKnowledge` refuses to speak an inferred belief at all ("an inferred
// belief is our guess about a person, and voicing it is indistinguishable --
// to them and to their audience -- from them having said it"), and the
// readiness gate was narrowed to the creator's own words under the heading
// "AN INFERENCE MUST NOT CREATE AN OBLIGATION". Business facts never got the
// same treatment. This is that treatment, and it reuses `BrandTruthSnapshotV1`
// rather than inventing a second provenance vocabulary -- the snapshot already
// carries per-field `provenance` and `authoritative`, which is exactly and only
// what is missing here.
//
// ⚠️ IT DOES NOT DELETE THE GUESS, AND MUST NOT. A guessed audience is still
// the best steer available for 22 of 40 creators, and blanking it would trade a
// labelled inference for an empty field -- strictly less information. §10.2's
// rule is the one applied here: an inferred business fact "may still inform a
// bounded creative choice, but it can never become an authoritative claim".
import type { BrandTruthSnapshotV1, TruthField } from './brandTruth.js'

/**
 * The five business facts the CREATOR DNA block renders, paired with the label
 * the writer sees. Ordered as the block renders them so a diff of the prompt
 * stays readable.
 */
export const DNA_BUSINESS_FACTS = [
  ['audience', 'Audience'],
  ['audiencePain', 'Audience pain'],
  ['dreamOutcome', 'Dream outcome'],
  ['offer', 'Offer'],
  ['product', 'Product'],
] as const

export type DnaBusinessFact = (typeof DNA_BUSINESS_FACTS)[number][0]

export interface FactLine {
  field: DnaBusinessFact
  label: string
  value: string
  /** True when a person asserted it. False when it came from synthesis. */
  stated: boolean
  /** The rendered line, provenance included. */
  line: string
}

/**
 * ⚠️ PLAIN ENGLISH ON PURPOSE. These strings are not creator-facing today, but
 * a prompt is one product decision away from being shown in a "why did Twin
 * write this?" panel, and "provenance: inferred" is not a sentence a creator
 * should ever have to parse. It also reads better to the model.
 */
const STATED_SUFFIX = ' [they told us this]'
const GUESSED_SUFFIX = ' [Twin guessed this from their public posts -- do not state it as a fact about them]'

/**
 * ⚠️ AUTHORITY, NOT PRESENCE, DECIDES. `authoritative` is the field the
 * snapshot computes for exactly this question, and reading `provenance` here
 * instead would re-implement -- and eventually contradict -- §5's hierarchy.
 * A value that is present but not authoritative is a guess.
 */
function readField(f: TruthField<string> | undefined): { value: string; stated: boolean } | null {
  if (!f || typeof f.value !== 'string') return null
  const v = f.value.trim()
  if (v === '') return null
  return { value: v, stated: f.authoritative === true }
}

/**
 * The CREATOR DNA business-fact lines, each carrying its provenance.
 *
 * Returns `[]` when the snapshot carries none of them, which is a real state:
 * a voice scanned before synthesis produced these fields has nothing to label,
 * and the caller keeps its existing behaviour rather than rendering empties.
 */
export function businessFactLines(snapshot: BrandTruthSnapshotV1 | null): FactLine[] {
  if (!snapshot) return []
  const bt = snapshot.businessTruth as unknown as Record<string, TruthField<string> | undefined>
  const out: FactLine[] = []
  for (const [field, label] of DNA_BUSINESS_FACTS) {
    const got = readField(bt[field])
    if (!got) continue
    out.push({
      field,
      label,
      value: got.value,
      stated: got.stated,
      line: `- ${label}: ${got.value}${got.stated ? STATED_SUFFIX : GUESSED_SUFFIX}`,
    })
  }
  return out
}

/**
 * How many of the rendered business facts are guesses. The caller logs this so
 * the ratio above stops being a one-off measurement and becomes a series.
 *
 * ⚠️ BOTH NUMBERS, ALWAYS. A count of guesses without the total is unreadable:
 * two guesses out of two is a different script from two out of five.
 */
export function businessFactProvenanceCounts(lines: FactLine[]): { stated: number; guessed: number; total: number } {
  const stated = lines.filter((l) => l.stated).length
  return { stated, guessed: lines.length - stated, total: lines.length }
}

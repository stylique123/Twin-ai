// WHAT TWIN LEARNED, AND HOW IT LEARNED EACH PART.
//
// ⚠️⚠️ "Your voice — what Twin has learned" WAS A CARD THAT OPENED NOTHING.
// Reported live. It is not a broken handler: `view_dna` maps to
// `setTab('twin')` and the card LIVES on the twin tab, so tapping "View"
// re-selects the tab you are already on. Nothing is broken and nothing happens,
// which is the worst version — the creator concludes Twin has nothing to show.
//
// ── TWO THINGS THE SPEC ASKED FOR THAT WOULD HAVE SHIPPED EMPTY ──────────
//
// ⚠️ `signature_phrases` DOES NOT EXIST. Measured 2026-09-09 over all 51
// voices: the key is absent from every single profile. The phrases a creator
// recognises as hers — "lineup", "honest routine", "10/10", "repurchase",
// "facecard" — are stored in `vocabulary` (47 of 51). A panel built against the
// name in the request would have rendered nothing, for everyone, and looked
// exactly like the dead card it replaced.
//
// ⚠️ AND THE SAMPLE SIZE CANNOT BE STATED HONESTLY. "Measured from 47 posts and
// 12 transcripts" needs counts this system does not have per voice:
// `scraped_posts` covers 5 of 51 and `own_sample_checked` 10 of 51. Printing a
// number we cannot support is the palette meter again.
//
// ⚖️ SO IT SHOWS PROVENANCE PER FACT INSTEAD, WHICH IS STRONGER AND ALREADY
// STORED. `profile._provenance` records, field by field, whether Twin HEARD it
// or READ it:
//
//   tone: observed_audio · vocabulary: observed_audio · audience: caption_synthesis
//
// 36 of 51 voices carry it and NOTHING has ever read it — the same
// written-and-never-read defect this codebase keeps finding, one layer in. A
// per-fact "heard in your videos" beats one aggregate count, because it is
// checkable against the creator's own memory of what she said.

/** How Twin came to know one fact. The stored vocabulary, unchanged. */
export type LearnedBasis = 'observed_audio' | 'caption_synthesis' | 'unknown'

/**
 * ⚠️ PLAIN ENGLISH, AND NEVER OUR WORD FOR IT. `caption_synthesis` is a
 * pipeline name; "read from your captions" is the same fact in language a
 * creator can agree or disagree with.
 *
 * ⚖️ `unknown` SAYS NOTHING RATHER THAN GUESSING. 15 of 51 voices have no
 * provenance map at all — they predate it — and labelling their facts "heard"
 * would invent an evidence claim for rows nobody measured.
 */
export const BASIS_LABEL: Readonly<Record<LearnedBasis, string>> = Object.freeze({
  observed_audio: 'heard in your videos',
  caption_synthesis: 'read from your captions',
  unknown: '',
})

export function basisOf(provenance: unknown, field: string): LearnedBasis {
  if (!provenance || typeof provenance !== 'object') return 'unknown'
  const v = (provenance as Record<string, unknown>)[field]
  return v === 'observed_audio' || v === 'caption_synthesis' ? v : 'unknown'
}

export interface LearnedFact {
  field: string
  /** What the creator reads as the name of this fact. */
  label: string
  /** Her value, verbatim. Lists are joined for display by the caller. */
  values: readonly string[]
  basis: LearnedBasis
}

/**
 * ⚠️ THE ORDER IS HOW A CREATOR CHECKS US, NOT HOW WE STORE IT. Niche first
 * because a wrong niche makes everything below it wrong; vocabulary high
 * because it is the fastest thing to recognise as hers or not.
 *
 * ⚖️ MEASURED COVERAGE, 2026-09-09, so nothing here is a field that is usually
 * absent: niche 47/51 · tone 47 · pacing 47 · vocabulary 47 · recurring_ctas 47
 * · hook_style 47 · audience 45.
 */
const SHOWN: ReadonlyArray<{ field: string; label: string }> = [
  { field: 'niche', label: 'What you make videos about' },
  { field: 'vocabulary', label: 'Words you actually use' },
  { field: 'tone', label: 'How you sound' },
  { field: 'pacing', label: 'Your pace' },
  { field: 'hook_style', label: 'How you open' },
  { field: 'recurring_ctas', label: 'How you end' },
  { field: 'audience', label: 'Who you make them for' },
]

const asValues = (v: unknown): string[] => {
  if (typeof v === 'string') return v.trim() === '' ? [] : [v.trim()]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
}

/**
 * Everything Twin can honestly say it learned about this creator.
 *
 * ⚠️ AN ABSENT FIELD IS ABSENT, NOT BLANK. A row of labels with empty values
 * reads as "Twin knows nothing about you" — which is the impression the dead
 * card already gave, rebuilt with more pixels.
 */
export function whatTwinLearned(profile: unknown): LearnedFact[] {
  if (!profile || typeof profile !== 'object') return []
  const p = profile as Record<string, unknown>
  const prov = p._provenance
  const out: LearnedFact[] = []
  for (const { field, label } of SHOWN) {
    const values = asValues(p[field])
    if (values.length === 0) continue
    out.push({ field, label, values, basis: basisOf(prov, field) })
  }
  return out
}

/** ⚖️ HOW MANY OF THESE TWIN HEARD RATHER THAN READ. Shown once at the top so
 *  the panel states its own evidence before the creator reads a word of it. */
export function heardCount(facts: readonly LearnedFact[]): number {
  return facts.filter((f) => f.basis === 'observed_audio').length
}

// ── ONE FACT, ONE PATH ──────────────────────────────────────────────────────
//
// ⚠️⚠️ THIS PANEL AND THE CREATOR DNA BLOCK SHOWED THE SAME THREE FACTS TWICE.
// Niche, vocabulary and audience appeared in both, in different words, on the
// same tab — and I INTRODUCED HALF OF IT: the panel above was a correct fix to
// a card that opened nothing, added without removing what it duplicated. That
// is the two-authorities defect on a screen. A creator reads her niche twice
// and cannot tell which one Twin writes from.
//
// ⚖️ AND IT DEFEATED THE PROVENANCE, which is the reason the panel exists. A
// per-fact "heard in your videos" is only meaningful if each fact appears ONCE.
// Two blocks means one copy carries provenance and its twin does not, which
// makes the honest one look arbitrary rather than earned.
//
// ⚖️ SO THE PANEL IS THE READ VIEW AND THE DNA BLOCK IS THE EDIT FORM. The one
// requirement that makes that safe is that Edit lands on the field she was
// looking at — never a second summary to scroll for it. This map is that path.

/**
 * The Creator DNA field a learned fact edits into, or `null` when Twin's
 * reading is the only source and there is nothing for her to type.
 *
 * ⚠️ ONLY THE FIELDS THE EDIT FORM ACTUALLY HAS. `vocabulary`, `tone`,
 * `pacing`, `hook_style` and `recurring_ctas` are read out of her videos and
 * have no input — offering an Edit that lands nowhere is the dead card again.
 */
export const EDITS_INTO: Readonly<Record<string, string | null>> = Object.freeze({
  niche: 'niche',
  audience: 'audience',
  // ⚠️⚠️ THREE OF THESE WERE `null` WHILE THEIR FORM FIELD ALREADY EXISTED.
  // Reported as "its Edit jumps to a lower block instead of editing in place" —
  // and the jump is not the defect: for `niche` and `audience` it closes the
  // panel, opens the form and puts the cursor IN THAT INPUT, which is what the
  // comment beside the button describes as the fix for a worse version. What was
  // actually wrong is that FIVE OF SEVEN FACTS OFFERED NO EDIT AT ALL, so the
  // rows a creator most wants to correct — how she opens, how she sounds — were
  // read-only with no route anywhere.
  //
  // ⚖️ AND THESE THREE ARE ADDED BECAUSE THE DESTINATION ALREADY EXISTS, not
  // because a gap looked untidy. `voice` and `editing_style` are live keys on the
  // same form `niche` and `audience` land in; verified against the field list
  // rather than assumed. A target that does not exist would focus nothing and
  // leave her at the top of a form — the exact defect this map was built to end.
  tone: 'voice',
  pacing: 'voice',
  hook_style: 'editing_style',
  // ⚖️ THESE TWO STAY NULL, AND THAT IS HONEST RATHER THAN UNFINISHED. Both are
  // lists, not sentences; the DNA form has no field for either, so any target
  // here would be a button that lands nowhere. `null` means "offers none", and
  // the row renders without an Edit — which is correct until a list editor
  // exists on this screen.
  vocabulary: null,
  recurring_ctas: null,
})

/** Where tapping this fact's Edit should land, or `null` if it offers none. */
export function editTargetOf(fact: Pick<LearnedFact, 'field'>): string | null {
  return EDITS_INTO[fact.field] ?? null
}

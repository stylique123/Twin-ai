// THE PERMANENT GLOSSARY — §6's "any hard words?", which the plan calls
// "quietly the highest-value field in the product: every hard word ever typed
// is saved forever, and accent stops being a risk permanently."
//
// ── WHAT A GLOSSARY TERM IS FOR, PRECISELY ────────────────────────────────
//
// Captions already take the SCRIPT'S SPELLING at the RECORDING'S TIME: the
// aligner pairs each script word to the spoken word it became, and where the
// pairing is a SUBSTITUTION above a similarity floor, the script's letters go
// on screen instead of the ASR's. That is how a brand name the ASR never heard
// correctly still renders correctly.
//
// The floor exists because a substitution is the aligner's guess that two words
// are the same word. Set it low and an unrelated pair gets accepted, putting a
// word on screen the creator never said — the one failure the caption pipeline
// must not have.
//
// A GLOSSARY TERM IS EVIDENCE THAT LOWERS THAT RISK FOR ONE WORD. The creator
// has typed it, deliberately, as a word they expect to be got wrong. So a
// substitution whose SCRIPT side is a known term can clear a lower floor than
// an arbitrary one: we are no longer guessing that this word matters.
//
// ── THE BOUND, AND WHAT IT COSTS ──────────────────────────────────────────
//
// The glossary NEVER matches against the transcript on its own. It only ever
// adjusts the floor for a pairing the ALIGNER already made, so every property
// the caption pipeline already has survives unchanged: it cannot add, drop,
// reorder or retime a caption word, and a take with no alignment is unaffected.
//
// That bound has a real cost, stated rather than hidden: an UPLOAD with no
// captured script gets nothing from the glossary, because there is no pairing
// to adjust. Making the glossary match ASR words directly would cover that
// case and would also be a bag of words matched by similarity against a
// transcript — which is how "kubernetes" becomes "cucumbers" on screen. That
// is a change to make against a real recording of a real ASR mangling, not
// against reasoning.
export const MAX_GLOSSARY_TERMS = 200
export const MAX_GLOSSARY_TERM_CHARS = 64

export interface GlossaryTerm {
  /** Exactly as the creator typed it — this is what reaches the screen. */
  term: string
}

/**
 * The comparison key for a term.
 *
 * CASE- AND ACCENT-FOLDED, because "TwinAI", "twinai" and "TWINAI" are one
 * entry in a glossary and three rows in a table that keys on the raw string.
 * The DISPLAY form is kept verbatim and is what renders — folding is only ever
 * for deciding whether two entries are the same entry.
 */
export function glossaryKey(term: string): string {
  return term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Accept a term, or say why not.
 *
 * ONE WORD, ALWAYS — the same bound a review respelling lives under, for the
 * same reason. A glossary entry becomes caption text, so an entry containing a
 * space would let one spoken word render as several, which is inventing speech
 * through the one door this pipeline keeps closed.
 */
export type GlossaryTermRejection = 'empty' | 'too_long' | 'not_one_word'

export function validateGlossaryTerm(raw: unknown): { term: string } | { rejected: GlossaryTermRejection } {
  if (typeof raw !== 'string') return { rejected: 'empty' }
  const term = raw.normalize('NFC').trim()
  if (term === '') return { rejected: 'empty' }
  if (term.length > MAX_GLOSSARY_TERM_CHARS) return { rejected: 'too_long' }
  if (/\s/.test(term)) return { rejected: 'not_one_word' }
  return { term }
}

/**
 * Normalise a submitted list into what may be stored.
 *
 * Deduplicated by FOLDED key with the FIRST spelling winning, so a creator who
 * types "TwinAI" and later "twinai" keeps the capitalisation they meant. Sorted
 * by key so the stored list — and therefore its digest, and therefore the
 * manifest that pins it — does not depend on the order a form submitted them.
 * Rejected entries are RETURNED rather than dropped silently: a term the
 * creator typed and never sees again is a promise the product broke.
 */
export function normalizeGlossary(raw: unknown): {
  terms: GlossaryTerm[]
  rejected: Array<{ input: string; reason: GlossaryTermRejection }>
  overCap: number
} {
  if (!Array.isArray(raw)) return { terms: [], rejected: [], overCap: 0 }
  const byKey = new Map<string, string>()
  const rejected: Array<{ input: string; reason: GlossaryTermRejection }> = []
  for (const entry of raw) {
    const value = typeof entry === 'string' ? entry : (entry as { term?: unknown })?.term
    const checked = validateGlossaryTerm(value)
    if ('rejected' in checked) {
      rejected.push({ input: typeof value === 'string' ? value : '', reason: checked.rejected })
      continue
    }
    const key = glossaryKey(checked.term)
    if (!byKey.has(key)) byKey.set(key, checked.term)
  }
  const all = [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const overCap = Math.max(0, all.length - MAX_GLOSSARY_TERMS)
  return {
    terms: all.slice(0, MAX_GLOSSARY_TERMS).map(([, term]) => ({ term })),
    rejected,
    overCap,
  }
}

/** The folded keys, for a consumer asking "is this word a known term?". */
export function glossaryKeySet(terms: readonly GlossaryTerm[]): Set<string> {
  return new Set(terms.map((t) => glossaryKey(t.term)))
}

// A DRAFT IS NAMED BY ITS SUBJECT, NOT BY ITS TAXONOMY.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-14. The library titled every draft with
// `reference_read.format_label`, which describes the REFERENCE'S FORMAT rather
// than what the video is about. One creator has ten drafts all called "Direct
// Confrontational Truth Reframe"; the audit caught it at five.
//
//   titles distinct today, by format_label ......... 109 of 134  (81.3%)
//   titles distinct by premise .................... 130 of 134  (97.0%)
//
// ⚖️ THE FORMAT LABEL IS NOT WRONG, IT IS THE WRONG FIELD FOR THIS. It still
// describes the reference accurately and the dashboard still GROUPS by it --
// that reader is untouched. What it cannot do is tell two of her drafts apart,
// because two videos built from the same kind of reference share it by
// definition.
//
// ⚖️ AND THE FALLBACK CHAIN KEEPS EVERY OLD ROW READABLE. 28 of 134 generations
// predate `concept.premise`; they keep the label they have always shown rather
// than becoming "Blueprint".
//
// A social manager running six accounts put it plainly: "Give me the subject --
// 'The $1,200 machine' -- not a taxonomy label."

/** Longest title before it is cut at a word boundary. */
export const DRAFT_TITLE_MAX = 72

const clean = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''

/**
 * ⚠️ CUT AT A WORD BOUNDARY, NEVER MID-WORD. A premise is a sentence, and a
 * title that ends "…beginner microbak" reads as a rendering bug rather than a
 * shortened sentence.
 */
function shorten(s: string, max = DRAFT_TITLE_MAX): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, '')}…`
}

export interface DraftTitleSource {
  concept?: { premise?: unknown } | null
  reference_read?: { format_label?: unknown } | null
}

/**
 * What the library calls this draft.
 *
 * ⚖️ THE ORDER IS THE WHOLE RULE: what it is about, then what kind of thing it
 * is, then a word that admits we have neither. Never the other way round.
 */
export function draftTitle(blueprint: DraftTitleSource | null | undefined): string {
  const premise = clean(blueprint?.concept?.premise)
  if (premise !== '') return shorten(premise)
  const label = clean(blueprint?.reference_read?.format_label)
  if (label !== '') return shorten(label)
  return 'Blueprint'
}

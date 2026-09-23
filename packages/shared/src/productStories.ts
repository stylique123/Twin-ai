// THREE THINGS ONLY THE CREATOR KNOWS ABOUT A PRODUCT (CTO decision, 2026-09-23).
//
// ⚖️ A page says what a product IS. It never says what nearly went wrong making
// it, what customers say back, or how it is actually made or delivered — and
// those are the lines that make a script sound like her. Each is optional and
// stored in `product_entities.creator_stories` (migration 0225) as one jsonb
// object, so a fourth question is a key rather than a migration.
//
// ⚠️ A SEPARATE, BEST-EFFORT READ, NOT A COLUMN IN `ENTITY_COLUMNS`. An
// unapplied migration makes PostgREST reject the WHOLE select, which would cost
// the creator her entire library for three optional boxes. Read separately, a
// missing column costs only these answers.

export interface ProductStories {
  almostWentWrong: string | null
  customersSay: string | null
  howItsMade: string | null
}

export type ProductStoryKey = keyof ProductStories

/** The one list of questions, in the words both forms show. */
export const PRODUCT_STORY_QUESTIONS: ReadonlyArray<{ key: ProductStoryKey; label: string; placeholder: string }> = [
  { key: 'almostWentWrong', label: 'What almost went wrong with this one?', placeholder: 'A near-miss, a first batch that failed, a lesson' },
  { key: 'customersSay', label: 'What do customers say back to you about it?', placeholder: 'In their words, if you remember them' },
  { key: 'howItsMade', label: 'How is it actually made or delivered?', placeholder: 'By hand, in batches, shipped from…' },
]

export const EMPTY_STORIES: ProductStories = { almostWentWrong: null, customersSay: null, howItsMade: null }

const clean = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? null : t.slice(0, 1000)
}

/** Read a stored value defensively: anything that is not an object is "none". */
export function readStories(raw: unknown): ProductStories {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_STORIES }
  const r = raw as Record<string, unknown>
  return { almostWentWrong: clean(r.almostWentWrong), customersSay: clean(r.customersSay), howItsMade: clean(r.howItsMade) }
}

/** What is written: null when every answer is blank, so "never answered" stays null. */
export function storiesForStorage(s: Partial<ProductStories> | null | undefined): ProductStories | null {
  const out = readStories(s ?? null)
  return out.almostWentWrong || out.customersSay || out.howItsMade ? out : null
}

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
  // ⚠️ AUDIT 2026-09-25 (P6 #11): "Something you promote" had no equivalent
  // questions, so a promoted item's scripts had nothing of hers to stand on.
  // Same jsonb, three more keys — no migration.
  whyYes?: string | null
  useItFor?: string | null
  tellAFriend?: string | null
}

export type ProductStoryKey = keyof ProductStories

/** The one list of questions, in the words both forms show. */
export const PRODUCT_STORY_QUESTIONS: ReadonlyArray<{ key: ProductStoryKey; label: string; placeholder: string }> = [
  { key: 'almostWentWrong', label: 'What almost went wrong with this one?', placeholder: 'A near-miss, a first batch that failed, a lesson' },
  { key: 'customersSay', label: 'What do customers say back to you about it?', placeholder: 'In their words, if you remember them' },
  { key: 'howItsMade', label: 'How is it actually made or delivered?', placeholder: 'By hand, in batches, shipped from…' },
]

/** The questions for something she PROMOTES (affiliate / sponsor) — about her
 *  honest use of it, never about making it. */
export const PROMOTED_STORY_QUESTIONS: ReadonlyArray<{ key: ProductStoryKey; label: string; placeholder: string }> = [
  { key: 'whyYes', label: 'Why did you say yes to this one?', placeholder: 'What made it worth putting your name next to' },
  { key: 'useItFor', label: 'What do you actually use it for?', placeholder: 'The real job it does for you, if you use it' },
  { key: 'tellAFriend', label: 'What would you tell a friend before they buy it?', placeholder: 'Including anything it is not good for' },
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
  return {
    almostWentWrong: clean(r.almostWentWrong), customersSay: clean(r.customersSay), howItsMade: clean(r.howItsMade),
    whyYes: clean(r.whyYes), useItFor: clean(r.useItFor), tellAFriend: clean(r.tellAFriend),
  }
}

/** What is written: null when every answer is blank, so "never answered" stays null. */
export function storiesForStorage(s: Partial<ProductStories> | null | undefined): ProductStories | null {
  const out = readStories(s ?? null)
  return out.almostWentWrong || out.customersSay || out.howItsMade || out.whyYes || out.useItFor || out.tellAFriend ? out : null
}

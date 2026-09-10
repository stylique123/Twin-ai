// HOW A NICHE TALKS — AND WHY FREQUENCY IS THE WRONG AXIS FOR FINDING OUT.
//
// ⚠️ EVERY PHYSIO SAYS "load tolerance". EVERY BAKER SAYS "bulk ferment". EVERY
// PHOTOGRAPHER SAYS "golden hour". That is terminology, not anyone's expression,
// and a script that avoids it sounds like an outsider wrote it. So the corpus
// may learn a niche's TERM LIST — never the sentences those terms appeared in.
//
// ── THE OBVIOUS IMPLEMENTATION IS WRONG, AND THE DATA SAYS SO ───────────────
//
// ⚠️⚠️ RANKING TERMS BY FREQUENCY PUTS CREATORS' NAMES IN THE VOCABULARY. A
// TF-IDF pass over 5,814 real cards in six niches returned, alongside genuine
// terminology, these: `madaan` · `eesh` (one creator, "Him eesh Madaan") ·
// `gopal` · `gaur` · `vogue` · `rodrigo's` · `olivia`. Those are PEOPLE AND
// BRANDS. Handing them to a writer as "how your niche talks" would put a
// stranger's name in a creator's script.
//
// ⚠️ AND FREQUENCY CANNOT TELL THEM APART. Measured on the real corpus:
//
//   chicken  148 cards / 49 creators      vogue   91 cards /  4 creators
//   recipe   168 cards / 44 creators      olivia  44 cards /  4 creators
//   garlic    97 cards / 23 creators      madaan  52 cards /  1 creator
//   tbsp      60 cards / 13 creators      gopal   38 cards /  1 creator
//
// `vogue` (91) out-appears `garlic` (97) almost exactly, and `madaan` (52)
// out-appears `tbsp` (60). On the CARD axis they are indistinguishable.
//
// ⚖️ CREATOR SPREAD SEPARATES THEM COMPLETELY. Real terminology sits at 13–49
// distinct creators; names and brands at 1–6. There is a clean gap, and it is
// the same principle as the outlier cap on lift: a cluster is evidence, one
// creator repeating themselves is an anecdote with a large number attached.
//
// ⚠️ THE THRESHOLD COSTS REAL TERMS AND THAT IS THE RIGHT TRADE. "whitening"
// (6 creators) and "skin-care" (1) are genuine beauty terminology and are
// excluded. A missing term makes a script slightly less native; a FALSE term
// puts someone else's brand in a creator's mouth. Those are not symmetrical.

// ── AND CREATOR SPREAD ALONE IS NOT ENOUGH — MEASURED, SECOND PASS ─────────
//
// ⚠️⚠️ THE SPREAD GATE KILLS NAMES AND KEEPS COMMON WORDS. Run over the real
// corpus it removed `madaan`, `vogue`, `olivia` and `gopal` completely — and
// then handed back, as "Business vocabulary":
//
//   mit(28) und(23) ich(20) die(19) das(19) dir(18) ist(17) ein(17)
//
// German function words. And as "Beauty vocabulary": today, just, going, easy,
// follow. Those ARE used by many creators; they are simply not terminology.
//
// ⚖️ SO A TERM MUST ALSO BE DISTINCTIVE TO ITS NICHE. A word that shows up in
// Food AND Education AND Beauty is a word, not a term. Adding that gate changed
// Food from a list containing `das` and `one` into:
//
//   chicken garlic recipe mukbang ingredients butter crispy paprika tbsp salt
//
// ⚠️⚠️ AND IT SOLVED THE MULTILINGUAL PROBLEM WITHOUT A GERMAN STOPWORD LIST.
// `und`, `das`, `mit`, `ist` are common across niches, so distinctiveness
// removed them for the same reason it removed `today`. A per-language stopword
// list would have been an endless chase; this needs none.
//
// ⚠️ WHICH MEANS ONE NICHE'S VOCABULARY CANNOT BE COMPUTED ALONE. Distinctiveness
// is a statement about the OTHER niches, so the entry point takes all of them.
// An API that let a caller ask for one niche in isolation would be an API that
// cannot answer the question, and it would silently return the common-word list.
//
// ⚖️ Business returns THREE terms on this corpus, all German. That is honest:
// the Business cards here are largely German, so English terminology does not
// clear the bar. Three terms beats twelve wrong ones.

/** ⚖️ TEN, FROM THE MEASURED GAP — real terms 13+, names and brands 6 and below.
 *  Set here rather than per call site so no caller can quietly lower it. */
export const MIN_CREATORS_FOR_TERM = 10

/** ⚠️ A TERM MAY APPEAR IN AT MOST THIS MANY NICHES. One is the measured value:
 *  at one, Food reads as terminology; relaxing it to two readmits `das` and
 *  `today`. Counting uses a LOWER presence bar (3 creators) than the keep bar
 *  (10), so a word need not be prominent elsewhere to disqualify — merely
 *  present. */
export const MAX_NICHES_FOR_TERM = 1
const PRESENT_IN_NICHE = 3

/**
 * ⚠️ THE NICHE LABEL'S OWN WORDS ARE EXCLUDED BY THE CALLER, NOT HERE. "beauty"
 * was the top Beauty term (324 cards) and "education" the top Education term
 * (331) — the label leaks into titles and tags, and reporting it back as
 * vocabulary is circular. `nicheVocabulary` takes the label and drops its words.
 */
const STOPWORDS: ReadonlySet<string> = new Set(
  ('the a an and or of to in for on with your you my is are it this that how what why'
    + ' i we they at be from as can will just get make made not do does new best top all'
    + ' more than have has had was were been being if but so out up down over under about'
    + ' when where who which their there here them his her its our very really much many')
    .split(' '),
)

/**
 * Words a card contributes, deduplicated.
 *
 * ⚠️ HASHTAGS AND MENTIONS COME OUT FIRST, for the same reason as in
 * captionShape: a caption is frequently 80% tags, and "#foodtiktok" is not a
 * creator using the word "food" in a sentence.
 *
 * ⚖️ AND EACH CARD VOTES AT MOST ONCE PER TERM. A recipe caption repeating
 * "chicken" nine times is one card's opinion, not nine.
 */
export function termsIn(title: unknown): Set<string> {
  if (typeof title !== 'string') return new Set()
  const cleaned = title
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@][\p{L}\p{N}_]+/gu, ' ')
    .toLowerCase()
  const out = new Set<string>()
  for (const w of cleaned.match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (!STOPWORDS.has(w)) out.add(w)
  }
  return out
}

export interface VocabularyTerm {
  term: string
  /** ⚠️ THE DISCRIMINATOR. Cards are reported too, but this is what gates. */
  creators: number
  cards: number
}

export interface NicheCard {
  creator: string | null | undefined
  title: string | null | undefined
}

/**
 * The term list for a niche: words used by enough DIFFERENT creators to be
 * terminology rather than somebody's name.
 *
 * ⚠️ A CARD WITH NO CREATOR IS SKIPPED ENTIRELY, not counted under a shared
 * blank. The corpus holds 940 cards under the creator literally named "@", and
 * pooling them would let one broken scrape manufacture a term's spread.
 *
 * ⚖️ RETURNS AN EMPTY LIST RATHER THAN A SHORT ONE when nothing clears the bar.
 * A niche Twin cannot describe yet is silence, not a best guess.
 */
export function nicheVocabulary(
  cards: readonly NicheCard[],
  nicheLabel: string,
): VocabularyTerm[] {
  return nicheVocabularies(new Map([[nicheLabel, cards]])).get(nicheLabel) ?? []
}

/** Per-niche creator sets for one niche's cards. */
function creatorSets(cards: readonly NicheCard[], labelWords: ReadonlySet<string>) {
  const creatorsOf = new Map<string, Set<string>>()
  const cardsOf = new Map<string, number>()
  for (const c of cards) {
    const creator = typeof c.creator === 'string' ? c.creator.trim() : ''
    // ⚠️ "@" IS NOT A CREATOR. 940 cards carry it from a scrape that captured
    // nothing; pooling them would let one failure manufacture spread.
    if (creator === '' || creator === '@') continue
    for (const t of termsIn(c.title)) {
      if (labelWords.has(t)) continue
      let set = creatorsOf.get(t)
      if (set === undefined) { set = new Set(); creatorsOf.set(t, set) }
      set.add(creator)
      cardsOf.set(t, (cardsOf.get(t) ?? 0) + 1)
    }
  }
  return { creatorsOf, cardsOf }
}

/**
 * Every niche's term list, computed together.
 *
 * ⚠️⚠️ TOGETHER IS NOT AN OPTIMISATION — IT IS THE ONLY WAY TO ANSWER. A term is
 * terminology because it is distinctive, and distinctiveness is a fact about the
 * other niches. `nicheVocabulary` above is a convenience for one niche and,
 * given one niche, correctly cannot apply the distinctiveness gate — so it
 * returns the spread-only list, which is why callers should prefer this.
 */
export function nicheVocabularies(
  cardsByNiche: ReadonlyMap<string, readonly NicheCard[]>,
): Map<string, VocabularyTerm[]> {
  const per = new Map<string, ReturnType<typeof creatorSets>>()
  for (const [label, cards] of cardsByNiche) {
    per.set(label, creatorSets(cards, termsIn(label)))
  }

  // how many niches each term is PRESENT in, at the lower presence bar
  const nichesWith = new Map<string, number>()
  for (const { creatorsOf } of per.values()) {
    for (const [term, set] of creatorsOf) {
      if (set.size < PRESENT_IN_NICHE) continue
      nichesWith.set(term, (nichesWith.get(term) ?? 0) + 1)
    }
  }

  const out = new Map<string, VocabularyTerm[]>()
  for (const [label, { creatorsOf, cardsOf }] of per) {
    const terms: VocabularyTerm[] = []
    for (const [term, set] of creatorsOf) {
      if (set.size < MIN_CREATORS_FOR_TERM) continue
      // ⚖️ WITH A SINGLE NICHE THERE IS NOTHING TO BE DISTINCTIVE AGAINST, so
      // the gate is skipped rather than applied vacuously to everything.
      if (cardsByNiche.size > 1 && (nichesWith.get(term) ?? 0) > MAX_NICHES_FOR_TERM) continue
      terms.push({ term, creators: set.size, cards: cardsOf.get(term) ?? 0 })
    }
    // ⚖️ ORDERED BY CREATOR SPREAD, NOT BY CARDS — the same axis that gates.
    terms.sort((a, b) => b.creators - a.creators || b.cards - a.cards || a.term.localeCompare(b.term))
    out.set(label, terms)
  }
  return out
}

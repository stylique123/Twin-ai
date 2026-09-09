// WHAT THE CORPUS IS ACTUALLY ABOUT — AND AN HONEST COUNT OF HOW LITTLE OF IT
// IS A TOPIC AT ALL.
//
// ⚠️⚠️ THE FIRST DRAFT OF THIS MODULE COULD NOT READ A SINGLE STORED TOPIC, AND
// ITS TESTS ALL PASSED. `normalizeTopic` took a string. Every topic in
// production is stored as an `Assessed<string>` — the evidence-bearing wrapper
// `readField` produces — so what reaches a caller that hands over a stored
// profile is a JSON object, `typeof raw !== 'string'`, and `null` on every row.
// A library wired to it would have rendered nothing and reported no error.
//
// ⚖️ THE MEASUREMENTS IN THE ORIGINAL HEADER WERE RIGHT; THE CODE WAS AIMED AT
// A SHAPE THAT NEVER EXISTED IN THE TABLE. The SQL that produced them read
// `profile->'topic'->>'value'`; the TypeScript read the field itself. That gap
// is the whole defect, and it is why `topicValueOf` below is the module's
// entry point rather than a convenience.
//
// ── RE-MEASURED IN PRODUCTION 2026-09-09 ─────────────────────────────────
//
//   reference_content_profiles          1,773 rows
//   carrying a `topic` field            1,099
//     basis `observed` (has a value)      955
//     basis `indeterminate`               125   read, and it does not say
//     basis `not_checked`                  19
//   DISTINCT raw values                   714
//
// ⚠️ AND ZERO ROWS ARE `inferred`. `isKnown` admits it anyway, because
// excluding it would be a rule nobody measured; today it changes no number.
//
// ⚖️ REPLAYING THE RULES BELOW OVER ALL 955 VALUES:
//
//   distinct topics after normalisation   634
//   topics occurring exactly once         554
//   topics at or above the support floor    49
//   rows they speak for                   339   = 35.5% of what was admitted
//
// So the corpus can support statements about 49 topics covering roughly a third
// of it. That is a real finding and a small one, and `topicCoverage` exists so
// no caller can quote the first half without the second.
//
// ⚖️ THE ALIAS LIST BELOW STILL HOLDS, WHICH IS ITS OWN CHECK. Re-counted on
// the same date: entrepreneurship 24 · business ideas 16 · business strategy 10
// · business and entrepreneurship 8 · business 5. Merged they remain the
// largest bucket in the corpus, ahead of music (39).
//
// ── AND `subtopic` IS NOT A TOPIC, SO IT IS NOT HERE ──────────────────────
//
// ⚠️ EFFECTIVELY ONE SUBTOPIC PER ROW, because the field holds a sentence
// describing ONE video:
//
//   "The biochemical and cognitive impact of different macronutrients and
//    micronutrients on the brain"
//   "Sachin Bamgude / SP Enterprise business growth strategies and scaling
//    framework"
//
// The second names a real person and their company. A cross-creator library is
// the one place that must not hold either, on the same rule that keeps
// `evidence` out of `shapeLibrary`. `subtopic` is never read by this module,
// and `normalizeTopic` REJECTS sentence-shaped input so a subtopic that leaks
// into the topic field is dropped rather than counted.
//
// ⚠️⚠️ THE SAME RULE NOW BINDS HARDER, BECAUSE THE WRAPPER CARRIES `evidence` —
// the creator's own transcribed sentence, sitting in the very field this module
// reads. `topicValueOf` takes `value` and NOTHING ELSE. There is no code path
// from `evidence` into a `TopicCount`, by construction rather than by care.
//
// ── THE FRAGMENTATION IS REPORTED, NOT SILENTLY MERGED ────────────────────
//
// ⚖️ THE HEAD IS ONE BUCKET SPLIT SIX WAYS. Merging them needs a synonym table,
// and a synonym table is a guess written down — the day it says `skincare` and
// `beauty` are one thing, the library is asserting something nobody measured.
// So this module normalises SURFACE FORM ONLY (case, punctuation, plurals, `/`
// splits) and exposes `fragmentsOf`, which names the merge candidates and their
// counts and leaves the judgement to a human. Visible fragmentation beats an
// invented taxonomy.
import { isKnown, type Assessed } from './assessed'

/** ⚠️ A TOPIC BELOW THIS IS NOT A FINDING. Three is the floor at which "the
 *  corpus contains videos about X" stops being a description of one video
 *  somebody happened to scrape. It excludes 458 of the 530 values, and that
 *  exclusion is the point — the same posture as `MIN_MEASURED_FOR_A_CLAIM`. */
export const MIN_TOPIC_SUPPORT = 3

/** Words that carry no subject and so cannot make two topics related. */
const STOPWORDS = new Set(['and', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'with', 'or'])

/** Longest a topic may be. Beyond this it is a description, not a category —
 *  measured: the real topics run to 56 characters, the subtopics to 96. */
const MAX_TOPIC_CHARS = 60
const MAX_TOPIC_WORDS = 5

function depluralize(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/**
 * The topic string out of whatever the profile actually holds.
 *
 * ⚠️⚠️ THIS FUNCTION IS THE BUG FIX. Production stores `topic` as an
 * `Assessed<string>`; the rest of this module was written against a bare
 * string, so every stored row normalised to `null` and the library counted an
 * empty corpus without complaining. Callers hand over `profile.topic` — the
 * field, not a value they dug out — and this reads it.
 *
 * ⚖️ IT READS `value` AND NOTHING ELSE. The wrapper also carries `evidence`,
 * which is the creator's own sentence, and a cross-creator library is the one
 * place that must never hold one. `isKnown` is the guard: `indeterminate`
 * carries evidence and NO value, and treating it as a topic would put a
 * transcript line into the count.
 *
 * ⚖️ A BARE STRING STILL WORKS, because the tests and any future caller with a
 * plain value should not have to box one to ask a question about it.
 */
export function topicValueOf(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && 'basis' in raw) {
    const field = raw as Assessed<unknown>
    if (!isKnown(field)) return null
    return typeof field.value === 'string' ? field.value : null
  }
  return null
}

/**
 * Reduce a stored topic to a comparable surface form, or reject it.
 *
 * ⚠️ REJECTION IS A FEATURE. `music / song lyrics` and `music / song
 * performance` are two rows of the same topic separated by a slash; a sentence
 * about macronutrients is not a topic at all. Both are decided here rather than
 * downstream, so the count can never include something that was never a
 * category.
 */
export function normalizeTopic(raw: unknown): string | null {
  // ⚠️ UNWRAPPED FIRST, so a caller may pass the stored field or a bare string
  // and get the same answer. Before this line existed, the stored field — which
  // is what every real caller has — fell straight through the type check below.
  const text = topicValueOf(raw)
  if (text === null) return null

  // ⚠️ THE WHOLE VALUE IS SIZED BEFORE THE SLASH IS SPLIT, AND THE ORDER IS THE
  // WHOLE SAFETY PROPERTY. Splitting first turned the real subtopic
  // "Sachin Bamgude / SP Enterprise business growth strategies and scaling
  // framework" into "sachin bamgude" — two words, fourteen characters, past
  // every limit — and a living person's name would have entered the library as
  // a topic. The production fixture caught it. A value that is sentence-shaped
  // is rejected as a whole; only something already topic-shaped is split.
  if (text.trim().length > MAX_TOPIC_CHARS) return null
  if (text.trim().split(/\s+/).length > MAX_TOPIC_WORDS) return null

  // A slash separates a topic from a qualifier — keep the head.
  const head = text.split('/')[0]
  const cleaned = head
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned || cleaned.length > MAX_TOPIC_CHARS) return null
  const words = cleaned.split(' ')
  if (words.length > MAX_TOPIC_WORDS) return null
  return words.map(depluralize).join(' ')
}

// ── SIX SPELLINGS OF ONE BUCKET, NAMED ONE AT A TIME ──────────────────────
//
// ⚠️ THE HEAD OF THE CORPUS IS ONE TOPIC SPLIT SIX WAYS, and surface
// normalisation cannot join them because they are not surface variants — they
// are different words for the same subject. Measured 2026-09-05:
//
//   entrepreneurship 21 · business idea 16 · business and entrepreneurship 8
//   business strategy 7 · business 4 · business growth 4
//
// Merged they are 63 — the LARGEST supported topic in the corpus, ahead of
// entertainment (22) and artificial intelligence (21). Left apart, the biggest
// thing the corpus knows about is invisible.
//
// ⚖️ SIX ENTRIES BY HAND, NOT A SYNONYM ENGINE. A general synonym rule is a
// guess applied forever: the day it decides `skincare` and `beauty` are one
// thing, the library asserts something nobody measured. A fixed list with its
// counts written beside it is auditable, and the next merge has to be argued
// for on its own evidence rather than inherited from a rule.
//
// ⚖️ AND IT IS DONE NOW *BECAUSE* NOTHING READS THIS LIBRARY YET. Merging
// buckets with no consumers is free. Doing it once the gallery and the angle
// engine read these labels would mean changing a taxonomy under live readers,
// and reasoning about references already assessed under the old ones.
//
// ⚠️ THE STORED VALUE IS NEVER REWRITTEN, WHICH IS WHY THIS IS SAFE. This is a
// READ-TIME projection: `reference_content_profiles.profile.topic` keeps the
// creator's original string, so old and new rows stay distinguishable by
// construction — the failure `known-limitations.md` records for `visualVersion`,
// where a classification changed without a version stamp and old and new rows
// became indistinguishable, cannot happen here. The version below exists for
// the other half of that lesson: anything that CACHES a derived topic must be
// able to say which map produced it.
export const TOPIC_ALIAS_VERSION = 'topic-alias-1'

/** Canonical form on the right. Keys are post-`normalizeTopic` surface forms —
 *  `business ideas` arrives here already depluralised to `business idea`. */
export const TOPIC_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'entrepreneurship': 'business',
  'business idea': 'business',
  'business and entrepreneurship': 'business',
  'business strategy': 'business',
  'business growth': 'business',
})

/**
 * A topic reduced to surface form AND then to its canonical bucket.
 *
 * ⚖️ SEPARATE FROM `normalizeTopic` ON PURPOSE. That function is surface-only
 * and its header promises so; `fragmentsOf` depends on that promise to report
 * collisions the aliases have not resolved. Folding the map into it would make
 * the fragmentation report blind to exactly the merges still worth making.
 */
export function canonicalTopic(raw: unknown): string | null {
  const surface = normalizeTopic(raw)
  if (!surface) return null
  return TOPIC_ALIASES[surface] ?? surface
}

export interface TopicCount {
  topic: string
  /** How many references carry it. */
  count: number
}

/** Every normalised topic and its count, most frequent first. Includes the
 *  singletons: a caller that wants only what is supported asks for that. */
export function topicCounts(
  rawTopics: readonly unknown[],
  /** ⚖️ `normalizeTopic` KEEPS THE SPELLINGS APART, `canonicalTopic` MERGES THE
   *  named six. The default is the surface form, so an existing caller's
   *  numbers do not move under it. */
  normalise: (raw: unknown) => string | null = normalizeTopic,
): TopicCount[] {
  const by = new Map<string, number>()
  for (const raw of rawTopics) {
    const topic = normalise(raw)
    if (!topic) continue
    by.set(topic, (by.get(topic) ?? 0) + 1)
  }
  return [...by].map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}

/** Only the topics the corpus can actually support a statement about. */
export function supportedTopics(
  rawTopics: readonly unknown[],
  normalise: (raw: unknown) => string | null = normalizeTopic,
): TopicCount[] {
  return topicCounts(rawTopics, normalise).filter((t) => t.count >= MIN_TOPIC_SUPPORT)
}

/** What share of assessed references the supported topics account for.
 *
 *  ⚠️ THIS NUMBER TRAVELS WITH THE LIST. Measured at 31%: a topic card built on
 *  this speaks for under a third of the corpus, and a caller that does not know
 *  that will overstate what Twin has seen. */
export function topicCoverage(
  rawTopics: readonly unknown[],
  normalise: (raw: unknown) => string | null = normalizeTopic,
): {
  supported: number; total: number; covered: number; ratio: number
} {
  const all = topicCounts(rawTopics, normalise)
  const total = all.reduce((n, t) => n + t.count, 0)
  const supported = all.filter((t) => t.count >= MIN_TOPIC_SUPPORT)
  const covered = supported.reduce((n, t) => n + t.count, 0)
  return {
    supported: supported.length,
    total,
    covered,
    ratio: total === 0 ? 0 : covered / total,
  }
}

/**
 * Other topics that share a significant word with this one — the merges a
 * human might make, named rather than made.
 *
 * ⚖️ THIS DELIBERATELY DOES NOT MERGE. `business growth` and `business
 * strategy` share `business` and are plainly the same bucket; `music` and
 * `music theory` share `music` and arguably are not. Nothing measured can tell
 * those apart, so the module reports the collision and stops.
 */
export function fragmentsOf(topic: string, counts: readonly TopicCount[]): TopicCount[] {
  const normalized = normalizeTopic(topic)
  if (!normalized) return []
  const words = new Set(normalized.split(' ').filter((w) => !STOPWORDS.has(w)))
  if (words.size === 0) return []
  return counts
    .filter((c) => c.topic !== normalized)
    .filter((c) => c.topic.split(' ').some((w) => !STOPWORDS.has(w) && words.has(w)))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}

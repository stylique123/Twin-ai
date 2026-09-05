// WHAT THE CORPUS IS ACTUALLY ABOUT — AND AN HONEST COUNT OF HOW LITTLE OF IT
// IS A TOPIC AT ALL.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-05, BEFORE ANY OF THIS WAS WRITTEN:
//
//   reference_content_profiles          1,459 rows
//   with a topic                          766
//   DISTINCT topic values                 530
//   topics occurring exactly once         458
//   topics occurring 3 or more times       38   covering 240 rows (31%)
//
// A library that counted raw `topic` values would emit 458 buckets of one and
// present each as a topic the corpus knows about. That is the same defect this
// repo keeps finding in a different costume: a number that exists is not a
// number that means anything.
//
// ⚖️ AND WHAT THIS MODULE ACTUALLY RECOVERS, measured by replaying the rules
// below over all 766 stored values:
//
//   rejected as sentence-shaped            44
//   admitted                              722
//   distinct topics after normalisation   463   (down from 530: the slash
//                                                split alone merged 67)
//   topics at or above the support floor    38
//   rows they speak for                    262   = 36.3% of what was admitted
//
// So the honest summary is that the corpus can support statements about 38
// topics covering roughly a third of it. That is a real finding and a small
// one, and `topicCoverage` exists so no caller can quote the first half
// without the second.
//
// ── AND `subtopic` IS NOT A TOPIC, SO IT IS NOT HERE ──────────────────────
//
// ⚠️ 707 DISTINCT SUBTOPICS OVER 734 ROWS. Effectively one per row, because the
// field holds a sentence describing ONE video:
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
// ── THE FRAGMENTATION IS REPORTED, NOT SILENTLY MERGED ────────────────────
//
// ⚖️ THE HEAD IS ONE BUCKET SPLIT SIX WAYS: `business`, `business ideas`,
// `business strategy`, `business growth`, `business and entrepreneurship`,
// `entrepreneurship`. Merging them needs a synonym table, and a synonym table
// is a guess written down — the day it says `skincare` and `beauty` are one
// thing, the library is asserting something nobody measured. So this module
// normalises SURFACE FORM ONLY (case, punctuation, plurals, `/` splits) and
// exposes `fragmentsOf`, which names the merge candidates and their counts and
// leaves the judgement to a human. Visible fragmentation beats an invented
// taxonomy.

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
 * Reduce a stored topic to a comparable surface form, or reject it.
 *
 * ⚠️ REJECTION IS A FEATURE. `music / song lyrics` and `music / song
 * performance` are two rows of the same topic separated by a slash; a sentence
 * about macronutrients is not a topic at all. Both are decided here rather than
 * downstream, so the count can never include something that was never a
 * category.
 */
export function normalizeTopic(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  // ⚠️ THE WHOLE VALUE IS SIZED BEFORE THE SLASH IS SPLIT, AND THE ORDER IS THE
  // WHOLE SAFETY PROPERTY. Splitting first turned the real subtopic
  // "Sachin Bamgude / SP Enterprise business growth strategies and scaling
  // framework" into "sachin bamgude" — two words, fourteen characters, past
  // every limit — and a living person's name would have entered the library as
  // a topic. The production fixture caught it. A value that is sentence-shaped
  // is rejected as a whole; only something already topic-shaped is split.
  if (raw.trim().length > MAX_TOPIC_CHARS) return null
  if (raw.trim().split(/\s+/).length > MAX_TOPIC_WORDS) return null

  // A slash separates a topic from a qualifier — keep the head.
  const head = raw.split('/')[0]
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

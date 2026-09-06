import { describe, it, expect } from 'vitest'
import {
  normalizeTopic, topicCounts, supportedTopics, topicCoverage, fragmentsOf,
  MIN_TOPIC_SUPPORT, canonicalTopic, TOPIC_ALIASES, TOPIC_ALIAS_VERSION,
} from '../topicLibrary'

// ⚠️ REAL VALUES, READ OUT OF `reference_content_profiles` ON 2026-09-05.
// Invented fixtures would not have contained `music / song lyrics` — the slash
// form that splits one topic into two rows — and would not have shown that the
// business bucket is spelled six different ways.
const REAL_TOPICS = [
  ...Array(22).fill('Entertainment'),
  ...Array(21).fill('Artificial Intelligence'),
  ...Array(21).fill('Entrepreneurship'),
  ...Array(16).fill('Business ideas'),
  ...Array(12).fill('Dropshipping'),
  ...Array(12).fill('Music'),
  ...Array(8).fill('Business and entrepreneurship'),
  ...Array(7).fill('Business strategy'),
  ...Array(6).fill('Skincare'),
  ...Array(5).fill('Music / song lyrics'),
  ...Array(5).fill('Music / song performance'),
  ...Array(4).fill('Business'),
  ...Array(4).fill('Business growth'),
  ...Array(4).fill('Cooking'),
  'A one-off nobody else made',
  'Another singleton',
]

// ⚠️ REAL `subtopic` VALUES. One of them names a living person and their
// company. These are what must never reach a cross-creator library.
const REAL_SUBTOPICS = [
  'The biochemical and cognitive impact of different macronutrients and micronutrients on the brain',
  'Sachin Bamgude / SP Enterprise business growth strategies and scaling framework',
  'End-to-end roadmap for indie hacking and coding your first profitable software product',
  'Acrobatic jump session leading to shoulder injury and moving to a new challenge spot',
  'Theory vs practice when founding a business after studying business administration',
]

describe('a subtopic can never be counted as a topic', () => {
  it('rejects every real subtopic', () => {
    for (const s of REAL_SUBTOPICS) {
      expect(normalizeTopic(s), `subtopic survived: ${s}`).toBeNull()
    }
  })

  // ⚠️ THE SLASH IS THE TRAP. "Sachin Bamgude / SP Enterprise business growth
  // strategies…" begins with a person's name before a slash, and normalizeTopic
  // keeps the head of a slash-separated value. The length and word limits are
  // what stop it, so this asserts the person's name specifically.
  it('does not admit a person and their company via the slash split', () => {
    const out = normalizeTopic(REAL_SUBTOPICS[1])
    expect(out).toBeNull()
    expect(JSON.stringify(topicCounts(REAL_SUBTOPICS))).not.toContain('sachin')
  })

  it('counts nothing at all from a list of subtopics', () => {
    expect(topicCounts(REAL_SUBTOPICS)).toEqual([])
    expect(topicCoverage(REAL_SUBTOPICS).total).toBe(0)
  })
})

describe('surface normalisation, and only surface normalisation', () => {
  it('joins the slash-split music rows into one topic', () => {
    const counts = topicCounts(REAL_TOPICS)
    const music = counts.find((c) => c.topic === 'music')
    expect(music?.count).toBe(22) // 12 + 5 lyrics + 5 performance
  })

  it('is case- and punctuation-insensitive and depluralises', () => {
    expect(normalizeTopic('Business Ideas')).toBe('business idea')
    expect(normalizeTopic('  E-Commerce!  ')).toBe('e-commerce')
    expect(normalizeTopic('Business')).toBe(normalizeTopic('business'))
  })

  // ⚖️ THE MERGE IT DOES *NOT* MAKE. Six spellings of the business bucket stay
  // six topics. Merging them needs a synonym table, and a synonym table is a
  // guess presented as a measurement.
  it('does NOT merge the six business spellings', () => {
    const topics = topicCounts(REAL_TOPICS).map((c) => c.topic)
    expect(topics).toContain('business')
    expect(topics).toContain('business strategy')
    expect(topics).toContain('business growth')
    expect(topics).toContain('entrepreneurship')
  })

  it('rejects a non-string, an empty string and whitespace', () => {
    for (const v of [null, undefined, 42, {}, [], '', '   ', '!!!']) {
      expect(normalizeTopic(v)).toBeNull()
    }
  })
})

describe('a topic below the support floor is not a finding', () => {
  it('drops the singletons', () => {
    const supported = supportedTopics(REAL_TOPICS).map((t) => t.topic)
    expect(supported).not.toContain('a one-off nobody else made')
    expect(supported).not.toContain('another singleton')
  })

  it('keeps only counts at or above the floor', () => {
    for (const t of supportedTopics(REAL_TOPICS)) {
      expect(t.count).toBeGreaterThanOrEqual(MIN_TOPIC_SUPPORT)
    }
  })

  // ⚠️ THE COVERAGE NUMBER TRAVELS WITH THE LIST. Measured over the real 766
  // rows it is 31%; a caller shown the topics without it will overstate what
  // Twin has seen.
  it('reports how much of the corpus the supported topics speak for', () => {
    const c = topicCoverage(REAL_TOPICS)
    expect(c.total).toBe(REAL_TOPICS.length)
    expect(c.covered).toBe(REAL_TOPICS.length - 2) // the two singletons
    expect(c.ratio).toBeLessThan(1)
    expect(c.ratio).toBeGreaterThan(0.9)
  })

  it('an empty corpus reports zero rather than dividing by it', () => {
    expect(topicCoverage([])).toEqual({ supported: 0, total: 0, covered: 0, ratio: 0 })
  })
})

describe('fragmentation is named, never merged', () => {
  it('finds the other business spellings without combining them', () => {
    const counts = topicCounts(REAL_TOPICS)
    const frags = fragmentsOf('business', counts).map((f) => f.topic)
    expect(frags).toContain('business strategy')
    expect(frags).toContain('business growth')
    expect(frags).toContain('business idea')
    // and the count for `business` itself is untouched by the report
    expect(counts.find((c) => c.topic === 'business')?.count).toBe(4)
  })

  it('never lists the topic as its own fragment', () => {
    const counts = topicCounts(REAL_TOPICS)
    expect(fragmentsOf('business', counts).map((f) => f.topic)).not.toContain('business')
  })

  // ⚠️ "AND" RELATES NOTHING. Without stopwords, "business and entrepreneurship"
  // would make every multi-word topic a fragment of every other one.
  it('does not relate two topics by a stopword alone', () => {
    const counts = topicCounts(['cooking and baking', 'travel and leisure', 'cooking and baking',
      'travel and leisure', 'cooking and baking', 'travel and leisure'])
    expect(fragmentsOf('cooking and baking', counts)).toEqual([])
  })

  it('returns nothing for input that is not a topic', () => {
    expect(fragmentsOf(REAL_SUBTOPICS[0], topicCounts(REAL_TOPICS))).toEqual([])
  })
})

// ── THE SIX SPELLINGS, MERGED BY NAME ─────────────────────────────────────
describe('six spellings of one bucket, and nothing else', () => {
  it('merges all six into `business`, and it becomes the largest topic', () => {
    const counts = topicCounts(REAL_TOPICS, canonicalTopic)
    const business = counts.find((c) => c.topic === 'business')
    // 4 + 16 + 7 + 4 + 8 + 21 across the six spellings in the real sample.
    expect(business?.count).toBe(60)
    // ⚠️ THE POINT OF THE MERGE. Apart, the biggest thing the corpus knows
    // about is invisible behind `entertainment` (22).
    expect(counts[0].topic).toBe('business')
  })

  it('leaves the surface counts untouched for callers that did not ask', () => {
    const surface = topicCounts(REAL_TOPICS).map((c) => c.topic)
    expect(surface).toContain('entrepreneurship')
    expect(surface).toContain('business strategy')
    expect(topicCounts(REAL_TOPICS).find((c) => c.topic === 'business')?.count).toBe(4)
  })

  // ⚖️ THE MAP IS A LIST, NOT A RULE. Every key is one somebody argued for.
  it('merges nothing it was not explicitly told to', () => {
    expect(canonicalTopic('skincare')).toBe('skincare')
    expect(canonicalTopic('beauty')).toBe('beauty')
    expect(canonicalTopic('music')).toBe('music')
    // A word CONTAINING `business` is not a listed alias.
    expect(canonicalTopic('business case study')).toBe('business case study')
  })

  it('still refuses everything normalizeTopic refuses', () => {
    for (const s of REAL_SUBTOPICS) expect(canonicalTopic(s)).toBeNull()
    expect(canonicalTopic(null)).toBeNull()
    expect(canonicalTopic('')).toBeNull()
  })

  // ⚠️ EVERY ALIAS KEY MUST SURVIVE `normalizeTopic`, or it can never match.
  // `business ideas` depluralises to `business idea`; a key written in the
  // plural would sit in the map forever and merge nothing.
  it('every alias key is already in surface form', () => {
    for (const key of Object.keys(TOPIC_ALIASES)) {
      expect(normalizeTopic(key), `alias key ${key} is not its own surface form`).toBe(key)
    }
  })

  it('no alias points at another alias', () => {
    for (const target of Object.values(TOPIC_ALIASES)) {
      expect(TOPIC_ALIASES[target], `${target} is both a target and a key`).toBeUndefined()
    }
  })

  it('carries a version, because a cached derived topic must name its map', () => {
    expect(TOPIC_ALIAS_VERSION).toMatch(/^topic-alias-\d+$/)
  })
})

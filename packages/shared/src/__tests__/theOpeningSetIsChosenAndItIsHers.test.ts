// TWO MORE QUESTIONS, CHOSEN — AND THE WORDING NAMES HER ACTUAL WORK.
//
// ⚠️ THE OWNER'S TWO CONSTRAINTS, BOTH LOAD-BEARING:
//   1. "there should not be written. There should be chosen" — the extra two
//      come out of the existing bank via `nextQuestionByDeficit`, the same
//      selector the post-script card uses. Nothing new was authored.
//   2. "these questions should be not business related but very specific to the
//      DNA extracted" — the coarse bucket says `business`; the scan said
//      "custom Bible rebinding". Measured on 57 voices, `sub_niche` is
//      populated on 52.
//
// ⚖️ THE INTERESTING PROPERTY IS THAT THE CHOICE IS NOT HARD-CODED. Feeding the
// seed's own kinds in as supply makes `framework` and `claim` the scarcest
// remaining kinds, so the selector lands on a method question and a number
// question BY ITSELF. If someone reorders the bank, this test says so.
import { describe, it, expect } from 'vitest'
import { CREATOR_QUESTIONS, OPENING_THREE, type CreatorQuestion } from '../creatorQuestions'
import { openingSetFor, OPENING_EXTRA, nextQuestionByDeficit } from '../questionDeficit'
import {
  creatorQuestionsFor, openingQuestionsFor, anchorAllToSubNiche, subNicheIsSpliceable,
} from '../nicheQuestions'

const ids = (qs: readonly CreatorQuestion[]) => qs.map((q) => q.id)

describe('the opening set is the seed plus what the store lacks', () => {
  it('is five questions, and the first three are the measured seed IN ORDER', () => {
    const set = openingSetFor()
    expect(set.length).toBe(OPENING_THREE.length + OPENING_EXTRA)
    expect(ids(set).slice(0, 3)).toEqual([...OPENING_THREE])
  })

  it('the extra two are a FRAMEWORK and a CLAIM — the kinds the seed leaves at zero', () => {
    const extra = openingSetFor().slice(OPENING_THREE.length)
    expect(extra.map((q) => q.kind).sort()).toEqual(['claim', 'framework'])
  })

  it('and on an empty store those are the method and number questions', () => {
    // Not hard-coded anywhere — this is what the deficit maths produces.
    expect(ids(openingSetFor()).slice(3)).toEqual(['own_method', 'number_that_matters'])
  })

  it('never repeats a question, and never invents one', () => {
    const set = openingSetFor()
    expect(new Set(ids(set)).size).toBe(set.length)
    for (const q of set) {
      expect(CREATOR_QUESTIONS.some((b) => b.id === q.id), `${q.id} is not in the bank`).toBe(true)
    }
  })

  it('a real store count outranks the seed', () => {
    // Eight frameworks already: the framework question must lose its place.
    const set = openingSetFor(CREATOR_QUESTIONS, { framework: 8 })
    const extra = ids(set).slice(OPENING_THREE.length)
    expect(extra).not.toContain('own_method')
    expect(extra).not.toContain('first_thing_asked')
  })

  it('both extras come from ONE selector — the same one the post-script card uses', () => {
    // Re-deriving the first pick by hand must agree, or there are two authorities.
    const seedKinds: Record<string, number> = {}
    for (const id of OPENING_THREE) {
      const k = CREATOR_QUESTIONS.find((q) => q.id === id)?.kind
      if (k) seedKinds[k] = (seedKinds[k] ?? 0) + 1
    }
    const byHand = nextQuestionByDeficit([...OPENING_THREE], seedKinds, CREATOR_QUESTIONS)
    expect(byHand?.id).toBe(ids(openingSetFor())[OPENING_THREE.length])
  })

  // ⚠️ THIS EXISTS BECAUSE A MUTANT SURVIVED AND THE MUTANT WAS RIGHT. Dropping
  // the per-pick supply update changes nothing on the real bank — `put` already
  // excludes the chosen question, and the next-scarcest kind happens to differ
  // anyway. The property it protects only becomes visible when one kind holds
  // two adjacent unanswered questions AND stays scarcest, which today's bank
  // cannot express. So the case is built rather than claimed.
  it('does not spend both picks on one kind when that kind stays scarcest', () => {
    const bank: CreatorQuestion[] = [
      ...OPENING_THREE.map((id) => CREATOR_QUESTIONS.find((q) => q.id === id)!),
      { id: 'fw_a', ask: 'a', kind: 'framework', hint: 'h' },
      { id: 'fw_b', ask: 'b', kind: 'framework', hint: 'h' },
      { id: 'cl_a', ask: 'c', kind: 'claim', hint: 'h' },
    ]
    const extra = ids(openingSetFor(bank)).slice(OPENING_THREE.length)
    // Both frameworks would be picked if the first pick were not counted.
    expect(extra).not.toEqual(['fw_a', 'fw_b'])
    expect(extra).toEqual(['fw_a', 'cl_a'])
  })

  it('degrades to the seed rather than below it', () => {
    expect(ids(openingSetFor(CREATOR_QUESTIONS, undefined, 0))).toEqual([...OPENING_THREE])
    // A bank holding only the seed cannot yield extras, and must not throw.
    const onlySeed = CREATOR_QUESTIONS.filter((q) => (OPENING_THREE as readonly string[]).includes(q.id))
    expect(ids(openingSetFor(onlySeed))).toEqual([...OPENING_THREE])
  })
})

describe('the wording names her actual work, not a bucket', () => {
  const askOf = (qs: readonly CreatorQuestion[], id: string) => qs.find((q) => q.id === id)?.ask

  /** The full pipeline, in the order `StoryInterview` runs it. */
  const screen = (niche: string | null, subNiche: string | null) => anchorAllToSubNiche(
    openingSetFor(openingQuestionsFor(creatorQuestionsFor(niche, CREATOR_QUESTIONS, null), null, null)),
    subNiche,
  )

  it('a Bible rebinder is asked about Bible rebinding, not "your industry"', () => {
    const qs = screen('Business & Entrepreneurship', 'custom Bible rebinding')
    expect(askOf(qs, 'contrarian')).toBe(
      'What advice does everyone in custom Bible rebinding give that you think is wrong?',
    )
    expect(askOf(qs, 'contrarian')).not.toMatch(/your industry/)
  })

  it('the number question gets it too, from the plain bank wording', () => {
    const qs = screen(null, 'holistic meal prep')
    expect(askOf(qs, 'number_that_matters')).toBe(
      'What number do you track that most people in holistic meal prep ignore?',
    )
  })

  it('a proper noun is spliced VERBATIM — we do not mangle her word for her craft', () => {
    // Lower-casing the first word would produce "bible rebinding".
    expect(askOf(screen(null, 'Bible rebinding'), 'contrarian')).toContain('in Bible rebinding')
    expect(askOf(screen(null, 'Postpartum pregnancy fitness'), 'contrarian'))
      .toContain('in Postpartum pregnancy fitness')
  })

  it('nothing but the placeholder moves, and the ids never move', () => {
    const plain = screen('Business & Entrepreneurship', null)
    const anchored = screen('Business & Entrepreneurship', 'custom Bible rebinding')
    expect(ids(anchored)).toEqual(ids(plain))
    // expensive_lesson has no group placeholder, so it must be untouched.
    expect(askOf(anchored, 'expensive_lesson')).toBe(askOf(plain, 'expensive_lesson'))
  })

  it('a missing sub_niche changes nothing at all', () => {
    for (const bad of [null, undefined, '', '   ']) {
      expect(ids(screen('Business & Entrepreneurship', bad as string | null)))
        .toEqual(ids(screen('Business & Entrepreneurship', null)))
      expect(askOf(screen(null, bad as string | null), 'contrarian')).toMatch(/your niche/)
    }
  })

  // ⚠️ THE REASON `enemy` AND `offer` ARE NOT USED. These are real production
  // values, and each one inside a question would be a sentence no human wrote.
  it('REFUSES prose, which is the shape of every other DNA field', () => {
    const realProse = [
      'Vague motivation, short-term toxic hustle culture, and business owners acting as their own bottleneck',
      'Cheap bonded factory leather, poorly glued factory bindings, and careless rushing',
      'The fear-mongering myth that pregnant women are too fragile to lift weights',
      'Custom Bible rebinding services, handcrafted leather wallets',
      'Blank screen paralysis and burning 5 hours trying to create social posts from scratch',
    ]
    for (const p of realProse) {
      expect(subNicheIsSpliceable(p), `spliced prose: ${p.slice(0, 40)}`).toBe(false)
      expect(askOf(screen(null, p), 'contrarian')).toMatch(/your niche/)
    }
  })

  // ⚠️ ADDED BECAUSE A MUTANT SURVIVED. Every fixture above is longer than the
  // 44-character cap, so the LENGTH guard rejected them all and the punctuation
  // and conjunction guards never ran once — removing them kept the suite green.
  // These are short enough that only the shape check can refuse them.
  it('refuses SHORT prose too, so the length cap is not the only guard', () => {
    const shortProse = [
      'leather, wallets',            // a comma: a list, not a practice
      'meal prep and catering',      // a conjunction: two practices
      'coaching or consulting',      // either/or
      'kits for creators',           // a prepositional phrase
      'wallets with initials',       // ditto
      'rebinding.',                  // a trailing full stop is prose
    ]
    for (const v of shortProse) {
      expect(v.length, `${v} is not short enough to isolate the shape guard`).toBeLessThan(44)
      expect(subNicheIsSpliceable(v), `admitted short prose: ${v}`).toBe(false)
      expect(askOf(screen(null, v), 'contrarian')).toMatch(/your niche/)
    }
  })

  it('accepts the real sub_niche values measured in production', () => {
    for (const v of [
      'custom Bible rebinding', 'holistic meal prep', 'scaling business operations',
      'Postpartum pregnancy fitness', 'niche social content kits',
    ]) {
      expect(subNicheIsSpliceable(v), v).toBe(true)
    }
  })

  it('refuses a placeholder that would read as a joke', () => {
    for (const v of ['general', 'various', 'N/A', 'unknown', 'none']) {
      expect(subNicheIsSpliceable(v), v).toBe(false)
    }
  })

  it('refuses a non-string without throwing', () => {
    for (const v of [42, {}, [], true, null, undefined]) {
      expect(subNicheIsSpliceable(v)).toBe(false)
    }
  })

  it('leaves "your trade" alone, because the substitution is not English there', () => {
    // `making`'s contrarian is "What does your trade insist on..." — no `in your X`.
    const qs = screen('Leathercraft & Custom Bible Rebinding', 'custom Bible rebinding')
    const ask = askOf(qs, 'contrarian')
    expect(ask).toMatch(/your trade insist on/)
    expect(ask).not.toMatch(/custom Bible rebinding insist on/)
  })
})

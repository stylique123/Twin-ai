// Plan v6.6 §32: "describe your voice yourself" builds a usable voice card with
// NO model call, labelled manual, behind a flag that defaults off.
// Fictional answers only.
import { describe, it, expect } from 'vitest'
import {
  buildManualVoiceCard, manualVoiceCardOn, sanitizeManualVoiceAnswers, withManualVoiceCard,
  buildCreatorVoiceCard, voiceCardView, voiceCardBrief, applyVoiceCardEdits, MANUAL_VOICE_KEY, GENERIC_AI_PHRASES,
} from '../voice/voiceCard'

const answers = {
  niche: 'Home baking for busy parents',
  tone: 'Funny, casual and direct',
  audience: 'Parents with 20 minutes on a weeknight',
  stories: ['I burned my first sourdough three times. Now I teach the shortcut I wish I had!', 'You do not need a stand mixer. I never had one.'],
  products: ['Weeknight Bread mini course'],
}

describe('manual voice card', () => {
  it('the flag defaults off', () => {
    expect(manualVoiceCardOn(undefined)).toBe(false)
    expect(manualVoiceCardOn('')).toBe(false)
    expect(manualVoiceCardOn('false')).toBe(false)
    expect(manualVoiceCardOn('yes')).toBe(false)
    for (const v of ['true', 'on', '1', ' TRUE ']) expect(manualVoiceCardOn(v)).toBe(true)
  })

  it('builds a deterministic card from the typed answers, labelled manual', () => {
    const a = buildManualVoiceCard(answers)
    const b = buildManualVoiceCard(JSON.parse(JSON.stringify(answers)))
    expect(a).toEqual(b)
    expect(a!.source).toBe('manual')
    expect(a!.id).toMatch(/^manual-[0-9a-f]{8}$/)
    expect(a!.manual).toEqual(sanitizeManualVoiceAnswers(answers))
    expect(a!.tone.label).toBe('playful')
    expect(a!.formality.label).toBe('casual')
    expect(a!.signatures).toEqual([])
    expect(a!.sentences).toBe(4)
    expect(a!.person.dominant).toBe('i')
    expect(a!.never_uses.length).toBeGreaterThan(0)
    expect(a!.never_uses.every((p) => GENERIC_AI_PHRASES.includes(p))).toBe(true)
  })

  it('never forbids her own words', () => {
    const phrase = GENERIC_AI_PHRASES[0]!
    const card = buildManualVoiceCard({ ...answers, stories: [`Honestly ${phrase} is how I talk.`] })
    expect(card!.never_uses).not.toContain(phrase)
  })

  it('uses neutral defaults with no stories, and returns null with nothing typed', () => {
    const c = buildManualVoiceCard({ niche: 'Gardening', tone: 'calm' })
    expect(c!.sentence_length).toEqual({ mean: 12, median: 12 })
    expect(c!.tone.label).toBe('even')
    expect(c!.formality.label).toBe('neutral')
    expect(buildManualVoiceCard({})).toBeNull()
    expect(buildManualVoiceCard(null)).toBeNull()
    expect(buildManualVoiceCard({ niche: 42, stories: [1, null] })).toBeNull()
  })

  it('caps and cleans what was typed', () => {
    const s = sanitizeManualVoiceAnswers({ niche: 'x'.repeat(500), stories: Array(20).fill('a story'), products: ['p', 3] })
    expect(s!.niche.length).toBe(120)
    expect(s!.stories.length).toBe(8)
    expect(s!.products).toEqual(['p'])
  })

  it('the view and the brief say it is manual', () => {
    const card = buildManualVoiceCard(answers)!
    const view = voiceCardView(card)
    expect(view.manual).toBe(true)
    expect(view.counted_from).toMatch(/by hand/)
    const brief = voiceCardBrief(card)
    expect(brief).toMatch(/BY HAND/)
    expect(brief).toContain('Home baking for busy parents')
    expect(brief).toContain('Weeknight Bread mini course')
  })

  it('her edits keep the manual label', () => {
    const card = buildManualVoiceCard(answers)!
    const edited = applyVoiceCardEdits(card, { never_says_add: ['game changer'] })
    expect(edited.source).toBe('manual')
  })

  it('a counted card is unchanged and is never labelled manual', () => {
    const view = voiceCardView({ ...buildManualVoiceCard(answers)!, source: undefined, manual: undefined })
    expect(view.manual).toBeUndefined()
  })
})

describe('withManualVoiceCard (the server fallback)', () => {
  const thin = buildCreatorVoiceCard({ answers: ['one short answer here'] }, { thinFloor: true })
  const profile = { niche: 'n', [MANUAL_VOICE_KEY]: { source: 'manual', ...answers } }

  it('fills a thin creator with the manual card only when the flag is on', () => {
    expect(thin.card).toBeNull()
    expect(withManualVoiceCard(thin, profile, false)).toBe(thin)
    const out = withManualVoiceCard(thin, profile, true)
    expect(out.reason).toBe('manual')
    expect(out.card!.source).toBe('manual')
    expect(out.card!.material).toEqual(thin.material)
  })

  it('does nothing without stored answers', () => {
    expect(withManualVoiceCard(thin, { niche: 'n' }, true)).toBe(thin)
    expect(withManualVoiceCard(thin, null, true)).toBe(thin)
  })

  it('a counted card always wins', () => {
    const counted = { ...thin, card: { ...buildManualVoiceCard(answers)!, source: 'counted' as const }, reason: 'ok' as const }
    expect(withManualVoiceCard(counted, profile, true)).toBe(counted)
  })
})

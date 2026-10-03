// ⚠️ AUDIT 2026-10-03 (script batch, part 2 — zero tolerance). part-1e#92
// (generation 971f9c9f) said "face fines and a court date", "$11 in my bank
// account" and "the officer joked"; eight more scripts told the officer or
// inspector visit. The story lived in fact cbd27272 and in her voice profile's
// sample hooks, and the word list caught none of it. Each layer is pinned here
// with the exact leaked sentences, and ordinary coffee content must still pass.
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { isPrivate, scrubPrivate, privateParts, guardScript, rewriteIsSafe, privateSqlPattern } from '../privacyGuard'

const LEAKED = [
  'I had 26 days to move my roastery… or face fines and a court date.',
  'I had $11 in my bank account during inspections—until the officer joked she was coming back just for the coffee.',
  'The visiting officer joked she told the girls in the office she might come back just for the coffee.',
  'today the city inspector walks through our doors',
  'Our inspector told her entire office she might return with coffee',
  'The visiting inspection officer walked through our doors today.',
  'The city inspector just walked into my home roastery',
  'inspectors walked through doors',
  'I just got off the phone with the Police Department code enforcement',
]
const ORDINARY = [
  'Fresh beans hold their aroma for about two weeks after roasting.',
  'Too many coffee fines in the cup make it taste muddy.',
  'Use a fine grind for espresso and a coarse one for French press.',
  'I am totally fine with oat milk.',
  'Grab a bag of Signature Blend, the link is in my bio.',
  // ⚖️ BORDERLINE, DECIDED: a bare inspector in a permit sense is business
  // advice, not her visit story. "The / our inspector …" or an inspector who
  // walked in, joked or cited is private (see SENSITIVE in storyRotation.ts).
  'City inspector approved my cart, so now I can sell at the farmers market.',
  'What city health inspectors look for in a mobile coffee cart.',
]

describe('the word list (shared PRIVATE)', () => {
  it('flags every leaked sentence', () => {
    for (const t of LEAKED) expect(isPrivate(t), t).toBe(true)
  })
  it('flags the legal, money and health hardship around them', () => {
    for (const t of ['We got a summons in March.', 'I was facing hefty fines.', 'My bank balance was zero.', 'We were broke that winter.', "I couldn't pay rent.", 'my doctor said rest', 'medical bills piled up', 'animal control came twice']) {
      expect(isPrivate(t), t).toBe(true)
    }
  })
  it('passes ordinary coffee content', () => {
    for (const t of ORDINARY) expect(isPrivate(t), t).toBe(false)
  })
})

describe('the readers: a voice profile is scrubbed before the writer sees it', () => {
  const profile = {
    sample_hooks: ['today the city inspector walks through our doors', 'Here is how I roast to order.'],
    hook_patterns: ['Our inspector told her entire office she might return with coffee', 'A number, then the twist.'],
    voice_samples: 'I roast in small batches. The officer joked she was coming back for the coffee.',
  }
  it('drops private list entries and cuts private sentences', () => {
    const s = scrubPrivate(profile)
    expect(s.sample_hooks).toEqual(['Here is how I roast to order.'])
    expect(s.hook_patterns).toEqual(['A number, then the twist.'])
    expect(s.voice_samples).toBe('I roast in small batches.')
  })
  it('hands what it cut to the final guard as excluded text', () => {
    const parts = privateParts(profile)
    expect(parts).toContain('today the city inspector walks through our doors')
    expect(parts).toContain('The officer joked she was coming back for the coffee.')
    expect(parts).not.toContain('Here is how I roast to order.')
  })
})

describe('the final guard: spoken lines, hooks and captions', () => {
  const excludedTexts = ['The visiting officer joked she told the girls in the office she might come back just for the coffee.']
  it('removes every leaked sentence and keeps the rest of the beat', () => {
    const beats = LEAKED.map((l) => ({ line: `I roast every bag to order. ${l}` }))
    const { beats: out, removed } = guardScript(beats, { allowedText: '', excludedTexts })
    expect(removed.length).toBe(LEAKED.length)
    for (const b of out) expect(b.line).toBe('I roast every bag to order.')
  })
  it('a rewrite carrying them is refused', () => {
    for (const t of LEAKED) expect(rewriteIsSafe(t, { allowedText: '', excludedTexts }), t).toBe(false)
  })
  it('ordinary coffee lines survive untouched', () => {
    const { removed } = guardScript(ORDINARY.map((line) => ({ line })), { allowedText: '', excludedTexts })
    expect(removed).toEqual([])
  })
})

describe('the stored flag (0273) is the same list', () => {
  const MIG = readFileSync(new URL('../../../../../supabase/migrations/0273_private_is_decided_when_stored.sql', import.meta.url), 'utf8')
  it('the knowledge flag and the voice-profile split both use it', () => {
    // Once in the trigger for text, once for evidence, twice in the backfill,
    // once in the voice-profile split.
    expect(MIG.split(privateSqlPattern()).length - 1).toBe(5)
    expect(MIG).toContain('create trigger brand_voices_private_out')
    expect(MIG).toMatch(/update public\.creator_knowledge\s+set sensitive = true\s+where not sensitive/)
  })
})

describe('every door into the writer prompt passes the same check', () => {
  const SRC = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
  it('voice profile, DNA, idea mode, past captions and web items are scrubbed', () => {
    expect(SRC).toContain('scrubRejected(scrubPrivate(voice?.profile ?? null), herRejected)')
    expect(SRC).toContain('const d = scrubPrivate(profile?.dna ?? {})')
    expect(SRC).toContain('scrubPrivate(v?.profile ?? null) as never)')
    expect(SRC).toContain('renderTrackRecordInline(scrubPrivate(record))')
    expect(SRC).toContain('renderNicheResearchInline(scrubPrivate(research))')
  })
  it('what the scrub cut is excluded text for the final guard', () => {
    expect(SRC).toContain('guardExcludedTexts.push(...privateParts(voice?.profile ?? null)')
  })
})

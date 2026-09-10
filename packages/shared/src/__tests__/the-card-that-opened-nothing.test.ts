// "YOUR VOICE — WHAT TWIN HAS LEARNED" OPENED NOTHING.
//
// ⚠️ NOT A BROKEN HANDLER. `view_dna` mapped to `setTab('twin')` and the card
// LIVES on the twin tab, so tapping "View" re-selected the tab you were already
// on. Nothing broke and nothing happened — which reads to a creator as "Twin has
// nothing to show me", the opposite of what it holds.
//
// ⚠️⚠️ AND TWO FIELDS THE REQUEST NAMED WOULD HAVE SHIPPED EMPTY:
//
//   `signature_phrases` — ABSENT FROM ALL 51 STORED PROFILES. The phrases a
//   creator recognises ("lineup", "honest routine", "10/10", "facecard") live in
//   `vocabulary`, 47 of 51. A panel built on the requested name renders nothing,
//   for everyone, and looks exactly like the dead card it replaced.
//
//   a sample size ("measured from 47 posts") — NOT AVAILABLE per voice.
//   `scraped_posts` covers 5 of 51, `own_sample_checked` 10 of 51.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { whatTwinLearned, heardCount, basisOf, BASIS_LABEL } from '../whatTwinLearned'

// A real profile shape, keys and provenance values verbatim from production.
const PROFILE = {
  niche: 'Beauty & Lifestyle',
  vocabulary: ['lineup', 'honest routine', '10/10', 'repurchase', 'facecard'],
  tone: 'warm, direct',
  pacing: 'quick',
  hook_style: 'question',
  recurring_ctas: ['Tag that friend', 'Let me know in the comments'],
  audience: 'everyday people who buy what they see',
  // ⚠️ NOT IN `SHOWN`, and deliberately: a summary is Twin describing her, not
  // a fact she can check word by word.
  summary: 'She reviews products honestly.',
  _provenance: {
    niche: 'observed_audio',
    vocabulary: 'observed_audio',
    tone: 'observed_audio',
    recurring_ctas: 'observed_audio',
    audience: 'caption_synthesis',
    pacing: 'caption_synthesis',
  },
}

describe('it shows the field that exists, not the one that was asked for', () => {
  it('renders vocabulary as the words she recognises', () => {
    const facts = whatTwinLearned(PROFILE)
    const vocab = facts.find((f) => f.field === 'vocabulary')!
    expect(vocab.values).toContain('facecard')
    expect(vocab.label).not.toMatch(/vocabulary|signature/i)
  })

  it('a profile with only the non-existent field learns nothing', () => {
    // ⚠️⚠️ THE LOAD-BEARING ONE. This is what the requested spec would have
    // produced on every account in production.
    expect(whatTwinLearned({ signature_phrases: ['lineup', '10/10'] })).toEqual([])
  })
})

describe('every fact says how Twin came to know it', () => {
  it('heard and read are told apart, in her language', () => {
    const facts = whatTwinLearned(PROFILE)
    expect(facts.find((f) => f.field === 'tone')!.basis).toBe('observed_audio')
    expect(facts.find((f) => f.field === 'audience')!.basis).toBe('caption_synthesis')
    expect(BASIS_LABEL.observed_audio).toBe('heard in your videos')
    // ⚖️ NEVER OUR WORD FOR IT. `caption_synthesis` is a pipeline name.
    expect(BASIS_LABEL.caption_synthesis).not.toMatch(/synthesis|observed|audio/i)
  })

  it('a field with no provenance claims nothing', () => {
    // ⚖️ 15 OF 51 VOICES PREDATE THE PROVENANCE MAP. Labelling their facts
    // "heard" would invent an evidence claim for rows nobody measured.
    expect(basisOf(undefined, 'tone')).toBe('unknown')
    expect(basisOf({}, 'tone')).toBe('unknown')
    expect(basisOf({ tone: 'something_new' }, 'tone')).toBe('unknown')
    expect(BASIS_LABEL.unknown).toBe('')
    const noProv = whatTwinLearned({ niche: 'Beauty', tone: 'warm' })
    expect(noProv.every((f) => f.basis === 'unknown')).toBe(true)
    expect(heardCount(noProv)).toBe(0)
  })

  it('counts only what was heard', () => {
    expect(heardCount(whatTwinLearned(PROFILE))).toBe(4)
  })
})

describe('absent is absent, never a blank row', () => {
  it('drops fields with no value', () => {
    // ⚠️ SEVEN LABELS WITH EMPTY VALUES IS THE DEAD CARD WITH MORE PIXELS.
    const facts = whatTwinLearned({ niche: 'Beauty', tone: '', vocabulary: [], pacing: '   ' })
    expect(facts.map((f) => f.field)).toEqual(['niche'])
  })

  it('survives malformed and absent profiles', () => {
    expect(whatTwinLearned(null)).toEqual([])
    expect(whatTwinLearned(undefined)).toEqual([])
    expect(whatTwinLearned('a string')).toEqual([])
    expect(whatTwinLearned({ vocabulary: [42, null, 'real'] })).toEqual([
      { field: 'vocabulary', label: 'Words you actually use', values: ['real'], basis: 'unknown' },
    ])
  })
})

// ── AND THE CARD OPENS IT ─────────────────────────────────────────────────
const SETTINGS = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
  'apps', 'web', 'src', 'pages', 'Settings.tsx'), 'utf8')

describe('the dead card now opens something', () => {
  it('view_dna no longer re-selects the tab it is already on', () => {
    // ⚠️⚠️ THE DEFECT, PINNED. `setTab('twin')` from a card on the twin tab.
    expect(SETTINGS).not.toMatch(/case 'view_dna': return setTab\('twin'\)/)
    expect(SETTINGS).toMatch(/case 'view_dna': return setLearnedOpen\(true\)/)
  })

  it('the panel reads the shared rule rather than reaching into the profile', () => {
    expect(SETTINGS).toMatch(/whatTwinLearned\(voiceProfile\)/)
    expect(SETTINGS).toMatch(/heardCount\(facts\)/)
    expect(SETTINGS).toMatch(/BASIS_LABEL\[f\.basis\]/)
  })

  it('it states its evidence before its claims', () => {
    expect(SETTINGS).toContain('learned-evidence')
    expect(SETTINGS).toContain('heard in your own videos')
  })

  it('an empty scan says so rather than rendering blank rows', () => {
    expect(SETTINGS).toContain('learned-empty')
    expect(SETTINGS).toContain('Nothing yet.')
  })
})

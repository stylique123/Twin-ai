import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  buildVoiceCard, buildCreatorVoiceCard, voiceMaterial, verbatimCount, voiceMaterialAmount, isThinMaterial,
  voiceCheck, voiceCardBrief, voiceCardCleanupOptions, voiceCardView, applyVoiceCardEdits, sanitizeVoiceCardEdits,
  VOICE_CHECK_PASS, THIN_SPEECH_MINUTES,
} from '../voice/voiceCard'
import { robotPass } from '../robotPhrases'

// FICTIONAL panel only (scripts/ops/fixtures/fictional-panel.json).
const FIXTURE = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..', '..', 'scripts', 'ops', 'fixtures', 'fictional-panel.json')
const panel = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { creators: Array<{ key: string; voice: Record<string, unknown>; answers: Record<string, string> }> }
const material = new Map(panel.creators.map((c) => [c.key, [...voiceMaterial(c.voice), ...Object.values(c.answers)]]))
const card = (k: string) => buildVoiceCard(material.get(k)!)!

/** A fictional "transcript": her samples repeated as one long passage, with a measured duration. */
const transcriptOf = (k: string, seconds: number) => ({ text: voiceMaterial(panel.creators.find((c) => c.key === k)!.voice).join(' '), seconds })

describe('the complete card', () => {
  it('carries every part: length, openers, words used and avoided, tone, pacing, signatures, never says', () => {
    for (const c of panel.creators) {
      const v = card(c.key)
      expect(v.sentence_length.mean).toBeGreaterThan(0)
      expect(v.openers).toBeDefined()
      expect(v.vocabulary.uses.length, c.key).toBeGreaterThan(0)
      expect(v.vocabulary.avoids.length).toBeGreaterThan(0)
      expect(['playful', 'energetic', 'curious', 'clipped', 'even']).toContain(v.tone.label)
      expect(v.pacing.long_bound).toBeGreaterThan(0)
      expect(v.never_uses.length).toBeGreaterThan(0)
    }
  })

  it('every signature, opener and used word is verbatim in her material at least twice', () => {
    for (const c of panel.creators) {
      const m = material.get(c.key)!
      const v = card(c.key)
      for (const s of v.signatures) expect(verbatimCount(m, s.text), `${c.key}: ${s.text}`).toBeGreaterThanOrEqual(2)
      for (const o of v.openers.top) expect(verbatimCount(m, o.text), `${c.key}: ${o.text}`).toBeGreaterThanOrEqual(2)
      for (const u of v.vocabulary.uses) expect(verbatimCount(m, u.text), `${c.key}: ${u.text}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('a phrase split by punctuation is not a verbatim signature', () => {
    const v = buildVoiceCard(['It is good, honestly fine.', 'Good, honestly fine again.', 'That was good, honestly fine.'])!
    expect(v.signatures.some((s) => s.text === 'good honestly')).toBe(false)
  })

  it('words she avoids are absent from her material', () => {
    for (const c of panel.creators) {
      const hay = material.get(c.key)!.join(' ').toLowerCase()
      for (const w of card(c.key).vocabulary.avoids) expect(new RegExp(`\\b${w}\\b`).test(hay), `${c.key}: ${w}`).toBe(false)
    }
  })

  it('reads tone and openers from the counts', () => {
    expect(card('pip-sprocket').tone.label).toBe('playful')
    expect(card('mayas-coffee').openers.top.some((o) => o.text === "here's the")).toBe(true)
    expect(card('quiet-loom').pacing.short_share).toBeGreaterThan(card('clay-kiln').pacing.short_share)
  })

  it('the brief states openers, vocabulary, tone and pacing as constraints', () => {
    const b = voiceCardBrief(card('mayas-coffee'))
    expect(b).toContain('How she opens')
    expect(b).toContain('Words she actually uses')
    expect(b).toContain('Humor and tone')
    expect(b).toContain('Pacing')
  })
})

describe('thin creators get no card', () => {
  it('under 15 minutes of speech and under 10 answers is thin', () => {
    const src = { answers: Object.values(panel.creators[0]!.answers), samples: voiceMaterial(panel.creators[0]!.voice) }
    expect(isThinMaterial(voiceMaterialAmount(src))).toBe(true)
    const r = buildCreatorVoiceCard(src)
    expect(r.card).toBeNull()
    expect(r.reason).toBe('thin')
  })

  it('15 minutes of measured speech is enough', () => {
    const r = buildCreatorVoiceCard({ transcripts: [transcriptOf('mayas-coffee', THIN_SPEECH_MINUTES * 60)], answers: Object.values(panel.creators[0]!.answers) })
    expect(r.reason).toBe('ok')
    expect(r.card!.material!.speech_minutes).toBe(15)
    expect(r.card!.pacing.words_per_minute).toBeGreaterThan(0)
  })

  it('ten real answers are enough; skips do not count', () => {
    const ans = Array.from({ length: 10 }, (_, i) => `Honestly, batch ${['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][i]} smelled like toast to me.`)
    expect(buildCreatorVoiceCard({ answers: ans }).reason).toBe('ok')
    expect(buildCreatorVoiceCard({ answers: [...ans.slice(0, 9), 'Nothing specific, keep it general.'] }).reason).toBe('thin')
  })

  it('the thin floor can be switched off for fictional testing', () => {
    const r = buildCreatorVoiceCard({ samples: voiceMaterial(panel.creators[0]!.voice) }, { thinFloor: false })
    expect(r.card).not.toBeNull()
  })
})

describe('voiceCheck', () => {
  it('her own words pass and beat the generic voice', () => {
    for (const c of panel.creators) {
      const v = card(c.key)
      const own = voiceCheck(v, voiceMaterial(c.voice))
      const generic = voiceCheck(v, ["In today's fast-paced world, let's dive in and unlock a seamless routine that will elevate your journey and transform everything you thought you knew about this.", 'Furthermore, this game-changer is essential.'])
      expect(own.score, c.key).toBeGreaterThan(generic.score)
      expect(own.pass, `${c.key} ${own.score}`).toBe(true)
      expect(generic.notes.some((n) => n.startsWith('never_uses'))).toBe(true)
      expect(own.threshold).toBe(VOICE_CHECK_PASS)
    }
  })
  it('is deterministic and empty scores zero', () => {
    const v = card('flowdesk')
    expect(voiceCheck(v, ['Look. Ship it.'])).toEqual(voiceCheck(v, ['Look. Ship it.']))
    expect(voiceCheck(v, []).score).toBe(0)
  })
})

describe('clean-up uses the card', () => {
  it('keeps her own signature even when it is a stock robot prefix', () => {
    const v = card('mayas-coffee')
    const beats = [{ line: "Here's the thing, old beans taste flat." }, { line: 'Check the roast date.' }, { line: 'Use a jar.' }, { line: 'Brew it hotter.' }]
    const generic = robotPass(beats, 3)
    const hers = robotPass(beats, 3, voiceCardCleanupOptions(v))
    expect(generic.beats[0]!.line).not.toMatch(/here's the thing/i)
    expect(hers.beats[0]!.line).toMatch(/^Here's the thing/)
  })
  it('splits sentences longer than her rhythm allows', () => {
    const v = card('quiet-loom')
    const opts = voiceCardCleanupOptions(v)
    expect(opts.maxWords).toBeGreaterThanOrEqual(12)
    const long = 'The loom sat in the cold corner all winter, and every evening I wove a little more.'
    const out = robotPass([{ line: long }, { line: 'Slowly.' }, { line: 'Thread by thread.' }], 3, opts)
    expect(out.record.cadence_split).toBeGreaterThan(0)
    expect(robotPass([{ line: long }], 3).record.cadence_split).toBe(0)
  })
})

describe('this is how you sound', () => {
  const v = card('mayas-coffee')
  const m = material.get('mayas-coffee')!
  it('the view lists every section in plain words', () => {
    const view = voiceCardView(v)
    expect(view.title).toBe('This is how you sound')
    expect(view.sections.map((s) => s.key)).toEqual(['sentences', 'openers', 'uses', 'avoids', 'tone', 'pacing', 'signatures', 'never_says'])
    expect(view.sections.find((s) => s.key === 'signatures')!.items).toEqual(v.signatures.map((s) => s.text))
  })
  it('she can remove items and add never-says; added signatures must be verbatim in her words', () => {
    const sig = v.signatures[0]!.text
    const e = applyVoiceCardEdits(v, { remove: { signatures: [sig] }, never_says_add: ['Hey besties'], signatures_add: ['honestly', 'totally made up phrase'] }, m)
    expect(e.edited).toBe(true)
    expect(e.signatures.some((s) => s.text === sig)).toBe(false)
    expect(e.never_uses).toContain('hey besties')
    expect(e.signatures.some((s) => s.text === 'totally made up phrase')).toBe(false)
  })
  it('she cannot list a word she uses as one she never says', () => {
    const e = applyVoiceCardEdits(v, { never_says_add: ['honestly'] }, m)
    expect(e.never_uses).not.toContain('honestly')
  })
  it('edits are sanitised', () => {
    expect(sanitizeVoiceCardEdits({ remove: { signatures: [1, 'x'.repeat(80), 'ok'] }, never_says_add: 'nope' })).toEqual({ remove: { signatures: ['ok'] }, never_says_add: [], signatures_add: [] })
    expect(applyVoiceCardEdits(v, null)).toBe(v)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { buildVoiceCard, scoreVoiceMatch, voiceCardMisses, voiceCardBrief, voiceCardOn, voiceMaterial, splitSentences } from '../voice/voiceCard'

// FICTIONAL panel only: every passage is invented (scripts/ops/fixtures).
const FIXTURE = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..', '..', 'scripts', 'ops', 'fixtures', 'fictional-panel.json')
const panel = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { creators: Array<{ key: string; voice: Record<string, unknown> }> }
const creators = panel.creators.map((c) => ({ key: c.key, samples: voiceMaterial(c.voice) }))
const cards = new Map(creators.map((c) => [c.key, buildVoiceCard(c.samples)!]))

describe('fictional voice samples', () => {
  it('every fictional creator has 3 to 5 short samples', () => {
    for (const c of creators) {
      expect(c.samples.length, c.key).toBeGreaterThanOrEqual(3)
      expect(c.samples.length, c.key).toBeLessThanOrEqual(5)
      for (const s of c.samples) expect(s.split(/\s+/).length, c.key).toBeLessThan(60)
    }
  })
})

describe('buildVoiceCard', () => {
  it('builds a card for every creator, with a distinct id', () => {
    const ids = new Set([...cards.values()].map((c) => c?.id))
    expect([...cards.values()].every(Boolean)).toBe(true)
    expect(ids.size).toBe(creators.length)
  })

  it('is deterministic', () => {
    for (const c of creators) expect(buildVoiceCard(c.samples)).toEqual(cards.get(c.key))
  })

  it('refuses too little material', () => {
    expect(buildVoiceCard(['One line.', 'Two lines.'])).toBeNull()
    expect(voiceMaterial({ tone: 'warm' })).toEqual([])
  })

  it('every signature appears at least twice in her own material', () => {
    for (const c of creators) {
      const hay = c.samples.join(' \n ').toLowerCase().replace(/’/g, "'")
      for (const s of cards.get(c.key)!.signatures) {
        const n = hay.split(new RegExp(`(?<![a-z0-9])${s.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`)).length - 1
        expect(n, `${c.key}: ${s.text}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('finds the signature phrases the fixtures were written with', () => {
    const has = (k: string, p: string) => cards.get(k)!.signatures.some((s) => s.text.includes(p))
    expect(has('mayas-coffee', "here's the thing")).toBe(true)
    expect(has('flowdesk', 'ship it')).toBe(true)
    expect(has('coach-ana', "you've got this")).toBe(true)
    expect(has('signal-daily', 'real talk') || has('signal-daily', 'the catch')).toBe(true)
    expect(has('pip-sprocket', 'sprocket says')).toBe(true)
    expect(has('quiet-loom', 'slowly')).toBe(true)
  })

  it('never lists a word she actually uses as one she never uses', () => {
    for (const c of creators) {
      const hay = c.samples.join(' ').toLowerCase()
      for (const p of cards.get(c.key)!.never_uses) expect(hay.includes(p), `${c.key}: ${p}`).toBe(false)
    }
    const own = buildVoiceCard(['I love this journey.', 'The journey is long.', 'Every journey starts small.'])!
    expect(own.never_uses).not.toContain('journey')
  })

  it('reads clearly different styles', () => {
    const g = (k: string) => cards.get(k)!
    expect(g('glow-lab').formality.label).toBe('formal')
    expect(g('coach-ana').formality.label).toBe('casual')
    expect(g('coach-ana').exclamation_rate).toBeGreaterThan(0.3)
    expect(g('quiet-loom').exclamation_rate).toBe(0)
    expect(g('quiet-loom').question_rate).toBe(0)
    expect(g('signal-daily').question_rate).toBeGreaterThan(0.2)
    expect(g('clay-kiln').sentence_length.mean).toBeGreaterThan(2 * g('flowdesk').sentence_length.mean)
    expect(g('clay-kiln').person.dominant).toBe('i')
    expect(g('coach-ana').person.dominant).toBe('you')
  })
})

describe('scoreVoiceMatch', () => {
  it('is deterministic and bounded', () => {
    const card = cards.get('flowdesk')!
    const a = scoreVoiceMatch(card, ['Look. Ship it.'])
    expect(scoreVoiceMatch(card, ['Look. Ship it.'])).toEqual(a)
    expect(a.score).toBeGreaterThanOrEqual(0)
    expect(a.score).toBeLessThanOrEqual(100)
    expect(scoreVoiceMatch(card, []).score).toBe(0)
  })

  it('each creator\'s held-out passage matches her own card best (leave one out)', () => {
    let right = 0; let total = 0
    for (const c of creators) {
      c.samples.forEach((held, i) => {
        const rest = c.samples.filter((_, j) => j !== i)
        const own = buildVoiceCard(rest)
        if (!own) return
        const others = creators.filter((o) => o.key !== c.key).map((o) => cards.get(o.key)!)
        const mine = scoreVoiceMatch(own, splitSentences(held)).score
        total++
        if (others.every((o) => scoreVoiceMatch(o, splitSentences(held)).score < mine)) right++
      })
    }
    expect(right / total).toBeGreaterThan(0.6)
  })

  it('generic AI voice scores below her own words', () => {
    const generic = ["In today's fast-paced world, let's dive in and unlock a seamless morning routine.", 'This game-changer will elevate your journey.']
    for (const c of creators) {
      const card = cards.get(c.key)!
      expect(scoreVoiceMatch(card, generic).score, c.key).toBeLessThan(scoreVoiceMatch(card, c.samples).score)
      expect(voiceCardMisses(card, generic).length).toBeGreaterThan(0)
    }
  })
})

describe('voiceCardBrief and voiceCardOn', () => {
  it('brief states counts and her never-use list', () => {
    const b = voiceCardBrief(cards.get('mayas-coffee')!)
    expect(b).toContain(cards.get('mayas-coffee')!.id)
    expect(b).toMatch(/Sentence length: about \d+ words/)
    expect(b).toContain('never uses')
  })

  it('needs the trial; defaults off for real creators', () => {
    expect(voiceCardOn(false, true, 'true')).toBe(false)
    expect(voiceCardOn(true, true, undefined)).toBe(true)
    expect(voiceCardOn(true, false, undefined)).toBe(false)
    expect(voiceCardOn(true, false, 'true')).toBe(true)
    expect(voiceCardOn(true, true, 'false')).toBe(false)
  })
})

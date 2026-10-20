// Panel-10 advisor: "voice is not visible". The voice card at the POLISH step
// (async worker polish + Plan B polish), the rich-samples floor, and the keep
// rule. FICTIONAL panel only (scripts/ops/fixtures/fictional-panel.json).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  buildCreatorVoiceCard, richSamples, rhythmOf, voiceRhythmRules, voicePolishBrief, voicePolishSamples,
  voicePolishVerdict, polishFactChecks, voicePolishOn, verbatimSignatures, type VoiceCard,
} from '../voice/voiceCard'
import { planBPolishPrompt } from '../planner/planBAssembly'
import { polishEditorPrompt, applyPolishRewrites, POLISH_VOICE_MAX_REWRITES } from '../asyncPolish'

const FIXTURE = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..', '..', 'scripts', 'ops', 'fixtures', 'fictional-panel.json')
const panel = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { creators: Array<{ key: string; voice: { samples: string[]; style_note: string } }> }
const voice = (k: string) => panel.creators.find((c) => c.key === k)!.voice
const cardOf = (k: string): VoiceCard => buildCreatorVoiceCard({ samples: voice(k).samples }, { richSamples: true }).card!

describe('thin floor: rich samples lower it (fictional creators get a card)', () => {
  it('every fictional creator was thin before (panel-current-10: 0 of 24 had a card)', () => {
    for (const c of panel.creators) expect(buildCreatorVoiceCard({ samples: c.voice.samples }).reason).toBe('thin')
  })
  it('with rich samples every fictional creator gets a card counted from her samples only', () => {
    for (const c of panel.creators) {
      expect(richSamples(c.voice.samples), c.key).toBe(true)
      const b = buildCreatorVoiceCard({ samples: c.voice.samples }, { richSamples: true })
      expect(b.reason).toBe('ok')
      expect(b.card!.passages).toBe(c.voice.samples.length)
    }
  })
  it('a few short samples are not rich: still thin', () => {
    expect(richSamples(['Look. Ship it.', 'We did.'])).toBe(false)
    expect(buildCreatorVoiceCard({ samples: ['Look. Ship it.', 'We did.', 'Fine.'] }, { richSamples: true }).reason).toBe('thin')
  })
})

describe('rhythm rules from the card', () => {
  it('Coach Ana exclaims, FlowDesk is clipped, Clay & Kiln winds, Glow Lab never exclaims', () => {
    expect(voiceRhythmRules(cardOf('coach-ana')).join('\n')).toMatch(/EXCLAMATIONS: \d+% of her sentences end in "!"/)
    expect(rhythmOf(cardOf('flowdesk'))).toBe('clipped')
    expect(voiceRhythmRules(cardOf('flowdesk')).join('\n')).toMatch(/CLIPPED/)
    expect(rhythmOf(cardOf('clay-kiln'))).toBe('winding')
    expect(voiceRhythmRules(cardOf('clay-kiln')).join('\n')).toMatch(/LONG AND WINDING/)
    expect(voiceRhythmRules(cardOf('glow-lab')).join('\n')).toMatch(/never uses "!"/)
  })
  it('signature phrases only when verbatim in her material', () => {
    const c = cardOf('coach-ana')
    const sigs = verbatimSignatures(c, voice('coach-ana').samples)
    for (const s of sigs) expect(voice('coach-ana').samples.join(' ').toLowerCase()).toContain(s)
    const fake = { ...c, signatures: [{ text: 'crush your goals', count: 9 }] }
    const rules = voiceRhythmRules(fake, voice('coach-ana').samples).join('\n')
    expect(rules).not.toContain('crush your goals')
    expect(rules).toMatch(/Do not invent catchphrases/)
  })
  it('the brief carries her style note and 2-3 verbatim samples', () => {
    const v = voice('clay-kiln')
    const b = voicePolishBrief({ card: cardOf('clay-kiln'), styleNote: v.style_note, samples: v.samples })
    expect(b).toContain(v.style_note)
    const s = voicePolishSamples(v.samples)
    expect(s.length).toBeGreaterThanOrEqual(2)
    expect(s.length).toBeLessThanOrEqual(3)
    for (const x of s) { expect(v.samples).toContain(x); expect(b).toContain(x) }
  })
})

describe('the polish prompts carry the voice', () => {
  const v = voice('coach-ana')
  const brief = voicePolishBrief({ card: cardOf('coach-ana'), styleNote: v.style_note, samples: v.samples })
  it('async editor prompt', () => {
    const p = polishEditorPrompt([{ section: 'Hook', line: 'Grab a chair.' }, { section: 'Body', line: 'Do ten sit-to-stands slowly.' }], 'her material', { voice: brief })
    expect(p).toContain(v.style_note)
    expect(p).toMatch(/EXCLAMATIONS/)
    expect(polishEditorPrompt([{ line: 'x' }], 'm')).not.toMatch(/HER VOICE/)
  })
  it('Plan B polish prompt', () => {
    const p = planBPolishPrompt([{ section: 'body', line: 'Do ten sit-to-stands slowly.', source_ids: ['f1'] } as never], { styleNote: v.style_note, rhythm: brief })
    expect(p).toMatch(/SENTENCE LENGTH/)
    expect(p).toContain(voicePolishSamples(v.samples)[0])
  })
  it('with a voice the editor may fix up to four lines', () => {
    const beats = ['Hook line here now.', 'one two three four', 'five six seven eight', 'nine ten eleven twelve', 'thirteen fourteen fifteen sixteen', 'Close line here now.'].map((line) => ({ line }))
    const raw = JSON.stringify({ rewrites: [1, 2, 3, 4].map((i) => ({ index: String(i), line: 'a new line here!' })) })
    expect(applyPolishRewrites(beats, raw, '').kept).toBe(2)
    expect(applyPolishRewrites(beats, raw, '', POLISH_VOICE_MAX_REWRITES).kept).toBe(4)
  })
})

describe('keep the polish only if the voice score improves and the checks pass', () => {
  const card = cardOf('coach-ana')
  const flat = ['Today we will be doing a series of sit-to-stand exercises using a standard chair in a controlled manner.', 'It is important to maintain proper form throughout the entirety of the exercise session.']
  const hers = ["Okay, you! Grab a chair. Ten slow sit-to-stands. You've got this!", 'Legit, form first. One more rep!']
  it('improved + checks ok = keep', () => {
    const v = voicePolishVerdict(card, flat, hers, true)
    expect(v.after).toBeGreaterThan(v.before)
    expect(v).toMatchObject({ keep: true, reason: 'improved' })
  })
  it('not better = drop', () => expect(voicePolishVerdict(card, hers, flat, true)).toMatchObject({ keep: false, reason: 'not_better' }))
  it('checks failed = drop even when the voice improved', () => expect(voicePolishVerdict(card, flat, hers, false)).toMatchObject({ keep: false, reason: 'checks_failed' }))
  it('fact checks: new number, lost number, new name, new claim', () => {
    expect(polishFactChecks(['Do 10 reps.'], ['Do 10 reps!'], '').ok).toBe(true)
    expect(polishFactChecks(['Do 10 reps.'], ['Do 12 reps!'], '').reasons).toContain('new_number')
    expect(polishFactChecks(['Do 10 reps.'], ['Do the reps!'], '').reasons).toContain('lost_number')
    expect(polishFactChecks(['Do the reps.'], ['Do the reps with Marcus!'], '').reasons).toContain('new_name')
    expect(polishFactChecks(['Do the reps.'], ['The best reps, clinically proven!'], '').reasons).toContain('new_claim')
    expect(polishFactChecks(['Do the reps.'], ['Do the reps with Marcus!'], 'Marcus is my training partner').ok).toBe(true)
  })
  it('kill switch: trial only, VOICE_POLISH=off', () => {
    expect(voicePolishOn(false, undefined)).toBe(false)
    expect(voicePolishOn(true, undefined)).toBe(true)
    expect(voicePolishOn(true, 'off')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { voiceRules, voiceViolations, vocabularyUsed, voiceRepairPrompt } from '../voiceGate'

describe('the voice gate (24-ideas #21)', () => {
  it('turns on only the rules her own donts name', () => {
    expect(voiceRules(['Do not use overly formal business jargon.', 'Do not use lengthy intros, greetings, or self-introductions.']))
      .toEqual(['no_jargon', 'no_greeting'])
    expect(voiceRules(["Don't preach perfectionism"])).toEqual([])
    expect(voiceRules(null)).toEqual([])
  })
  it('flags the lines that break them, greetings only on the opener', () => {
    const beats = [{ line: 'Hey guys, welcome back to my channel.' }, { line: 'We leverage synergy to unlock your full potential.' }, { line: 'Hey, this glaze cracked.' }]
    expect(voiceViolations(beats, ['no_jargon', 'no_greeting'])).toEqual([
      { index: 0, rule: 'no_greeting' }, { index: 1, rule: 'no_jargon' },
    ])
    expect(voiceViolations(beats, [])).toEqual([])
  })
  it('never counts her own words as a miss', () => {
    expect(voiceViolations([{ line: 'This is insanely simple.' }], ['no_hype'])).toHaveLength(1)
    expect(voiceViolations([{ line: 'This is insanely simple.' }], ['no_hype'], ['insanely simple'])).toHaveLength(0)
  })
  it('measures her vocabulary without forcing it, and keeps facts in the repair', () => {
    expect(vocabularyUsed(['crushing it', 'dead simple'], ['We are crushing it'])).toEqual({ stored: 2, used: 1 })
    expect(voiceRepairPrompt([{ line: 'x' }], [{ index: 0, rule: 'no_jargon' }], 'blunt', ['yeah'])).toMatch(/HER OWN WORDS/)
  })
  it('runs on every script before the shot-list sync and is recorded', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
    const gb = readFileSync(join(repo, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(gb.indexOf('THE VOICE GATE')).toBeLessThan(gb.indexOf('THE SHOT LIST MUST QUOTE THE SCRIPT THAT ACTUALLY SHIPS'))
    expect(gb).toMatch(/beatAudit\.voice_gate = voiceGateAudit/)
  })
})

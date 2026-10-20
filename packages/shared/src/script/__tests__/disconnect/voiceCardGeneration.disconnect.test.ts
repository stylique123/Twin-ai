// DISCONNECT TEST, ledger row 4: VOICE_CARD in generation (#1270, #1288).
// The fictional panel only (scripts/ops/fixtures/fictional-panel.json). No model call.
import { describe, it, expect } from 'vitest'
import { voiceCardOn, buildCreatorVoiceCard, voiceCardBrief, voiceMaterial, voiceCardMisses } from '../../voice/voiceCard'
import { EDGE, readRepo } from './edge'

const panel = JSON.parse(readRepo('scripts/ops/fixtures/fictional-panel.json')) as { creators: Array<{ key: string; voice: Record<string, unknown> }> }
const maya = panel.creators.find((c) => c.key === 'mayas-coffee')!
const samples = voiceMaterial(maya.voice)

/** The edge's voice card block (index.ts ~8390): gate, build, brief. */
function voiceCardBlockFor(env: { VOICE_CARD_ENABLED?: string; VOICE_CARD_THIN_FLOOR?: string }, trialOn = true, fictional = true): { block: string; reason: string | null } {
  if (!voiceCardOn(trialOn, fictional, env.VOICE_CARD_ENABLED)) return { block: '', reason: null }
  const built = buildCreatorVoiceCard({ samples }, { thinFloor: env.VOICE_CARD_THIN_FLOOR !== 'off' })
  return { block: built.card ? `\n${voiceCardBrief(built.card)}` : '', reason: built.reason }
}

describe('VOICE_CARD (generation) disconnect', () => {
  it('on (thin floor lifted for the fictional panel): the writer brief carries her card; VOICE_CARD_ENABLED=false: no card', () => {
    const on = voiceCardBlockFor({ VOICE_CARD_THIN_FLOOR: 'off' })
    const off = voiceCardBlockFor({ VOICE_CARD_ENABLED: 'false', VOICE_CARD_THIN_FLOOR: 'off' })
    expect(on.block).not.toBe(off.block)
    expect(on.block).toMatch(/Sentence length: about \d+ words/)
    expect(on.block).toContain('never uses')
    expect(off).toEqual({ block: '', reason: null })
  })
  it('a real creator (not fictional) gets no card unless VOICE_CARD_ENABLED=true', () => {
    expect(voiceCardBlockFor({ VOICE_CARD_THIN_FLOOR: 'off' }, true, false).block).toBe('')
    expect(voiceCardBlockFor({ VOICE_CARD_ENABLED: 'true', VOICE_CARD_THIN_FLOOR: 'off' }, true, false).block).not.toBe('')
    expect(voiceCardBlockFor({ VOICE_CARD_ENABLED: 'true', VOICE_CARD_THIN_FLOOR: 'off' }, false, true).block).toBe('')
  })
  it('VOICE_CARD_THIN_FLOOR both ways: thin material gets no card with the floor, a card without it', () => {
    expect(voiceCardBlockFor({})).toEqual({ block: '', reason: 'thin' })
    expect(voiceCardBlockFor({ VOICE_CARD_THIN_FLOOR: 'off' }).reason).toBe('ok')
  })
  it('on: the voice gate sees a phrase she never uses', () => {
    const card = buildCreatorVoiceCard({ samples }, { thinFloor: false }).card!
    const never = card.never_uses[0]!
    expect(never).toBeTruthy()
    expect(voiceCardMisses(card, [`Honestly this is ${never} for sure.`]).length).toBe(1)
  })
  it('the edge still gates, builds and briefs the card', () => {
    expect(EDGE).toContain("if (!voiceCardOn(trialOn, fictional, Deno.env.get('VOICE_CARD_ENABLED'))) return null")
    expect(EDGE).toContain("buildCreatorVoiceCard(source, { thinFloor: Deno.env.get('VOICE_CARD_THIN_FLOOR') !== 'off' })")
    expect(EDGE).toContain('const voiceCardBlock = voiceCard ? `\\n${voiceCardBrief(voiceCard)}` : \'\'')
  })
})

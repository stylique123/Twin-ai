// DISCONNECT TEST, ledger row 4b: VOICE_POLISH + VOICE_CARD_RICH_SAMPLES (panel-10).
// The fictional panel only (scripts/ops/fixtures/fictional-panel.json). No model call.
import { describe, it, expect } from 'vitest'
import { buildCreatorVoiceCard, voicePolishOn, voicePolishBrief, voiceMaterial } from '../../voice/voiceCard'
import { planBPolishPrompt } from '../../planner/planBAssembly'
import { EDGE, readRepo } from './edge'

const panel = JSON.parse(readRepo('scripts/ops/fixtures/fictional-panel.json')) as { creators: Array<{ key: string; voice: Record<string, unknown> }> }
const ana = panel.creators.find((c) => c.key === 'coach-ana')!
const samples = voiceMaterial(ana.voice)
const WORKER = readRepo('worker/src/jobs/inventionRecheck.ts')

describe('VOICE_CARD_RICH_SAMPLES disconnect', () => {
  it('on: a fictional creator with five samples gets a card; off: thin', () => {
    expect(buildCreatorVoiceCard({ samples }, { richSamples: true }).reason).toBe('ok')
    expect(buildCreatorVoiceCard({ samples }, { richSamples: false }).reason).toBe('thin')
  })
  it('the edge passes the switch on both build sites', () => {
    expect(EDGE.split("richSamples: Deno.env.get('VOICE_CARD_RICH_SAMPLES') !== 'off'").length - 1).toBe(2)
  })
})

describe('VOICE_POLISH disconnect', () => {
  const card = buildCreatorVoiceCard({ samples }, { richSamples: true }).card!
  const lines = [{ section: 'body', line: 'Do ten sit-to-stands slowly.', source_ids: ['f1'] }] as never
  it('on: the Plan B polish prompt carries her rhythm; off: it does not', () => {
    const on = voicePolishOn(true, undefined) ? planBPolishPrompt(lines, { rhythm: voicePolishBrief({ card, samples }) }) : planBPolishPrompt(lines)
    const off = voicePolishOn(true, 'off') ? planBPolishPrompt(lines, { rhythm: voicePolishBrief({ card, samples }) }) : planBPolishPrompt(lines)
    expect(on).not.toBe(off)
    expect(on).toMatch(/EXCLAMATIONS/)
  })
  it('the edge gates, briefs Plan B, checks the voice and hands the voice to the worker', () => {
    expect(EDGE).toContain("voicePolishOn(trialOn, Deno.env.get('VOICE_POLISH'))")
    expect(EDGE).toContain('rhythm: voicePolish ? voicePolishBrief(voicePolish) : null')
    expect(EDGE).toContain('const vv = voicePolishVerdict(voicePolish.card,')
    expect(EDGE).toContain('voice: { card: voicePolish.card, style_note: voicePolish.styleNote, samples: voicePolish.samples }')
  })
  it('the worker reads the voice off the job and checks it after the polish', () => {
    expect(WORKER).toContain('voice: polishVoiceOf(polishOpts.voice)')
    expect(WORKER).toContain('voicePolishVerdict(v.card,')
    expect(WORKER).toContain('polishFactChecks(')
  })
})

// DISCONNECT TEST, ledger row 16 (route half): the voice_card view/edit route (#1288).
// Kill switch VOICE_CARD_ENABLED=false. The Settings panel half is
// apps/web/src/components/VoiceCardPanel.disconnect.test.tsx.
// Fictional panel only (scripts/ops/fixtures/fictional-panel.json). No model call.
import { describe, it, expect } from 'vitest'
import { buildCreatorVoiceCard, applyVoiceCardEdits, sanitizeVoiceCardEdits, voiceCardView, voiceMaterial } from '../../voice/voiceCard'
import { evalEdge, edgeAfter, readRepo } from './edge'

const panel = JSON.parse(readRepo('scripts/ops/fixtures/fictional-panel.json')) as { creators: Array<{ key: string; voice: Record<string, unknown> }> }
const samples = voiceMaterial(panel.creators.find((c) => c.key === 'mayas-coffee')!.voice)

/** The route's disabled check, taken from the edge source and evaluated. */
function routeDisabled(env: Record<string, string>, testAccount = true): boolean {
  const block = edgeAfter("if (specMode === 'voice_card') {", 600)
  const line = block.split('\n').find((l) => l.includes('return json({ disabled: true })'))!
  const cond = /if \((.*)\) return json\(\{ disabled: true \}\)/.exec(line)![1]!
  return evalEdge(cond, { testAccount }, env) as boolean
}
/** The route's response (index.ts ~6705): disabled, or her card view after her edits. */
function routeResponse(env: Record<string, string>, testAccount = true): Record<string, unknown> {
  if (routeDisabled(env, testAccount)) return { disabled: true }
  const built = buildCreatorVoiceCard({ samples }, { thinFloor: env.VOICE_CARD_THIN_FLOOR !== 'off' })
  const card = built.card ? applyVoiceCardEdits(built.card, sanitizeVoiceCardEdits({}), samples) : null
  return { card: card ? voiceCardView(card) : null, reason: built.reason }
}

describe('voice_card route disconnect', () => {
  it('on: a test account gets her card view; VOICE_CARD_ENABLED=false: disabled', () => {
    const on = routeResponse({ VOICE_CARD_THIN_FLOOR: 'off' })
    const off = routeResponse({ VOICE_CARD_ENABLED: 'false', VOICE_CARD_THIN_FLOOR: 'off' })
    expect(on).not.toEqual(off)
    expect(off).toEqual({ disabled: true })
    expect(on.reason).toBe('ok')
    expect((on.card as { sections: unknown[] }).sections.length).toBeGreaterThan(0)
  })
  it('a real creator is always disabled', () => {
    expect(routeResponse({ VOICE_CARD_ENABLED: 'true' }, false)).toEqual({ disabled: true })
  })
  it('the edge route still builds the view', () => {
    const block = edgeAfter("if (specMode === 'voice_card') {", 2400)
    expect(block).toContain('buildCreatorVoiceCard(source')
    expect(block).toContain('card: card ? voiceCardView(card) : null')
  })
})

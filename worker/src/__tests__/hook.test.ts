import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

import { loadAnalysisRules } from '../jobs/editorManifest.js'
import { PermanentJobError } from '../errors.js'

const { alignmentTokens, buildHookEvidence } = await import('../jobs/editorHook.js')

const { rules, boundsSha256 } = loadAnalysisRules()
const asset = { id: 'a1', content_sha256: 'h1' }

const base = {
  words: [
    { text: 'Stop', startMs: 120 }, { text: 'scrolling,', startMs: 480 },
    { text: 'this', startMs: 900 }, { text: 'changes', startMs: 1400 },
    { text: 'everything', startMs: 2100 }, { text: 'today', startMs: 2999 },
    { text: 'because', startMs: 3000 }, { text: 'later', startMs: 3600 },
  ],
  speechVersion: 'speech-6',
  audioVersion: 'audio-1',
  earlyRmsDb: -12.5,
  earlyEnergyRatio: 1.2,
  snapshotHook: 'Stop scrolling — this changes everything',
  scriptSnapshotSha256: 'f'.repeat(64),
}

describe('alignmentTokens', () => {
  it('NFC + collapse + lowercase + strip punctuation, keep apostrophes', () => {
    expect(alignmentTokens("Stop  scrolling, DON'T   move!")).toEqual(['stop', 'scrolling', "don't", 'move'])
  })
})

describe('buildHookEvidence (pure, evidence only)', () => {
  it('opening window is words with startMs < 3000 (frozen boundary is exclusive)', () => {
    const r = buildHookEvidence(asset, base, rules, boundsSha256) as Record<string, any>
    expect(r.windowMs).toBe(3000)
    expect(r.spokenOpening.wordCount).toBe(6) // 'because' at exactly 3000 is OUT
    expect(r.spokenOpening.text).toBe('Stop scrolling, this changes everything today')
    expect(r.spokenOpening.firstWordStartMs).toBe(120)
    expect(r.scriptSnapshotSha256).toBe('f'.repeat(64))
    expect(r.earlyRmsDb).toBe(-12.5)
  })

  it('alignment: multiset token overlap / hook token count', () => {
    const r = buildHookEvidence(asset, base, rules, boundsSha256) as Record<string, any>
    // hook tokens: stop scrolling this changes everything (5); all matched.
    expect(r.scriptAlignment).toEqual({ scriptHookTokenCount: 5, matchedTokenRatio: 1 })
    const half = buildHookEvidence(asset, { ...base, snapshotHook: 'Stop scrolling like nobody watches' }, rules, boundsSha256) as Record<string, any>
    expect(half.scriptAlignment.scriptHookTokenCount).toBe(5)
    expect(half.scriptAlignment.matchedTokenRatio).toBe(0.4) // stop + scrolling
  })

  it('null hook line => null alignment; empty word list => null firstWordStartMs', () => {
    const r = buildHookEvidence(asset, { ...base, snapshotHook: null, words: [] }, rules, boundsSha256) as Record<string, any>
    expect(r.scriptAlignment).toBeNull()
    expect(r.spokenOpening).toEqual({ text: '', wordCount: 0, firstWordStartMs: null })
  })

  it('fails LOUD past the 16 KiB payload cap (never truncates)', () => {
    const words = Array.from({ length: 400 }, (_, i) => ({ text: 'w'.repeat(50), startMs: i }))
    let err: unknown
    try { buildHookEvidence(asset, { ...base, words }, rules, boundsSha256) } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermanentJobError)
    expect((err as PermanentJobError).code).toBe('hook_component_too_large')
  })

  it('is deterministic for identical inputs', () => {
    const a = buildHookEvidence(asset, base, rules, boundsSha256)
    const b = buildHookEvidence(asset, base, rules, boundsSha256)
    expect(a).toEqual(b)
  })
})

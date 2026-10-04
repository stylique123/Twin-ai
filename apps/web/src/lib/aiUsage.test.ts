import { describe, expect, it, vi } from 'vitest'
import { addUsage, geminiModelOf, installUsageTracking, trackUsage, currentUsage, type UsageStore } from '../../../../supabase/functions/_shared/aiUsage'

describe('aiUsage: what one script costs', () => {
  it('reads the model from a Gemini URL and ignores others', () => {
    expect(geminiModelOf('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')).toBe('gemini-3.8-flash')
    expect(geminiModelOf('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent')).toBe('gemini-embedding-001')
    expect(geminiModelOf('https://example.supabase.co/rest/v1/generations')).toBeNull()
  })
  it('adds usage per model', () => {
    const s: UsageStore = {}
    addUsage(s, 'm', { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 })
    addUsage(s, 'm', { promptTokenCount: 50 })
    addUsage(s, 'e', undefined)
    expect(s.m).toEqual({ calls: 2, input: 150, output: 20, thinking: 5, cached: 0 })
    expect(s.e.calls).toBe(1)
  })
  it('tallies Gemini calls inside a request without touching the caller body', async () => {
    const body = { candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 } }
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status: 200 }))
    installUsageTracking()
    const seen = await trackUsage(async () => {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', { method: 'POST' })
      const j = await r.json()
      await fetch('https://example.com/other')
      return { text: j.candidates[0].content.parts[0].text, usage: currentUsage() }
    })
    expect(seen.text).toBe('ok')
    expect(seen.usage).toEqual({ 'gemini-3.8-flash': { calls: 1, input: 10, output: 3, thinking: 0, cached: 0 } })
    expect(currentUsage()).toBeNull()
    vi.unstubAllGlobals()
  })
})

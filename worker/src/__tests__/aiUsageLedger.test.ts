import { describe, it, expect } from 'vitest'
import { addUsage, geminiModelOf, ledgerRows, trafficOf, type UsageStore } from '../aiUsage.js'

describe('worker usage ledger (plan 11.1-2)', () => {
  it('reads the model from a Gemini URL and nothing else', () => {
    expect(geminiModelOf('https://generativelanguage.googleapis.com/v1beta/models/gemini-x-flash:generateContent')).toBe('gemini-x-flash')
    expect(geminiModelOf('https://example.com/v1beta/models/a:generateContent')).toBeNull()
  })
  it('sums tokens per model and builds one row per model with stage and traffic', () => {
    const u: UsageStore = {}
    addUsage(u, 'm1', { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 })
    addUsage(u, 'm1', { promptTokenCount: 50 })
    const rows = ledgerRows({ id: 'j1', type: 'extract_product', owner_id: 'o1' }, u)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ stage: 'extract_product', model: 'm1', calls: 2, input_tokens: 150, output_tokens: 20, thinking_tokens: 5, traffic: 'real' })
  })
  it('tags listed owners as test traffic', () => {
    expect(trafficOf('o1', 'o2, o1')).toBe('test')
    expect(trafficOf('o3', 'o2, o1')).toBe('real')
    expect(trafficOf(null, 'o1')).toBe('real')
  })
})

describe('a failed job still records its usage (plan 11.1-2)', () => {
  it('keeps the tally when the handler throws', async () => {
    const { runTallied } = await import('../aiUsage.js')
    const usage: UsageStore = {}
    await expect(runTallied(usage, async () => { addUsage(usage, 'm1', { promptTokenCount: 7 }); throw new Error('boom') })).rejects.toThrow('boom')
    expect(ledgerRows({ id: 'j', type: 't', owner_id: null }, usage)[0]).toMatchObject({ model: 'm1', input_tokens: 7 })
  })
})

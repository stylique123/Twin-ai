import { describe, it, expect, vi } from 'vitest'
import { scriptLedgerRows, setLedgerContext, withScriptLedger, trackUsage, inStage, installUsageTracking } from '../../../../supabase/functions/_shared/aiUsage.ts'

describe('writer usage ledger (ops audit)', () => {
  it('makes one row per stage and model, counts only', () => {
    const rows = scriptLedgerRows({ 'writer|gemini-3.8-flash': { calls: 2, input: 10, output: 5, thinking: 3, cached: 1 }, 'other|gemini-embedding-001': { calls: 1, input: 7, output: 0, thinking: 0, cached: 0 } }, { ownerId: 'u1', traffic: 'real' })
    expect(rows).toEqual([
      { job_id: null, stage: 'script:writer', owner_id: 'u1', model: 'gemini-3.8-flash', traffic: 'real', calls: 2, input_tokens: 10, output_tokens: 5, thinking_tokens: 3, cached_tokens: 1 },
      { job_id: null, stage: 'script:other', owner_id: 'u1', model: 'gemini-embedding-001', traffic: 'real', calls: 1, input_tokens: 7, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0 },
    ])
  })

  it('writes nothing without a context (unauthenticated or shadow)', async () => {
    const insert = vi.fn()
    await trackUsage(() => withScriptLedger(async () => 'ok', () => insert))
    expect(insert).not.toHaveBeenCalled()
  })

  it('is fail-open: a ledger error never fails or changes the result', async () => {
    const res = await trackUsage(() => withScriptLedger(async () => {
      setLedgerContext({ ownerId: 'u1', traffic: 'test' })
      await inStage('writer', async () => { /* a tallied call */ })
      return 'script'
    }, () => () => { throw new Error('db down') }))
    expect(res).toBe('script')
    const r2 = await trackUsage(() => withScriptLedger(async () => { setLedgerContext({ ownerId: 'u1', traffic: 'real' }); return 1 }, () => () => Promise.reject(new Error('x'))))
    expect(r2).toBe(1)
  })

  it('writes the tally even when the request throws', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } }), { status: 200 })) as typeof fetch
    installUsageTracking()
    const insert = vi.fn(async (_rows: unknown) => ({ error: null }))
    await expect(trackUsage(() => withScriptLedger(async () => {
      setLedgerContext({ ownerId: 'u1', traffic: 'real' })
      await inStage('writer', () => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'))
      throw new Error('boom')
    }, () => insert))).rejects.toThrow('boom')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toEqual([expect.objectContaining({ stage: 'script:writer', model: 'gemini-3.8-flash', calls: 1, input_tokens: 4, output_tokens: 2 })])
  })
})

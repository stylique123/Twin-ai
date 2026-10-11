// The invention re-check judges and rewrites at temperature 0, like the edge.
// Every other geminiJson caller keeps the 0.4 default. Fictional fixtures only.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  process.env.GEMINI_API_KEY ||= 'stub-gemini-key'
})
afterEach(() => { vi.unstubAllGlobals() })

describe('invention re-check temperature', () => {
  it('the re-check passes temperature 0 to geminiJson for judge and rewrite', async () => {
    const { recheckCallModel, RECHECK_TEMPERATURE } = await import('../jobs/inventionRecheck.js')
    expect(RECHECK_TEMPERATURE).toBe(0)
    const fake = vi.fn(async () => ({ sentences: [] }))
    const call = recheckCallModel(fake as never, 'model-fixture')
    expect(await call('judge system', 'prompt', { type: 'OBJECT' }, 1000)).toBe('{"sentences":[]}')
    await call('rewrite system', 'prompt', { type: 'OBJECT' }, 1000)
    expect(fake).toHaveBeenCalledTimes(2)
    for (const args of fake.mock.calls as unknown[][]) {
      expect(args[5]).toBe('model-fixture')
      expect(args[7]).toBe(0)
    }
  })

  it('geminiJson sends 0.4 by default and the given temperature when passed', async () => {
    const bodies: Array<{ generationConfig: { temperature: number } }> = []
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 })
    }))
    const { geminiJson } = await import('../gemini.js')
    await geminiJson('s', 'p', { type: 'OBJECT' }, 1000, undefined, 'model-fixture')
    await geminiJson('s', 'p', { type: 'OBJECT' }, 1000, undefined, 'model-fixture', [], 0)
    expect(bodies.map((b) => b.generationConfig.temperature)).toEqual([0.4, 0])
  })
})

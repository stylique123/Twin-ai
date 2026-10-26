// GEMINI_BACKEND: the worker's Gemini calls on both backends, with a fake fetch.
// Unset = developer, and the developer request is byte-identical to what the
// worker sent before the helper existed (URL, headers, body string).
// Fictional keys only; nothing here reaches Google.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

const DEV_KEY = 'dev-key-fixture'
const VERTEX_KEY = 'AQ.vertex-key-fixture'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  process.env.GEMINI_API_KEY = DEV_KEY
})
const VARS = ['GEMINI_BACKEND', 'VERTEX_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'VERTEX_MODEL_MAP'] as const
afterEach(() => {
  vi.unstubAllGlobals()
  for (const v of VARS) delete process.env[v]
})

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } }
function fakeFetch(respond: (url: string) => Response) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: Call['init']) => { calls.push({ url, init }); return respond(url) }))
  return calls
}
const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 })
const answer = ok({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] })

describe('geminiJson', () => {
  it('unset backend = developer, byte-identical to the pre-helper request', async () => {
    const calls = fakeFetch(() => answer.clone())
    const { geminiJson } = await import('../gemini.js')
    await geminiJson('sys', 'prompt', { type: 'OBJECT' }, 1000, 512, 'gemini-model-fixture')
    expect(calls).toHaveLength(1)
    const c = calls[0]!
    expect(c.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-model-fixture:generateContent')
    expect(c.init.method).toBe('POST')
    expect(c.init.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': DEV_KEY })
    // The exact string the old inline JSON.stringify produced.
    expect(c.init.body).toBe(JSON.stringify({
      systemInstruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: 'prompt' }] }],
      generationConfig: {
        temperature: 0.4, maxOutputTokens: 16384, responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT' }, thinkingConfig: { thinkingBudget: 512 },
      },
    }))
  })

  it('vertex: express-mode URL, the Vertex key, same Gemini body', async () => {
    process.env.GEMINI_BACKEND = 'vertex'
    process.env.VERTEX_API_KEY = VERTEX_KEY
    const calls = fakeFetch(() => answer.clone())
    const { geminiJson } = await import('../gemini.js')
    expect(await geminiJson('sys', 'prompt', { type: 'OBJECT' }, 1000, 512, 'gemini-model-fixture')).toEqual({ ok: true })
    const c = calls[0]!
    expect(c.url).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-model-fixture:generateContent')
    expect(c.url).not.toContain('key=')
    expect(c.init.headers['x-goog-api-key']).toBe(VERTEX_KEY)
    const body = JSON.parse(c.init.body)
    expect(body.generationConfig.responseSchema).toEqual({ type: 'OBJECT' })
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 512 })
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] })
  })

  it('vertex with project + region: regional project URL; VERTEX_MODEL_MAP renames', async () => {
    process.env.GEMINI_BACKEND = 'vertex'
    process.env.GOOGLE_CLOUD_PROJECT = 'proj-fixture'
    process.env.GOOGLE_CLOUD_LOCATION = 'us-central1'
    process.env.VERTEX_MODEL_MAP = '{"gemini-model-fixture":"gemini-vertex-fixture"}'
    const calls = fakeFetch(() => answer.clone())
    const { geminiJson } = await import('../gemini.js')
    await geminiJson('sys', 'prompt', {}, 1000, 0, 'gemini-model-fixture')
    expect(calls[0]!.url).toBe('https://us-central1-aiplatform.googleapis.com/v1/projects/proj-fixture/locations/us-central1/publishers/google/models/gemini-vertex-fixture:generateContent')
    // No VERTEX_API_KEY: falls back to GEMINI_API_KEY.
    expect(calls[0]!.init.headers['x-goog-api-key']).toBe(DEV_KEY)
  })
})

describe('geminiGroundedSearch', () => {
  it('developer keeps google_search; vertex sends googleSearch', async () => {
    const grounded = ok({ candidates: [{ content: { parts: [{ text: 'x' }] }, groundingMetadata: { groundingChunks: [] } }] })
    let calls = fakeFetch(() => grounded.clone())
    const { geminiGroundedSearch } = await import('../gemini.js')
    await geminiGroundedSearch('s', 'p', 'gemini-model-fixture')
    expect(JSON.parse(calls[0]!.init.body).tools).toEqual([{ google_search: {} }])
    process.env.GEMINI_BACKEND = 'vertex'
    calls = fakeFetch(() => grounded.clone())
    await geminiGroundedSearch('s', 'p', 'gemini-model-fixture')
    expect(calls[0]!.url).toContain('aiplatform.googleapis.com')
    expect(JSON.parse(calls[0]!.init.body).tools).toEqual([{ googleSearch: {} }])
  })
})

describe('geminiEmbed', () => {
  const vec = Array.from({ length: 768 }, (_, i) => i / 768)

  it('developer: embedContent, byte-identical body, embedding.values', async () => {
    const calls = fakeFetch(() => ok({ embedding: { values: vec } }))
    const { geminiEmbed, EMBED_DIMS } = await import('../gemini.js')
    expect(await geminiEmbed('hello')).toEqual(vec)
    expect(calls[0]!.url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^:]+:embedContent$/)
    expect(calls[0]!.init.body).toBe(JSON.stringify({
      content: { parts: [{ text: 'hello' }] }, taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: EMBED_DIMS,
    }))
  })

  it('vertex: :predict with instances, predictions[].embeddings.values → the same 768 vector', async () => {
    process.env.GEMINI_BACKEND = 'vertex'
    process.env.VERTEX_API_KEY = VERTEX_KEY
    const calls = fakeFetch(() => ok({ predictions: [{ embeddings: { values: vec, statistics: { token_count: 1, truncated: false } } }] }))
    const { geminiEmbed } = await import('../gemini.js')
    expect(await geminiEmbed('hello')).toEqual(vec)
    expect(calls[0]!.url).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1\/publishers\/google\/models\/[^:]+:predict$/)
    expect(JSON.parse(calls[0]!.init.body)).toEqual({
      instances: [{ content: 'hello', task_type: 'SEMANTIC_SIMILARITY' }], parameters: { outputDimensionality: 768 },
    })
  })

  it('a wrong-length vector is still refused on vertex', async () => {
    process.env.GEMINI_BACKEND = 'vertex'
    fakeFetch(() => ok({ predictions: [{ embeddings: { values: [1, 2, 3] } }] }))
    const { geminiEmbed } = await import('../gemini.js')
    expect(await geminiEmbed('hello')).toBeNull()
  })
})

describe('quota errors on both backends', () => {
  const devDaily = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [{
    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
    violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
  }] } })
  const vertexBare = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource exhausted. Please try again later.' } })

  it('developer: a daily quota still stops at once with class=daily', async () => {
    const calls = fakeFetch(() => new Response(devDaily, { status: 429 }))
    const { geminiJson } = await import('../gemini.js')
    await expect(geminiJson('s', 'p', {}, 1000, 0, 'm')).rejects.toThrow(/class=daily status=RESOURCE_EXHAUSTED/)
    expect(calls).toHaveLength(1)
  })

  it('developer: an unnamed RESOURCE_EXHAUSTED stays unknown (not retried)', async () => {
    const calls = fakeFetch(() => new Response(vertexBare, { status: 429 }))
    const { geminiJson } = await import('../gemini.js')
    await expect(geminiJson('s', 'p', {}, 1000, 0, 'm')).rejects.toThrow(/class=unknown/)
    expect(calls).toHaveLength(1)
  })

  it('vertex: a bare RESOURCE_EXHAUSTED (shared-quota contention) is short_window and retried', async () => {
    process.env.GEMINI_BACKEND = 'vertex'
    vi.useFakeTimers()
    try {
      let n = 0
      const calls = fakeFetch(() => (n++ === 0 ? new Response(vertexBare, { status: 429 }) : answer.clone()))
      const { geminiJson } = await import('../gemini.js')
      const p = geminiJson('s', 'p', {}, 60_000, 0, 'm')
      await vi.advanceTimersByTimeAsync(6_000)
      expect(await p).toEqual({ ok: true })
      expect(calls).toHaveLength(2)
    } finally { vi.useRealTimers() }
  })
})

describe('parseGeminiError on Vertex bodies', () => {
  it('reads a Vertex QuotaFailure (aiplatform metric) and an array-wrapped envelope', async () => {
    const { parseGeminiError, classifyQuota, quotaSummary } = await import('../geminiQuota.js')
    const perMinute = JSON.stringify([{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded', details: [{
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaMetric: 'aiplatform.googleapis.com/generate_content_requests_per_minute_per_project_per_base_model', quotaId: 'GenerateContentRequestsPerMinutePerProjectPerBaseModel' }],
    }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }] } }])
    const e = parseGeminiError(429, perMinute, 'vertex')
    expect(e.quotaMetric).toBe('aiplatform.googleapis.com/generate_content_requests_per_minute_per_project_per_base_model')
    expect(e.retryDelayMs).toBe(7000)
    expect(classifyQuota(e)).toBe('short_window')
    expect(quotaSummary(e)).toMatch(/^Gemini 429 class=short_window backend=vertex status=RESOURCE_EXHAUSTED/)
    const daily = parseGeminiError(429, JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', details: [{
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateContentRequestsPerDayPerProject' }] }] } }), 'vertex')
    expect(classifyQuota(daily)).toBe('daily')
  })
  it('the developer default parses exactly as before (no backend field)', async () => {
    const { parseGeminiError } = await import('../geminiQuota.js')
    expect(parseGeminiError(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')).toEqual({ httpStatus: 429, status: 'RESOURCE_EXHAUSTED' })
  })
})

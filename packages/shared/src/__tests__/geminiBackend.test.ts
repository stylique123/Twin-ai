// The Gemini backend helper (developer | vertex), its JS twin for scripts, and
// the ledger's URL parser. Fictional keys; nothing reaches Google.
import { describe, it, expect } from 'vitest'
import * as ts from '../geminiBackend'
// @ts-expect-error plain JS twin, no types
import * as js from '../../../../scripts/lib/geminiBackend.mjs'
import { findDirectCalls } from '../../../../scripts/ci/check_gemini_backend_routing.mjs'
import { geminiModelOf as edgeModelOf } from '../../../../supabase/functions/_shared/aiUsage'

const env = (o: Record<string, string>) => (k: string) => o[k]
const DEV = env({ GEMINI_API_KEY: 'dev-key' })
const VERTEX = env({ GEMINI_BACKEND: 'vertex', GEMINI_API_KEY: 'dev-key', VERTEX_API_KEY: 'AQ.vx' })
const REGIONAL = env({ GEMINI_BACKEND: 'vertex', VERTEX_API_KEY: 'AQ.vx', GOOGLE_CLOUD_PROJECT: 'p1', GOOGLE_CLOUD_LOCATION: 'europe-west4' })
const GLOBAL = env({ GEMINI_BACKEND: 'Vertex ', GEMINI_API_KEY: 'dev-key', GOOGLE_CLOUD_PROJECT: 'p1', GOOGLE_CLOUD_LOCATION: 'global' })
const MAPPED = env({ GEMINI_BACKEND: 'vertex', VERTEX_API_KEY: 'k', VERTEX_MODEL_MAP: 'gemini-a=gemini-b, gemini-c = gemini-d' })

const BODY = {
  systemInstruction: { parts: [{ text: 's' }] },
  contents: [{ parts: [{ text: 'no role' }] }, { role: 'model', parts: [{ text: 'x' }] }],
  tools: [{ google_search: {} }],
  generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT' }, thinkingConfig: { thinkingBudget: 0 } },
}

describe('backend selection', () => {
  it('unset / anything else = developer, with GEMINI_API_KEY', () => {
    expect(ts.geminiBackend(env({}))).toBe('developer')
    expect(ts.geminiBackend(env({ GEMINI_BACKEND: 'developer' }))).toBe('developer')
    expect(ts.geminiBackend(env({ GEMINI_BACKEND: 'vertx' }))).toBe('developer')
    expect(ts.geminiApiKey(env({ GEMINI_API_KEY: ' dev-key ', VERTEX_API_KEY: 'AQ.vx' }))).toBe('dev-key')
  })
  it('vertex: VERTEX_API_KEY, else GEMINI_API_KEY', () => {
    expect(ts.geminiApiKey(VERTEX)).toBe('AQ.vx')
    expect(ts.geminiApiKey(GLOBAL)).toBe('dev-key')
  })
})

describe('generate', () => {
  it('developer: today\'s URL, header key, body passed through untouched', () => {
    const r = ts.geminiGenerateRequest(DEV, 'gemini-3.7-flash', BODY)
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent')
    expect(r.init).toEqual({ method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'dev-key' }, body: JSON.stringify(BODY) })
  })
  it('vertex express: global host, no project, no key in the URL; role + googleSearch fixed', () => {
    const r = ts.geminiGenerateRequest(VERTEX, 'gemini-3.7-flash', BODY)
    expect(r.url).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.7-flash:generateContent')
    expect(r.init.headers['x-goog-api-key']).toBe('AQ.vx')
    const b = JSON.parse(r.init.body)
    expect(b.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model'])
    expect(b.tools).toEqual([{ googleSearch: {} }])
    expect(b.generationConfig).toEqual(BODY.generationConfig)
    expect(b.systemInstruction).toEqual(BODY.systemInstruction)
  })
  it('vertex project/location: regional host; "global" uses the bare host', () => {
    expect(ts.geminiUrl(REGIONAL, 'm', 'streamGenerateContent'))
      .toBe('https://europe-west4-aiplatform.googleapis.com/v1/projects/p1/locations/europe-west4/publishers/google/models/m:streamGenerateContent')
    expect(ts.geminiUrl(GLOBAL, 'm')).toBe('https://aiplatform.googleapis.com/v1/projects/p1/locations/global/publishers/google/models/m:generateContent')
  })
  it('VERTEX_MODEL_MAP renames on vertex only (JSON or a=b pairs; junk ignored)', () => {
    expect(ts.geminiUrl(MAPPED, 'gemini-c')).toMatch(/models\/gemini-d:generateContent$/)
    expect(ts.geminiUrl(MAPPED, 'gemini-x')).toMatch(/models\/gemini-x:generateContent$/)
    expect(ts.backendModel(env({ GEMINI_BACKEND: 'vertex', VERTEX_MODEL_MAP: '{"a":"b"}' }), 'a')).toBe('b')
    expect(ts.vertexModelMap(env({ VERTEX_MODEL_MAP: '{not json' }))).toEqual({})
    expect(ts.backendModel(env({ VERTEX_MODEL_MAP: 'gemini-a=gemini-b' }), 'gemini-a')).toBe('gemini-a')
  })
})

describe('embed', () => {
  const A = { model: 'gemini-embedding-001', text: 'hi', taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: 768 }
  it('developer: embedContent with the exact body the call sites sent', () => {
    const r = ts.geminiEmbedRequest(DEV, A)
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent')
    expect(r.init.body).toBe(JSON.stringify({ content: { parts: [{ text: 'hi' }] }, taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: 768 }))
  })
  it('vertex: :predict with instances/parameters, dimensionality unchanged', () => {
    const r = ts.geminiEmbedRequest(VERTEX, A)
    expect(r.url).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-embedding-001:predict')
    expect(JSON.parse(r.init.body)).toEqual({ instances: [{ content: 'hi', task_type: 'SEMANTIC_SIMILARITY' }], parameters: { outputDimensionality: 768 } })
  })
  it('readEmbedding maps both response shapes to one vector', () => {
    expect(ts.readEmbedding({ embedding: { values: [1, 2] } })).toEqual([1, 2])
    expect(ts.readEmbedding({ predictions: [{ embeddings: { values: [3, 4], statistics: { token_count: 1 } } }] })).toEqual([3, 4])
    expect(ts.readEmbedding({ predictions: [] })).toBeNull()
    expect(ts.readEmbedding(null)).toBeNull()
  })
})

describe('usage ledger model parsing', () => {
  const cases: Array<[string, string | null]> = [
    ['https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', 'gemini-3.8-flash'],
    ['https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', 'gemini-embedding-001'],
    ['https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent', 'gemini-3.8-flash'],
    ['https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:streamGenerateContent?alt=sse', 'gemini-3.8-flash'],
    ['https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google/models/gemini-embedding-001:predict', 'gemini-embedding-001'],
    ['https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/gemini-3.1-pro-preview:generateContent', 'gemini-3.1-pro-preview'],
    ['https://aiplatform.googleapis.com/v1/publishers/google/models/m:countTokens', null],
    ['https://api.apify.com/v2/acts/x/runs', null],
  ]
  it.each(cases)('%s → %s (helper, edge ledger)', (url, want) => {
    expect(ts.geminiModelOfUrl(url)).toBe(want)
    expect(edgeModelOf(url)).toBe(want)
  })
})

describe('the scripts\' JS twin matches the TS source', () => {
  const ENVS = { DEV, VERTEX, REGIONAL, GLOBAL, MAPPED, EMPTY: env({}) }
  it.each(Object.entries(ENVS))('%s', (_n, get) => {
    for (const m of ['gemini-a', 'gemini-c', 'gemini-2.5-flash']) {
      for (const meth of ['generateContent', 'streamGenerateContent', 'countTokens'] as const) {
        expect(js.geminiUrl(get, m, meth)).toBe(ts.geminiUrl(get, m, meth))
      }
      expect(js.geminiGenerateRequest(get, m, BODY)).toEqual(ts.geminiGenerateRequest(get, m, BODY))
      const a = { model: m, text: 't', taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }
      expect(js.geminiEmbedRequest(get, a)).toEqual(ts.geminiEmbedRequest(get, a))
      expect(js.geminiBody(BODY, get)).toBe(ts.geminiGenerateRequest(get, m, BODY).init.body)
    }
    expect(js.geminiBackend(get)).toBe(ts.geminiBackend(get))
    expect(js.geminiApiKey(get)).toBe(ts.geminiApiKey(get))
    expect(js.readEmbedding({ predictions: [{ embeddings: { values: [9] } }] })).toEqual([9])
  })
  it('ledger regexes agree', () => {
    for (const u of ['https://aiplatform.googleapis.com/v1/publishers/google/models/x:predict', 'https://generativelanguage.googleapis.com/v1beta/models/y:embedContent', 'https://example.com']) {
      expect(js.geminiModelOfUrl(u)).toBe(ts.geminiModelOfUrl(u))
    }
  })
})

describe('no direct Gemini URL outside the helper', () => {
  it('scripts/ci/check_gemini_backend_routing.mjs finds none', () => {
    expect(findDirectCalls(new URL('../../../../', import.meta.url).pathname.replace(/\/$/, ''))).toEqual([])
  })
})

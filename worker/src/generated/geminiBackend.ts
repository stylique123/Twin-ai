// GENERATED FROM packages/shared/src/geminiBackend.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// WHICH GOOGLE ENDPOINT A GEMINI CALL GOES TO — ONE PLACE.
//
// Every Gemini call in the worker and the edge functions builds its URL, its
// auth header and its body here, so moving from the Gemini Developer API to
// Vertex AI is an env change, not a hunt through call sites.
//
//   GEMINI_BACKEND        "developer" (default, today's behaviour, unchanged)
//                         | "vertex"
//   VERTEX_API_KEY        the Vertex key (express mode keys start "AQ."); when
//                         unset, GEMINI_API_KEY is used. Vertex backend only.
//   GOOGLE_CLOUD_PROJECT  optional; with GOOGLE_CLOUD_LOCATION selects the
//   GOOGLE_CLOUD_LOCATION project/location URL form. Location defaults to
//                         "global" (host aiplatform.googleapis.com).
//   VERTEX_MODEL_MAP      optional model-id rename for Vertex only, either JSON
//                         {"<id>":"<vertex id>"} or "<id>=<vertex id>,...".
//
// ⚖️ THE DEVELOPER BRANCH IS BYTE-IDENTICAL TO WHAT THE CALL SITES SENT BEFORE:
// same URL, same `x-goog-api-key` header, and the body is JSON.stringify of the
// caller's object with no rewriting. Tests pin that.
//
// ⚠️ THE KEY TRAVELS IN THE `x-goog-api-key` HEADER ON BOTH BACKENDS, never in
// the URL. Google's docs show `?key=` for express mode; the header is the same
// credential (Google API keys are accepted in either place) and keeps it out of
// URLs, which do reach logs and the usage ledger's URL parser.
//
// This file has NO imports and is mirrored by scripts/ci/generate_shared_pilot_core.mjs
// into supabase/functions/_shared/ and worker/src/generated/. Scripts use the
// hand-kept JS twin scripts/lib/geminiBackend.mjs, held to this file by a parity test.

/** Reads one env var (process.env / Deno.env.get). */
export type EnvGet = (name: string) => string | undefined

export type GeminiBackend = 'developer' | 'vertex'

export type GenerateMethod = 'generateContent' | 'streamGenerateContent' | 'countTokens'

export const DEVELOPER_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/'

/** The request a caller hands to fetch (it adds its own `signal`). */
export interface GeminiRequest {
  url: string
  init: { method: 'POST'; headers: Record<string, string>; body: string }
}

const val = (get: EnvGet, name: string): string => (get(name) ?? '').trim()

export function geminiBackend(get: EnvGet): GeminiBackend {
  return val(get, 'GEMINI_BACKEND').toLowerCase() === 'vertex' ? 'vertex' : 'developer'
}

/** The key for the active backend. Developer: GEMINI_API_KEY. Vertex:
 *  VERTEX_API_KEY, else GEMINI_API_KEY. Empty string when none is set. */
export function geminiApiKey(get: EnvGet): string {
  if (geminiBackend(get) === 'vertex') return val(get, 'VERTEX_API_KEY') || val(get, 'GEMINI_API_KEY')
  return val(get, 'GEMINI_API_KEY')
}

/** VERTEX_MODEL_MAP parsed. Malformed input yields an empty map, never a throw. */
export function vertexModelMap(get: EnvGet): Record<string, string> {
  const raw = val(get, 'VERTEX_MODEL_MAP')
  if (!raw) return {}
  const out: Record<string, string> = {}
  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw) as unknown
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
          if (typeof v === 'string' && k.trim() && v.trim()) out[k.trim()] = v.trim()
        }
      }
    } catch { /* malformed: no renames */ }
    return out
  }
  for (const pair of raw.split(',')) {
    const i = pair.indexOf('=')
    if (i <= 0) continue
    const k = pair.slice(0, i).trim()
    const v = pair.slice(i + 1).trim()
    if (k && v) out[k] = v
  }
  return out
}

/** The model id actually sent. Developer: unchanged. Vertex: VERTEX_MODEL_MAP rename, else unchanged. */
export function backendModel(get: EnvGet, model: string): string {
  if (geminiBackend(get) !== 'vertex') return model
  return vertexModelMap(get)[model] ?? model
}

/** `https://…/models/{model}` for Vertex, without the `:method` suffix. */
function vertexModelPath(get: EnvGet, model: string): string {
  const project = val(get, 'GOOGLE_CLOUD_PROJECT')
  const location = val(get, 'GOOGLE_CLOUD_LOCATION')
  if (project && location) {
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
    return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${model}`
  }
  // Express mode: no project in the path; the key identifies it.
  return `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}`
}

/** The URL for one generate-family call. No key in it on either backend. */
export function geminiUrl(get: EnvGet, model: string, method: GenerateMethod = 'generateContent'): string {
  if (geminiBackend(get) === 'vertex') return `${vertexModelPath(get, backendModel(get, model))}:${method}`
  return `${DEVELOPER_BASE}${model}:${method}`
}

export function geminiHeaders(key: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': key }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The generateContent body for Vertex. The Gemini schema is the same on both
 * APIs; the differences that bite are handled here and nowhere else:
 *  - Vertex REQUIRES `role` on every `contents[]` entry (the Developer API
 *    defaults it to "user"); a missing role becomes "user".
 *  - The grounding tool is spelled `googleSearch` in Vertex's docs; the snake
 *    `google_search` is renamed so it does not depend on proto-JSON leniency.
 * systemInstruction, generationConfig (responseSchema, responseMimeType,
 * thinkingConfig, maxOutputTokens, temperature) and inlineData pass unchanged.
 */
export function vertexGenerateBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
  if (Array.isArray(body.contents)) {
    out.contents = body.contents.map((c) => (isObj(c) && typeof c.role !== 'string' ? { role: 'user', ...c } : c))
  }
  if (Array.isArray(body.tools)) {
    out.tools = body.tools.map((t) => {
      if (!isObj(t) || !('google_search' in t)) return t
      const { google_search, ...rest } = t
      return { ...rest, googleSearch: google_search }
    })
  }
  return out
}

/** Everything one generateContent (or stream/countTokens) call needs. */
export function geminiGenerateRequest(
  get: EnvGet,
  model: string,
  body: Record<string, unknown>,
  method: GenerateMethod = 'generateContent',
): GeminiRequest {
  const vertex = geminiBackend(get) === 'vertex'
  return {
    url: geminiUrl(get, model, method),
    init: {
      method: 'POST',
      headers: geminiHeaders(geminiApiKey(get)),
      body: JSON.stringify(vertex ? vertexGenerateBody(body) : body),
    },
  }
}

export interface EmbedArgs {
  model: string
  text: string
  taskType?: string
  outputDimensionality?: number
}

/**
 * One text embedding. Developer: `:embedContent` with exactly today's body.
 * Vertex: gemini-embedding-001 is served by `:predict`
 * `{instances:[{content, task_type}], parameters:{outputDimensionality}}`.
 * Read the answer with `readEmbedding` — it maps both shapes to number[].
 */
export function geminiEmbedRequest(get: EnvGet, a: EmbedArgs): GeminiRequest {
  const headers = geminiHeaders(geminiApiKey(get))
  if (geminiBackend(get) === 'vertex') {
    const instance: Record<string, unknown> = { content: a.text }
    if (a.taskType) instance.task_type = a.taskType
    const parameters: Record<string, unknown> = {}
    if (a.outputDimensionality !== undefined) parameters.outputDimensionality = a.outputDimensionality
    return {
      url: `${vertexModelPath(get, backendModel(get, a.model))}:predict`,
      init: { method: 'POST', headers, body: JSON.stringify({ instances: [instance], parameters }) },
    }
  }
  const body: Record<string, unknown> = { content: { parts: [{ text: a.text }] } }
  if (a.taskType) body.taskType = a.taskType
  if (a.outputDimensionality !== undefined) body.outputDimensionality = a.outputDimensionality
  return { url: `${DEVELOPER_BASE}${a.model}:embedContent`, init: { method: 'POST', headers, body: JSON.stringify(body) } }
}

/** The vector from either response shape, or null. */
export function readEmbedding(json: unknown): number[] | null {
  if (!isObj(json)) return null
  const dev = isObj(json.embedding) ? json.embedding.values : undefined
  if (Array.isArray(dev)) return dev as number[]
  const preds = Array.isArray(json.predictions) ? json.predictions : []
  const first = preds[0]
  const emb = isObj(first) && isObj(first.embeddings) ? first.embeddings.values : undefined
  return Array.isArray(emb) ? (emb as number[]) : null
}

// ── USAGE LEDGER ─────────────────────────────────────────────────────────────
// The model a Gemini URL calls, on either backend, or null for any other URL.
// The ledger records the id IN THE URL — on Vertex with VERTEX_MODEL_MAP that is
// the mapped id, which is the one Google bills.
const DEVELOPER_URL = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:/?]+):(generateContent|embedContent)/
const VERTEX_URL = /^https:\/\/(?:[a-z0-9-]+-)?aiplatform\.googleapis\.com\/v1(?:beta1)?\/(?:projects\/[^/]+\/locations\/[^/]+\/)?publishers\/google\/models\/([^:/?]+):(generateContent|streamGenerateContent|predict)/

export function geminiModelOfUrl(url: string): string | null {
  return DEVELOPER_URL.exec(url)?.[1] ?? VERTEX_URL.exec(url)?.[1] ?? null
}

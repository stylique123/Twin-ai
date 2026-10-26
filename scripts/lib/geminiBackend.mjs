// THE SCRIPTS' GEMINI BACKEND HELPER (developer | vertex) — plain JS twin of
// packages/shared/src/geminiBackend.ts, because scripts run under plain `node`
// (CI pins Node 20 in places, which cannot import .ts). Same functions, same
// outputs: packages/shared/src/__tests__/geminiBackend.test.ts runs both on one
// matrix and fails on any difference. Edit both together.
//
// Env: GEMINI_BACKEND, VERTEX_API_KEY, GEMINI_API_KEY, GOOGLE_CLOUD_PROJECT,
// GOOGLE_CLOUD_LOCATION, VERTEX_MODEL_MAP — see the TS source for the contract.

export const DEVELOPER_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/'

const val = (get, name) => (get(name) ?? '').trim()

/** Reads process.env at call time. */
export const processEnv = (name) => process.env[name]

export function geminiBackend(get = processEnv) {
  return val(get, 'GEMINI_BACKEND').toLowerCase() === 'vertex' ? 'vertex' : 'developer'
}

export function geminiApiKey(get = processEnv) {
  if (geminiBackend(get) === 'vertex') return val(get, 'VERTEX_API_KEY') || val(get, 'GEMINI_API_KEY')
  return val(get, 'GEMINI_API_KEY')
}

export function vertexModelMap(get = processEnv) {
  const raw = val(get, 'VERTEX_MODEL_MAP')
  if (!raw) return {}
  const out = {}
  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw)
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        for (const [k, v] of Object.entries(j)) {
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

export function backendModel(get, model) {
  if (geminiBackend(get) !== 'vertex') return model
  return vertexModelMap(get)[model] ?? model
}

function vertexModelPath(get, model) {
  const project = val(get, 'GOOGLE_CLOUD_PROJECT')
  const location = val(get, 'GOOGLE_CLOUD_LOCATION')
  if (project && location) {
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
    return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${model}`
  }
  return `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}`
}

export function geminiUrl(get, model, method = 'generateContent') {
  if (geminiBackend(get) === 'vertex') return `${vertexModelPath(get, backendModel(get, model))}:${method}`
  return `${DEVELOPER_BASE}${model}:${method}`
}

export function geminiHeaders(key) {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': key }
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

export function vertexGenerateBody(body) {
  const out = { ...body }
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

/** { url, init } for one generate-family call; spread `init` into fetch and add your own signal. */
export function geminiGenerateRequest(get, model, body, method = 'generateContent') {
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

export function geminiEmbedRequest(get, a) {
  const headers = geminiHeaders(geminiApiKey(get))
  if (geminiBackend(get) === 'vertex') {
    const instance = { content: a.text }
    if (a.taskType) instance.task_type = a.taskType
    const parameters = {}
    if (a.outputDimensionality !== undefined) parameters.outputDimensionality = a.outputDimensionality
    return {
      url: `${vertexModelPath(get, backendModel(get, a.model))}:predict`,
      init: { method: 'POST', headers, body: JSON.stringify({ instances: [instance], parameters }) },
    }
  }
  const body = { content: { parts: [{ text: a.text }] } }
  if (a.taskType) body.taskType = a.taskType
  if (a.outputDimensionality !== undefined) body.outputDimensionality = a.outputDimensionality
  return { url: `${DEVELOPER_BASE}${a.model}:embedContent`, init: { method: 'POST', headers, body: JSON.stringify(body) } }
}

export function readEmbedding(json) {
  if (!isObj(json)) return null
  const dev = isObj(json.embedding) ? json.embedding.values : undefined
  if (Array.isArray(dev)) return dev
  const preds = Array.isArray(json.predictions) ? json.predictions : []
  const first = preds[0]
  const emb = isObj(first) && isObj(first.embeddings) ? first.embeddings.values : undefined
  return Array.isArray(emb) ? emb : null
}

const DEVELOPER_URL = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:/?]+):(generateContent|embedContent)/
const VERTEX_URL = /^https:\/\/(?:[a-z0-9-]+-)?aiplatform\.googleapis\.com\/v1(?:beta1)?\/(?:projects\/[^/]+\/locations\/[^/]+\/)?publishers\/google\/models\/([^:/?]+):(generateContent|streamGenerateContent|predict)/

export function geminiModelOfUrl(url) {
  return DEVELOPER_URL.exec(url)?.[1] ?? VERTEX_URL.exec(url)?.[1] ?? null
}

/** The request body string for the active backend (Vertex: role + googleSearch fixed up). */
export function geminiBody(body, get = processEnv) {
  return JSON.stringify(geminiBackend(get) === 'vertex' ? vertexGenerateBody(body) : body)
}

/** Scripts' shorthand: `fetch(...geminiPost(model, body, { signal }))`, env from process.env. */
export function geminiPost(model, body, extra = {}, method = 'generateContent') {
  const r = geminiGenerateRequest(processEnv, model, body, method)
  return [r.url, { ...r.init, ...extra }]
}

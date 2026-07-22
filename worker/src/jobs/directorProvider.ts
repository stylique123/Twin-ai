// Editor v2 — Phase 7: the Director's DEDICATED provider client.
//
// EXACTLY ONE generateContent call to the pinned gemini-3.5-flash, with NO
// retry on any status (429/5xx/timeout all fail closed) — a retry here could
// double-charge or double-edit. This is deliberately NOT worker/src/gemini.ts
// (which retries). Model is the frozen DIRECTOR_MODEL constant, never env.
import { env } from '../env.js'
import { DIRECTOR_MODEL } from './directorContract.js'

export class DirectorProviderError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'DirectorProviderError'
    this.code = code
  }
}

// Gemini structured-output schema (uppercase OpenAPI-subset types). The real
// authority is validateDirectorDecision — this only shapes the model's output.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    selections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          candidateIndex: { type: 'INTEGER' },
          reason: { type: 'STRING' },
        },
        required: ['candidateIndex'],
      },
    },
    keptBoundaries: { type: 'ARRAY', items: { type: 'INTEGER' } },
    summary: { type: 'STRING' },
  },
  required: ['selections'],
}

export interface DirectorProviderResult {
  raw: unknown
  responseText: string
}

// One call. Returns the parsed JSON body + the exact response text (for the
// response hash). Throws DirectorProviderError with a stable code on any
// non-2xx, timeout, empty, or unparseable response — never retries.
//
// `cancelSignal` (the directing stage's cooperative-cancellation signal) aborts
// the in-flight fetch: a cancel during the request maps to `director_cancelled`
// (distinct from `director_provider_timeout`), so the caller can treat delivery
// as UNCERTAIN and never permit a second call.
export async function callDirectorOnce(
  system: string,
  prompt: string,
  timeoutMs: number,
  cancelSignal?: AbortSignal,
): Promise<DirectorProviderResult> {
  if (!env.geminiKey) throw new DirectorProviderError('GEMINI_API_KEY not configured', 'director_no_credentials')
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 2048 },
    },
  })
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)
  const onCancel = () => ctrl.abort()
  if (cancelSignal) {
    if (cancelSignal.aborted) ctrl.abort()
    else cancelSignal.addEventListener('abort', onCancel, { once: true })
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DIRECTOR_MODEL}:generateContent`,
      { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey }, body },
    )
    // NO RETRY. Any non-2xx is a definitive, single-call failure.
    if (!res.ok) {
      throw new DirectorProviderError(`director provider HTTP ${res.status}`, 'director_provider_http')
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const responseText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!responseText) throw new DirectorProviderError('empty director response', 'director_response_unparseable')
    let raw: unknown
    try { raw = JSON.parse(responseText) } catch { throw new DirectorProviderError('unparseable director response', 'director_response_unparseable') }
    return { raw, responseText }
  } catch (e) {
    if (e instanceof DirectorProviderError) throw e
    // Cancellation wins over timeout: charge/delivery is uncertain.
    if (cancelSignal?.aborted) throw new DirectorProviderError('director cancelled in-flight', 'director_cancelled')
    if (timedOut || ctrl.signal.aborted) throw new DirectorProviderError('director provider timeout', 'director_provider_timeout')
    throw new DirectorProviderError(`director provider error: ${(e as Error).message}`, 'director_provider_http')
  } finally {
    clearTimeout(timer)
    if (cancelSignal) cancelSignal.removeEventListener('abort', onCancel)
  }
}

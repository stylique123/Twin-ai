// Editor v2 — Phase 7: the Director's DEDICATED provider client.
//
// EXACTLY ONE generateContent call to the pinned gemini-3.5-flash, with NO
// retry on any status (429/5xx/timeout all fail closed) — a retry here could
// double-charge or double-edit. This is deliberately NOT worker/src/gemini.ts
// (which retries). Model is the frozen DIRECTOR_MODEL constant, never env.
import { env } from '../env.js'
import {
  DIRECTOR_MODEL, DECISION_PACING, DECISION_MUSIC, DECISION_HOOK,
  CAPTION_PRESET_IDS, TRANSITION_POLICIES, ZOOM_INTENSITIES, ZOOM_REASON_CODES,
  DIRECTOR_MAX_OUTPUT_TOKENS, DIRECTOR_THINKING_BUDGET_TOKENS,
} from './directorContract.js'

export class DirectorProviderError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'DirectorProviderError'
    this.code = code
  }
}

// Gemini structured-output schema (uppercase OpenAPI-subset types). The real
// authority is validateDirectorDecision — this only shapes the model's output. It
// MUST stay semantically identical to directorResponseSchema() (the lowercase copy
// whose SHA is pinned into the envelope); both carry the FULL Decision v2 choice set
// so the model can actually return caption/zoom/transition/visual-waste, not just cuts.
const enumStr = (values: readonly string[]) => ({ type: 'STRING', format: 'enum', enum: [...values] })
// Exported so the parity test can pin this literal (dialect-normalized) against
// directorResponseSchema() — the two must never drift apart silently.
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    selections: { type: 'ARRAY', items: { type: 'INTEGER' } },
    keptBoundaries: { type: 'ARRAY', items: { type: 'INTEGER' } },
    summary: { type: 'STRING' },
    pacing: enumStr(DECISION_PACING),
    music: enumStr(DECISION_MUSIC),
    emphasisWordIndices: { type: 'ARRAY', items: { type: 'INTEGER' } },
    hookTreatment: enumStr(DECISION_HOOK),
    hookStartWordIndex: { type: 'INTEGER' },
    visualWasteSelections: { type: 'ARRAY', items: { type: 'INTEGER' } },
    captionPresetId: enumStr(CAPTION_PRESET_IDS),
    transitionPolicy: enumStr(TRANSITION_POLICIES),
    zoomRequests: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          anchorWordIndex: { type: 'INTEGER' },
          intensity: enumStr(ZOOM_INTENSITIES),
          reasonCode: enumStr(ZOOM_REASON_CODES),
        },
        required: ['anchorWordIndex'],
      },
    },
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
      // Output budget: sized so the WORST legal Decision v2 provably fits
      // (MAX_DECISION_OUTPUT_BYTES <= max - thinking, bytes>=tokens; test-pinned).
      maxOutputTokens: DIRECTOR_MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: DIRECTOR_THINKING_BUDGET_TOKENS },
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

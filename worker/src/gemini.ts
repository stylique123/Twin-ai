import { env } from './env.js'
import { modelForTask } from './modelRouting.js'
import { parseGeminiError, planRetry, quotaSummary } from './geminiQuota.js'

// Minimal Gemini JSON client for the worker (structure derivation, later steps).
// Provider is isolated here so it can be swapped without touching job handlers.
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'OBJECT', properties, required })
const arr = (items: unknown) => ({ type: 'ARRAY', items })
const str = { type: 'STRING' }
const num = { type: 'NUMBER' }
const bool = { type: 'BOOLEAN' }
/** A closed string vocabulary. The type stays 'STRING' — `enum` narrows it
 *  rather than replacing it, and a schema that omits the type is accepted and
 *  then ignored, which reads as a constraint and enforces nothing. */
const oneOf = (values: readonly string[]) => ({ type: 'STRING', enum: [...values] })

export { obj, arr, str, num, bool, oneOf }

// An image sent inline as base64 so the model can read it (Gemini vision) — e.g.
// a creator's post thumbnail, for reading their real brand palette from pixels.
export interface InlineImage { mimeType: string; data: string }

export async function geminiJson(
  system: string,
  prompt: string,
  schema: unknown,
  timeoutMs = 60_000,
  thinkingBudget?: number,
  model?: string,
  images: InlineImage[] = [],
): Promise<unknown> {
  if (!env.geminiKey) throw new Error('GEMINI_API_KEY not configured')
  // Per-call model wins, else the TASK CLASS decides (§2.4).
  //
  // This used to fall through to `process.env.GEMINI_MODEL ?? 'gemini-3.1-…'`,
  // which made "which model runs this" a property of whoever forgot to pass one
  // — a choice by omission. `profile` resolves to the same id and honours the
  // same env var, so nothing moves; what changes is that the choice is now
  // written down in model_routing_v1.json where it can be seen and argued with.
  const m = model ?? modelForTask('profile')
  // SPEED: cap the thinking model's reasoning. Unbounded thinking is the biggest
  // latency sink — these are schema-constrained JSON tasks that don't need deep
  // reasoning. Per-call budget wins; else env GEMINI_THINKING_BUDGET; else 2048.
  const budget = thinkingBudget ?? Number(process.env.GEMINI_THINKING_BUDGET ?? '2048')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const parts: Array<Record<string, unknown>> = [{ text: prompt }]
  for (const img of images) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
      responseSchema: schema,
      ...(budget >= 0 ? { thinkingConfig: { thinkingBudget: budget } } : {}),
    },
  })
  try {
    // Retry transient rate-limit / server errors with backoff so a spike doesn't
    // hard-fail DNA/structure jobs.
    let res: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey }, body },
      )
      if (res.ok) break

      // ⚠️ A 429 IS NOT A 500, AND THIS LOOP USED TO TREAT THEM IDENTICALLY.
      // A server error is transient by nature and worth a blind backoff. A quota
      // refusal is a STATEMENT about an allowance, and Google says which one in
      // `error.details[]` — including how long to wait. Retrying a per-DAY
      // exhaustion three times at 1s and 4s is not resilience: in this pipeline
      // every attempt re-downloads the video and re-runs whisper, so it spends
      // real acquisition to rediscover a wall that will not move until the quota
      // resets.
      //
      // ⚖️ AND THE BODY IS READ BEFORE IT IS THROWN, ONCE. `res.text()` can only
      // be consumed once, so the old code's "retry, then on the last attempt
      // read the body" shape meant the diagnostic was only ever available for
      // the attempt that had already given up.
      if (res.status === 429) {
        const quota = parseGeminiError(res.status, await res.text())
        const plan = planRetry(quota, attempt)
        if (plan.retry) {
          await new Promise((r) => setTimeout(r, plan.delayMs))
          continue
        }
        // ⚠️ THE DISCRIMINATING FIELDS GO FIRST. Whatever truncates this
        // downstream keeps the front of the string, and the front is now the
        // quota class and its id rather than a sentence identical across every
        // quota Google has.
        throw new Error(`${quotaSummary(quota)} — ${plan.reason}`)
      }

      if (res.status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) * (attempt + 1)))
        continue
      }
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    if (!res || !res.ok) throw new Error('Gemini request failed')
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    if (!text) throw new Error('Empty response from model')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

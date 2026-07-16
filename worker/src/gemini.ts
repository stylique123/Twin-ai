import { env } from './env.js'

// Minimal Gemini JSON client for the worker (structure derivation, later steps).
// Provider is isolated here so it can be swapped without touching job handlers.
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'OBJECT', properties, required })
const arr = (items: unknown) => ({ type: 'ARRAY', items })
const str = { type: 'STRING' }
const num = { type: 'NUMBER' }

export { obj, arr, str, num }

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
  // Per-call model wins (so cheap mechanical tasks can run on a fast/flash model),
  // else the configured default. Routing structure extraction to a flash model
  // is a large COGS cut with no quality loss on these schema-constrained tasks.
  const m = model ?? process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview'
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
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
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

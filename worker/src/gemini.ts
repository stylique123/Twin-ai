import { env } from './env.js'

// Minimal Gemini JSON client for the worker (structure derivation, later steps).
// Provider is isolated here so it can be swapped without touching job handlers.
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'OBJECT', properties, required })
const arr = (items: unknown) => ({ type: 'ARRAY', items })
const str = { type: 'STRING' }
const num = { type: 'NUMBER' }

export { obj, arr, str, num }

export async function geminiJson(
  system: string,
  prompt: string,
  schema: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  if (!env.geminiKey) throw new Error('GEMINI_API_KEY not configured')
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            // Thinking model: budget covers reasoning + the JSON output.
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
      },
    )
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
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

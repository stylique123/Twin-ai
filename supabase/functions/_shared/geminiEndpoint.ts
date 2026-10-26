// The edge functions' door to the Gemini backend helper (developer | vertex).
// Every Gemini call in supabase/functions builds its request through here; the
// env contract is in packages/shared/src/geminiBackend.ts (mirrored beside this
// file as geminiBackend.ts).
import { geminiApiKey, geminiBackend, geminiEmbedRequest, geminiGenerateRequest, readEmbedding, type EmbedArgs, type GenerateMethod } from './geminiBackend.ts'
export { geminiApiKey, geminiBackend, readEmbedding }

/** Deno's env, read at call time. */
export const denoEnv = (name: string): string | undefined => Deno.env.get(name)

/** The key for the active backend ('' when unset). */
export const edgeGeminiKey = (): string => geminiApiKey(denoEnv)

/** `fetch(...geminiPost(model, body, signal))` — URL + init for one generate call. */
export function geminiPost(
  model: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  method: GenerateMethod = 'generateContent',
): [string, RequestInit] {
  const r = geminiGenerateRequest(denoEnv, model, body, method)
  return [r.url, signal ? { ...r.init, signal } : r.init]
}

/** `fetch(...geminiEmbedPost({...}, signal))` — URL + init for one embedding. */
export function geminiEmbedPost(a: EmbedArgs, signal?: AbortSignal): [string, RequestInit] {
  const r = geminiEmbedRequest(denoEnv, a)
  return [r.url, signal ? { ...r.init, signal } : r.init]
}

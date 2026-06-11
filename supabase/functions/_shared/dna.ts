// Shared helpers for the Brand-DNA flow (start-dna + dna-poll).
//
// The DNA pipeline reads a creator's last N posts from their handle (via Apify),
// then asks Gemini to synthesize a structured "voice profile" the creator
// confirms in one tap. Video transcription (faster-whisper) is a later worker
// enhancement; captions + post metadata already give a strong first profile.

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'other'

// Normalize a handle: strip URL, leading @, trailing slashes, whitespace.
export function normalizeHandle(raw: string): string {
  let h = (raw ?? '').trim()
  if (!h) return ''
  // Pull the last path segment out of a full profile URL.
  const urlMatch = h.match(/^https?:\/\/[^\s]+/i)
  if (urlMatch) {
    try {
      const u = new URL(h)
      const seg = u.pathname.split('/').filter(Boolean).pop() ?? ''
      h = seg || u.hostname
    } catch {
      /* fall through to raw cleanup */
    }
  }
  return h.replace(/^@+/, '').replace(/\/+$/, '').trim()
}

// --- Apify -----------------------------------------------------------------
// One actor per platform, each overridable via env so we can swap actors
// without a code change.
function actorFor(platform: Platform): string {
  switch (platform) {
    case 'instagram':
      return Deno.env.get('APIFY_ACTOR_INSTAGRAM') ?? 'apify~instagram-scraper'
    case 'youtube':
      return Deno.env.get('APIFY_ACTOR_YOUTUBE') ?? 'streamers~youtube-scraper'
    case 'tiktok':
    default:
      return Deno.env.get('APIFY_ACTOR_TIKTOK') ?? 'clockworks~tiktok-scraper'
  }
}

const RESULTS = Number(Deno.env.get('DNA_POST_COUNT') ?? '20')

function actorInput(platform: Platform, handle: string): Record<string, unknown> {
  switch (platform) {
    case 'instagram':
      return { username: [handle], resultsLimit: RESULTS, resultsType: 'posts' }
    case 'youtube':
      return { startUrls: [{ url: `https://www.youtube.com/@${handle}/videos` }], maxResults: RESULTS }
    case 'tiktok':
    default:
      return {
        profiles: [handle],
        resultsPerPage: RESULTS,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
      }
  }
}

// Start an Apify actor run (async). Returns the runId to poll later.
export async function startApifyRun(platform: Platform, handle: string): Promise<string> {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) throw new Error('APIFY_TOKEN not configured')
  const actor = actorFor(platform)
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(actorInput(platform, handle)),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Apify start ${res.status}: ${detail.slice(0, 200)}`)
  }
  const data = await res.json()
  const runId = data?.data?.id
  if (!runId) throw new Error('Apify did not return a run id')
  return runId
}

export type ApifyStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT' | string

// Check an Apify run; when SUCCEEDED, pull its dataset items.
export async function pollApifyRun(
  runId: string,
): Promise<{ status: ApifyStatus; items: Record<string, unknown>[] | null }> {
  const token = Deno.env.get('APIFY_TOKEN')
  if (!token) throw new Error('APIFY_TOKEN not configured')

  const runRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!runRes.ok) throw new Error(`Apify run status ${runRes.status}`)
  const run = await runRes.json()
  const status: ApifyStatus = run?.data?.status ?? 'RUNNING'
  if (status !== 'SUCCEEDED') return { status, items: null }

  const datasetId = run?.data?.defaultDatasetId
  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&limit=${RESULTS}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!itemsRes.ok) throw new Error(`Apify dataset ${itemsRes.status}`)
  const items = (await itemsRes.json()) as Record<string, unknown>[]
  return { status, items: Array.isArray(items) ? items : [] }
}

// Pull the human-readable text + light metrics out of whatever shape the actor
// returns. Field names vary by actor, so we probe a list of common ones.
function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}
function pickNum(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
}

export interface PostSample {
  text: string
  likes: number
  plays: number
}

export function extractPosts(items: Record<string, unknown>[]): PostSample[] {
  return (items ?? [])
    .map((it) => ({
      text: pick(it, ['text', 'caption', 'description', 'title', 'desc']),
      likes: pickNum(it, ['diggCount', 'likesCount', 'likes', 'likeCount']),
      plays: pickNum(it, ['playCount', 'videoViewCount', 'views', 'viewCount']),
    }))
    .filter((p) => p.text.length > 0)
}

// --- Gemini synthesis ------------------------------------------------------
const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'OBJECT',
  properties,
  required,
})
const arr = (items: unknown) => ({ type: 'ARRAY', items })
const str = { type: 'STRING' }

export const voiceProfileSchema = obj(
  {
    summary: str, // one-line "this is how you sound"
    niche: str,
    tone: str,
    pacing: str,
    hook_style: str,
    vocabulary: arr(str), // signature words/phrases
    recurring_ctas: arr(str),
    dos: arr(str),
    donts: arr(str),
    sample_hooks: arr(str), // 3 hooks written in their voice
  },
  ['summary', 'niche', 'tone', 'pacing', 'hook_style', 'vocabulary', 'recurring_ctas', 'dos', 'donts', 'sample_hooks'],
)

const SYSTEM = `You are TwinAI's Brand-DNA engine. From a creator's recent posts you infer how THEY sound, so we can later write new scripts in their exact voice.

Hard rules:
- Describe their voice; never copy a specific post's content. Capture STRUCTURE and STYLE: tone, pacing, hook shape, signature vocabulary, recurring CTAs.
- Be concrete and specific to this creator — no generic "be authentic" filler.
- vocabulary = 4-8 actual words/phrases they lean on. sample_hooks = 3 fresh hooks written the way THEY would write one.
- dos/donts = practical guardrails for staying on-voice. Keep every string short.
- If the sample is thin, infer sensibly from what's there rather than refusing.`

export async function synthesizeVoice(handle: string, platform: Platform, posts: PostSample[]): Promise<unknown> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro'

  const corpus = posts
    .slice(0, 25)
    .map((p, i) => `${i + 1}. (${p.plays || p.likes || 0} views/likes) ${p.text}`)
    .join('\n')

  const prompt = `CREATOR: @${handle} on ${platform}
RECENT POSTS (caption/text + rough reach):
${corpus || '(no captions available — infer a sensible starting voice from the handle and platform)'}

Synthesize this creator's voice profile.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: voiceProfileSchema,
          },
        }),
      },
    )
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`)
    }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
    if (!text) throw new Error('Empty response from model')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

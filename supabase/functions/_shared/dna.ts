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
      // Apify's official Instagram scraper keys off `directUrls` (a profile URL),
      // NOT `username` — passing username silently scrapes nothing, which is why
      // even huge public accounts came back "empty". Send the profile URL and ask
      // for posts. (Extra keys are ignored by the actor, so username stays as a
      // harmless hint for alternate actors.)
      return {
        directUrls: [`https://www.instagram.com/${handle}/`],
        username: [handle],
        resultsType: 'posts',
        resultsLimit: RESULTS,
        addParentData: false,
      }
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
  const token = Deno.env.get('APIFY_TOKEN') ?? Deno.env.get('apify_api')
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
  const token = Deno.env.get('APIFY_TOKEN') ?? Deno.env.get('apify_api')
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
// returns. Field names vary across the TikTok / Instagram / YouTube actors, so we
// probe a list of common ones (including nested objects) and coerce string counts.
function get(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}
function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = get(obj, k)
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}
function pickNum(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = get(obj, k)
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  }
  return 0
}
function pickTags(obj: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = get(obj, k)
    if (Array.isArray(v)) {
      const tags = v
        .map((t) => (typeof t === 'string' ? t : ((t as Record<string, unknown>)?.name ?? (t as Record<string, unknown>)?.hashtag ?? '')))
        .filter((t): t is string => typeof t === 'string' && t.length > 0)
      if (tags.length) return tags.slice(0, 6)
    }
  }
  return []
}

export interface PostSample {
  text: string
  likes: number
  plays: number
  hashtags: string[]
}

export function extractPosts(items: Record<string, unknown>[]): PostSample[] {
  return (items ?? [])
    .map((it) => ({
      // TikTok: text · Instagram: caption · YouTube: title/description (+ subtitles when present)
      text: pick(it, ['text', 'caption', 'description', 'title', 'desc', 'subtitles']),
      likes: pickNum(it, ['diggCount', 'likesCount', 'likes', 'likeCount', 'stats.diggCount']),
      plays: pickNum(it, ['playCount', 'videoViewCount', 'videoPlayCount', 'viewCount', 'views', 'stats.playCount']),
      hashtags: pickTags(it, ['hashtags', 'tags']),
    }))
    .filter((p) => p.text.length > 0)
}

// Pull the top video URLs (highest reach first) so the worker can transcribe the
// creator's ACTUAL spoken audio and upgrade the voice beyond captions.
export function extractVideoUrls(items: Record<string, unknown>[], max = 5): string[] {
  const refs = (items ?? [])
    .map((it) => ({
      url: pick(it, ['webVideoUrl', 'videoUrl', 'url', 'postUrl', 'video.url']),
      reach: pickNum(it, ['playCount', 'videoViewCount', 'viewCount', 'views', 'diggCount', 'likesCount', 'stats.playCount']),
    }))
    .filter((r) => /^https:\/\//i.test(r.url))
  // De-dup, sort by reach desc, take top N.
  const seen = new Set<string>()
  return refs
    .sort((a, b) => b.reach - a.reach)
    .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
    .slice(0, max)
    .map((r) => r.url)
}

// The creator's profile bio/nickname is some of the richest voice signal we get —
// most actors stamp it on every item (TikTok: authorMeta.*, IG: ownerFullName/biography).
export function extractProfileBio(items: Record<string, unknown>[]): string {
  for (const it of items ?? []) {
    const name = pick(it, [
      'authorMeta.nickName', // TikTok actor uses capital-N "nickName"
      'authorMeta.name',
      'ownerFullName',
      'channelName',
      'author.name',
      'fullName',
    ])
    const bio = pick(it, ['authorMeta.signature', 'biography', 'channelDescription', 'author.signature'])
    if (bio || name) return [name, bio].filter(Boolean).join(' — ')
  }
  return ''
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

export async function synthesizeVoice(
  handle: string,
  platform: Platform,
  posts: PostSample[],
  bio = '',
): Promise<unknown> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro-preview'

  const corpus = posts
    .slice(0, 25)
    .map((p, i) => {
      const reach = p.plays || p.likes ? ` (${p.plays || p.likes} views/likes)` : ''
      const tags = p.hashtags.length ? ` [#${p.hashtags.join(' #')}]` : ''
      return `${i + 1}.${reach} ${p.text}${tags}`
    })
    .join('\n')

  const prompt = `CREATOR: @${handle} on ${platform}
${bio ? `PROFILE BIO: ${bio}\n` : ''}RECENT POSTS (caption/text + hashtags + rough reach):
${corpus || '(no captions available — infer a sensible starting voice from the handle, bio, and platform)'}

Synthesize this creator's voice profile.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45_000)
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
            // Thinking model: leave headroom for reasoning + the JSON profile.
            temperature: 0.7,
            maxOutputTokens: 8192,
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

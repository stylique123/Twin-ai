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

// Aggregate creator stats for the dashboard ("little things about them"): follower
// count (from the author meta, best-effort across actors) + counts/averages derived
// from the posts we read. Returns 0s when an actor doesn't expose a field.
export interface CreatorStats { followers: number; videos: number; avg_views: number; avg_likes: number }
export function computeStats(items: Record<string, unknown>[], posts: PostSample[]): CreatorStats {
  let followers = 0
  for (const it of items ?? []) {
    const f = pickNum(it, ['authorMeta.fans', 'followersCount', 'followers', 'subscriberCount', 'author.fans', 'authorMeta.followerCount', 'fansCount', 'edge_followed_by.count'])
    if (f > followers) followers = f
  }
  const videos = posts.length
  const sum = (sel: (p: PostSample) => number) => posts.reduce((a, p) => a + (sel(p) || 0), 0)
  return {
    followers,
    videos,
    avg_views: videos ? Math.round(sum((p) => p.plays) / videos) : 0,
    avg_likes: videos ? Math.round(sum((p) => p.likes) / videos) : 0,
  }
}

// Pull the top video URLs (highest reach first) so the worker can transcribe the
// creator's ACTUAL spoken audio and upgrade the voice beyond captions.
export function extractVideoUrls(items: Record<string, unknown>[], max = 5): string[] {
  const refs = (items ?? [])
    .map((it) => ({
      // Prefer the POST PERMALINK over the raw CDN media URL. Instagram's
      // scontent CDN links are IP-bound to the scraper and 403 from the worker,
      // so the audio upgrade must transcribe via the permalink (TikTok→yt-dlp,
      // YouTube→captions, Instagram→Apify reel transcript). videoUrl stays last
      // as a fallback for any item that only exposes a direct media URL.
      url: pick(it, ['webVideoUrl', 'url', 'postUrl', 'video.url', 'videoUrl']),
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

// --- Privacy / ownership guards --------------------------------------------
// Owner handle of a scraped item, normalized for comparison. IG: ownerUsername ·
// TikTok: authorMeta.name · YouTube: channelUsername.
function ownerOf(it: Record<string, unknown>): string {
  return pick(it, ['ownerUsername', 'authorMeta.name', 'channelUsername', 'authorMeta.uniqueId', 'authorUsername', 'username'])
    .toLowerCase()
    .replace(/^@/, '')
}

// A PRIVATE account can't be read, and the actor returns RELATED/tagged profiles'
// posts (Instagram) or none — so we must never synthesize a voice from someone
// else's content (the "private account → made-up brand identity" bug). IG stamps
// `private`; TikTok stamps `authorMeta.privateAccount`. (YouTube has no private-
// account concept — a private/missing channel simply returns no items.)
export function isPrivateProfile(items: Record<string, unknown>[]): boolean {
  return (items ?? []).some(
    (it) =>
      get(it, 'private') === true ||
      get(it, 'isPrivate') === true ||
      get(it, 'authorMeta.privateAccount') === true,
  )
}

// Keep only posts actually OWNED by the requested handle. Items the actor didn't
// stamp with an owner are kept (we can't disprove ownership); posts owned by a
// DIFFERENT account (what a private profile yields) are dropped.
export function postsOwnedBy(
  items: Record<string, unknown>[],
  handle: string,
): Record<string, unknown>[] {
  const want = handle.toLowerCase().replace(/^@/, '')
  const list = items ?? []
  // If the actor stamps owners on ANY item (IG/TikTok do), an UNSTAMPED item is
  // almost certainly a related/tagged post — drop it. We only keep unstamped items
  // when the actor never stamps owners at all (so we can't disprove ownership).
  // This closes the fail-open hole where a foreign post slipped through unstamped.
  const anyStamped = list.some((it) => ownerOf(it) !== '')
  return list.filter((it) => {
    const o = ownerOf(it)
    if (o) return o === want
    return !anyStamped
  })
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
    niche: str, // broad category (Fitness, Personal Finance, Fashion Tech)
    sub_niche: str, // the SPECIFIC angle within it that makes them distinct
    audience: str, // who they make content for
    audience_pain: str, // the core problem that audience feels
    dream_outcome: str, // what that audience actually wants
    offer: str, // what the creator sells or the action they push
    tone: str,
    pacing: str,
    hook_style: str,
    hook_patterns: arr(str), // 2-3 DISTINCT opener moves they use, each with a real example
    editing_style: str,
    vocabulary: arr(str), // signature words/phrases
    recurring_ctas: arr(str),
    pov: arr(str), // 2-3 beliefs / hot takes they repeat (what makes their content theirs)
    enemy: str, // the bad advice or villain they push against
    dos: arr(str),
    donts: arr(str),
    sample_hooks: arr(str), // 3 hooks written in their voice
  },
  ['summary', 'niche', 'sub_niche', 'audience', 'audience_pain', 'dream_outcome', 'offer', 'tone', 'pacing', 'hook_style', 'hook_patterns', 'vocabulary', 'recurring_ctas', 'pov', 'enemy', 'dos', 'donts', 'sample_hooks'],
)

const SYSTEM = `You are TwinAI's Brand-DNA engine. From a creator's recent posts you infer how THEY sound, so we can later write new scripts in their exact voice.

Hard rules:
- Describe their voice; never copy a specific post's content. Capture STRUCTURE and STYLE: tone, pacing, hook shape, signature vocabulary, recurring CTAs.
- niche = the BROAD category (e.g. Fitness, Personal Finance, Fashion Tech, Food). sub_niche = the SPECIFIC angle within it that makes them distinct and is what their audience actually searches for (e.g. calisthenics for beginners, debt payoff for couples, AI virtual try-on, high-protein meal prep). Keep sub_niche to 2-4 words, concrete and searchable, never a sentence.
- LEARN FROM THEIR WINNERS. The posts are ranked by reach, best first; the ones marked [TOP PERFORMER] are their biggest hits. Weight those hardest. What a creator's TOP posts do (the angle, the hook move, the emotional register) is what actually works for THEIR audience. Average posts dilute the signal, so let the winners lead.
- hook_style must be their repeatable HOOK FORMULA written as a reusable fill-in template derived from their best openers, e.g. "[surprising number] + [who it is for] + comment [KEYWORD]" or "I did [X] so you do not have to. Here is what happened." Not adjectives, an actual template someone could fill in.
- hook_patterns = the 2-3 DISTINCT opener MOVES this creator actually uses (a real creator has several, not one). Name each move and include a real example lifted from their captions, e.g. "Contrarian claim — 'Everyone is wrong about protein timing'", "Number drop — '3 lifts that fixed my back'", "Confession — 'I wasted 2 years doing this'", "Direct callout — 'If you train fasted, stop'". These let us write 5 hooks that feel different instead of one template five times.
- POV = the 2-3 recurring BELIEFS or contrarian takes they repeat (the "thing they always say"), and enemy = the conventional wisdom, bad advice, or villain they push against. This is what makes their content unmistakably THEIRS: two creators with identical tone differ by what they believe and what they attack. Extract both from the posts, never invent a stance the captions do not support.
- Also infer their AUDIENCE (who they make content for), that audience's core PAIN (the problem they feel), their DREAM OUTCOME (what they actually want), and the creator's OFFER (what they sell or the action they push). Infer these from the posts, bio, hashtags and niche even when not stated outright. Be specific, not generic.
- Be concrete and specific to this creator — no generic "be authentic" filler. Every field should be unmistakably about THIS creator and useless for anyone else.
- vocabulary = 4-8 actual words/phrases they lean on, lifted from their real captions. sample_hooks = 3 fresh hooks written the way THEY would write one, each drawing on a DIFFERENT hook_pattern and using their vocabulary.
- dos/donts = practical guardrails for staying on-voice. Keep every string short.
- If the sample is thin, infer sensibly from what's there rather than refusing. For pov/enemy specifically, prefer a shorter honest list over inventing beliefs the posts do not show.`

export async function synthesizeVoice(
  handle: string,
  platform: Platform,
  posts: PostSample[],
  bio = '',
): Promise<unknown> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro-preview'

  // Rank by reach so the model studies their WINNERS first. The patterns in a
  // creator's top posts are what actually works for THEIR audience; average posts
  // dilute the signal. Mark the top tier explicitly so the synthesis weights them.
  const ranked = [...posts].sort((a, b) => (b.plays || b.likes) - (a.plays || a.likes)).slice(0, 25)
  const corpus = ranked
    .map((p, i) => {
      const r = p.plays || p.likes
      const reach = r ? ` (${r.toLocaleString()} views/likes)` : ''
      const tags = p.hashtags.length ? ` [#${p.hashtags.join(' #')}]` : ''
      const tier = i < 5 && r ? ' [TOP PERFORMER]' : ''
      return `${i + 1}.${tier}${reach} ${p.text}${tags}`
    })
    .join('\n')

  const prompt = `CREATOR: @${handle} on ${platform}
${bio ? `PROFILE BIO: ${bio}\n` : ''}RECENT POSTS (caption/text + hashtags + rough reach):
${corpus || '(no captions available — infer a sensible starting voice from the handle, bio, and platform)'}

Synthesize this creator's voice profile.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60_000)
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
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: voiceProfileSchema,
            // Speed: cap reasoning so the DNA build doesn't over-deliberate. Uses a
            // DNA-SPECIFIC budget (falls back to the shared one) so the blueprint can
            // stay full while DNA is capped — A/B-proven to keep identical quality.
            ...((Number(Deno.env.get('DNA_THINKING_BUDGET') ?? Deno.env.get('GEMINI_THINKING_BUDGET') ?? '0') > 0)
              ? { thinkingConfig: { thinkingBudget: Number(Deno.env.get('DNA_THINKING_BUDGET') ?? Deno.env.get('GEMINI_THINKING_BUDGET')) } }
              : {}),
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

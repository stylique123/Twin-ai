import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from './env.js'

// --- SSRF guard ------------------------------------------------------------
// The worker downloads user-supplied URLs with yt-dlp, so we ONLY allow the
// social platforms we actually ingest. No file://, no internal IPs, no SSRF.
const ALLOWED_HOSTS = [
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
  'instagram.com', 'www.instagram.com',
  'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
  // Instagram / Facebook media CDNs. The DNA scrape returns ready-to-fetch mp4
  // URLs on these public Meta edges (scontent-*.cdninstagram.com, *.fbcdn.net).
  // We only ever feed them URLs WE scraped, so allowing them lets the brand-voice
  // build pull audio straight off the clip with ffmpeg+whisper — no paid Apify
  // transcript call. (Public CDN hosts, not internal, so no SSRF exposure.)
  'cdninstagram.com', 'fbcdn.net',
]

function assertAllowedUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (u.protocol !== 'https:') throw new Error('Only https URLs are allowed')
  const host = u.hostname.toLowerCase()
  const ok = ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  if (!ok) throw new Error(`Host not allowed: ${host}`)
  return u
}

// --- subprocess helper (no shell; args are passed as an array) -------------
function run(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`))
    })
  })
}

export interface Transcript {
  language: string
  duration_sec: number
  text: string
  words: { w: string; start: number; end: number }[]
  segments: { start: number; end: number; text: string }[]
}

export interface ScrapedPost {
  text: string
  likes: number
  plays: number
  hashtags: string[]
  url: string
  cover?: string // best-effort video cover/thumbnail URL, for reading the brand palette
}

// FREE TikTok profile scrape via yt-dlp. Datacenter IPs are NOT bot-blocked for
// TikTok (unlike YouTube/Instagram), so `--flat-playlist -J` returns full per-video
// metadata in one fast call: the caption (`title`/`description`), `view_count` and
// `like_count`. That's everything the DNA synth needs, with no paid Apify run. The
// profile URL scopes results to THIS creator, so no other-account leak is possible;
// an empty result means private/empty/invalid, which the caller refuses.
/** WHO THE HANDLE ACTUALLY RESOLVED TO.
 *
 *  ⚠️ THESE FACTS WERE ALWAYS HERE AND WERE ALWAYS DISCARDED. yt-dlp's `-J` on a
 *  profile returns the channel name, the canonical uploader id, the follower
 *  count and the playlist size alongside `entries`, and this function read
 *  `entries` and dropped the rest on the floor. That is why a scan of
 *  `@CarterPCs` could build a voice from a 146-subscriber channel called "five"
 *  and report no error: nothing ever looked at the account it landed on.
 *
 *  ⚖️ `null` MEANS NOT READ, AND IS NOT ZERO. yt-dlp omits the follower count on
 *  some accounts, and rounding that absence to 0 is the same three-state defect
 *  this repo keeps finding — it would make every unread account look like a
 *  brand new one. */
export interface ScrapedProfileFacts {
  resolvedHandle: string | null
  displayName: string | null
  audience: number | null
  postCount: number | null
}

export async function scrapeTikTokProfile(
  handle: string, limit = 12,
): Promise<{ posts: ScrapedPost[]; facts: ScrapedProfileFacts }> {
  const h = handle.replace(/^@/, '')
  const url = `https://www.tiktok.com/@${h}`
  assertAllowedUrl(url)
  const { stdout } = await run('yt-dlp', ['--flat-playlist', '-J', '--playlist-end', String(limit), url], 60_000)
  const data = JSON.parse(stdout) as {
    entries?: Record<string, unknown>[]
    channel?: unknown; uploader?: unknown; uploader_id?: unknown
    channel_follower_count?: unknown; playlist_count?: unknown
  }
  const entries = Array.isArray(data.entries) ? data.entries : []
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/^@/, '') : null)
  const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const facts: ScrapedProfileFacts = {
    resolvedHandle: str(data.uploader_id) ?? str(data.uploader),
    displayName: str(data.channel) ?? str(data.uploader),
    audience: int(data.channel_follower_count),
    // ⚖️ Only the playlist total counts. `entries.length` is capped by `limit`,
    // so reading it here would report "12 posts" for every prolific account and
    // — worse — a real 0 would be indistinguishable from a page that failed.
    postCount: int(data.playlist_count),
  }
  return { posts: buildPosts(entries), facts }
}

/** The original signature, unchanged for callers that only want the posts. */
export async function scrapeTikTokPosts(handle: string, limit = 12): Promise<ScrapedPost[]> {
  return (await scrapeTikTokProfile(handle, limit)).posts
}

// --- Profile scrape via Apify, because yt-dlp reads nothing from here --------
//
// ⚠️ THE SCAN WAS A SILENT NO-OP. `scrape_dna` called `scrapeTikTokProfile` for
// EVERY platform — a YouTube creator was scraped against `tiktok.com/@handle` —
// and yt-dlp is now bot-blocked for TikTok from datacenter IPs as well. A live
// job against a real user finished in 10 seconds, read zero posts, wrote zero
// `creator_knowledge`, kept the voice `ready`, and recorded status `done`. The
// caption-knowledge extraction added in #330 is correct and could never fire,
// because it is downstream of a scrape that hands it an empty list.
//
// ⚖️ FREE FIRST, PAID ONLY WHEN FREE RETURNS NOTHING — the rule
// `youtubeTranscriptFree` → `youtubeTranscriptViaApify` already follows. yt-dlp
// still works for some accounts and costs nothing; Apify is the fallback, not
// the default. An EMPTY result counts as failure here: a profile that parses to
// zero posts is the exact shape of the silent no-op this exists to end.
async function apifyDataset(actor: string, input: unknown, timeoutMs = 300_000): Promise<Record<string, unknown>[]> {
  if (!env.apifyToken) throw new Error('APIFY_TOKEN is not set; cannot scrape profile')
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${env.apifyToken}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: ctl.signal,
    })
    if (!r.ok) throw new Error(`apify ${actor} returned ${r.status}`)
    const j = await r.json()
    return Array.isArray(j) ? (j as Record<string, unknown>[]) : []
  } finally {
    clearTimeout(timer)
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const nullableInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const nonEmpty = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/^@/, '') : null)
const tags = (text: string) =>
  Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1)))).slice(0, 6)

async function tiktokProfileViaApify(handle: string, limit: number) {
  const items = await apifyDataset(env.apifyTiktokProfileActor, {
    profiles: [handle.replace(/^@/, '')],
    profileScrapeSections: ['videos'],
    profileSorting: 'latest',
    resultsPerPage: limit,
    excludePinnedPosts: false,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES',
  })
  const author = (items[0]?.authorMeta ?? {}) as Record<string, unknown>
  const posts: ScrapedPost[] = items
    .map((e) => {
      const text = String(e.text ?? '').replace(/\s+/g, ' ').trim()
      const meta = (e.videoMeta ?? {}) as Record<string, unknown>
      return {
        text,
        likes: num(e.diggCount),
        plays: num(e.playCount),
        hashtags: tags(text),
        url: String(e.webVideoUrl ?? ''),
        cover: typeof meta.coverUrl === 'string' ? meta.coverUrl : undefined,
      }
    })
    .filter((p) => p.text.length > 0)
  const facts: ScrapedProfileFacts = {
    resolvedHandle: nonEmpty(author.name),
    displayName: nonEmpty(author.nickName),
    audience: nullableInt(author.fans),
    postCount: nullableInt(author.video),
  }
  return { posts, facts }
}

async function youtubeChannelViaApify(handle: string, limit: number) {
  const items = await apifyDataset(env.apifyYoutubeChannelActor, {
    startUrls: [{ url: `https://www.youtube.com/@${handle.replace(/^@/, '')}` }],
    maxResults: limit,
    // MUST equal maxResults — see the note in env.ts. A shorts-first channel
    // returns nothing at all when this is 0.
    maxResultsShorts: limit,
    maxResultStreams: 0,
    sortVideosBy: 'NEWEST',
  })
  const first = items[0] ?? {}
  const posts: ScrapedPost[] = items
    .map((e) => {
      const text = String(e.title ?? '').replace(/\s+/g, ' ').trim()
      return {
        text,
        // The channel scraper reports views but not likes. 0 is the honest read
        // of "not returned" for a metric the DNA synth only ranks by.
        likes: 0,
        plays: num(e.viewCount),
        hashtags: tags(text),
        url: String(e.url ?? ''),
        cover: typeof e.thumbnailUrl === 'string' ? e.thumbnailUrl : undefined,
      }
    })
    .filter((p) => p.text.length > 0)
  const facts: ScrapedProfileFacts = {
    resolvedHandle: nonEmpty(first.channelUsername),
    displayName: nonEmpty(first.channelName),
    audience: nullableInt(first.numberOfSubscribers),
    postCount: nullableInt(first.channelTotalVideos),
  }
  return { posts, facts }
}

async function instagramProfileViaApify(handle: string, limit: number) {
  const h = handle.replace(/^@/, '')
  const items = await apifyDataset(env.apifyInstagramProfileActor, {
    directUrls: [`https://www.instagram.com/${h}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    addParentData: false,
  })
  const first = items[0] ?? {}
  const posts: ScrapedPost[] = items
    .map((e) => {
      const text = String(e.caption ?? '').replace(/\s+/g, ' ').trim()
      return {
        text,
        likes: num(e.likesCount),
        plays: num(e.videoPlayCount) || num(e.videoViewCount),
        hashtags: tags(text),
        url: String(e.url ?? ''),
        cover: typeof e.displayUrl === 'string' ? e.displayUrl : undefined,
      }
    })
    .filter((p) => p.text.length > 0)
  const facts: ScrapedProfileFacts = {
    // ⚖️ THE HANDLE THE POSTS ACTUALLY CAME FROM. This is what lets
    // `assessScanTarget` catch a profile URL that resolved to someone else —
    // the specific hazard that made refusing Instagram the right call until an
    // Actor could report it.
    resolvedHandle: nonEmpty(first.ownerUsername),
    displayName: nonEmpty(first.ownerFullName),
    // ⚖️ NOT READ, AND SAID SO. The `posts` result type carries no follower or
    // post total; those need a second, separately charged `details` run. `null`
    // is the honest answer and the one `scan_target` renders as "audience not
    // read". Rounding to 0 would make every IG creator look brand new — the
    // three-state defect this file already documents twice.
    audience: null,
    postCount: null,
  }
  return { posts, facts }
}

/** The scan was asked for a platform this worker cannot read. Typed, so the
 *  caller can tell "we do not support this" apart from "we tried and failed" —
 *  those need opposite messages and opposite fixes. */
export class UnsupportedPlatformError extends Error {
  readonly platform: string
  constructor(platform: string) {
    super(`No proven profile source for platform "${platform}"`)
    this.name = 'UnsupportedPlatformError'
    this.platform = platform
  }
}

/** Scrape a creator's own back catalogue for the platform they actually publish on.
 *
 *  ⚠️ PLATFORM WAS IGNORED BEFORE THIS. Every scan went to TikTok regardless of
 *  what the voice said, so a YouTube creator's scan asked tiktok.com for a handle
 *  that does not exist there and read nothing — a second, independent cause of
 *  the same empty result.
 *
 *  ⚠️ AND "KEEP THE EXISTING BEHAVIOUR" WAS NOT INERT. Instagram used to fall
 *  through to the TikTok scraper — so an IG creator's scan asked tiktok.com for
 *  their handle. Best case it read nothing. WORST CASE IT READ SOMEBODY ELSE:
 *  handles are not unique across platforms, so an IG creator whose name belongs
 *  to a different person on TikTok would have had a voice synthesised from a
 *  stranger's videos, with no error raised anywhere. A wrong-person profile is
 *  worse than a missing one, and 14 of 27 production voices are Instagram.
 *
 *  So an unsupported platform now REFUSES. No IG profile Actor has been proven
 *  against a real account from this worker, and guessing one would repeat the
 *  defect this function exists to fix — but silence was never the safe half of
 *  that choice. The refusal is explicit, typed, and reaches the creator as "we
 *  cannot scan Instagram yet" rather than as a scan that quietly returns a
 *  stranger. */
export async function scrapeProfile(
  handle: string, platform: string, limit = 12,
): Promise<{ posts: ScrapedPost[]; facts: ScrapedProfileFacts }> {
  const p = platform.trim().toLowerCase()
  if (p === 'youtube') {
    // yt-dlp is bot-blocked on YouTube from datacenter IPs — the reason the
    // transcript path moved to Apify. There is no free attempt worth making.
    return await youtubeChannelViaApify(handle, limit)
  }
  if (p === 'tiktok') {
    try {
      const free = await scrapeTikTokProfile(handle, limit)
      if (free.posts.length) {
        // ⚠️ POSTS WITHOUT FACTS IS NOT A SUCCESS. Observed on four live TikTok
        // scans: yt-dlp returned real posts but `resolvedHandle` and `audience`
        // both null, so every one stored `followers: 0` and — the part that
        // matters — `assessScanTarget` had NO resolved handle to compare against
        // the requested one. That check is the thing that catches a scan landing
        // on a DIFFERENT account holding the same name, the @CarterPCs trap. It
        // was silently unenforceable for TikTok.
        //
        // ⚖️ ENRICH, DON'T REDO. The free posts are good; only the identity is
        // missing. One Actor result carries `authorMeta`, so this buys the
        // resolved handle and follower count for a single billed item instead of
        // re-scraping the whole profile. A failure here keeps the free posts —
        // an identity we could not read must never cost a scrape that worked.
        if (free.facts.resolvedHandle === null) {
          console.warn(JSON.stringify({ event: 'profile_facts_missing', handle, platform: p }))
          try {
            const enriched = await tiktokProfileViaApify(handle, 1)
            if (enriched.facts.resolvedHandle !== null) {
              return { posts: free.posts, facts: enriched.facts }
            }
          } catch (err) {
            console.warn(JSON.stringify({
              event: 'profile_facts_enrich_failed', handle, platform: p,
              reason: err instanceof Error ? err.message : String(err),
            }))
          }
        }
        return free
      }
      console.warn(JSON.stringify({ event: 'profile_scrape_free_empty', handle, platform: p }))
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'profile_scrape_free_failed', handle, platform: p,
        reason: err instanceof Error ? err.message : String(err),
      }))
    }
    return await tiktokProfileViaApify(handle, limit)
  }
  if (p === 'instagram') {
    // ⚖️ INSTAGRAM JOINS THE LIST BY THE LIST'S OWN RULE — proven, then added.
    // It was refused because it fell through to TikTok and could return a
    // DIFFERENT PERSON holding the same handle. The fix for that is a source
    // that reads Instagram and reports whose posts it returned, not a permanent
    // refusal: 14 of 27 production voices are IG, and every one of them was
    // going to keep reading nothing. Verified against a real public profile
    // (12 posts, 0 failed requests) before being wired, and `resolvedHandle`
    // now carries the owner the posts actually came from so `assessScanTarget`
    // can still catch a mismatch.
    // No free attempt: yt-dlp gets "login required" on Instagram, which is why
    // the TRANSCRIPT path has been on Apify since it was written.
    return await instagramProfileViaApify(handle, limit)
  }
  // ⚖️ A CLOSED LIST, NOT A DEFAULT. Anything that is not a platform we have
  // PROVEN we can read is refused by name. A fallback here is how Instagram
  // ended up asking TikTok for someone else's account, and any platform added
  // later would inherit exactly that.
  throw new UnsupportedPlatformError(p)
}

function buildPosts(entries: Record<string, unknown>[]): ScrapedPost[] {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  // Best-effort cover URL — yt-dlp's flat-playlist TikTok extractor often includes
  // `thumbnails[]`; grab the last (largest) one. Absent on some accounts — that's
  // fine, the DNA synth just falls back to caption-only color inference.
  const cover = (e: Record<string, unknown>): string | undefined => {
    const thumbs = e.thumbnails
    if (Array.isArray(thumbs) && thumbs.length) {
      const last = thumbs[thumbs.length - 1] as Record<string, unknown>
      if (typeof last?.url === 'string') return last.url
    }
    return typeof e.thumbnail === 'string' ? e.thumbnail : undefined
  }
  return entries
    .map((e) => {
      const text = String(e.title || e.description || '').replace(/\s+/g, ' ').trim()
      const hashtags = Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1)))).slice(0, 6)
      return { text, likes: num(e.like_count), plays: num(e.view_count), hashtags, url: String(e.url ?? ''), cover: cover(e) }
    })
    .filter((p) => p.text.length > 0)
}

// --- YouTube: captions via Apify (datacenter IPs are bot-blocked by yt-dlp) ---
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']
function isYouTube(u: URL): boolean {
  const h = u.hostname.toLowerCase()
  return YT_HOSTS.some((x) => h === x || h.endsWith('.' + x))
}

// Apify caption Actors return segment-level timing only (no per-word boundaries).
// Synthesize word-level timing by spreading each segment's duration evenly across
// its words, so a YouTube/Instagram transcript carries the same `words[]` shape as
// a Whisper one. This gives the structure analysis word-level pacing to reason
// about (words/min, where a beat lands) instead of coarse 5-10 word chunks, and
// keeps any caption rendering downstream working on reference-sourced clips.
function wordsFromSegments(segments: { start: number; end: number; text: string }[]): Transcript['words'] {
  const words: Transcript['words'] = []
  for (const seg of segments) {
    const toks = seg.text.split(/\s+/).filter(Boolean)
    const span = Math.max(0, seg.end - seg.start)
    const per = toks.length ? span / toks.length : 0
    toks.forEach((w, i) => {
      words.push({
        w,
        start: Number((seg.start + i * per).toFixed(3)),
        end: Number((seg.start + (i + 1) * per).toFixed(3)),
      })
    })
  }
  return words
}

// FREE YouTube transcript via youtube-transcript-api (a Python helper). YouTube
// does not block our datacenter IP (verified), so we try this first and only pay
// for the Apify Actor if it fails. ~1s and $0 vs ~25s and paid. The helper exits
// non-zero on any problem (no captions, transient block) so the caller falls back.
async function youtubeTranscriptFree(rawUrl: string): Promise<Transcript> {
  const { stdout } = await run(
    'python3',
    [join(import.meta.dirname, '..', 'youtube_transcript.py'), rawUrl],
    30_000,
  )
  const t = JSON.parse(stdout) as Transcript
  if (!t.text || !t.text.trim()) throw new Error('empty transcript')
  return t
}

// Run an Apify transcript Actor synchronously and read its captions, mapping
// them into our Transcript shape. Throws a clear, user-facing message on failure
// (no token configured, or no captions on the video) so the UI can show why.
async function youtubeTranscriptViaApify(rawUrl: string): Promise<Transcript> {
  if (!env.apifyToken) {
    throw new Error('YouTube analysis is not configured yet. Try a TikTok or Instagram link, or contact support.')
  }
  // run-sync-get-dataset-items returns the dataset directly as [{ data: [...] }].
  // (The older /run-sync + key-value-store path returned an empty body here and
  // broke JSON parsing — "Unexpected end of JSON input".)
  const url = `https://api.apify.com/v2/acts/${env.apifyYoutubeActor}/run-sync-get-dataset-items?token=${env.apifyToken}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: rawUrl, targetLanguage: 'en' }),
    // Bound the synchronous Apify run so a stuck connection can't hold the worker
    // indefinitely (Apify's own sync cap is ~5 min; 330s lets its error surface first).
    signal: AbortSignal.timeout(330_000),
  })
  if (!res.ok) {
    throw new Error(`YouTube transcript service error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const items = (await res.json()) as { data?: { start?: string | number; dur?: string | number; text?: string }[] }[]
  const rows = (Array.isArray(items) ? items[0]?.data : null) ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('This video has no captions we can read. Try a different reference.')
  }

  const segments = rows
    .map((r) => {
      const start = Number(r.start) || 0
      const dur = Number(r.dur) || 0
      return { start, end: Number((start + dur).toFixed(3)), text: String(r.text ?? '').trim() }
    })
    .filter((s) => s.text)
  if (segments.length === 0) throw new Error('This video has no captions we can read. Try a different reference.')

  const text = segments.map((s) => s.text).join(' ')
  const duration_sec = Math.ceil(segments[segments.length - 1].end)
  return { language: 'en', duration_sec, text, words: wordsFromSegments(segments), segments }
}

// --- Instagram: transcript via Apify (yt-dlp gets "login required"/rate-limited) ---
const IG_HOSTS = ['instagram.com', 'www.instagram.com']
function isInstagram(u: URL): boolean {
  const h = u.hostname.toLowerCase()
  return IG_HOSTS.some((x) => h === x || h.endsWith('.' + x))
}

// Direct media edges (Instagram/FB CDN): the scrape already handed us a ready mp4
// URL, so we pull the audio straight off it locally instead of a paid transcript
// Actor. This is what makes the brand-voice audio upgrade actually run (the URLs
// the DNA scrape passes live on these hosts, which the old allowlist rejected).
const DIRECT_MEDIA_HOSTS = ['cdninstagram.com', 'fbcdn.net']
function isDirectMedia(u: URL): boolean {
  const h = u.hostname.toLowerCase()
  return DIRECT_MEDIA_HOSTS.some((x) => h === x || h.endsWith('.' + x))
}

// Pull audio straight from a direct media URL (a scraped Instagram/FB CDN mp4) with
// ffmpeg and transcribe locally with faster-whisper — free, no transcript Actor.
// ffmpeg streams just the audio (`-vn`) into whisper's native 16 kHz mono, capped
// at maxMediaSecs, and the temp audio is always discarded (analyze-and-discard).
async function transcribeDirectMedia(rawUrl: string): Promise<Transcript> {
  const dir = await mkdtemp(join(tmpdir(), 'twinai-'))
  const audioPath = join(dir, 'audio.wav')
  const outPath = join(dir, 'transcript.json')
  try {
    await run(
      'ffmpeg',
      ['-y', '-i', rawUrl, '-vn', '-ac', '1', '-ar', '16000', '-t', String(env.maxMediaSecs), audioPath],
      120_000,
    )
    await run(
      'python3',
      [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
       '--audio', audioPath, '--out', outPath,
       '--model', env.whisperModel, '--device', env.whisperDevice,
       '--language', 'auto', '--beam-size', '1', '--max-seconds', String(env.maxMediaSecs)],
      Math.max(180_000, env.maxMediaSecs * 1000),
    )
    return JSON.parse(await readFile(outPath, 'utf8')) as Transcript
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Run an Apify Instagram transcript Actor and map its dataset output into our
// Transcript shape. The Actor returns one dataset item shaped as:
//   { text, duration, errMsg, segments: [{ start, end, text }] }
// Throws a clear, user-facing message when the token is missing, the reel is
// unavailable (empty result), or the clip has no readable speech.
async function instagramTranscriptViaApify(rawUrl: string): Promise<Transcript> {
  if (!env.apifyToken) {
    throw new Error('Instagram analysis is not configured yet. Try a TikTok link, or contact support.')
  }
  const url = `https://api.apify.com/v2/acts/${env.apifyInstagramActor}/run-sync-get-dataset-items?token=${env.apifyToken}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: rawUrl }),
    // Bound the synchronous Apify run (see YouTube path above).
    signal: AbortSignal.timeout(330_000),
  })
  if (!res.ok) {
    throw new Error(`Instagram transcript service error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const items = (await res.json()) as {
    text?: string
    duration?: number
    errMsg?: string
    segments?: { start?: number; end?: number; text?: string }[]
  }[]
  const item = Array.isArray(items) ? items[0] : null
  // The Actor returns an empty dataset for private/removed/region-locked reels.
  if (!item) throw new Error("Couldn't read that Instagram video — it may be private or removed. Try another.")
  if (item.errMsg) throw new Error(`This Instagram video could not be read: ${String(item.errMsg).slice(0, 150)}`)

  const segments = (Array.isArray(item.segments) ? item.segments : [])
    .map((s) => {
      const start = Number(s.start) || 0
      const end = Number(s.end) || start
      return { start, end: Number(end.toFixed(3)), text: String(s.text ?? '').trim() }
    })
    .filter((s) => s.text)

  const text =
    typeof item.text === 'string' && item.text.trim()
      ? item.text.trim()
      : segments.map((s) => s.text).join(' ')
  if (!text) throw new Error('This Instagram video has no speech we can read. Try a different reference.')

  const duration_sec = Number(item.duration) || (segments.length ? Math.ceil(segments[segments.length - 1].end) : 0)
  return { language: 'en', duration_sec, text, words: wordsFromSegments(segments), segments }
}

// Download audio from an allow-listed URL, transcribe with faster-whisper, and
// ALWAYS discard the raw media afterwards (analyze-and-discard / privacy).
// YouTube + Instagram are the exceptions: we fetch transcripts via Apify (see
// above) because both bot-block yt-dlp from datacenter IPs.
export async function transcribeFromUrl(rawUrl: string): Promise<Transcript> {
  const u = assertAllowedUrl(rawUrl)
  if (isYouTube(u)) {
    // Free first (YouTube doesn't block us), Apify only as a paid fallback.
    try {
      return await youtubeTranscriptFree(rawUrl)
    } catch (e) {
      console.error('free YT transcript failed, falling back to Apify:', e instanceof Error ? e.message : e)
      return youtubeTranscriptViaApify(rawUrl)
    }
  }
  if (isInstagram(u)) return instagramTranscriptViaApify(rawUrl)
  if (isDirectMedia(u)) return transcribeDirectMedia(rawUrl) // scraped IG/FB CDN mp4 → free local whisper
  const dir = await mkdtemp(join(tmpdir(), 'twinai-'))
  const audioPath = join(dir, 'audio.m4a')
  const outPath = join(dir, 'transcript.json')
  try {
    // 1. Download audio only (no video) — cheaper + faster than full media.
    await run(
      'yt-dlp',
      ['-f', 'bestaudio/best', '-x', '--audio-format', 'm4a', '--no-playlist',
       '--max-filesize', '200M', '-o', audioPath, rawUrl],
      120_000,
    )
    // 2. Transcribe via the Python faster-whisper wrapper (prints JSON).
    await run(
      'python3',
      [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
       '--audio', audioPath, '--out', outPath,
       '--model', env.whisperModel, '--device', env.whisperDevice,
       // Reference clips can be in any language, so detect here (unlike the
       // creator's own take, which we pin to avoid English->Arabic misdetection).
       '--language', 'auto', '--beam-size', '1',
       '--max-seconds', String(env.maxMediaSecs)],
      Math.max(180_000, env.maxMediaSecs * 1000),
    )
    return JSON.parse(await readFile(outPath, 'utf8')) as Transcript
  } finally {
    // Discard raw media + working files no matter what.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

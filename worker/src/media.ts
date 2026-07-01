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

export function assertAllowedUrl(raw: string): URL {
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
export async function scrapeTikTokPosts(handle: string, limit = 12): Promise<ScrapedPost[]> {
  const h = handle.replace(/^@/, '')
  const url = `https://www.tiktok.com/@${h}`
  assertAllowedUrl(url)
  const { stdout } = await run('yt-dlp', ['--flat-playlist', '-J', '--playlist-end', String(limit), url], 60_000)
  const data = JSON.parse(stdout) as { entries?: Record<string, unknown>[] }
  const entries = Array.isArray(data.entries) ? data.entries : []
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

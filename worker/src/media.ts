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

// --- YouTube: captions via Apify (datacenter IPs are bot-blocked by yt-dlp) ---
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']
function isYouTube(u: URL): boolean {
  const h = u.hostname.toLowerCase()
  return YT_HOSTS.some((x) => h === x || h.endsWith('.' + x))
}

// Run an Apify transcript Actor synchronously and read its captions, mapping
// them into our Transcript shape. Throws a clear, user-facing message on failure
// (no token configured, or no captions on the video) so the UI can show why.
async function youtubeTranscriptViaApify(rawUrl: string): Promise<Transcript> {
  if (!env.apifyToken) {
    throw new Error('YouTube analysis is not configured yet. Try a TikTok or Instagram link, or contact support.')
  }
  const base = `https://api.apify.com/v2/acts/${env.apifyYoutubeActor}`
  const runRes = await fetch(`${base}/run-sync?token=${env.apifyToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl: rawUrl, targetLanguage: 'en' }),
  })
  if (!runRes.ok) {
    throw new Error(`YouTube transcript service error ${runRes.status}: ${(await runRes.text()).slice(0, 200)}`)
  }
  const run = await runRes.json()
  const storeId = run?.data?.defaultKeyValueStoreId
  if (!storeId) throw new Error('YouTube transcript service returned no output store.')

  const outRes = await fetch(`https://api.apify.com/v2/key-value-stores/${storeId}/records/output?token=${env.apifyToken}`)
  if (!outRes.ok) throw new Error(`Could not read YouTube transcript output (${outRes.status}).`)
  const out = await outRes.json()
  const rows: { start?: string | number; dur?: string | number; text?: string }[] = out?.data ?? []
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
  return { language: 'en', duration_sec, text, words: [], segments }
}

// Download audio from an allow-listed URL, transcribe with faster-whisper, and
// ALWAYS discard the raw media afterwards (analyze-and-discard / privacy).
// YouTube is the exception: we fetch real captions via Apify (see above) because
// YouTube bot-blocks yt-dlp from datacenter IPs.
export async function transcribeFromUrl(rawUrl: string): Promise<Transcript> {
  const u = assertAllowedUrl(rawUrl)
  if (isYouTube(u)) return youtubeTranscriptViaApify(rawUrl)
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
       '--max-seconds', String(env.maxMediaSecs)],
      Math.max(180_000, env.maxMediaSecs * 1000),
    )
    return JSON.parse(await readFile(outPath, 'utf8')) as Transcript
  } finally {
    // Discard raw media + working files no matter what.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

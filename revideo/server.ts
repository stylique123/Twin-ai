import express from 'express'
import { renderVideo } from '@revideo/renderer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

// Persistent Revideo render service (the premium visual engine of the hybrid).
// The worker POSTs { baseClipUrl, edl } and gets back the captioned MP4. The base
// clip MUST be a fetchable URL (a signed storage URL) — Revideo can't resolve raw
// local paths. ffmpeg stays the instant default; this is the premium pass.
const app = express()
const PORT = Number(process.env.PORT ?? 4500)
// Parallel render workers — each is a Chromium+Vite instance rendering a slice of
// the frames, then they're concatenated. ~near-linear speedup. Default 3 (the VPS
// has 4 cores; leave one for the OS + other containers). ~1-1.5GB RAM per worker.
const WORKERS = Number(process.env.REVIDEO_WORKERS ?? 4)
const WORK = '/app/work'
fs.mkdirSync(WORK, { recursive: true })

app.get('/health', (_req, res) => res.json({ ok: true }))

// --- Hardening (audit B1) ------------------------------------------------------
// This service runs expensive Chromium renders and fetches an operator-supplied URL,
// so left open it's both a compute-DoS and an SSRF surface. Three guards:
//   1. Bearer auth when RENDER_TOKEN is set (the worker sends the same token).
//   2. SSRF allow-list: https only, and either an explicit host allow-list
//      (RENDER_ALLOWED_HOSTS) or, absent that, block localhost / private / link-local
//      / cloud-metadata targets so a caller can't make Chromium probe the internal net.
//   3. A hard concurrency cap so a burst can't exhaust RAM/CPU.
// Operationally this MUST still be bound to loopback / a private network and firewalled
// (see deploy-revideo.yml) — auth is defence in depth, not the only control.
const RENDER_TOKEN = (process.env.RENDER_TOKEN ?? '').trim()
const ALLOWED_HOSTS = (process.env.RENDER_ALLOWED_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const MAX_CONCURRENT = Number(process.env.REVIDEO_MAX_CONCURRENT ?? 2)
const MAX_WORDS = Number(process.env.REVIDEO_MAX_WORDS ?? 4000)
let inFlight = 0

function timingSafeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0') return true
  // IPv4 literal → block loopback / private / link-local / metadata ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true // IPv6 ULA/link-local
  return false
}

function validClipUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (ALLOWED_HOSTS.length) return ALLOWED_HOSTS.includes(host)
  return !isPrivateHost(host)
}

app.post('/render', express.json({ limit: '4mb' }), async (req, res) => {
  // 1. Auth (enforced only when a token is configured; the worker sends it).
  if (RENDER_TOKEN) {
    const bearer = (req.header('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!bearer || !timingSafeEq(bearer, RENDER_TOKEN)) return res.status(401).json({ error: 'unauthorized' })
  }
  const { baseClipUrl, edl } = req.body ?? {}
  if (!baseClipUrl || !edl) return res.status(400).json({ error: 'baseClipUrl and edl are required' })
  // 2. SSRF: only allow a public https media URL (or an explicit allow-listed host).
  if (!validClipUrl(baseClipUrl)) return res.status(400).json({ error: 'baseClipUrl must be a public https URL' })
  // 3. Concurrency cap — reject rather than pile on and OOM.
  if (inFlight >= MAX_CONCURRENT) return res.status(429).json({ error: 'render service busy' })
  if (Array.isArray(edl?.captions?.words ?? edl?.words) && (edl.captions?.words ?? edl.words).length > MAX_WORDS) {
    return res.status(400).json({ error: 'too many caption words' })
  }
  inFlight++
  try { await handleRender(baseClipUrl, edl, res) } finally { inFlight-- }
})

async function handleRender(baseClipUrl: unknown, edl: any, res: express.Response): Promise<void> {
  const outName = `${crypto.randomUUID()}.mp4`
  // The worker's EDL stores caption words as { w, start, end } (worker/src/edl.ts),
  // but the Revideo scene (src/project.tsx) reads `.text`. Map w→text here or every
  // caption renders as an empty string — the whole point of the premium pass. Also
  // accept already-{text} shaped words for forward-compat.
  const rawWords = edl.captions?.words ?? edl.words ?? []
  const words = (Array.isArray(rawWords) ? rawWords : []).map(
    (x: { w?: string; text?: string; start?: number; end?: number }) => ({
      text: x.text ?? x.w ?? '',
      start: x.start ?? 0,
      end: x.end ?? 0,
    }),
  )
  // Highlight color follows the EDL's caption `variation` index (the same palette
  // the ffmpeg path uses), as correct web hex. A brand hex, when present, wins.
  // Must match edit.ts POP_PALETTE exactly so the premium render's highlight color
  // is identical to the instant ffmpeg render (was drifted: coral #FF6B6B vs #FF5B7B,
  // gold #FFE500 vs #FFD400).
  const POP_HEX = ['#F5A623' /*amber*/, '#65E5D8' /*teal*/, '#FF5B7B' /*coral*/, '#FFD400' /*gold*/]
  const variation = Number(edl.captions?.variation ?? 0)
  const highlightColor =
    edl.captions?.highlight_hex ??
    edl.highlightColor ??
    POP_HEX[((variation % POP_HEX.length) + POP_HEX.length) % POP_HEX.length]

  const flat = {
    baseClip: String(baseClipUrl),
    words,
    highlightColor,
    style: edl.captions?.style ?? edl.style ?? 'bold-pop',
    decoder: 'web', // parallelizes across workers + faster (H.264 base clips)
  }
  const t0 = Date.now()
  try {
    await renderVideo({
      projectFile: './src/project.tsx',
      variables: { edl: flat },
      settings: {
        outFile: outName as `${string}.mp4`,
        outDir: WORK,
        workers: WORKERS,
        logProgress: true,
        ffmpeg: { ffmpegPath: '/usr/bin/ffmpeg', ffprobePath: '/usr/bin/ffprobe' },
        puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
      },
    })
    const outPath = path.join(WORK, outName)
    console.log(`[render] done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outName}`)
    res.sendFile(outPath, (err) => {
      fs.rm(outPath, { force: true }, () => {})
      if (err) console.error('[render] sendFile error', err)
    })
  } catch (e) {
    console.error('[render] failed', e)
    res.status(500).json({ error: String(e).slice(0, 400) })
  }
}

app.listen(PORT, () => console.log(`twinai-revideo render service on :${PORT}`))

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

app.post('/render', express.json({ limit: '4mb' }), async (req, res) => {
  const { baseClipUrl, edl } = req.body ?? {}
  if (!baseClipUrl || !edl) return res.status(400).json({ error: 'baseClipUrl and edl are required' })
  const outName = `${crypto.randomUUID()}.mp4`
  const flat = {
    baseClip: String(baseClipUrl),
    words: edl.captions?.words ?? edl.words ?? [],
    highlightColor: edl.highlightColor ?? '#23A6F5',
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
})

app.listen(PORT, () => console.log(`twinai-revideo render service on :${PORT}`))

import { renderVideo } from '@revideo/renderer'
import * as fs from 'node:fs'
import * as path from 'node:path'

// CLI: tsx render.ts <edl.json> <baseClipUrl> <out.mp4>
// baseClipUrl must be a FETCHABLE URL (signed storage URL) — Revideo can't resolve
// raw local file paths. The worker uploads the cut+graded base clip, signs it, and
// passes the URL. Output is the premium-captioned MP4. Verified on the VPS.
const [, , edlPath, baseClipUrl, outFile] = process.argv
if (!edlPath || !baseClipUrl || !outFile) {
  console.error('usage: tsx render.ts <edl.json> <baseClipUrl> <out.mp4>')
  process.exit(2)
}

const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'))
const flat = {
  baseClip: baseClipUrl,
  words: edl.captions?.words ?? edl.words ?? [],
  highlightColor: edl.highlightColor ?? '#23A6F5',
  style: edl.captions?.style ?? edl.style ?? 'bold-pop',
}

async function main() {
  const t0 = Date.now()
  const out = await renderVideo({
    // Relative path; run from the revideo/ dir (the renderer joins cwd + this and
    // emits a vite client import of the same).
    projectFile: './src/project.tsx',
    variables: { edl: flat },
    settings: {
      outFile: path.basename(outFile) as `${string}.mp4`,
      outDir: path.dirname(path.resolve(outFile)),
      logProgress: true,
      ffmpeg: { ffmpegPath: '/usr/bin/ffmpeg', ffprobePath: '/usr/bin/ffprobe' },
      puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    },
  })
  console.log('RENDERED', out, 'in', ((Date.now() - t0) / 1000).toFixed(1) + 's')
}
main().catch((e) => { console.error(e); process.exit(1) })

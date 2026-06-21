import { renderVideo } from '@revideo/renderer'
import * as path from 'node:path'
import * as fs from 'node:fs'

// CLI: tsx render.ts <edl.json> <base.mp4> <out.mp4>
// The worker calls this with the cut+graded base clip and the EDL; out is the
// premium-captioned MP4. Headless Chromium (no-sandbox) so it runs on the server.
const [, , edlPath, baseClip, outFile] = process.argv
if (!edlPath || !baseClip || !outFile) {
  console.error('usage: tsx render.ts <edl.json> <base.mp4> <out.mp4>')
  process.exit(2)
}

const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'))
// The scene reads a flat shape: { baseClip, words, highlightColor, style }.
const flat = {
  baseClip: path.resolve(baseClip),
  words: edl.captions?.words ?? edl.words ?? [],
  highlightColor: edl.highlightColor ?? '#23A6F5',
  style: edl.captions?.style ?? edl.style ?? 'bold-pop',
}

const out = await renderVideo({
  projectFile: path.resolve(import.meta.dirname, 'src/project.ts'),
  variables: { edl: flat },
  settings: {
    outFile: path.basename(outFile) as `${string}.mp4`,
    outDir: path.dirname(path.resolve(outFile)),
    workers: 1,
    logProgress: true,
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
    projectSettings: { size: { x: 1080, y: 1920 } },
  },
})
console.log('RENDERED', out)

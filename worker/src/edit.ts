import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from './env.js'

// One-click auto-edit v2: take a raw recorded clip and return a finished vertical
// MP4 that feels professionally edited:
//   1. jump-cuts  — auto-editor trims silence/dead air (snappy pacing)
//   2. captions   — single-layer, word-synced, the spoken word "pops" (amber + scale)
//   3. framing    — fill vertical 1080x1920
//   4. audio      — loudness-normalized
// Captions are derived AFTER cutting so their timing stays in sync.

interface Word { w: string; start: number; end: number }

function run(cmd: string, args: string[], timeoutMs: number, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd })
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

export interface EditResult {
  outFile: string
  durationSec: number
  words: number
  jumpCut: boolean
}

export interface EditOptions {
  captions?: boolean // default true; skip when the source is already captioned
}

// ASS time h:mm:ss.cs
function assTime(s: number): string {
  const cs = Math.max(0, Math.round(s * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const sec = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

// Single-layer captions: 3-word groups, the active word pops (amber + 116% scale).
// One Dialogue per word window so exactly ONE caption shows at a time (no overlap).
function buildAss(words: Word[]): string {
  const WHITE = '&HFFFFFF&'
  const POP = '&H23A6F5&' // amber (BGR)
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap, Arial, 70, ${WHITE}, &H00000000&, &HA0000000&, 1, 0, 1, 5, 1, 2, 90, 90, 470, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const esc = (w: string) => w.replace(/[{}\\]/g, '').trim()

  // Group into lines of up to 3 words; break early on sentence punctuation.
  const lines: Word[][] = []
  let cur: Word[] = []
  for (const w of words) {
    cur.push(w)
    if (cur.length >= 3 || /[.!?]$/.test(w.w)) {
      lines.push(cur)
      cur = []
    }
  }
  if (cur.length) lines.push(cur)

  const events: string[] = []
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const start = line[i].start
      const end = i + 1 < line.length ? line[i + 1].start : line[i].end
      if (end <= start) continue
      const text = line
        .map((w, j) =>
          j === i
            ? `{\\fscx116\\fscy116\\b1\\c${POP}}${esc(w.w)}{\\r}`
            : esc(w.w),
        )
        .join(' ')
      // a tiny grow-in on the whole group keeps it lively without overlap
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{\\fad(40,0)}${text}`)
    }
  }
  return head + events.join('\n') + '\n'
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size
  } catch {
    return 0
  }
}

export async function autoEdit(takeFile: string, opts: EditOptions = {}): Promise<EditResult> {
  const captions = opts.captions !== false
  const dir = await mkdtemp(join(tmpdir(), 'twinai-edit-'))
  const cut = join(dir, 'cut.mp4')
  const audio = join(dir, 'a.wav')
  const assRel = 'captions.ass'
  const ass = join(dir, assRel)
  const transcript = join(dir, 't.json')
  const out = join(dir, 'out.mp4')
  try {
    // 1. Jump-cuts: remove silence/dead air. Keep a small margin so words aren't
    //    clipped. Best-effort — if auto-editor can't (e.g. tiny/odd clip), fall
    //    back to the original take so we always produce a render.
    let jumpCut = true
    try {
      await run(
        'auto-editor',
        [takeFile, '--no-open', '--margin', '0.2sec',
         '--video-codec', 'libx264', '--audio-codec', 'aac', '-o', cut],
        Math.max(240_000, env.maxMediaSecs * 1500),
      )
      if ((await fileSize(cut)) < 1024) throw new Error('empty cut')
    } catch {
      jumpCut = false
    }
    const base = jumpCut ? cut : takeFile

    // 2. Captions from the (possibly tightened) audio so timing stays in sync.
    let words: Word[] = []
    let durationSec = 0
    if (captions) {
      await run('ffmpeg', ['-y', '-i', base, '-vn', '-ac', '1', '-ar', '16000', audio], 120_000)
      await run(
        'python3',
        [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
         '--audio', audio, '--out', transcript,
         '--model', env.whisperModel, '--device', env.whisperDevice,
         '--max-seconds', String(env.maxMediaSecs)],
        Math.max(180_000, env.maxMediaSecs * 1000),
      )
      const tr = JSON.parse(await readFile(transcript, 'utf8')) as { words: Word[]; duration_sec: number }
      words = (tr.words ?? []).filter((w) => w.w && Number.isFinite(w.start) && Number.isFinite(w.end))
      durationSec = tr.duration_sec ?? 0
    }
    await writeFile(ass, words.length ? buildAss(words) : '[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n[Events]\n')

    // 3 + 4. Fill vertical 1080x1920, burn captions, normalize loudness.
    const vf = captions && words.length
      ? `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${assRel}`
      : `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`
    await run(
      'ffmpeg',
      ['-y', '-i', base,
       '-vf', vf,
       '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
       'out.mp4'],
      Math.max(240_000, env.maxMediaSecs * 2000),
      dir,
    )

    const finalBuf = await readFile(out)
    const keep = join(tmpdir(), `twinai-render-${Date.now()}.mp4`)
    await writeFile(keep, finalBuf)
    return { outFile: keep, durationSec, words: words.length, jumpCut }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

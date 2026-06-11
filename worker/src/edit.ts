import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from './env.js'

// One-click auto-edit: take a raw recorded clip and return a finished vertical
// MP4 with word-synced captions burned in and loudness-corrected audio — the
// transform that turns a phone take into a postable short.

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
}

// Produce captions.ass: chunked lines with the currently-spoken word highlighted
// (the modern "karaoke" caption look). Times are in ASS h:mm:ss.cs.
function buildAss(words: Word[]): string {
  const HIGHLIGHT = '&H23A6F5&' // amber (BGR)
  const WHITE = '&HFFFFFF&'
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap, Arial, 64, ${WHITE}, &H000000&, &H80000000&, 1, 0, 1, 4, 2, 2, 80, 80, 430, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const t = (s: number) => {
    const cs = Math.max(0, Math.round(s * 100))
    const h = Math.floor(cs / 360000)
    const m = Math.floor((cs % 360000) / 6000)
    const sec = Math.floor((cs % 6000) / 100)
    const c = cs % 100
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(c).padStart(2, '0')}`
  }
  const esc = (w: string) => w.replace(/[{}\\]/g, '').trim()

  // Group into lines of up to 4 words; break early on sentence punctuation.
  const lines: Word[][] = []
  let cur: Word[] = []
  for (const w of words) {
    cur.push(w)
    if (cur.length >= 4 || /[.!?]$/.test(w.w)) {
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
        .map((w, j) => (j === i ? `{\\c${HIGHLIGHT}\\b1}${esc(w.w)}{\\c${WHITE}}` : esc(w.w)))
        .join(' ')
      events.push(`Dialogue: 0,${t(start)},${t(end)},Cap,,0,0,0,,${text}`)
    }
  }
  return head + events.join('\n') + '\n'
}

export async function autoEdit(takeFile: string): Promise<EditResult> {
  const dir = await mkdtemp(join(tmpdir(), 'twinai-edit-'))
  const audio = join(dir, 'a.wav')
  const assRel = 'captions.ass'
  const ass = join(dir, assRel)
  const transcript = join(dir, 't.json')
  const out = join(dir, 'out.mp4')
  try {
    // 1. Extract audio for ASR.
    await run('ffmpeg', ['-y', '-i', takeFile, '-vn', '-ac', '1', '-ar', '16000', audio], 120_000)

    // 2. Word-level timestamps via the same faster-whisper wrapper used elsewhere.
    await run(
      'python3',
      [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
       '--audio', audio, '--out', transcript,
       '--model', env.whisperModel, '--device', env.whisperDevice,
       '--max-seconds', String(env.maxMediaSecs)],
      Math.max(180_000, env.maxMediaSecs * 1000),
    )
    const tr = JSON.parse(await readFile(transcript, 'utf8')) as { words: Word[]; duration_sec: number }
    const words = (tr.words ?? []).filter((w) => w.w && Number.isFinite(w.start) && Number.isFinite(w.end))

    // 3. Caption file (skip gracefully if the take had no speech).
    await writeFile(ass, words.length ? buildAss(words) : '[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n[Events]\n')

    // 4. Render: fill vertical 1080x1920, burn captions, normalize loudness.
    //    Run with cwd=dir so the subtitles filter can use a bare filename
    //    (avoids filtergraph path-escaping pitfalls).
    const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${assRel}`
    await run(
      'ffmpeg',
      ['-y', '-i', takeFile,
       '-vf', vf,
       '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
       'out.mp4'],
      Math.max(240_000, env.maxMediaSecs * 2000),
      dir,
    )

    // 5. Hand back the rendered file (caller uploads, then we clean up).
    const finalBuf = await readFile(out)
    const keep = join(tmpdir(), `twinai-render-${Date.now()}.mp4`)
    await writeFile(keep, finalBuf)
    return { outFile: keep, durationSec: tr.duration_sec ?? 0, words: words.length }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

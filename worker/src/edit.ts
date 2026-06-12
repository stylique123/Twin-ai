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
  energy?: 'high' | 'calm' // 'high' → jump-zoom punches on cuts; 'calm' → clean cuts
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

// Keyword → emoji. When a caption group mentions one of these, we append the
// emoji so captions feel alive (the modern viral look). One emoji per group max.
const EMOJI: [RegExp, string][] = [
  [/\b(money|cash|dollar|dollars|rich|profit|paid|wealth|income|revenue)\b/i, '💰'],
  [/\b(fire|lit|hot|insane|crazy|wild|best|amazing)\b/i, '🔥'],
  [/\b(love|heart|adore)\b/i, '❤️'],
  [/\b(time|clock|fast|quick|now|today|minute|minutes|hour|hours)\b/i, '⏰'],
  [/\b(idea|ideas|think|smart|genius|brain|mind|learn)\b/i, '💡'],
  [/\b(grow|growth|up|increase|rise|scale|more|bigger)\b/i, '📈'],
  [/\b(win|winner|won|success|succeed|goal|goals)\b/i, '🏆'],
  [/\b(stop|don't|dont|no|never|avoid|wrong|bad)\b/i, '🚫'],
  [/\b(work|hustle|grind|effort|hard|push|strong)\b/i, '💪'],
  [/\b(secret|secrets|hidden|nobody|truth|real)\b/i, '🤫'],
  [/\b(warning|careful|mistake|danger|risk|fail)\b/i, '⚠️'],
  [/\b(viral|views|blow|explode|reach|million)\b/i, '🚀'],
  [/\b(food|eat|delicious|tasty|cook|recipe)\b/i, '😋'],
  [/\b(boom|done|finished|finally|yes)\b/i, '💥'],
]
function emojiFor(line: Word[]): string {
  const text = line.map((w) => w.w).join(' ')
  for (const [re, e] of EMOJI) if (re.test(text)) return e
  return ''
}

// Single-layer captions: 3-word groups, the active word pops (amber + animated
// scale), optional emoji. One Dialogue per word window so exactly ONE caption
// shows at a time (no overlap).
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
Style: Cap, DejaVu Sans, 70, ${WHITE}, &H00000000&, &HA0000000&, 1, 0, 1, 5, 1, 2, 90, 90, 470, 1

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
    const emoji = emojiFor(line)
    for (let i = 0; i < line.length; i++) {
      const start = line[i].start
      const end = i + 1 < line.length ? line[i + 1].start : line[i].end
      if (end <= start) continue
      const text = line
        .map((w, j) =>
          j === i
            // active word: amber + a quick scale "pop" (animated 100→122%)
            ? `{\\b1\\c${POP}\\fscx100\\fscy100\\t(0,90,\\fscx122\\fscy122)}${esc(w.w)}{\\r}`
            : esc(w.w),
        )
        .join(' ')
      const tail = emoji ? ` ${emoji}` : ''
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{\\fad(40,0)}${text}${tail}`)
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

async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      30_000,
    )
    const d = parseFloat(stdout.trim())
    return Number.isFinite(d) ? d : 0
  } catch {
    return 0
  }
}

// Jump-cuts via ffmpeg silencedetect: find silent gaps, keep the spoken segments
// (with a small margin so words aren't clipped), and concat them back together.
// Returns true if it actually tightened the clip.
async function jumpCutSilence(base: string, outFile: string, energy: 'high' | 'calm' = 'calm'): Promise<boolean> {
  const duration = await probeDuration(base)
  if (duration < 3) return false // too short to bother

  // Detect silence: quieter than -30dB for >= 0.35s.
  const { stderr } = await run(
    'ffmpeg',
    ['-i', base, '-af', 'silencedetect=noise=-30dB:d=0.35', '-f', 'null', '-'],
    Math.max(120_000, duration * 2000),
  )
  const starts: number[] = []
  const ends: number[] = []
  for (const m of stderr.matchAll(/silence_start:\s*([0-9.]+)/g)) starts.push(parseFloat(m[1]))
  for (const m of stderr.matchAll(/silence_end:\s*([0-9.]+)/g)) ends.push(parseFloat(m[1]))
  if (!starts.length) return false

  // Build silence intervals, shrink each by a 0.15s margin so we never clip speech.
  const MARGIN = 0.15
  const sil: [number, number][] = []
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i] + MARGIN
    const e = (i < ends.length ? ends[i] : duration) - MARGIN
    if (e - s > 0.1) sil.push([s, e])
  }
  if (!sil.length) return false

  // Keep segments = complement of silence within [0, duration].
  const keep: [number, number][] = []
  let cursor = 0
  for (const [s, e] of sil) {
    if (s > cursor + 0.1) keep.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (duration - cursor > 0.1) keep.push([cursor, duration])
  // Nothing meaningful to cut, or pathological segmentation.
  if (keep.length < 2 || keep.length > 60) return false
  const kept = keep.reduce((a, [s, e]) => a + (e - s), 0)
  if (kept >= duration - 0.4) return false // <0.4s removed — not worth a re-encode

  // filter_complex: trim each keep window for v+a, normalize to 1080x1920, then
  // concat. On 'high' energy, alternate a +8% zoom per segment so every cut lands
  // a subtle jump-zoom "punch" (the high-energy talking-head look); 'calm' keeps
  // clean, consistent framing.
  const norm = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
  const punch = 'scale=1166:2074:force_original_aspect_ratio=increase,crop=1080:1920'
  const parts: string[] = []
  keep.forEach(([s, e], i) => {
    const vf = energy === 'high' && i % 2 === 1 ? punch : norm
    parts.push(`[0:v]trim=${s.toFixed(3)}:${e.toFixed(3)},setpts=PTS-STARTPTS,${vf}[v${i}]`)
    parts.push(`[0:a]atrim=${s.toFixed(3)}:${e.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`)
  })
  const concatIn = keep.map((_, i) => `[v${i}][a${i}]`).join('')
  const filter = `${parts.join(';')};${concatIn}concat=n=${keep.length}:v=1:a=1[v][a]`
  await run(
    'ffmpeg',
    ['-y', '-i', base, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
     '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', outFile],
    Math.max(240_000, duration * 3000),
  )
  return (await fileSize(outFile)) > 1024
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
    // 1. Jump-cuts: remove silence/dead air via ffmpeg silencedetect. Best-effort
    //    — if there's nothing worth cutting (or it errors), fall back to the
    //    original take so we always produce a render.
    let jumpCut = false
    try {
      jumpCut = await jumpCutSilence(takeFile, cut, opts.energy ?? 'calm')
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

import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from './env.js'
import { fetchBroll, fetchMusicBed, pickKeywords, type Broll } from './broll.js'

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
  broll: boolean
}

export interface EditOptions {
  captions?: boolean // default true; skip when the source is already captioned
  energy?: 'high' | 'calm' // 'high' → jump-zoom punches on cuts; 'calm' → clean cuts
  variation?: number // remake index → different caption highlight color
  brollText?: string // blueprint text (hook/script/captions) to source b-roll keywords from
}

// Highlight-color palette (BGR). Remakes rotate through it so each looks fresh.
const POP_PALETTE = ['&H23A6F5&' /*amber*/, '&H70E4D5&' /*teal*/, '&H6B6BFF&' /*coral*/, '&H00E5FF&' /*gold*/]


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
function buildAss(words: Word[], variation = 0): string {
  const WHITE = '&HFFFFFF&'
  const POP = POP_PALETTE[((variation % POP_PALETTE.length) + POP_PALETTE.length) % POP_PALETTE.length]
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap, DejaVu Sans, 76, ${WHITE}, &H00000000&, &HC0000000&, 1, 0, 1, 7, 2, 2, 90, 90, 560, 1

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
      // Clamp the caption's display end so it never hangs on screen during a
      // pause before the next word (the lagging-caption bug). It tracks speech:
      // show until the next word, but no longer than ~0.2s past this word's end.
      const nextStart = i + 1 < line.length ? line[i + 1].start : line[i].end + 0.2
      const end = Math.min(nextStart, line[i].end + 0.2)
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

// Disfluency cut: when the transcript captures fillers ("um"/"uh"/...) or an
// immediate stammered duplicate of a short word ("I I", "the the"), return the
// time spans to drop. Whisper often cleans fillers out, so this fires
// opportunistically and never removes content words.
const FILLERS = new Set(['um', 'umm', 'ummm', 'uh', 'uhh', 'uhhh', 'uhm', 'uhmm', 'er', 'err', 'erm', 'ah', 'ahh', 'eh', 'ehh', 'hmm', 'hmmm', 'mm', 'mmm'])
const normWord = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')
export function fillerSpans(words: Word[]): [number, number][] {
  const spans: [number, number][] = []
  for (let i = 0; i < words.length; i++) {
    const w = normWord(words[i].w)
    if (!w) continue
    let drop = FILLERS.has(w)
    if (!drop && i + 1 < words.length && w.length <= 3 && w === normWord(words[i + 1].w)) drop = true
    if (drop) spans.push([Math.max(0, words[i].start - 0.03), words[i].end + 0.03])
  }
  return spans
}

// Jump-cuts via ffmpeg silencedetect: find silent gaps (plus any extraRemove word
// spans from fillerSpans), keep the spoken segments with a small margin, and
// concat them back together. Returns true if it actually tightened the clip.
async function jumpCutSilence(base: string, outFile: string, energy: 'high' | 'calm' = 'calm', extraRemove: [number, number][] = []): Promise<boolean> {
  const duration = await probeDuration(base)
  if (duration < 3) return false // too short to bother

  // Adaptive silence threshold: measure the take's mean loudness, then treat
  // anything ~8dB below the average as a pause. Clamped to a safe band so we
  // never clip speech (threshold too high) or never fire (too low). Falls back to -30dB.
  let noiseDb = -30
  try {
    const { stderr: vd } = await run('ffmpeg', ['-i', base, '-af', 'volumedetect', '-f', 'null', '-'], Math.max(60_000, duration * 1500))
    const mm = vd.match(/mean_volume:\s*(-?[0-9.]+)\s*dB/)
    if (mm) noiseDb = Math.max(-45, Math.min(-28, parseFloat(mm[1]) - 8))
  } catch { /* keep -30 */ }
  // Detect silence quieter than the adaptive threshold for >= 0.35s.
  const { stderr } = await run(
    'ffmpeg',
    ['-i', base, '-af', `silencedetect=noise=${noiseDb.toFixed(1)}dB:d=0.35`, '-f', 'null', '-'],
    Math.max(120_000, duration * 2000),
  )
  const starts: number[] = []
  const ends: number[] = []
  for (const m of stderr.matchAll(/silence_start:\s*([0-9.]+)/g)) starts.push(parseFloat(m[1]))
  for (const m of stderr.matchAll(/silence_end:\s*([0-9.]+)/g)) ends.push(parseFloat(m[1]))
  if (!starts.length && !extraRemove.length) return false

  // Remove set = silence intervals (shrunk by a 0.15s margin so we never clip
  // speech) PLUS any filler/stammer word spans passed in.
  const MARGIN = 0.15
  const sil: [number, number][] = []
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i] + MARGIN
    const e = (i < ends.length ? ends[i] : duration) - MARGIN
    if (e - s > 0.1) sil.push([s, e])
  }
  for (const [s, e] of extraRemove) {
    const cs = Math.max(0, s)
    const ce = Math.min(duration, e)
    if (ce - cs > 0.05) sil.push([cs, ce])
  }
  if (!sil.length) return false

  // Sort + merge overlapping remove intervals (silence and fillers can overlap).
  sil.sort((a, b) => a[0] - b[0])
  const remove: [number, number][] = []
  for (const iv of sil) {
    const last = remove[remove.length - 1]
    if (last && iv[0] <= last[1] + 0.05) last[1] = Math.max(last[1], iv[1])
    else remove.push([iv[0], iv[1]])
  }

  // Keep segments = complement of the remove set within [0, duration].
  const keep: [number, number][] = []
  let cursor = 0
  for (const [s, e] of remove) {
    if (s > cursor + 0.1) keep.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (duration - cursor > 0.1) keep.push([cursor, duration])
  // Drop sub-0.2s slivers that would create a 3-frame stutter cut.
  const segs = keep.filter(([s, e]) => e - s >= 0.2)
  // Nothing meaningful to cut, or pathological segmentation.
  if (segs.length < 2 || segs.length > 200) return false
  const kept = segs.reduce((a, [s, e]) => a + (e - s), 0)
  if (kept >= duration - 0.4) return false // <0.4s removed — not worth a re-encode

  // filter_complex: trim each keep window for v+a, normalize to 1080x1920, then
  // concat. A 25ms audio fade in/out at each seam removes the click/pop that a raw
  // atrim+concat splice produces (the #1 tell of an amateur auto-cut). On 'high'
  // energy, alternate a +8% zoom so every other cut lands a jump-zoom punch.
  const norm = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
  const punch = 'scale=1166:2074:force_original_aspect_ratio=increase,crop=1080:1920'
  const FADE = 0.025
  const parts: string[] = []
  segs.forEach(([s, e], i) => {
    const vf = energy === 'high' && i % 2 === 1 ? punch : norm
    parts.push(`[0:v]trim=${s.toFixed(3)}:${e.toFixed(3)},setpts=PTS-STARTPTS,${vf}[v${i}]`)
    const segDur = e - s
    const fade =
      segDur > FADE * 2 + 0.02
        ? `,afade=t=in:st=0:d=${FADE},afade=t=out:st=${(segDur - FADE).toFixed(3)}:d=${FADE}`
        : ''
    parts.push(`[0:a]atrim=${s.toFixed(3)}:${e.toFixed(3)},asetpts=PTS-STARTPTS${fade}[a${i}]`)
  })
  const concatIn = segs.map((_, i) => `[v${i}][a${i}]`).join('')
  const filter = `${parts.join(';')};${concatIn}concat=n=${segs.length}:v=1:a=1[v][a]`
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
    // 0. Detect disfluencies on the ORIGINAL so fillers + stammers get cut along
    //    with silence in the same pass. Best-effort: if it fails we fall back to
    //    silence-only cuts (unchanged behavior).
    let removeSpans: [number, number][] = []
    try {
      const a0 = join(dir, 'a0.wav')
      const t0 = join(dir, 't0.json')
      await run('ffmpeg', ['-y', '-i', takeFile, '-vn', '-ac', '1', '-ar', '16000', a0], 120_000)
      await run(
        'python3',
        [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
         '--audio', a0, '--out', t0,
         '--model', env.whisperModel, '--device', env.whisperDevice,
         '--max-seconds', String(env.maxMediaSecs)],
        Math.max(180_000, env.maxMediaSecs * 1000),
      )
      const w0 = (JSON.parse(await readFile(t0, 'utf8')).words ?? []) as Word[]
      removeSpans = fillerSpans(w0.filter((w) => w.w && Number.isFinite(w.start) && Number.isFinite(w.end)))
    } catch {
      removeSpans = []
    }

    // 1. Jump-cuts: remove silence + detected fillers via ffmpeg. Best-effort, and
    //    if there's nothing worth cutting (or it errors), fall back to the
    //    original take so we always produce a render.
    let jumpCut = false
    try {
      jumpCut = await jumpCutSilence(takeFile, cut, opts.energy ?? 'calm', removeSpans)
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
    await writeFile(ass, words.length ? buildAss(words, opts.variation ?? 0) : '[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n[Events]\n')

    // 2b. Optional b-roll cutaway (best-effort, only if PEXELS_API_KEY is set and
    //     the clip is long enough to spare a 2s window after the hook).
    let broll: Broll | null = null
    if (words.length && durationSec > 6) {
      try {
        // Prefer keywords from the blueprint (what the creator is shooting); fall
        // back to the spoken transcript when no blueprint text was passed.
        const kwSource = opts.brollText && opts.brollText.trim() ? opts.brollText : words.map((w) => w.w).join(' ')
        broll = await fetchBroll(pickKeywords(kwSource), dir)
      } catch {
        broll = null
      }
    }
    const fill = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
    const subs = captions && words.length ? `,subtitles=${assRel}` : ''
    const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', 'out.mp4']

    // Optional ducked MUSIC BED (env MUSIC_BED_URL): the connective tissue that
    // makes cut clips feel like ONE coherent video. It plays under the whole
    // timeline and ducks beneath the voice via sidechaincompress. Best-effort.
    let bedFile: string | null = null
    if (env.musicBedUrl) {
      try { bedFile = await fetchMusicBed(env.musicBedUrl, dir) } catch { bedFile = null }
    }

    // B-roll cutaway SYNCED to when its keyword is actually spoken (not a fixed 2s),
    // and faded in/out so it does not pop.
    let brollStart = 2.0
    if (broll && words.length) {
      const q = broll.query.toLowerCase()
      const hit = words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').includes(q))
      if (hit) brollStart = Math.max(1.2, Math.min(hit.start, Math.max(1.2, durationSec - 3)))
    }
    const brollEnd = brollStart + 2.2

    // Inputs: 0 = base (video+voice), then b-roll, then bed (indices depend on presence).
    const inputs: string[] = ['-i', base]
    let idx = 1
    let brollIdx = -1, bedIdx = -1
    if (broll) { inputs.push('-i', 'broll.mp4'); brollIdx = idx++ }
    if (bedFile) { inputs.push('-i', 'bed.mp3'); bedIdx = idx++ }

    // Video chain: fill -> optional faded b-roll overlay -> captions.
    const vparts: string[] = [`[0:v]${fill}[mv]`]
    let vlast = 'mv'
    if (broll) {
      // Shift the b-roll so it starts playing at brollStart, then alpha-fade edges.
      vparts.push(
        `[${brollIdx}:v]${fill},setpts=PTS-STARTPTS+${brollStart.toFixed(3)}/TB,format=yuva420p,` +
        `fade=t=in:st=${brollStart.toFixed(3)}:d=0.15:alpha=1,fade=t=out:st=${(brollEnd - 0.15).toFixed(3)}:d=0.15:alpha=1[bv]`,
      )
      vparts.push(`[mv][bv]overlay=enable='between(t,${brollStart.toFixed(2)},${brollEnd.toFixed(2)})'[ov]`)
      vlast = 'ov'
    }
    vparts.push(`[${vlast}]${subs ? `subtitles=${assRel}` : 'null'}[v]`)

    // Two-pass loudnorm on the voice: measure first so the final pass lands on
    // -14 LUFS exactly (consistent perceived volume across all of a creator's
    // videos) instead of the ~1 LU drift of single-pass. Best-effort; on any
    // failure lnMeasured is '' and we degrade to single-pass cleanly. Skipped
    // for the bed path, where loudnorm runs on the MIX, not the measured voice.
    const lnMeasured = bedFile ? '' : ((await measureLoudnorm(base, durationSec)) ?? '')
    const LN = `loudnorm=I=-14:TP=-1.5:LRA=11${lnMeasured}`
    // Clean the voice before normalizing: high-pass removes low rumble, afftdn does
    // mild broadband denoise (helps soft mics / background noise). Conservative so
    // speech is never muffled.
    const DN = 'highpass=f=85,afftdn=nr=10,'

    // Audio chain: ducked bed + voice, or just denoise + loudnorm. Target -14 LUFS.
    const aChain = bedFile
      ? `[0:a]${DN}asplit=2[v1][vkey];` +
        `[${bedIdx}:a]aloop=loop=-1:size=2000000000,volume=0.22[bedv];` +
        `[bedv][vkey]sidechaincompress=threshold=0.04:ratio=8:attack=5:release=260[bedduck];` +
        `[v1][bedduck]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`
      : `[0:a]${DN}${LN}[a]`

    const fullArgs = ['-y', ...inputs, '-filter_complex', `${vparts.join(';')};${aChain}`,
      '-map', '[v]', '-map', '[a]', ...enc]
    // Fallback render that can never fail on a complex filtergraph.
    const plain = ['-y', '-i', base, '-vf', `${fill}${subs}`, '-af', `${DN}${LN}`, ...enc]
    try {
      await run('ffmpeg', fullArgs, Math.max(240_000, env.maxMediaSecs * 2000), dir)
    } catch {
      await run('ffmpeg', plain, Math.max(240_000, env.maxMediaSecs * 2000), dir)
    }

    const finalBuf = await readFile(out)
    const keep = join(tmpdir(), `twinai-render-${Date.now()}.mp4`)
    await writeFile(keep, finalBuf)
    return { outFile: keep, durationSec, words: words.length, jumpCut, broll: !!broll }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// First pass of a two-pass loudnorm: measure the source loudness and return the
// ':measured_*' fragment to splice into the final loudnorm filter (with
// linear=true for a single, non-pumping gain to exactly -14 LUFS). Returns null
// on any failure or non-finite measurement (e.g. near-silent audio) so the
// caller falls back to adaptive single-pass loudnorm.
async function measureLoudnorm(base: string, duration: number): Promise<string | null> {
  try {
    const { stderr } = await run(
      'ffmpeg',
      ['-i', base, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
      Math.max(60_000, duration * 1500),
    )
    const m = stderr.match(/\{\s*"input_i"[\s\S]*?\}/)
    if (!m) return null
    const j = JSON.parse(m[0]) as Record<string, string>
    const keys = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']
    for (const k of keys) {
      const v = j[k]
      if (v == null || !Number.isFinite(parseFloat(v))) return null
    }
    return `:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}` +
      `:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`
  } catch {
    return null
  }
}

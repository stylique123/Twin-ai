import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from './env.js'
import { fetchBroll, fetchMusicBed, pickKeywords, type Broll } from './broll.js'
import { buildEdl, type EditDecisionList, type EdlSegment } from './edl.js'
import { planEdit, type EditPlan } from './director.js'

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

// Burn a subtle TwinAI wordmark, bottom-centre, as an ISOLATED single pass over an
// already-finished render. Deliberately separate from the main edit filtergraph so it
// can never break a paid render. Fail-safe: on any error (no font, ffmpeg quirk) we
// return the original CLEAN file — a free user occasionally getting a clean export is
// far better than a failed/empty render.
const WM_FONTS = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
]
export async function applyWatermark(inFile: string): Promise<string> {
  try {
    let FONT = ''
    for (const f of WM_FONTS) { if ((await fileSize(f)) > 0) { FONT = f; break } }
    if (!FONT) return inFile
    const out = join(tmpdir(), `twinai-wm-${Date.now()}.mp4`)
    const vf = `drawtext=fontfile=${FONT}:text='TwinAI':fontcolor=white@0.5:fontsize=h/24:x=(w-text_w)/2:y=h-(h/9):shadowcolor=black@0.6:shadowx=2:shadowy=2`
    await run('ffmpeg', ['-y', '-i', inFile, '-vf', vf, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out], 300_000)
    if ((await fileSize(out)) > 2048) return out
    return inFile
  } catch (e) {
    console.error('[watermark] failed, shipping clean render:', e)
    return inFile
  }
}

// Burn a brand logo (PNG) into the top-right corner. Discrete final pass that
// FAIL-OPENS to the clean render on any error — exactly like applyWatermark — so a
// logo problem can never break a paying customer's export.
export async function applyLogo(inFile: string, logoFile: string): Promise<string> {
  try {
    if ((await fileSize(logoFile)) < 64) return inFile
    const out = join(tmpdir(), `twinai-logo-${Date.now()}.mp4`)
    // Scale the logo to ~120px tall, place it 36px from the top-right.
    const fc = '[1:v]scale=-1:120[lg];[0:v][lg]overlay=W-w-36:36:format=auto'
    await run('ffmpeg', ['-y', '-i', inFile, '-i', logoFile, '-filter_complex', fc, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out], 300_000)
    if ((await fileSize(out)) > 2048) return out
    return inFile
  } catch (e) {
    console.error('[logo] failed, shipping render without logo:', e)
    return inFile
  }
}

export interface EditResult {
  outFile: string
  durationSec: number
  words: number
  jumpCut: boolean
  broll: boolean
  thumbFile?: string | null // generated cover image, when coverText is provided
  edl: EditDecisionList // structured record of every edit decision (for the manual editor)
  // Caption-free, graded base clip (cut + grade + audio) for the Revideo premium
  // pass to draw its animated captions over. Only when opts.produceRevideoBase.
  baseRevideoFile?: string | null
}

export interface EditOptions {
  captions?: boolean // default true; skip when the source is already captioned
  energy?: 'high' | 'calm' // 'high' → jump-zoom punches on cuts; 'calm' → clean cuts
  variation?: number // remake index → different caption highlight color
  captionStyle?: string // brand-kit default caption preset; loses to an explicit Refine choice
  brollText?: string // blueprint text (hook/script/captions) to source b-roll keywords from
  coverText?: string // hook/cover line to overlay on the generated thumbnail
  // Manual re-render: when present, autoEdit renders FROM this (creator-edited)
  // Edit Decision List instead of re-detecting cuts / re-transcribing. This is the
  // bridge that makes the manual Refine panel flow back through this same renderer.
  edl?: EditDecisionList
  // Also emit a caption-free graded base clip (the Revideo premium pass draws its
  // captions over it). Set by the job handler when a Revideo service is configured.
  produceRevideoBase?: boolean
  // Live progress callback so the UI can show the REAL stage (never a stale
  // "Editing…" screen). pct is 0-100; label is human copy.
  onProgress?: (phase: string, pct: number, label: string) => void
}

// Wrap text to at most `maxLines` lines of ~`width` chars (word-aware) for the
// cover overlay. Excess is dropped with an ellipsis so the cover never overflows.
function wrapText(s: string, width: number, maxLines: number): string {
  const words = s.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width && line) {
      lines.push(line)
      line = w
      if (lines.length === maxLines) break
    } else {
      line = (line + ' ' + w).trim()
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines.slice(0, maxLines).join('\n')
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

// Color emoji can't be rendered by libass (it only draws monochrome glyph
// outlines), so we burn them as Twemoji PNG overlays instead. Compute up to `max`
// emoji moments from the same 3-word caption grouping, evenly spaced so they
// punctuate the video rather than clutter every line.
function emojiMoments(words: Word[], max = 6): { emoji: string; start: number; end: number }[] {
  const lines: Word[][] = []
  let cur: Word[] = []
  for (const w of words) {
    cur.push(w)
    if (cur.length >= 3 || /[.!?]$/.test(w.w)) { lines.push(cur); cur = [] }
  }
  if (cur.length) lines.push(cur)
  const all: { emoji: string; start: number; end: number }[] = []
  for (const line of lines) {
    const e = emojiFor(line)
    if (!e) continue
    const start = line[0].start
    const end = line[line.length - 1].end + 0.2
    if (end > start) all.push({ emoji: e, start, end })
  }
  if (all.length <= max) return all
  const step = all.length / max
  return Array.from({ length: max }, (_, i) => all[Math.floor(i * step)])
}

// Emoji char → Twemoji asset codepoint (lowercase hex, FE0F variation selector
// stripped, joined by '-'), matching Twemoji's 72x72 PNG filenames.
function twemojiCode(emoji: string): string {
  const cps: string[] = []
  for (const ch of emoji) {
    const cp = ch.codePointAt(0)
    if (cp == null || cp === 0xfe0f) continue
    cps.push(cp.toString(16))
  }
  return cps.join('-')
}

// Download a Twemoji PNG for an emoji into dir (best-effort). Returns the local
// filename (relative to dir) or null; any failure means that emoji is skipped.
async function fetchEmojiPng(emoji: string, dir: string): Promise<string | null> {
  try {
    const code = twemojiCode(emoji)
    if (!code) return null
    const name = `em_${code}.png`
    const dest = join(dir, name)
    if ((await fileSize(dest)) > 0) return name // already fetched (dedup)
    const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength < 256) return null
    await writeFile(dest, buf)
    return name
  } catch {
    return null
  }
}

// Single-layer captions: 3-word groups, the active word pops (amber + animated
// scale), optional emoji. One Dialogue per word window so exactly ONE caption
// shows at a time (no overlap).
// Caption style presets → the ASS Style line (size, box vs outline, position).
// These are the creator-facing "caption style" options in the Refine panel; the
// highlight COLOR is the separate `variation` (POP_PALETTE). Names are stable so
// they map 1:1 to the EDL's captions.style.
// Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour,
//   Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
// Fonts are bundled in the image (Anton = impact, Poppins = clean). Heavy outline
// (5-6) + a soft drop shadow gives the modern "designed" caption depth.
const CAP_STYLES: Record<string, string> = {
  // big impact face, center-low, thick outline + shadow (default)
  'bold-pop': 'Style: Cap, Anton, 100, &HFFFFFF&, &H00000000&, &H64000000&, 0, 0, 1, 5, 3, 2, 80, 80, 600, 1',
  // clean modern lower-third, lighter weight feel
  'clean-lower': 'Style: Cap, Poppins, 64, &HFFFFFF&, &H00000000&, &H78000000&, 1, 0, 1, 4, 2, 2, 110, 110, 380, 1',
  // opaque rounded box behind the words (BorderStyle 3)
  'boxed': 'Style: Cap, Poppins, 70, &HFFFFFF&, &H00000000&, &HB4000000&, 1, 0, 3, 8, 0, 2, 100, 100, 560, 1',
  // big impact captions pinned near the top
  'top': 'Style: Cap, Anton, 90, &HFFFFFF&, &H00000000&, &H64000000&, 0, 0, 1, 5, 3, 8, 80, 80, 320, 1',
  // extra-large thick-outline word-by-word pop
  'karaoke-word': 'Style: Cap, Anton, 112, &HFFFFFF&, &H00000000&, &H64000000&, 0, 0, 1, 6, 2, 2, 80, 80, 580, 1',
}
export const CAPTION_STYLES = Object.keys(CAP_STYLES)

// Single-layer captions: 3-word groups, the active word pops (color + animated
// scale), optional emoji. One Dialogue per word window so exactly ONE caption
// shows at a time (no overlap). `style` picks the preset; `variation` the color.
function buildAss(words: Word[], variation = 0, style = 'bold-pop'): string {
  const POP = POP_PALETTE[((variation % POP_PALETTE.length) + POP_PALETTE.length) % POP_PALETTE.length]
  const styleLine = CAP_STYLES[style] ?? CAP_STYLES['bold-pop']
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const esc = (w: string) => w.replace(/[{}\\]/g, '').trim()

  // Group into lines of up to 3 words; break early on sentence punctuation OR a
  // natural pause (comma/semicolon/colon) so captions phrase the way people speak.
  const lines: Word[][] = []
  let cur: Word[] = []
  for (const w of words) {
    cur.push(w)
    if (cur.length >= 3 || /[.!?,;:]$/.test(w.w)) {
      lines.push(cur)
      cur = []
    }
  }
  if (cur.length) lines.push(cur)

  const events: string[] = []
  for (const line of lines) {
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
            // active word: highlight color + a punchy scale "pop" — overshoot to
            // 130% then settle to 118% so it feels springy, not linear.
            ? `{\\c${POP}\\fscx100\\fscy100\\t(0,80,\\fscx130\\fscy130)\\t(80,150,\\fscx118\\fscy118)}${esc(w.w)}{\\r}`
            : esc(w.w),
        )
        .join(' ')
      // Emojis are burned as color PNG overlays (see emojiMoments), not in the
      // caption text, because libass can't render color emoji.
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
async function jumpCutSilence(base: string, outFile: string, energy: 'high' | 'calm' = 'calm', extraRemove: [number, number][] = []): Promise<{ applied: boolean; segments: EdlSegment[] }> {
  const NOCUT = { applied: false, segments: [] as EdlSegment[] }
  const duration = await probeDuration(base)
  if (duration < 3) return NOCUT // too short to bother

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
  if (!starts.length && !extraRemove.length) return NOCUT

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
  if (!sil.length) return NOCUT

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
  if (segs.length < 2 || segs.length > 200) return NOCUT
  const kept = segs.reduce((a, [s, e]) => a + (e - s), 0)
  if (kept >= duration - 0.4) return NOCUT // <0.4s removed — not worth a re-encode

  // The kept windows ARE the cut decisions; carry the per-segment zoom punch on
  // 'high' energy, then render. renderCutSegments is shared with the manual
  // re-render path so an edited EDL produces the same kind of cut.
  const segments: EdlSegment[] = segs.map(([s, e], i) => ({
    start: s, end: e, zoom: energy === 'high' && i % 2 === 1,
  }))
  const ok = await renderCutSegments(base, outFile, segments)
  return ok ? { applied: true, segments } : NOCUT
}

// Render a list of kept windows (EDL segments) from `base` into `outFile`: trim
// each window for v+a, normalize to 1080x1920 (+8% jump-zoom on segments flagged
// `zoom`), 25ms audio fades at each seam to kill the splice click, then concat.
// Shared by the auto jump-cut and the manual EDL re-render.
async function renderCutSegments(base: string, outFile: string, segments: EdlSegment[]): Promise<boolean> {
  if (segments.length < 1) return false
  const duration = await probeDuration(base)
  const norm = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
  const punch = 'scale=1166:2074:force_original_aspect_ratio=increase,crop=1080:1920'
  const FADE = 0.025
  const parts: string[] = []
  segments.forEach((seg, i) => {
    const s = seg.start
    const e = seg.end
    const vf = seg.zoom ? punch : norm
    parts.push(`[0:v]trim=${s.toFixed(3)}:${e.toFixed(3)},setpts=PTS-STARTPTS,${vf}[v${i}]`)
    const segDur = e - s
    const fade =
      segDur > FADE * 2 + 0.02
        ? `,afade=t=in:st=0:d=${FADE},afade=t=out:st=${(segDur - FADE).toFixed(3)}:d=${FADE}`
        : ''
    parts.push(`[0:a]atrim=${s.toFixed(3)}:${e.toFixed(3)},asetpts=PTS-STARTPTS${fade}[a${i}]`)
  })
  const concatIn = segments.map((_, i) => `[v${i}][a${i}]`).join('')
  const filter = `${parts.join(';')};${concatIn}concat=n=${segments.length}:v=1:a=1[v][a]`
  await run(
    'ffmpeg',
    ['-y', '-i', base, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
     // crf 16 (near-visually-lossless) on the intermediate cut so the FINAL crf-20
     // encode is the only meaningful compression — kills the double-compression
     // mush that made cut clips look soft.
     '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'aac', outFile],
    Math.max(240_000, (duration || 30) * 3000),
  )
  return (await fileSize(outFile)) > 1024
}

export async function autoEdit(takeFile: string, opts: EditOptions = {}): Promise<EditResult> {
  const captions = opts.captions !== false
  const prog = (phase: string, pct: number, label: string) => { try { opts.onProgress?.(phase, pct, label) } catch { /* progress is best-effort */ } }
  prog('starting', 5, 'Warming up the editor…')
  const dir = await mkdtemp(join(tmpdir(), 'twinai-edit-'))
  const cut = join(dir, 'cut.mp4')
  const audio = join(dir, 'a.wav')
  const assRel = 'captions.ass'
  const ass = join(dir, assRel)
  const transcript = join(dir, 't.json')
  const out = join(dir, 'out.mp4')
  try {
    const edl = opts.edl // present → manual re-render from edited decisions

    // 0. Detect disfluencies on the ORIGINAL so fillers + stammers get cut along
    //    with silence in the same pass. Best-effort: if it fails we fall back to
    //    silence-only cuts (unchanged behavior). Skipped entirely on re-render —
    //    the EDL already carries the (possibly creator-edited) cut decisions.
    let removeSpans: [number, number][] = []
    if (!edl) try {
      const a0 = join(dir, 'a0.wav')
      const t0 = join(dir, 't0.json')
      await run('ffmpeg', ['-y', '-i', takeFile, '-vn', '-ac', '1', '-ar', '16000', a0], 120_000)
      await run(
        'python3',
        [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
         '--audio', a0, '--out', t0,
         '--model', env.whisperFillerModel, '--device', env.whisperDevice,
         '--language', env.whisperLanguage, '--beam-size', '1',
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
    prog('cutting', 22, edl ? 'Applying your edits…' : 'Tightening the cuts…')
    let jumpCut = false
    let cutSegments: EdlSegment[] = []
    if (edl) {
      // Re-render: apply the EDL's (possibly edited) cut windows directly. A single
      // full-length segment means "no cut" → render the original take untouched.
      const segs = edl.segments.filter((s) => s.end > s.start)
      const full = segs.length <= 1 && (!segs[0] || (segs[0].start <= 0.05 && segs[0].end >= (edl.durationSec - 0.05)))
      if (segs.length && !full) {
        try { jumpCut = await renderCutSegments(takeFile, cut, segs); if (jumpCut) cutSegments = segs } catch { jumpCut = false }
      }
    } else {
      try {
        const jc = await jumpCutSilence(takeFile, cut, opts.energy ?? 'calm', removeSpans)
        jumpCut = jc.applied
        cutSegments = jc.segments
      } catch {
        jumpCut = false
      }
    }
    const base = jumpCut ? cut : takeFile

    // 2. Captions. On re-render we take the creator-edited words straight from the
    //    EDL; otherwise we transcribe the (tightened) audio so timing stays in sync.
    let words: Word[] = []
    let durationSec = 0
    let trSegments: { start: number; end: number; text: string }[] = []
    let trLanguage = 'en'
    if (edl) {
      words = (edl.captions.words ?? []).filter((w) => w.w && Number.isFinite(w.start) && Number.isFinite(w.end))
      durationSec = edl.durationSec ?? 0
    } else if (captions) {
      prog('transcribing', 42, 'Reading your words…')
      await run('ffmpeg', ['-y', '-i', base, '-vn', '-ac', '1', '-ar', '16000', audio], 120_000)
      await run(
        'python3',
        [join(import.meta.dirname, '..', 'whisper_transcribe.py'),
         '--audio', audio, '--out', transcript,
         '--model', env.whisperModel, '--device', env.whisperDevice,
         '--language', env.whisperLanguage, '--beam-size', '1',
         '--max-seconds', String(env.maxMediaSecs)],
        Math.max(180_000, env.maxMediaSecs * 1000),
      )
      const tr = JSON.parse(await readFile(transcript, 'utf8')) as { words: Word[]; duration_sec: number; segments?: { start: number; end: number; text: string }[]; language?: string }
      words = (tr.words ?? []).filter((w) => w.w && Number.isFinite(w.start) && Number.isFinite(w.end))
      durationSec = tr.duration_sec ?? 0
      trSegments = tr.segments ?? []
      trLanguage = tr.language ?? 'en'
    }
    const capVariation = edl?.captions.variation ?? opts.variation ?? 0

    // AI Edit Director: read the SCRIPT + transcript to place b-roll / emphasis /
    // transitions intelligently (grounded queries), instead of word-frequency
    // guessing. Best-effort — falls back to heuristics on any failure / no key.
    // On re-render we reuse the plan the creator already has in their EDL.
    let plan: EditPlan | null = edl?.plan ?? null
    if (!plan && !edl && words.length && env.geminiKey) {
      prog('directing', 58, 'Directing the edit…')
      plan = await planEdit(
        { language: trLanguage, duration_sec: durationSec, text: words.map((w) => w.w).join(' '), words, segments: trSegments },
        opts.brollText ?? '',
      )
    }

    // Caption style: the creator's choice (EDL) wins; else the Director's pick; else default.
    // Priority: a per-video Refine choice (edl) > the workspace brand kit > the
    // Director's AI pick > default. So a brand kit themes every new edit, but the
    // creator can still override one video in Refine.
    const captionStyle = edl?.captions.style ?? opts.captionStyle ?? plan?.caption_style ?? 'bold-pop'
    await writeFile(ass, words.length ? buildAss(words, capVariation, captionStyle) : '[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n[Events]\n')

    // 2b. Optional b-roll cutaway (best-effort, only if PEXELS_API_KEY is set and
    //     the clip is long enough to spare a 2s window after the hook).
    let broll: Broll | null = null
    if (edl) {
      // Re-render: the EDL decides — re-fetch its (possibly swapped) query, or skip.
      if (edl.broll) {
        try { broll = await fetchBroll([edl.broll.query], dir) } catch { broll = null }
      }
    } else if (plan && plan.broll.length) {
      // Director-grounded b-roll: a literal query tied to what's actually said.
      try { broll = await fetchBroll([plan.broll[0].query], dir) } catch { broll = null }
    } else if (words.length && durationSec > 6) {
      try {
        // Fallback (no Director plan): keywords from the blueprint, else transcript.
        const kwSource = opts.brollText && opts.brollText.trim() ? opts.brollText : words.map((w) => w.w).join(' ')
        broll = await fetchBroll(pickKeywords(kwSource), dir)
      } catch {
        broll = null
      }
    }
    // Frame fill + a subtle cinematic grade: a touch more contrast & saturation
    // and a light sharpen so the footage reads "graded/pro", not flat phone video.
    const GRADE = 'eq=contrast=1.06:saturation=1.12:brightness=0.012,unsharp=5:5:0.45:3:3:0.0'
    const fill = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${GRADE}`
    const subs = captions && words.length ? `,subtitles=${assRel}` : ''
    const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', 'out.mp4']

    // Optional ducked MUSIC BED (env MUSIC_BED_URL): the connective tissue that
    // makes cut clips feel like ONE coherent video. It plays under the whole
    // timeline and ducks beneath the voice via sidechaincompress. Best-effort.
    let bedFile: string | null = null
    const wantMusic = edl ? edl.music : true // re-render honors the creator's music toggle
    if (wantMusic && env.musicBedUrl) {
      try { bedFile = await fetchMusicBed(env.musicBedUrl, dir) } catch { bedFile = null }
    }

    // B-roll cutaway SYNCED to when its keyword is actually spoken (not a fixed 2s),
    // and faded in/out so it does not pop.
    let brollStart = 2.0
    if (edl?.broll) {
      brollStart = edl.broll.start
    } else if (plan && plan.broll.length) {
      brollStart = Math.max(1.2, Math.min(plan.broll[0].at_sec, Math.max(1.2, durationSec - 3)))
    } else if (broll && words.length) {
      const q = broll.query.toLowerCase()
      const hit = words.find((w) => w.w.toLowerCase().replace(/[^a-z]/g, '').includes(q))
      if (hit) brollStart = Math.max(1.2, Math.min(hit.start, Math.max(1.2, durationSec - 3)))
    }
    const brollEnd = edl?.broll ? edl.broll.end : brollStart + 2.2

    // Color emoji overlays (best-effort): fetch a Twemoji PNG per emoji moment so
    // captions get the modern emoji punctuation. Any miss is just skipped.
    const emojiPlan = edl ? edl.emoji : (captions && words.length && env.editEmoji ? emojiMoments(words, 6) : [])
    const emojiSpans: { file: string; start: number; end: number }[] = []
    for (const m of emojiPlan) {
      const file = await fetchEmojiPng(m.emoji, dir)
      if (file) emojiSpans.push({ file, start: m.start, end: m.end })
    }

    // Inputs: 0 = base (video+voice), then b-roll, then bed, then emoji PNGs.
    const inputs: string[] = ['-i', base]
    let idx = 1
    let brollIdx = -1, bedIdx = -1
    if (broll) { inputs.push('-i', 'broll.mp4'); brollIdx = idx++ }
    if (bedFile) { inputs.push('-i', 'bed.mp3'); bedIdx = idx++ }
    const emojiBaseIdx = idx
    for (const e of emojiSpans) { inputs.push('-i', e.file); idx++ }

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
    // Captions (libass) first, then color-emoji PNG overlays on top, synced to
    // each caption moment and sitting just above the caption safe-zone.
    const capOut = emojiSpans.length ? 'vtx' : 'v'
    vparts.push(`[${vlast}]${subs ? `subtitles=${assRel}` : 'null'}[${capOut}]`)
    if (emojiSpans.length) {
      emojiSpans.forEach((_, i) => vparts.push(`[${emojiBaseIdx + i}:v]scale=104:-1[em${i}]`))
      let elast = 'vtx'
      emojiSpans.forEach((e, i) => {
        const out = i === emojiSpans.length - 1 ? 'v' : `eo${i}`
        vparts.push(`[${elast}][em${i}]overlay=x=(W-w)/2:y=H*0.60:enable='between(t,${e.start.toFixed(2)},${e.end.toFixed(2)})'[${out}]`)
        elast = out
      })
    }

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
    prog('rendering', 80, 'Rendering your video…')
    try {
      await run('ffmpeg', fullArgs, Math.max(240_000, env.maxMediaSecs * 2000), dir)
    } catch {
      await run('ffmpeg', plain, Math.max(240_000, env.maxMediaSecs * 2000), dir)
    }

    const finalBuf = await readFile(out)
    const keep = join(tmpdir(), `twinai-render-${Date.now()}.mp4`)
    await writeFile(keep, finalBuf)

    // Caption-free graded base for the Revideo premium pass: same cut + grade +
    // audio as the instant render, MINUS captions/emoji (Revideo draws its own
    // premium animated captions). Best-effort — if it fails, the premium pass just
    // doesn't run and the ffmpeg result stands.
    let baseRevideoFile: string | null = null
    if (opts.produceRevideoBase && words.length) {
      try {
        const br = join(tmpdir(), `twinai-base-${Date.now()}.mp4`)
        // GRADE is part of `fill`; -c:a aac re-muxes the (possibly bed-mixed) audio.
        await run('ffmpeg', ['-y', '-i', base, '-vf', fill, '-c:v', 'libx264', '-preset', 'veryfast',
          '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', br],
          Math.max(180_000, env.maxMediaSecs * 1500), dir)
        if ((await fileSize(br)) > 1024) baseRevideoFile = br
      } catch { baseRevideoFile = null }
    }

    // Cover thumbnail: a strong frame from the finished render + the hook overlaid
    // in brand style. Best-effort: failure (or no coverText) just means no cover.
    let thumbFile: string | null = null
    prog('finishing', 94, 'Adding the cover…')
    if (opts.coverText && opts.coverText.trim()) {
      try {
        const cover = wrapText(opts.coverText, 18, 3)
        await writeFile(join(dir, 'cover.txt'), cover)
        const at = Math.min(1.6, Math.max(0.4, (durationSec || 3) / 3))
        // Step 1: pull a clean, already-vertical frame from the finished render.
        // (out.mp4 is 1080x1920, so no rescale needed — keep this step trivial so
        // it can't fail on filter quirks.)
        await run('ffmpeg', ['-y', '-ss', at.toFixed(2), '-i', 'out.mp4', '-vframes', '1', '-q:v', '2', 'frame.jpg'], 60_000, dir)
        if ((await fileSize(join(dir, 'frame.jpg'))) <= 1024) throw new Error('cover frame extract produced no image')
        // Step 2: overlay the hook in brand style. Try a few font paths so a
        // missing DejaVu build doesn't sink the whole cover.
        const fonts = [
          '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
          '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
        ]
        let FONT = ''
        for (const f of fonts) { if ((await fileSize(f)) > 0) { FONT = f; break } }
        if (FONT) {
          const vf = [
            'drawbox=x=0:y=ih*0.52:w=iw:h=ih*0.48:color=black@0.5:t=fill',
            'drawbox=x=84:y=ih*0.56:w=190:h=12:color=0x23A6F5:t=fill',
            `drawtext=fontfile=${FONT}:textfile=cover.txt:fontcolor=white:fontsize=78:line_spacing=16:x=(w-text_w)/2:y=h*0.58:borderw=5:bordercolor=black@0.9:shadowcolor=black@0.7:shadowx=2:shadowy=2`,
          ].join(',')
          try {
            await run('ffmpeg', ['-y', '-i', 'frame.jpg', '-vf', vf, '-q:v', '3', 'thumb.jpg'], 60_000, dir)
          } catch (e) {
            console.error('[autoedit] cover overlay failed, using plain frame:', e)
          }
        } else {
          console.error('[autoedit] no usable font for cover overlay, using plain frame')
        }
        // Prefer the overlaid cover; fall back to the plain frame so we always get
        // a thumbnail when a frame extracted.
        const finalThumb = (await fileSize(join(dir, 'thumb.jpg'))) > 1024 ? 'thumb.jpg' : 'frame.jpg'
        thumbFile = join(tmpdir(), `twinai-thumb-${Date.now()}.jpg`)
        await writeFile(thumbFile, await readFile(join(dir, finalThumb)))
      } catch (e) {
        console.error('[autoedit] cover thumbnail failed:', e)
        thumbFile = null
      }
    }

    // Emit the Edit Decision List: the structured record of every choice above,
    // so the manual editor (the 20% human layer) can load, tweak, and re-render
    // deterministically through this same path. When no jump-cut fired, the whole
    // take is one segment.
    const outEdl = buildEdl({
      energy: edl?.energy ?? opts.energy ?? 'calm',
      variation: capVariation,
      segments: cutSegments.length ? cutSegments : [{ start: 0, end: durationSec || 0 }],
      words,
      emoji: emojiPlan,
      broll: broll ? { query: broll.query, start: brollStart, end: brollEnd } : null,
      music: !!bedFile,
      durationSec,
      plan: plan ?? undefined,
      captionStyle,
    })

    return { outFile: keep, durationSec, words: words.length, jumpCut, broll: !!broll, thumbFile, edl: outEdl, baseRevideoFile }
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

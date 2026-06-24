import { writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { env } from './env.js'

// Optional b-roll: when PEXELS_API_KEY is set, we pick a content keyword from the
// transcript and pull ONE short vertical stock clip to use as a cutaway. Entirely
// best-effort — any failure (no key, no match, download error) returns null and
// the edit proceeds without b-roll.

const STOPWORDS = new Set(
  ('a an the and or but if then this that these those i you he she it we they me him her us them my your his its our their is am are was were be been being do does did have has had will would can could should of to in on at for with from by as so just like really very about into out up down not no yes get got go going know think want need make made say said one two three what when where why how who all some any more most ' +
   // abstract words that produce generic, cheesy stock and never a clear visual
   'thing things stuff people person someone everyone something anything nothing really actually basically literally honestly maybe always never ever every always today tomorrow yesterday everything moment moments idea ideas point points reason reasons number numbers level levels best better great good better amazing awesome thanks please right wrong true truth fact facts kind sort type lots tons bunch okay yeah gonna wanna gotta because however therefore meaning matter')
    .split(/\s+/),
)

// Concrete, filmable concepts: when a transcript/blueprint keyword is one of (or
// contains) these, b-roll is likely to look intentional rather than random. We
// ONLY pull b-roll for confident, visual matches — that kills the "silly" generic
// cutaways. Categories cover the common creator niches.
const VISUAL = new Set(
  ('money cash dollar dollars coins wallet bank invest stocks chart charts graph trading ' +
   'gym workout fitness weights dumbbell barbell running run treadmill yoga stretch muscle ' +
   'food cooking kitchen recipe chef coffee restaurant meal pasta pizza burger fruit vegetables ' +
   'phone laptop computer screen keyboard desk office meeting team startup whiteboard code coding ' +
   'city street traffic car cars driving travel airport plane beach ocean mountain forest sunset sunrise nature ' +
   'camera lights studio microphone podcast filming editing timeline ' +
   'book books reading study student school classroom library notebook pen ' +
   'shop shopping store product products package delivery box ' +
   'dog cat pet baby family home house apartment plant plants ' +
   'clock time calendar schedule deadline ' +
   // beauty / fashion
   'skincare skin makeup lipstick mascara mirror salon hair haircut nails ' +
   'fashion outfit clothes shoes sneakers dress shirt jacket closet jewelry ' +
   // music / art / hobbies
   'guitar piano drums vinyl headphones paint brush canvas drawing pottery ' +
   'garden flowers soil watering candle journal meditation breathing ' +
   // sport
   'soccer basketball football tennis golf swimming bike cycling boxing skate ' +
   // health / home
   'doctor medicine pills vitamins supplement water hydration sleep bed couch ' +
   'keys door window bedroom bathroom shower mirror ' +
   // business visuals
   'presentation growth arrow handshake contract sign signature email notification')
    .split(/\s+/),
)

function isVisual(word: string): boolean {
  if (VISUAL.has(word)) return true
  for (const v of VISUAL) if (word.length > 4 && (word.includes(v) || v.includes(word))) return true
  return false
}

// Pick up to N CONCRETE, visualizable keywords. We require a visual match so
// b-roll only fires when it will look intentional; if nothing concrete is found
// we return [] and the edit renders cleanly with no cutaway.
export function pickKeywords(text: string, n = 2): string[] {
  const freq = new Map<string, number>()
  for (const raw of (text ?? '').toLowerCase().split(/[^a-z]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue
    freq.set(raw, (freq.get(raw) ?? 0) + 1)
  }
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
  // Only keep concrete/visual words — this is the gate that stops silly b-roll.
  return ranked.filter(([w]) => isVisual(w)).slice(0, n).map(([w]) => w)
}

export interface Broll {
  file: string
  query: string
}

// CLIP-rank candidate thumbnails against the spoken line so the cutaway actually
// MATCHES what's being said, instead of keyword-roulette. Spawns clip_rank.py;
// returns the best candidate index, or -1 on any failure (caller falls back).
function clipPick(query: string, imageUrls: string[]): Promise<number> {
  return new Promise((resolve) => {
    try {
      const py = spawn('python3', [join(import.meta.dirname, '..', 'clip_rank.py'), query], { stdio: ['pipe', 'pipe', 'ignore'] })
      let out = ''
      const timer = setTimeout(() => { try { py.kill() } catch { /* */ } resolve(-1) }, 30_000)
      py.stdout.on('data', (d) => { out += d })
      py.on('close', () => { clearTimeout(timer); const n = parseInt(out.trim(), 10); resolve(Number.isFinite(n) ? n : -1) })
      py.on('error', () => { clearTimeout(timer); resolve(-1) })
      py.stdin.on('error', () => { /* broken pipe if py died early */ })
      py.stdin.write(imageUrls.join('\n')); py.stdin.end()
    } catch { resolve(-1) }
  })
}

// Returns a downloaded vertical stock clip best-matching the spoken line, or null.
// `clipText` (the line / Director reason) drives the CLIP visual match; `keywords`
// are the Pexels search terms. Entirely best-effort — fail-open at every step.
export async function fetchBroll(keywords: string[], dir: string, clipText?: string): Promise<Broll | null> {
  const key = env.pexelsKey
  if (!key) return null
  // Cap a b-roll clip at 60 MB: a cutaway is a few seconds, so anything larger is
  // a mis-pick we don't want to pull into the single worker's memory.
  const BROLL_CAP = 60 * 1024 * 1024
  type Cand = { query: string; image?: string; link: string }
  const cands: Cand[] = []
  for (const q of keywords) {
    try {
      const res = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=small&per_page=6`,
        { headers: { Authorization: key }, signal: AbortSignal.timeout(10_000) },
      )
      if (!res.ok) continue
      const data = (await res.json()) as {
        videos?: { image?: string; video_files?: { file_type?: string; width?: number; link?: string }[] }[]
      }
      for (const v of data.videos ?? []) {
        const mp4s = (v.video_files ?? []).filter((f) => f.file_type === 'video/mp4' && f.link)
        // smallest portrait mp4 keeps the download + decode cheap
        const pick = mp4s.sort((a, b) => (a.width ?? 9999) - (b.width ?? 9999))[0]
        if (pick?.link) cands.push({ query: q, image: v.image, link: pick.link })
      }
    } catch {
      /* try next keyword */
    }
    if (cands.length >= 8) break
  }
  if (!cands.length) return null

  // Rank: pick the candidate whose THUMBNAIL best matches the line. Fail-open — if
  // CLIP is unavailable or errors, we keep the original (smallest-first) order.
  let order = [...cands.keys()]
  const withImg = cands.map((c, i) => ({ i, image: c.image })).filter((c) => !!c.image)
  if (withImg.length > 1) {
    const q = (clipText && clipText.trim()) || cands[0].query
    const best = await clipPick(q, withImg.map((c) => c.image as string))
    if (best >= 0 && best < withImg.length) {
      const winner = withImg[best].i
      order = [winner, ...order.filter((i) => i !== winner)]
    }
  }

  // Download in ranked order; first clip that fits the cap wins.
  for (const i of order) {
    const c = cands[i]
    try {
      const vr = await fetch(c.link, { signal: AbortSignal.timeout(20_000) })
      if (!vr.ok) continue
      if (Number(vr.headers.get('content-length') ?? '0') > BROLL_CAP) continue
      const buf = Buffer.from(await vr.arrayBuffer())
      if (buf.byteLength > BROLL_CAP) continue
      const out = join(dir, 'broll.mp4')
      await writeFile(out, buf)
      return { file: out, query: c.query }
    } catch {
      /* next candidate */
    }
  }
  return null
}

// Download the configured royalty-free music bed (MUSIC_BED_URL) once per render
// into dir/bed.mp3. Best-effort: any failure returns null and the edit renders
// without a bed. The URL must point to a track you have the rights to use.
export async function fetchMusicBed(url: string, dir: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength < 2048) return null // not a real audio file
    const out = join(dir, 'bed.mp3')
    await writeFile(out, buf)
    return out
  } catch {
    return null
  }
}

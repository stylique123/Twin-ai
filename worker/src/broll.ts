import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from './env.js'

// Optional b-roll: when PEXELS_API_KEY is set, we pick a content keyword from the
// transcript and pull ONE short vertical stock clip to use as a cutaway. Entirely
// best-effort — any failure (no key, no match, download error) returns null and
// the edit proceeds without b-roll.

const STOPWORDS = new Set(
  ('a an the and or but if then this that these those i you he she it we they me him her us them my your his its our their is am are was were be been being do does did have has had will would can could should of to in on at for with from by as so just like really very about into out up down not no yes get got go going know think want need make made say said one two three what when where why how who all some any more most' )
    .split(/\s+/),
)

// Pick up to N content keywords (longest, non-stopword, alphabetic) by frequency.
export function pickKeywords(text: string, n = 4): string[] {
  const freq = new Map<string, number>()
  for (const raw of (text ?? '').toLowerCase().split(/[^a-z]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue
    freq.set(raw, (freq.get(raw) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, n)
    .map(([w]) => w)
}

export interface Broll {
  file: string
  query: string
}

// Returns a downloaded vertical stock clip for the best-matching keyword, or null.
export async function fetchBroll(keywords: string[], dir: string): Promise<Broll | null> {
  const key = env.pexelsKey
  if (!key) return null
  for (const q of keywords) {
    try {
      const res = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=small&per_page=3`,
        { headers: { Authorization: key } },
      )
      if (!res.ok) continue
      const data = (await res.json()) as {
        videos?: { video_files?: { file_type?: string; width?: number; link?: string }[] }[]
      }
      for (const v of data.videos ?? []) {
        const mp4s = (v.video_files ?? []).filter((f) => f.file_type === 'video/mp4' && f.link)
        // smallest portrait mp4 keeps the download + decode cheap
        const pick = mp4s.sort((a, b) => (a.width ?? 9999) - (b.width ?? 9999))[0]
        if (!pick?.link) continue
        const vr = await fetch(pick.link)
        if (!vr.ok) continue
        const out = join(dir, 'broll.mp4')
        await writeFile(out, Buffer.from(await vr.arrayBuffer()))
        return { file: out, query: q }
      }
    } catch {
      /* try next keyword */
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

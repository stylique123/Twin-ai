// CHOOSING THE 300–500 THAT DECIDE WHETHER THE SCHEMA SURVIVES.
//
// ⚠️ A RANDOM SAMPLE OF THIS LIBRARY IS 76% TIKTOK AND TELLS YOU ALMOST NOTHING
// ABOUT THE EXPENSIVE HALF. Measured on production: 3,210 distinct TikTok URLs,
// 733 YouTube, 268 Instagram. The YouTube rows are long-form `watch?v=` videos
// whose transcripts are one to two orders of magnitude larger than a 30-second
// TikTok, so they dominate both the cost and the risk — and a sample drawn by
// luck would contain a handful of them.
//
// ⚖️ SO THE SAMPLE IS STRATIFIED AND THE STRATA ARE DELIBERATE: platform first,
// then niche within it. The pilot's whole job is to find the places the schema
// does not fit, and those live at the edges — the 40-minute podcast whose
// "container" is nothing the gallery can sell, not the fourth skincare listicle.
//
// ── DETERMINISTIC, AND NOT BECAUSE RANDOMNESS IS UNAVAILABLE ──────────────
//
// ⚠️ A PILOT YOU CANNOT RE-DRAW IS A PILOT YOU CANNOT ARGUE WITH. When the
// results come back and somebody asks "was that container rate a property of the
// library or of the sample", the only useful answer re-runs the same selection
// after a schema change and compares. So selection is a pure function of the
// rows and the size — same inputs, same 400 URLs, forever.

/** The fields selection actually needs. Deliberately not the whole row: a
 *  sampler that took `GalleryItem` would have to be updated every time an
 *  unrelated column moved. */
export interface SampleCandidate {
  url: string
  platform: string
  niche: string
}

export interface SampleReport {
  /** The chosen URLs, in a stable order. */
  urls: readonly string[]
  /** How many were taken from each platform, so the caller can SEE the shape of
   *  what it is about to spend on rather than trusting that it worked. */
  byPlatform: Readonly<Record<string, number>>
  nichesCovered: number
  /** ⚠️ NAMED, NOT SILENTLY DROPPED. A stratum too small to reach its quota
   *  means the sample is not what was asked for, and a caller that never hears
   *  about it will read the results as representative anyway. */
  shortfalls: readonly { platform: string; wanted: number; got: number }[]
  /** Rows excluded before selection, and why. */
  excluded: Readonly<Record<string, number>>
}

/**
 * ⚠️ NOT EVERY URL IN THE GALLERY IS A VIDEO. 689 of the 692 Instagram rows are
 * `instagram.com/explore/tags/…` hashtag pages — no video, no transcript, and
 * on 689 of them no title or blurb either. Sampling them would spend real calls
 * to discover they cannot be read, and would then report the failure as a
 * property of the schema.
 *
 * ⚖️ THIS EXCLUDES THEM FROM THE PILOT; IT DOES NOT DELETE THEM. They are live
 * public rows and removing them is a separate, irreversible decision that
 * belongs to their owner, not to a sampler.
 */
export function isTranscribable(c: SampleCandidate): boolean {
  const u = c.url.toLowerCase()
  if (u.includes('/explore/tags/')) return false
  if (u.includes('/explore/')) return false
  return /^https?:\/\//.test(u)
}

/**
 * A stable 32-bit hash, used only for ordering.
 *
 * ⚖️ FNV-1a BECAUSE IT IS SHORT AND DETERMINISTIC ACROSS RUNTIMES. Nothing here
 * is security-sensitive; the requirement is that the same URL sorts to the same
 * place in a year's time, which `Math.random` and `Date.now` cannot promise —
 * and which is why neither appears in this file.
 */
export function stableOrder(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * Draw a stratified pilot sample.
 *
 * Platforms get a floor so the small-but-expensive ones cannot be rounded away,
 * then the remainder is allocated in proportion to what exists. Within a
 * platform, niches are visited round-robin so one enormous niche cannot eat the
 * whole quota.
 */
export function pilotSample(
  candidates: readonly SampleCandidate[],
  size: number,
  opts: { minPerPlatform?: number } = {},
): SampleReport {
  const minPerPlatform = opts.minPerPlatform ?? 25
  const excluded: Record<string, number> = {}

  // Distinct URLs only. The library stores one row per niche placement — 9,504
  // rows over 4,211 URLs — and enriching a video twice buys nothing.
  const seen = new Set<string>()
  const usable: SampleCandidate[] = []
  for (const c of candidates) {
    if (!isTranscribable(c)) {
      excluded.not_a_video = (excluded.not_a_video ?? 0) + 1
      continue
    }
    if (seen.has(c.url)) {
      excluded.duplicate_url = (excluded.duplicate_url ?? 0) + 1
      continue
    }
    seen.add(c.url)
    usable.push(c)
  }

  const byPlatformRows = new Map<string, SampleCandidate[]>()
  for (const c of usable) {
    const list = byPlatformRows.get(c.platform) ?? []
    list.push(c)
    byPlatformRows.set(c.platform, list)
  }

  const platforms = [...byPlatformRows.keys()].sort()
  const total = usable.length
  const quotas = new Map<string, number>()
  let allocated = 0
  for (const p of platforms) {
    const available = byPlatformRows.get(p)!.length
    const proportional = total === 0 ? 0 : Math.round((available / total) * size)
    const want = Math.min(available, Math.max(minPerPlatform, proportional))
    quotas.set(p, want)
    allocated += want
  }
  // Trim proportionally if the floors overshot, largest stratum first so the
  // small expensive ones keep their representation.
  if (allocated > size) {
    for (const p of [...platforms].sort(
      (a, b) => quotas.get(b)! - quotas.get(a)! || a.localeCompare(b))) {
      if (allocated <= size) break
      const canGive = Math.max(0, quotas.get(p)! - minPerPlatform)
      const give = Math.min(canGive, allocated - size)
      quotas.set(p, quotas.get(p)! - give)
      allocated -= give
    }
  }

  const urls: string[] = []
  const byPlatform: Record<string, number> = {}
  const shortfalls: { platform: string; wanted: number; got: number }[] = []

  for (const p of platforms) {
    const want = quotas.get(p)!
    const rows = byPlatformRows.get(p)!

    // Round-robin across niches, each niche internally in stable-hash order.
    const byNiche = new Map<string, SampleCandidate[]>()
    for (const c of rows) {
      const list = byNiche.get(c.niche) ?? []
      list.push(c)
      byNiche.set(c.niche, list)
    }
    const niches = [...byNiche.keys()].sort()
    for (const n of niches) {
      byNiche.get(n)!.sort((a, b) => stableOrder(a.url) - stableOrder(b.url)
        || a.url.localeCompare(b.url))
    }

    const taken: string[] = []
    let round = 0
    while (taken.length < want) {
      let addedThisRound = 0
      for (const n of niches) {
        if (taken.length >= want) break
        const row = byNiche.get(n)![round]
        if (row) {
          taken.push(row.url)
          addedThisRound++
        }
      }
      if (addedThisRound === 0) break
      round++
    }

    urls.push(...taken)
    byPlatform[p] = taken.length
    if (taken.length < want) shortfalls.push({ platform: p, wanted: want, got: taken.length })
  }

  const chosen = new Set(urls)
  const nichesCovered = new Set(usable.filter((c) => chosen.has(c.url)).map((c) => c.niche)).size

  return { urls, byPlatform, nichesCovered, shortfalls, excluded }
}

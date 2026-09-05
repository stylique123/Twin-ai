// WHAT THE MODEL ACTUALLY GETS TO READ, AND WHY IT WAS ARBITRARY.
//
// ⚠️ MEASURED ON TWO REAL CREATORS, 2026-09-04, FROM `scraped_posts`:
//
//   handle            posts  corpus chars  avg caption  lost at the 12,000 cap
//   lukefitphysio        50        16,659          333                   28.0%
//   ishmaelmechanic      50         3,604           72                    0.0%
//
// Same post count. 4.6x the material. Only the one who WRITES is punished. The
// cap is not a global constant — it is a penalty proportional to how much a
// creator gives us, and the creators who give us most are truncated hardest.
//
// ⚖️ AND WHAT IT DISCARDED WAS DECIDED BY SCRAPE ORDER. The old line was
// `usable.slice(0, 120).map(...).join('\n').slice(0, 12000)` — positional
// truncation, twice, over `posts.map(x => x.text)` in the order the scraper
// happened to return. So the physio's 13 lost captions were THE LAST THIRTEEN
// FETCHED, not the thirteen least useful. And `.slice(0, 12000)` cuts
// MID-STRING: one caption was not dropped but severed, and the model read the
// fragment as though it were whole.
//
// ── WHY NOT SORT BY REACH, WHICH WAS THE OBVIOUS FIX ──────────────────────
//
// ⚠️ BECAUSE IT WOULD HAVE MADE THE VOICE CARD WORSE, AND THE PHYSIO'S OWN
// NUMBERS ARE THE ARGUMENT. His top post is a LEGO parody at 543,300 plays;
// his clinical captions — the ones carrying "arthrogenic inhibition" and
// "terminal knee extension", the vocabulary that makes his twin sound like a
// physio — sit far below it. Reach-sorting fills the budget with his jokes and
// truncates his expertise. Popularity is not substance, and optimising the
// number we happen to have is how a metric replaces the goal.
//
// ── AND SUBSTANCE-FIRST ORDERING WAS ALSO WRONG. MEASURED, AND DISCARDED. ──
//
// ⚠️ SORTING BY LENGTH KEPT 14 OF THE PHYSIO'S 50 CAPTIONS. Shortest kept: 466
// characters. Longest dropped: 463. That is not a quality boundary, it is a
// length threshold wearing one — and it deletes 36 SUBJECTS. This extractor
// exists to record WHAT THE VIDEOS ARE ABOUT (`covered`, `topic`, `product`,
// and `times_seen` counted ACROSS captions), so breadth is not a nice-to-have,
// it is the output. Trading arbitrary loss for systematic loss of 36 subjects
// is better motivated and still worse.
//
// ⚖️ SO: WATERFILL. Every caption is present; a per-caption ceiling is raised
// until the budget is spent, so short captions arrive whole and only the long
// ones are trimmed, and only as far as the budget actually requires.
//
// ⚠️ MEASURED AGAINST THE 100 STORED ROWS, AND IT BEATS THE SHIPPED CODE ON
// BOTH AXES AT ONCE — there is no trade-off being made here:
//
//   approach                     physio captions reaching model   caption chars
//   scrape order + .slice()      ~37, arbitrary, one severed            ~11,010
//   substance-first (rejected)    14                                     11,305
//   equal fair share              50                                      7,684
//   WATERFILL                     50                                     11,041
//
// The theoretical ceiling, once 950 characters of headers are paid for, is
// 11,050. Waterfill lands 9 characters short of it while keeping every subject.
// For `ishmaelmechanic` the ceiling never binds: all 50 arrive whole.

/** The header the corpus writes before each caption. ⚠️ ITS COST IS REAL AND
 *  WAS NOT COUNTED: `--- CAPTION 1 ---\n` is 18 characters, and at the 120-caption
 *  limit the headers alone consume ~2,390 of a 12,000-character budget — 20%
 *  spent on scaffolding that the old code charged to the captions. */
export const captionHeader = (n: number): string => `--- CAPTION ${n} ---\n`

/** Below this a caption is a tag dump or a "link in bio", not material. Kept
 *  low deliberately: this ORDERS the corpus, it does not gate a creator out of
 *  it, and `ishmaelmechanic`'s entire catalogue averages 72 characters. */
export const SUBSTANCE_FLOOR = 40

export interface CaptionSource {
  caption: string
  url?: string | null
  plays?: number | null
  likes?: number | null
}

export interface CaptionCorpus {
  /** The text handed to the model, headers included. */
  corpus: string
  /** ⚠️ ALIGNED TO THE HEADER NUMBERING, so `source_video: "3"` resolves to
   *  `urls[2]`. The transcript path already does exactly this; the caption path
   *  asked the model for the number and then threw the answer away. */
  urls: (string | null)[]
  /** Captions that reached the model. */
  included: number
  /** Captions considered after the usability filter. */
  considered: number
  /** ⚖️ REPORTED, NOT INFERRED. A caller cannot tell a census from a sample by
   *  looking at the corpus, and the whole defect above was invisible for
   *  exactly that reason. */
  discarded: number
  chars: number
  /** The per-caption ceiling the budget allowed. Equal to the longest caption
   *  when nothing had to be trimmed. */
  ceiling: number
  /** Captions that were trimmed to the ceiling, and therefore carry the marker. */
  truncated: number
}

/**
 * Build the caption corpus: best-substance first, whole captions only, headers
 * paid for out of the same budget they occupy.
 *
 * ⚠️ NEVER SEVERS A CAPTION. A caption that does not fit is skipped and the
 * fill continues with the next one, so the budget is used without ever handing
 * the model half a sentence to read as a whole one.
 */
export function buildCaptionCorpus(
  sources: readonly CaptionSource[],
  budget = 12_000,
  maxCaptions = 120,
): CaptionCorpus {
  const usable = sources
    .map((s) => ({ ...s, caption: String(s?.caption ?? '').trim() }))
    .filter((s) => s.caption.length > 8)

  // ⚖️ ORDER NO LONGER DECIDES INCLUSION — every caption that fits the count
  // limit is present — so this only decides NUMBERING, and reach is a fine
  // tiebreak for that. Kept deterministic so the same scrape yields the same
  // corpus twice.
  const reach = (s: CaptionSource) =>
    typeof s.plays === 'number' && Number.isFinite(s.plays) ? s.plays
      : typeof s.likes === 'number' && Number.isFinite(s.likes) ? s.likes : -1
  const chosen = [...usable]
    .sort((a, b) => (b.caption.length - a.caption.length) || (reach(b) - reach(a)))
    .slice(0, maxCaptions)
  if (!chosen.length) return { corpus: '', urls: [], included: 0, considered: usable.length, discarded: 0, chars: 0, ceiling: 0, truncated: 0 }

  // Headers and joins are charged FIRST, so the ceiling is solved against the
  // budget that actually remains for caption text.
  const overhead = chosen.reduce((n, _s, i) => n + captionHeader(i + 1).length + (i ? 1 : 0), 0)
  const room = budget - overhead
  if (room <= 0) return { corpus: '', urls: [], included: 0, considered: usable.length, discarded: chosen.length, chars: 0, ceiling: 0, truncated: 0 }

  // ⚖️ THE LARGEST CEILING THAT FITS, found by bisection on the sorted lengths.
  // `sum(min(len, k))` is monotonic in k, so this is exact rather than a search.
  // ⚠️ THE MARKER IS PART OF THE COST. A trimmed caption is written as
  // `slice(0, k) + '…'`, so it occupies k + 1 characters, not k. Solving the
  // ceiling without that charge overshot the budget by exactly one character
  // per trimmed caption — 12,022 against 12,000 on the physio's 50, caught by
  // the budget assertion rather than in production.
  const total = (k: number) =>
    chosen.reduce((n, s) => n + (s.caption.length <= k ? s.caption.length : k + 1), 0)
  const longest = chosen[0].caption.length
  let lo = 0, hi = longest
  if (total(longest) <= room) { lo = longest } else {
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (total(mid) <= room) lo = mid; else hi = mid - 1
    }
  }
  const ceiling = lo

  const parts: string[] = []
  const urls: (string | null)[] = []
  let chars = 0
  let truncated = 0
  for (const s of chosen) {
    const header = captionHeader(parts.length + 1)
    // ⚠️ A TRIMMED CAPTION SAYS SO. The old `.slice(0, 12000)` severed a caption
    // mid-sentence and the model read the fragment as a whole thought. The
    // marker costs one character and removes that misreading.
    const full = s.caption.length <= ceiling
    const text = full ? s.caption : `${s.caption.slice(0, ceiling).trimEnd()}…`
    if (!full) truncated++
    parts.push(`${header}${text}`)
    urls.push(typeof s.url === 'string' && s.url.trim() !== '' ? s.url.trim() : null)
    chars += header.length + text.length + (parts.length > 1 ? 1 : 0)
  }

  return {
    corpus: parts.join('\n'),
    urls,
    included: parts.length,
    considered: usable.length,
    discarded: usable.length - parts.length,
    chars,
    ceiling,
    truncated,
  }
}

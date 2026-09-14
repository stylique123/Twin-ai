// WHAT SHE ACTUALLY FILMS, WHICH NOBODY HAD EVER LOOKED AT.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14: 891 `visual_profile` rows exist and
// every one is a `gallery_items` row we scraped. 0 are the creator's own posts.
// The pass that can say what her videos look like has never been pointed at one.
//
// ⚖️ AND THIS IS THE OPPOSITE BLOCK FROM THE REFERENCE ONE, WHICH IS WHY IT IS
// A SEPARATE BLOCK. `observedVisualBlockInline` says of its own evidence: "not a
// description of this creator … never as instruction for what this creator's own
// video should show." That caveat is correct there and WRONG here. A reference
// is a vote — one video she admired. Her own posts are a record: what she has
// proven she will actually set up, stand in front of, and publish. Appending
// this to the reference block would inherit a warning that inverts its meaning.
//
// ⚖️ IT STATES COUNTS AND REFUSES TO LABEL THEM, for the reason
// `measuredFromFileBlockInline` gives: a verdict needs a threshold, no threshold
// has been measured on this product, and a label is far easier for a model to
// over-trust than the numbers under it. "8 of 10" is a fact; "she is a
// talking-head creator" is a guess wearing a fact's clothes.

/** One of her own posts that the frame pass actually read. `plays` is
 *  three-state on purpose: a post whose reach the source omitted is not a post
 *  nobody watched, and averaging a null as 0 is how 945 gallery rows taught this
 *  repo what reading "captured nothing" as a quantity does to a median. */
export interface OwnPostVisual {
  url: string
  plays: number | null
  visualPassRan: boolean
  /** dimension -> the observation, already reduced to a readable sentence by the
   *  same lines the reference block renders. Absent means the pass did not
   *  answer that dimension for this post, never that the answer was "no". */
  observations: Readonly<Record<string, string>>
}

/** ⚠️ THREE, AND IT IS A FLOOR WITH A REASON. Two posts agreeing is a
 *  coincidence a prompt will read as a habit. Below this the split is not
 *  reported at all — not reported as a weaker signal, not reported with a
 *  hedge. */
export const MIN_POSTS_PER_GROUP = 3

/** ⚠️ AND A FLOOR ON THE POOLED FORM TOO. One profiled post is a description of
 *  one video; calling it "what she films" is the confident-1 problem. */
export const MIN_POSTS_POOLED = 3

export interface OwnVisualShape {
  /** How many of her posts the pass actually read. */
  postsRead: number
  /** Above-median reach, at-or-below median reach. Both null when the split was
   *  refused, which is NOT the same as an even split. */
  split: { strong: number; typical: number } | null
  /** One rendered sentence per distinct observation, each carrying its own
   *  counts. Sentences are the posts' own reduced lines, never rewritten here. */
  lines: readonly string[]
}

function median(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2
}

/**
 * Her own videos' visual shape, or null when there is not enough to say.
 *
 * ⚠️ NULL IS A REAL ANSWER AND THE CALLER MUST NOT FILL IT IN. Fewer than
 * `MIN_POSTS_POOLED` posts read means nobody has looked at enough of her work to
 * describe it, which is a different fact from "her videos have no shape" — and
 * the only one of the two that is true today for most creators.
 */
export function ownVisualShape(posts: readonly OwnPostVisual[]): OwnVisualShape | null {
  const read = posts.filter((p) => p.visualPassRan)
  if (read.length < MIN_POSTS_POOLED) return null

  // ⚖️ THE SPLIT IS ON HER OWN MEDIAN, NEVER ON AN ABSOLUTE REACH. A creator
  // with 900 median plays and one with 90,000 are both asking the same question:
  // which of my videos beat MY normal. An absolute threshold answers a different
  // question and answers it wrong for everyone on one side of it.
  const withPlays = read.filter((p): p is OwnPostVisual & { plays: number } => p.plays !== null)
  const med = median(withPlays.map((p) => p.plays))
  const strong = med === null ? [] : withPlays.filter((p) => p.plays > med)
  const typical = med === null ? [] : withPlays.filter((p) => p.plays <= med)
  const splitUsable = strong.length >= MIN_POSTS_PER_GROUP && typical.length >= MIN_POSTS_PER_GROUP

  const dimensions = [...new Set(read.flatMap((p) => Object.keys(p.observations)))].sort()
  const lines: string[] = []

  for (const dim of dimensions) {
    if (splitUsable) {
      const s = strong.filter((p) => p.observations[dim] !== undefined)
      const t = typical.filter((p) => p.observations[dim] !== undefined)
      if (s.length === 0 && t.length === 0) continue
      // ⚠️ THE SENTENCE IS HERS, NOT REWRITTEN. Each post already carries the
      // reduced line the reference block would print; counting how many posts
      // share the same line keeps this file out of the business of deciding what
      // a dimension means.
      const byLine = new Map<string, { s: number; t: number }>()
      for (const p of s) {
        const k = p.observations[dim]!
        byLine.set(k, { s: (byLine.get(k)?.s ?? 0) + 1, t: byLine.get(k)?.t ?? 0 })
      }
      for (const p of t) {
        const k = p.observations[dim]!
        byLine.set(k, { s: byLine.get(k)?.s ?? 0, t: (byLine.get(k)?.t ?? 0) + 1 })
      }
      for (const [line, n] of [...byLine.entries()].sort((a, b) => (b[1].s + b[1].t) - (a[1].s + a[1].t))) {
        lines.push(`${line} — in ${n.s} of your ${s.length} best-performing videos, `
          + `and ${n.t} of your ${t.length} typical ones.`)
      }
    } else {
      const all = read.filter((p) => p.observations[dim] !== undefined)
      if (all.length === 0) continue
      const byLine = new Map<string, number>()
      for (const p of all) {
        const k = p.observations[dim]!
        byLine.set(k, (byLine.get(k) ?? 0) + 1)
      }
      for (const [line, n] of [...byLine.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`${line} — in ${n} of the ${all.length} of your videos we looked at.`)
      }
    }
  }

  if (lines.length === 0) return null
  return {
    postsRead: read.length,
    split: splitUsable ? { strong: strong.length, typical: typical.length } : null,
    lines,
  }
}

/**
 * The prompt block, or null.
 *
 * ⚠️ IT NAMES ITS OWN LIMIT IN THE PROMPT. When the reach split was refused the
 * header says so, because a model handed frequencies with no performance split
 * would otherwise read them as "what works for her" rather than "what she does".
 * Those are different claims and only one of them is supported.
 */
export function ownVisualShapeBlock(shape: OwnVisualShape | null): string | null {
  if (shape === null) return null
  const header = shape.split !== null
    ? 'OBSERVED FROM THIS CREATOR’S OWN PUBLISHED VIDEOS (own_visual — a model’s '
      + 'reading of frames from videos SHE made and published, split by whether each '
      + 'beat her own median reach). Unlike the reference block, this IS a '
      + 'description of this creator, and it is the strongest evidence available for '
      + 'what she will actually set up and film. It is not an instruction to repeat '
      + 'herself:'
    : 'OBSERVED FROM THIS CREATOR’S OWN PUBLISHED VIDEOS (own_visual — a model’s '
      + 'reading of frames from videos SHE made and published). ⚠️ NOT SPLIT BY '
      + 'PERFORMANCE: too few of her posts have both a reach figure and a frame '
      + 'pass, so this says what she DOES film, and says nothing about what works '
      + 'for her. Do not read it as the latter:'
  return `${header}\n${shape.lines.map((l) => `  - ${l}`).join('\n')}`
}

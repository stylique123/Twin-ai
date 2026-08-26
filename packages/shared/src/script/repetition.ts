// TWO BEATS THAT SAY THE SAME THING — AND THE ONES THAT DO IT ON PURPOSE.
//
// ── WHAT WAS MEASURED, AND WHY IT DOES NOT SETTLE THE QUESTION ────────────
//
// A blind creator panel reported that 67% of scripts repeat a beat. Every
// LEXICAL measure computable from production disagrees, on 41 real scripts
// (2026-08-26):
//
//   an exactly repeated beat            2 of 41   (4.9%)
//   two beats sharing >=50% of tokens   4 of 35   (11.4%)
//   two beats sharing >=70% of tokens   0 of 35
//   beats per script, mean              6.3
//
// ⚠️ THE GAP IS THE WHOLE POINT AND IT HAS TWO READINGS. Either the panel sees
// repetition of MEANING that no word-overlap measure can reach — in which case
// only a model finds it — or the panel is counting restatement this product
// does DELIBERATELY. Zero scripts carry even a 70%-overlap pair, which makes
// the second reading serious rather than a footnote.
//
// So this module does two things and refuses to do a third: it computes the
// lexical floor, so a model's verdict can be checked against a number instead
// of believed; and it names the beats that restate ON PURPOSE, so the model is
// never asked to judge them. It does not itself decide that a script repeats.
//
// ⚖️ THE RE-HOOK AND THE CTA ARE FEATURES. A short-form script re-states its
// promise in the middle to hold attention, and re-states the ask at the end
// because that is what a call to action IS. #41 was a bug report about the
// teleprompter DELETING the re-hook beat. A judge not told this would spend its
// budget flagging the two beats the format requires, and acting on that would
// make scripts worse, not better.

/** A script beat, as the blueprint stores it. */
export interface RepetitionBeat {
  line?: unknown
  section?: unknown
}

/** ⚠️ SHORT WORDS CARRY NO TOPIC. "that", "with", "your" overlap everywhere. */
const MIN_TOKEN_LENGTH = 5

export function contentTokens(line: unknown): string[] {
  if (typeof line !== 'string') return []
  return line.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((t) => t.length > MIN_TOKEN_LENGTH - 1)
}

/**
 * Sections whose whole job is to restate. Matched on the section label the
 * writer already assigns, not guessed from the text.
 *
 * ⚠️ A BEAT WITH NO SECTION IS NOT EXEMPT. Unlabelled means unknown, and
 * treating unknown as "deliberate" would silently exempt everything the moment
 * a writer stopped labelling.
 */
// ⚠️ `payoff` IS DELIBERATELY ABSENT, AND IT WAS IN THIS LIST FIRST. A payoff
// is the substance a beat delivers, not a restatement of an earlier one --
// and production carries scripts with "Payoff 1" and "Payoff 2" as two
// DIFFERENT payoffs. Exempting them would hide exactly the repetition worth
// finding. Only the two sections whose job is to say something again are here.
const DELIBERATE_SECTIONS = ['re-hook', 'rehook', 'cta', 'call to action']

export function isDeliberateRestatement(beat: RepetitionBeat): boolean {
  if (typeof beat.section !== 'string') return false
  const s = beat.section.trim().toLowerCase()
  if (s === '') return false
  return DELIBERATE_SECTIONS.some((d) => s === d || s.startsWith(`${d} `) || s.endsWith(` ${d}`))
}

export interface OverlapPair {
  a: number
  b: number
  /** Shared content tokens as a fraction of the SMALLER beat, in milli-units. */
  overlapMilli: number
  exact: boolean
}

export interface LexicalFloor {
  pairs: OverlapPair[]
  /** Beats excluded because their section restates by design. */
  exemptBeats: number[]
  /** Beats too short to compare. Reported so a low count is not read as a low rate. */
  tooShortBeats: number[]
  comparedBeats: number
}

/** ⚠️ FEWER THAN THIS AND OVERLAP IS NOISE. Two four-token beats sharing two
 *  tokens is 50% and means nothing. */
const MIN_COMPARABLE_TOKENS = 4

/**
 * What word-overlap alone can see, with the deliberate beats removed.
 *
 * This is the FLOOR, never the answer: it cannot see two beats that say one
 * thing in unrelated words, which is exactly what the panel may be reporting.
 */
export function lexicalFloor(beats: readonly RepetitionBeat[]): LexicalFloor {
  const exemptBeats: number[] = []
  const tooShortBeats: number[] = []
  const usable: Array<{ i: number; toks: string[]; norm: string }> = []

  // ⚠️ AN EXACT DUPLICATE IS REPETITION AT ANY LENGTH, and gating it on token
  // count hid the worst case in production. Script cba89a95 shipped FIVE
  // identical beats -- "Only you can supply this. What would you actually say
  // here?" -- and the earlier version of this function scored it clean, because
  // that line yields three content tokens and three is below the partial-overlap
  // threshold. The threshold exists so that two short beats sharing two words do
  // not read as 50% similar; it has no business suppressing an identical line.
  // So short beats are still excluded from PARTIAL comparison and are compared
  // for EXACTNESS regardless.
  const short: Array<{ i: number; norm: string }> = []
  beats.forEach((b, i) => {
    if (isDeliberateRestatement(b)) { exemptBeats.push(i); return }
    const toks = contentTokens(b.line)
    const norm = typeof b.line === 'string'
      ? b.line.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).join(' ')
      : ''
    if (toks.length < MIN_COMPARABLE_TOKENS) {
      tooShortBeats.push(i)
      if (norm !== '') short.push({ i, norm })
      return
    }
    usable.push({ i, toks, norm })
  })

  const pairs: OverlapPair[] = []
  for (let x = 0; x < usable.length; x++) {
    for (let y = x + 1; y < usable.length; y++) {
      const A = usable[x]!; const B = usable[y]!
      const setB = new Set(B.toks)
      const shared = new Set(A.toks.filter((t) => setB.has(t))).size
      const smaller = Math.min(new Set(A.toks).size, new Set(B.toks).size)
      if (smaller === 0) continue
      pairs.push({
        a: A.i, b: B.i,
        overlapMilli: Math.round((shared / smaller) * 1000),
        exact: A.norm === B.norm,
      })
    }
  }
  // The short beats, compared only for exactness.
  for (let x = 0; x < short.length; x++) {
    for (let y = x + 1; y < short.length; y++) {
      const A = short[x]!; const B = short[y]!
      if (A.norm === B.norm) pairs.push({ a: A.i, b: B.i, overlapMilli: 1000, exact: true })
    }
  }
  pairs.sort((p, q) => (q.overlapMilli - p.overlapMilli) || (p.a - q.a) || (p.b - q.b))
  return { pairs, exemptBeats, tooShortBeats, comparedBeats: usable.length }
}

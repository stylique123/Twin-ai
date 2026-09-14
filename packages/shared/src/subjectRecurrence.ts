// A RETRY IS NOT A REPEAT, AND ONLY ONE OF THEM IS A DEFECT.
//
// ⚠️ THIS FILE EXISTS BECAUSE `contentHistory.ts` NAMED ITS OWN DISCRIMINATOR
// AND NOBODY HAD RUN IT. Its closing paragraph reads: "WHAT WOULD SETTLE IT: a
// near-duplicate pair generated DAYS APART. Zero exist today. The query is
// premise pairs per creator by content-word overlap, and the discriminator is
// whether d1 = d2." That query was run on 2026-09-13 and the answer has not
// changed, which is the whole reason this module blocks nothing.
//
// ── MEASURED 2026-09-13, ON 106 GENERATIONS CARRYING A PREMISE ────────────
//
//   same-creator premise pairs ......................... 513
//   pairs at >=60% content-word overlap ................  14   (was 3 on 09-07)
//   the highest overlap of any pair .................... 0.92
//   ⚠️ near-duplicate pairs generated DAYS APART .......   0
//
// Near-duplication has grown more than fourfold and EVERY INSTANCE IS STILL
// SAME-DAY. The widest gap between any two near-duplicate premises is 224
// minutes; eleven of the fourteen are inside thirty minutes. That is a creator
// pressing generate again in one sitting.
//
// ⚖️ SO A 30-DAY REPETITION BLOCK WOULD TODAY FIRE ON 14 RETRIES AND 0 REPEATS.
// It would not reduce repetition — there is none of the kind it targets — it
// would refuse the second take a creator just asked for, which `contentHistory`
// already argued is the worse product. The window is not the binding
// constraint, and building the block first would have made the product worse on
// 100% of the evidence that exists.
//
// ⚖️ WHAT THIS DOES INSTEAD IS TELL THE TWO APART, so the rule lands the day the
// evidence does. `RETRY` is the measured population and is left alone. `REPEAT`
// is the population that has never occurred, and it is the only one that
// licenses a word to the writer. If the discriminator stays at zero forever this
// module stays silent forever, which is the correct behaviour and not a failure.

/** The widest gap between any measured near-duplicate pair is 224 minutes. Four
 *  hours sits just above that, so every pair on record classifies as a RETRY and
 *  the boundary is drawn from the data rather than from a round number. */
export const RETRY_WINDOW_MINUTES = 240

/** ⚖️ THE OWNER'S DEFAULT, AND IT IS A CEILING RATHER THAN A TRIGGER. A creator
 *  who films weekly makes four videos a month, and the same opener in videos 1,
 *  3 and 5 is what their audience would notice. Nothing older than this is worth
 *  policing: a premise revisited after a month is a creator returning to a good
 *  subject, not Twin forgetting. */
export const REPEAT_WINDOW_DAYS = 30

/** Content-word overlap at which two premises are the same video written twice.
 *  ⚠️ PINNED TO THE MEASUREMENT, NOT CHOSEN. 0.6 is the threshold the 09-07
 *  re-measure used to find 3 pairs and this one used to find 14; moving it
 *  silently rewrites the history both numbers came from. */
export const NEAR_DUPLICATE_OVERLAP = 0.6

export type Recurrence =
  /** Near-duplicate, inside the retry window. The creator asked again. Leave it. */
  | 'retry'
  /** Near-duplicate, outside the retry window and inside the repeat window.
   *  THE POPULATION THAT HAS NEVER OCCURRED. The only one that speaks. */
  | 'repeat'
  /** Not a near-duplicate, or older than the repeat window. */
  | 'fresh'

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'they',
  'you', 'your', 'their', 'as', 'at', 'by', 'from', 'not', 'no', 'do', 'does',
])

/** Content words, lowercased, in order, punctuation gone. */
export function contentWords(s: unknown): readonly string[] {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && !STOP.has(w))
}

/**
 * Overlap as a share of the LONGER premise.
 *
 * ⚠️ THE LONGER, NOT THE SHORTER, AND NOT THE INTERSECTION ALONE. Dividing by
 * the shorter lets a three-word fragment score 1.0 against a paragraph that
 * happens to contain it, which would classify every terse premise as a
 * duplicate of every long one. This is the same denominator the 09-07 and 09-13
 * measurements used, so the numbers above remain comparable to what it returns.
 */
export function premiseOverlap(a: unknown, b: unknown): number {
  const wa = new Set(contentWords(a))
  const wb = new Set(contentWords(b))
  const longer = Math.max(wa.size, wb.size)
  if (longer === 0) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / longer
}

export interface PriorPremise {
  readonly premise: string
  /** When the prior generation happened. */
  readonly at: Date
}

/**
 * Which of the three this premise is, against one prior.
 *
 * ⚖️ ORDER MATTERS AND IS THE SAFETY PROPERTY. `retry` is asked BEFORE `repeat`,
 * so a near-duplicate inside the sitting can never be reported as the thing we
 * refuse. The population we have measured is the population we leave alone.
 */
export function classifyOne(prior: PriorPremise, premise: string, now: Date): Recurrence {
  if (premiseOverlap(prior.premise, premise) < NEAR_DUPLICATE_OVERLAP) return 'fresh'
  const minutes = Math.abs(now.getTime() - prior.at.getTime()) / 60000
  if (minutes <= RETRY_WINDOW_MINUTES) return 'retry'
  if (minutes <= REPEAT_WINDOW_DAYS * 24 * 60) return 'repeat'
  return 'fresh'
}

export interface RecurrenceVerdict {
  readonly kind: Recurrence
  /** The prior it matched, when it matched one. Null on `fresh`. */
  readonly matched: PriorPremise | null
  /** How many generations back it was, 1 = the one immediately before. */
  readonly scriptsAgo: number | null
}

/**
 * The strongest recurrence across every prior, newest first.
 *
 * ⚠️ A REPEAT OUTRANKS A RETRY EVEN WHEN THE RETRY IS NEARER. If a creator wrote
 * this premise three weeks ago AND again ten minutes ago, the three-week-old one
 * is the fact worth saying — the recent one is the sitting they are already in
 * and know about. Returning the nearest match would hide the only case this
 * module exists for behind the case it ignores.
 */
export function classifyRecurrence(
  priors: readonly PriorPremise[],
  premise: string,
  now: Date,
): RecurrenceVerdict {
  let retry: RecurrenceVerdict | null = null
  for (let i = 0; i < priors.length; i++) {
    const kind = classifyOne(priors[i], premise, now)
    if (kind === 'repeat') return { kind, matched: priors[i], scriptsAgo: i + 1 }
    if (kind === 'retry' && retry === null) {
      retry = { kind, matched: priors[i], scriptsAgo: i + 1 }
    }
  }
  return retry ?? { kind: 'fresh', matched: null, scriptsAgo: null }
}

/**
 * What the creator reads on the panel, or null.
 *
 * ⚠️ IT NAMES THE SUBJECT AND SAYS THE SCRIPT STILL GOT WRITTEN. The owner's
 * rule: "when a subject is blocked, say so on the panel -- otherwise it reads as
 * Twin ignoring her prompt, which is what the silent substitutions looked like."
 * Nothing here blocks, so the sentence says what it actually did.
 *
 * ⚖️ SILENT ON `retry`, DELIBERATELY. Telling someone they just generated this
 * ten minutes ago is telling them what they did on purpose.
 */
export function recurrenceNotice(v: RecurrenceVerdict): string | null {
  if (v.kind !== 'repeat' || v.matched === null || v.scriptsAgo === null) return null
  const n = v.scriptsAgo
  const when = n === 1 ? 'in your last script' : `${n} scripts ago`
  return `You covered this ${when}. This one takes a different angle on it.`
}

/**
 * The line the writer is given, or ''.
 *
 * ⚖️ A DIFFERENT ANGLE, NOT A DIFFERENT SUBJECT. A creator who asked for this
 * subject still wants it; what they do not want is the same opener twice. So the
 * instruction narrows the treatment and never refuses the topic.
 */
export function recurrenceDirective(v: RecurrenceVerdict): string {
  if (v.kind !== 'repeat' || v.matched === null) return ''
  return `\nALREADY COVERED: this creator has published a video on this same premise `
    + `within the last ${REPEAT_WINDOW_DAYS} days -- "${v.matched.premise.slice(0, 160)}". `
    + `Write this one on the SAME SUBJECT but from a genuinely different angle: a `
    + `different opening move, a different example, a different beat order. Do NOT `
    + `reuse the opener of the earlier video, and do NOT refuse the subject.`
}

// ── WHAT TWIN HAS ALREADY WRITTEN FOR THEM, WHICH IS NOT WHAT THEY PUBLISHED ──
//
// ⚠️ THE `ALREADY COVERED` BLOCK EXISTS, CARRIES THE RIGHT INSTRUCTION, AND IS
// FED FROM ONE SOURCE ONLY. `generate-blueprint` builds it from
// `creator_knowledge` rows of kind `covered`, and measured on 2026-09-13 those
// are 431 rows from `caption` plus 8 from `transcript` — every one derived from
// a video the creator PUBLISHED. Not one comes from a script Twin wrote for
// them. So the writer is steered away from repeating the creator's own back
// catalogue and is told nothing about its own.
//
// ⚖️ AND IT MUST BE A SEPARATE BLOCK, NOT AN EXTRA ROW IN THAT ONE. The covered
// block's own words are "they have made a video about each of these", which is
// FALSE of a draft: Twin writing a script is not the creator filming it.
// Appending drafts to that list would put a claim about someone's catalogue in
// the prompt that nothing supports — the same defect class as the covered list's
// recorded leak, where our notes reached a spoken line.
//
// ⚖️ GATED BY THE RETRY WINDOW, FOR THE REASON THE REST OF THIS FILE EXISTS. A
// draft from ten minutes ago is the sitting the creator is in; steering away
// from it is steering away from the retry they just asked for. Only drafts older
// than the window are catalogue.
//
// ⚖️ THIS ONE HAS A POPULATION, WHICH `repeat` DOES NOT. 7 of 35 creators have
// generated on two or more separate days, so this fires today where the
// near-duplicate rule still cannot.

/** Prior premises old enough to count as catalogue rather than as this sitting. */
export function draftedSubjects(
  priors: readonly PriorPremise[], now: Date, limit = 8,
): readonly string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of priors) {
    const minutes = Math.abs(now.getTime() - p.at.getTime()) / 60000
    if (minutes <= RETRY_WINDOW_MINUTES) continue
    if (minutes > REPEAT_WINDOW_DAYS * 24 * 60) continue
    const text = p.premise.trim()
    if (text === '') continue
    // ⚠️ DEDUPED ON THE TEXT, because a creator who generated the same premise
    // twice a week ago would otherwise have it listed twice and read as two
    // separate prior videos.
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

/**
 * The block, or ''.
 *
 * ⚠️ IT SAYS DRAFTED, NEVER PUBLISHED, AND IT IS NEVER SPOKEN. Both are defects
 * this repository has already paid for once: the covered block shipped saying
 * only "do not repeat" and produced the spoken line "we've had a video on this",
 * narrating our own notes to an audience.
 */
export function renderAlreadyDrafted(subjects: readonly string[]): string {
  if (subjects.length === 0) return ''
  return '\nALREADY WRITTEN FOR THIS CREATOR — Twin has drafted a script on each of these '
    + 'subjects for them before today. They may or may not have filmed them, so do NOT say '
    + 'or imply that they did. THIS LIST IS NEVER SPOKEN: it steers what you choose and must '
    + 'not appear in any line. Take a subject here only from an angle it has not already been '
    + 'written from, and do not reuse its opening move.\n'
    + subjects.map((s) => `  * ${s.slice(0, 200)}`).join('\n')
}

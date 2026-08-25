/**
 * WHAT THE TWIN ACTUALLY KNOWS, SAID PLAINLY.
 *
 * ⚠️ THE FAILURE THIS EXISTS TO END IS A SILENT ONE. A creator whose catalogue
 * is captions and text-overlay content gets a hollow twin, and NOTHING TELLS
 * THEM. Measured on production knowledge: caption-derived items are 13%
 * substance and have produced ZERO experiences, ever; transcripts are 78%. So
 * whether Twin can write anything worth filming is decided by whether the
 * creator talks on camera — and today they find that out by reading a
 * disappointing script and concluding the product is bad at its job.
 *
 * ⚖️ COUNTS, NEVER A SCORE. "87% ready" is theatre: it implies a measurement
 * nobody took and invites the creator to optimise a number we invented. Four
 * plain counts and one honest sentence are the whole feature.
 *
 * ⚖️ AND IT NEVER SAYS "WEAK". A store scanned before `source` was recorded
 * cannot be judged — unrecorded is not the same as caption-derived, and calling
 * an unmeasured twin weak is a claim about the creator's work that we cannot
 * support.
 */

import { SUBSTANCE_KINDS, carriesFigure, wasSpoken } from './knowledgeSelection'

/** ⚠️ EXPERIENCE IS BROKEN OUT BECAUSE IT IS THE PREDICTOR. It is the kind that
 *  makes a script non-generic, and it is the one captions never produce. */
const EXPERIENCE_KINDS: ReadonlySet<string> = new Set(['experience', 'example'])

export interface KnowledgeRow {
  kind?: string
  text?: string
  source?: string | null
}

export interface TwinStrength {
  /** Items that could carry a beat at all. */
  substance: number
  /** Of those, the ones that are something that happened to this creator. */
  experiences: number
  /** Substance items carrying a number the creator could say out loud. */
  figures: number
  /** ⚠️ THREE STATES, NOT TWO. `true` when at least one item records where it
   *  came from; `false` when items exist and NONE do; `null` when the store is
   *  empty and there is nothing to have measured. */
  sourceRecorded: boolean | null
  /** Of the items that DO record a source, how many the creator actually said.
   *  ⚖️ `null` WHEN NOTHING RECORDS A SOURCE — a share computed over zero known
   *  sources is 0/0, and rendering that as 0% would report a measured absence
   *  where there was no measurement. */
  spokenShare: number | null
}

export function twinStrength(rows: readonly KnowledgeRow[] | null | undefined): TwinStrength {
  const items = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : []
  const substance = items.filter((i) => SUBSTANCE_KINDS.has(String(i.kind)))
  const withSource = items.filter((i) => typeof i.source === 'string' && i.source !== '')

  return {
    substance: substance.length,
    experiences: substance.filter((i) => EXPERIENCE_KINDS.has(String(i.kind))).length,
    figures: substance.filter(carriesFigure).length,
    sourceRecorded: items.length === 0 ? null : withSource.length > 0,
    spokenShare: withSource.length === 0
      ? null
      : withSource.filter((i) => wasSpoken(i)).length / withSource.length,
  }
}

/** What the creator reads. ⚠️ PLAIN EVERYDAY ENGLISH, and it never names
 *  anything internal: no "substance", no "kinds", no "source". */
export interface StrengthSentence {
  headline: string
  /** The next thing worth doing, or '' when there is nothing honest to suggest. */
  nudge: string
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function strengthSentence(s: TwinStrength): StrengthSentence {
  // ⚠️ UNMEASURED, NEVER WEAK. A store with nothing in it and a store scanned
  // before we recorded where things came from are both "we cannot say", and
  // saying anything else is a claim about their work we cannot support.
  if (s.sourceRecorded === null) {
    return {
      headline: 'Your twin has not learned anything yet.',
      nudge: 'Answer a couple of questions and it will have something of yours to work from.',
    }
  }
  if (s.substance === 0) {
    return {
      headline: 'Your twin knows about your work, but nothing it can say out loud yet.',
      nudge: 'Tell it one thing that actually happened to you.',
    }
  }

  // ⚖️ STORIES AND NUMBERS ARE NAMED SEPARATELY because they do different jobs
  // in a script, and a creator can tell instantly which one they are short of.
  const parts: string[] = [plural(s.experiences, 'real story', 'real stories')]
  if (s.figures > 0) parts.push(plural(s.figures, 'number', 'numbers'))
  const headline = `Your twin knows ${parts.join(' and ')} from you.`

  if (s.experiences === 0) {
    return { headline, nudge: 'One story of your own would change what it can write.' }
  }
  if (s.experiences < 3) {
    return { headline, nudge: 'Two or three more stories and it stops sounding generic.' }
  }
  // ⚠️ NO NUDGE IS A REAL ANSWER. Inventing a next step for a creator who has
  // done the work is how a helpful meter becomes a nagging one.
  return { headline, nudge: '' }
}

// THREE LINES BEFORE THE CREDIT IS SPENT, AND THE THIRD IS THE POINT.
//
// ⚠️ THE CREATOR CANNOT SEE WHAT TWIN UNDERSTOOD UNTIL AFTER THEY HAVE PAID.
// Today the intent questions are answered, a credit is spent, and a script
// arrives. If Twin misread the angle, or is about to write around a product it
// has no facts for, the first evidence is the script itself.
//
//   The angle          what Twin thinks this video is
//   What I'll use      the creator's own material it will draw on
//   What I don't have  the gaps — and this is the line that earns the screen
//
// ⚖️ THE THIRD LINE IS WHERE A FABRICATED CLAIM GETS CAUGHT BEFORE IT IS
// WRITTEN. "I have no numbers from you" shown BEFORE the spend is a creator
// adding one, or choosing a different angle. The same sentence discovered
// afterwards is a refund.
//
// ── EVERY GAP IS DERIVED FROM A PREDICATE THE WRITER ITSELF USES ──────────
//
// ⚠️ A PLAN SCREEN THAT DESCRIBES A DIFFERENT SET THAN THE WRITER RECEIVES IS
// WORSE THAN NO PLAN SCREEN. It would be a promise the script then breaks, and
// the creator would have no way to tell which half was lying. So nothing here
// re-implements a test: `carriesFigure`, `isFirstPerson`, `wasSpoken` and
// `SUBSTANCE_KINDS` are imported from `knowledgeSelection` — the module
// `selectSpeakable` runs on — and `readyFacts` arrives from the caller, which
// mirrors the server's own derivation (`libraryFacts` in V2Building, pinned
// line-for-line to `readyFacts` in generate-blueprint).
//
// ⚖️ SO A DRIFT IS A COMPILE ERROR OR A FAILING TEST, NEVER A QUIET LIE.

import {
  SUBSTANCE_KINDS, carriesFigure, isFirstPerson, wasSpoken,
} from './knowledgeSelection'

/**
 * ⚠️ THE CALLER MUST READ `text` AND `source`, NOT JUST `kind`, AND THAT IS A
 * REAL CONSTRAINT ON THE SCREEN THAT USES THIS. `loadKnowledgeCounts` in
 * apps/web selects `kind` alone — enough to say "no story" (no `experience`
 * row) and NOT enough to say "no numbers", because `carriesFigure` tests the
 * TEXT. A plan built from counts would state the numbers gap as a guess.
 *
 * ⚖️ AND A GUESS IS THE ONE THING THIS SCREEN CANNOT CONTAIN. Its whole value
 * is that the third line is true of the script about to be written; a line that
 * is right about stories and approximate about numbers teaches a creator to
 * distrust all three. So the pre-spend read is `kind, text, source` over the
 * same rows `selectSpeakable` will see.
 */
export interface PlanItem { kind?: string; text?: string; source?: string | null }

export interface VideoPlanInput {
  /** What the video is for, in the creator's own chosen words. */
  angle: string | null | undefined
  /** The knowledge the writer will select from — the SAME array. */
  knowledge: readonly PlanItem[] | null | undefined
  /** Product fact labels, as `libraryFacts`/`readyFacts` derive them. */
  readyFacts: readonly string[] | null | undefined
  /** Whether the creator has said they can put a product on camera. */
  canShowProduct?: 'yes' | 'sometimes' | 'no' | null
}

/** ⚠️ EACH GAP NAMES THE PREDICATE THAT PRODUCED IT, so a reader can check the
 *  claim rather than trust it. */
export interface PlanGap {
  /** Plain English, for the creator. */
  line: string
  /** The writer-side predicate this was derived from. */
  basis: 'isFirstPerson' | 'carriesFigure' | 'wasSpoken' | 'readyFacts' | 'canShowProduct'
}

export interface VideoPlan {
  angle: string | null
  willUse: string[]
  gaps: PlanGap[]
}

/** ⚠️ AN EMPTY STORE IS NOT A GAP LIST OF ONE. A creator Twin knows nothing
 *  about should be told that once, plainly, rather than handed five separate
 *  absences that all say the same thing. */
const NOTHING_AT_ALL: PlanGap = {
  line: 'I have nothing from you yet, so this will be written from your niche rather than your own material.',
  basis: 'wasSpoken',
}

/**
 * Build the three lines.
 *
 * ⚖️ IT DESCRIBES; IT NEVER BLOCKS. Nothing here can refuse a generation — the
 * creator may look at a gap and generate anyway, and often should. A screen
 * that turned a gap into a wall would make the honest answer expensive.
 */
export function buildVideoPlan(input: VideoPlanInput): VideoPlan {
  const items = (input.knowledge ?? []).filter((i) => typeof i?.kind === 'string')
  const facts = (input.readyFacts ?? []).filter((f) => String(f ?? '').trim() !== '')
  const angle = typeof input.angle === 'string' && input.angle.trim() !== ''
    ? input.angle.trim() : null

  const substance = items.filter((i) => SUBSTANCE_KINDS.has(String(i.kind)))
  const spoken = items.filter(wasSpoken)

  const willUse: string[] = []
  if (spoken.length > 0) willUse.push(`${spoken.length} thing${spoken.length === 1 ? '' : 's'} you've said before`)
  if (substance.some(isFirstPerson)) willUse.push('something that happened to you')
  if (substance.some(carriesFigure)) willUse.push('a number you gave')
  if (facts.length > 0) willUse.push(`${facts.length} fact${facts.length === 1 ? '' : 's'} about your product`)

  const gaps: PlanGap[] = []
  if (items.length === 0) {
    gaps.push(NOTHING_AT_ALL)
  } else {
    // ⚠️ ORDERED BY WHAT A CREATOR CAN FIX IN A MINUTE. A missing episode is a
    // sentence they can type; a missing product fact is a trip to the library.
    if (!substance.some(isFirstPerson)) {
      gaps.push({
        line: 'No story of your own — so this will explain rather than recount.',
        basis: 'isFirstPerson',
      })
    }
    if (!substance.some(carriesFigure)) {
      gaps.push({
        line: 'No numbers from you, so this will not claim any.',
        basis: 'carriesFigure',
      })
    }
  }
  if (facts.length === 0) {
    gaps.push({
      line: 'No confirmed facts about your product, so this will not make claims about what it does.',
      basis: 'readyFacts',
    })
  }
  // ⚖️ UNANSWERED IS NOT "NO", AND IT IS ALSO NOT NOTHING. Run G invented a
  // whiteboard on an unanswered capability. Saying so here is cheaper than
  // discovering it while standing in a room holding a phone.
  if (input.canShowProduct === 'no') {
    gaps.push({
      line: 'You said you cannot film your product, so no scene will depend on showing it.',
      basis: 'canShowProduct',
    })
  }

  return { angle, willUse, gaps }
}

/**
 * ⚠️ THE ONE THING THE SCREEN MUST NEVER DO. If it lists a gap the writer does
 * not have, or omits one the writer does, the creator was misled about the
 * script they are paying for. This returns the disagreement rather than a
 * boolean, so a test can say WHICH.
 */
export function planGapDrift(
  plan: VideoPlan,
  writerSaw: { hasFirstPerson: boolean; hasFigure: boolean; factCount: number },
): string[] {
  const has = (b: PlanGap['basis']) => plan.gaps.some((g) => g.basis === b)
  const out: string[] = []
  if (has('isFirstPerson') && writerSaw.hasFirstPerson) out.push('plan says no story, writer has one')
  if (!has('isFirstPerson') && !writerSaw.hasFirstPerson && !has('wasSpoken')) {
    out.push('writer has no story, plan does not say so')
  }
  if (has('carriesFigure') && writerSaw.hasFigure) out.push('plan says no numbers, writer has one')
  if (!has('carriesFigure') && !writerSaw.hasFigure && !has('wasSpoken')) {
    out.push('writer has no numbers, plan does not say so')
  }
  if (has('readyFacts') && writerSaw.factCount > 0) out.push('plan says no product facts, writer has some')
  if (!has('readyFacts') && writerSaw.factCount === 0) out.push('writer has no product facts, plan does not say so')
  return out
}

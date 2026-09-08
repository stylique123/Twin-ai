// THE CTA ALREADY SAID WHAT THE VIDEOS ARE FOR.
//
// ⚠️ ASKED THREE TIMES, AND ANSWERED ON EVERY POST THEY HAVE EVER MADE. "What do
// you want your content to do?" is put at signup, again in the remix pop-up, and
// again in the intent questions — while the scan is reading the creator's actual
// endings and storing them in `voice_profile.recurring_ctas`. The bakery's came
// back as "in bio!!", the physio's as "drop an injury in the comments", a
// skincare creator's as "use my code VICKIE". Those are not hints about the
// goal; they ARE the goal, in the creator's own words, already extracted.
//
// ⚖️ SO THIS IS A MAPPING, NOT AN EXTRACTION. Nothing new is read, no model is
// called, and nothing here can fail slowly: the field exists, is populated, and
// is currently read only to be counted and rendered as chips.
//
// ⚠️ AND AN INFERENCE IS NEVER RECORDED AS A STATEMENT. What this returns is a
// candidate the creator confirms in one tap — the same shape as every other
// inference in onboarding. Writing it straight into `contentGoals`, which every
// reader treats as something they said, would be exactly the "0 stated, 34
// guessed" defect wearing a better disguise.

import { BRIEF_GOALS, type BriefGoal } from './preScriptBrief'

/** ⚠️ ORDER MATTERS AND IS NOT ALPHABETICAL. A CTA can carry two families at
 *  once — "comment SAUCE and I'll send the link" is both a comment prompt and a
 *  link hand-off — and the more SPECIFIC commercial reading wins, because
 *  mistaking a sale for engagement loses the disclosure question. */
const FAMILIES: ReadonlyArray<{ goal: BriefGoal; test: RegExp }> = [
  // Buying: a code, a shop, a price, an order.
  { goal: 'sell', test: /\b(use (my|the) code|discount code|promo code|shop (now|here|the)|order (now|yours|here)|buy (it|now|yours|here)|on sale|in stock|restock)\b/i },
  // A hand-off to somewhere they transact or enquire.
  { goal: 'sell', test: /\b(link in (my )?bio|in bio|linkinbio|link below|swipe up|check the link)\b/i },
  // Asking for the conversation itself.
  { goal: 'leads', test: /\b(dm me|message me|book (a|your) (call|slot|appointment|consult)|enquire|get in touch|work with me|apply (now|here))\b/i },
  // Asking them to keep it: the ending of something taught.
  { goal: 'educate', test: /\b(save (this|it|for later)|bookmark|keep this|come back to this|send this to)\b/i },
  // Asking them to say something, or to stay.
  { goal: 'followers', test: /\b(comment|drop (a|your|an)|tell me|let me know|what do you think|follow for more|hit follow|part \d)\b/i },
]

export interface GoalFromCtas {
  goal: BriefGoal
  /** The CTA that decided it, verbatim — so the screen can quote the creator
   *  back to themselves rather than assert a conclusion about them. */
  evidence: string
}

/**
 * What the creator's own endings say this content is for.
 *
 * ⚠️ NULL IS THE COMMON, CORRECT ANSWER and must stay cheap to return. A store
 * with no CTAs, unrecognised ones, or a genuine tie between two families all
 * mean the same thing: we do not know, so the question still gets asked.
 *
 * ⚖️ A TIE IS NOT A COIN FLIP. A creator who half sells and half teaches has two
 * goals, and picking one would state a priority they never expressed — on the
 * field that decides how every script of theirs ends.
 */
export function goalFromCtas(ctas: readonly unknown[] | null | undefined): GoalFromCtas | null {
  const lines = Array.isArray(ctas)
    ? ctas.map((c) => (typeof c === 'string' ? c.trim() : '')).filter((c) => c !== '')
    : []
  if (lines.length === 0) return null

  const tally = new Map<BriefGoal, { n: number; first: string }>()
  for (const line of lines) {
    // ⚖️ ONE VOTE PER CTA, from the FIRST family it matches. Letting one line
    // vote twice would make a single chatty CTA outweigh three plain ones.
    const hit = FAMILIES.find((f) => f.test.test(line))
    if (!hit) continue
    const prev = tally.get(hit.goal)
    if (prev) prev.n += 1
    else tally.set(hit.goal, { n: 1, first: line })
  }
  if (tally.size === 0) return null

  const ranked = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)
  // ⚠️ THE TIE CHECK MUST PRECEDE THE PICK. Reading `ranked[0]` first and
  // checking afterwards is how a coin flip ships as a measurement.
  if (ranked.length > 1 && ranked[0][1].n === ranked[1][1].n) return null
  return { goal: ranked[0][0], evidence: ranked[0][1].first }
}

/** ⚖️ THE SENTENCE THE CREATOR CONFIRMS, and it quotes them. "You mostly want to
 *  sell" is a claim about a person; "your videos usually end with 'in bio'" is
 *  something they can check against their own memory in a second. */
export const GOAL_CONFIRMATION: Record<BriefGoal, string> = {
  sell: 'so these are mostly about selling what you offer',
  leads: 'so these are mostly about starting conversations',
  educate: 'so these are mostly about teaching something worth keeping',
  followers: 'so these are mostly about reaching more people',
  authority: 'so these are mostly about building trust in what you know',
  entertain: 'so these are mostly about entertaining people',
  personal_brand: 'so these are mostly about building your name',
}

/** ⚠️ EVERY GOAL NEEDS A SENTENCE even though only four can currently be
 *  inferred: a family added to the table above without one would render a blank
 *  line under a quote of the creator's own words. */
export function goalConfirmationLine(found: GoalFromCtas): string {
  return `Your videos usually end with “${found.evidence}” — ${GOAL_CONFIRMATION[found.goal]}.`
}

/** The goals this mapping can currently reach. Exported so a test can pin the
 *  gap rather than a reader discovering it. */
export const INFERABLE_GOALS: readonly BriefGoal[] =
  BRIEF_GOALS.filter((g) => FAMILIES.some((f) => f.goal === g))

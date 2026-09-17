// THE SAME SIX FACTS WON EVERY TIME, AND MORE SUPPLY WOULD NOT HAVE FIXED IT.
//
// ⚠️ THE MECHANISM. The selector is deterministic on inputs that barely move:
// relevance against the brief, then `times_seen`, then kind. Run it twice on the
// same niche and the same rows win twice. So a creator with forty good facts
// gets one good script and five near-repeats — not because there is nothing else
// to say, but because nothing records that a thing has already been said.
// §G17 has repetition as the top defect in finished scripts and records that it
// does not respond to instruction. This is one of its causes, upstream of the
// writer entirely, and it is arithmetic rather than judgement.
//
// ⚖️ A TIE-BREAK, NEVER A REORDERING, AND THIS IS THE WHOLE DESIGN. Sorting the
// store by how recently each row was spent would hand a phone review a stale
// business claim ahead of the phone — the exact failure `selectSpeakable`'s
// comment already records for depth-first sorting. Relevance still chooses WHICH
// rows are candidates; spend only decides the order among rows that are equally
// relevant. Among equals there is no reason to prefer the one already used, and
// today the order among equals is whatever the database returned.
//
// ⚠️ AND THE BIGGEST WIN IS IN THE GROUP NOBODY ORDERS. The edge partitions into
// `hit > 0` (sorted) and `hit === 0` (UNSORTED — arbitrary). That second group is
// where the filler comes from, it is most of the store, and it currently has no
// ordering rule at all. Cooling it is free.

/** A row as this module needs to see it. Two fields, so a caller can pass the
 *  shape a two-column select returns. */
export interface SpendRecord {
  lastSpentAt: string | null
  spendCount: number | null
}

/**
 * How long a spent row stays cooled.
 *
 * ⚠️ MATCHED TO `REC_REPEAT_DAYS = 30`, THE PREMISE-OVERLAP WINDOW ALREADY IN
 * `generate-blueprint`, ON PURPOSE. Two windows deciding "has this been said
 * recently" would be two answers to one question, which this repository has paid
 * for enough times to name it as a class. If one moves, both move.
 *
 * ⚖️ AND IT IS A COOLING, NOT A BAN. A cooled row still reaches the prompt when
 * nothing else is available — that is the point of it being a tie-break. The
 * §H2 argument applies: refusing a creator's own material outright is a product
 * decision `recDirective` already declined to make, deliberately.
 */
export const SPEND_COOLDOWN_DAYS = 30

/**
 * How worn a row is, lower is fresher. Three buckets, then wear within them.
 *
 * ⚖️ NEVER-SPENT BEATS SPENT-LONG-AGO, and the distinction is not pedantry. A
 * row nobody has ever used is supply this product has paid to extract and never
 * once delivered; a row spent in March is material that has already done its
 * job. Collapsing them would make the ranking indifferent to exactly the rows
 * the whole change exists to surface.
 *
 * ⚠️ A `spendCount` WITH NO DATE IS TREATED AS SPENT LONG AGO, NOT AS NEVER.
 * The pair should never disagree — 0216 writes both in one statement — but if it
 * ever does, reading "count 4, no date" as never-spent would promote the most
 * worn rows in the store to the front. The safe reading of a contradiction is
 * the one that cannot do damage.
 */
export function spendWear(r: SpendRecord, now: Date): number {
  const count = typeof r?.spendCount === 'number' && Number.isFinite(r.spendCount) && r.spendCount > 0
    ? r.spendCount
    : 0
  const t = r?.lastSpentAt ? Date.parse(r.lastSpentAt) : NaN
  if (Number.isNaN(t)) {
    // No date. Never spent only if nothing claims otherwise.
    return count === 0 ? 0 : 1_000 + count
  }
  const days = (now.getTime() - t) / (1000 * 60 * 60 * 24)
  // ⚖️ THE COUNT IS THE TIE-BREAK WITHIN A BUCKET, not a term added to the
  // recency. A row spent eight times in 2024 is more worn than one spent once,
  // and both are less worn than anything spent last week.
  const bucket = days <= SPEND_COOLDOWN_DAYS ? 2_000_000 : 1_000
  return bucket + count
}

/**
 * Order equally-relevant rows so the unspent ones go first.
 *
 * ⚠️ STABLE, AND A TEST PINS THAT. `Array.prototype.sort` is stable in every
 * engine this runs on, and the guarantee is load-bearing: rows with equal wear
 * must keep the order relevance gave them, or this function silently becomes the
 * reordering its own header forbids.
 *
 * ⚖️ THE CALLER APPLIES IT WITHIN EACH RELEVANCE GROUP, and this function
 * deliberately does not know what a group is. Handing it the whole list and
 * letting it sort would let a wholly irrelevant unspent row outrank a directly
 * relevant one, which is the failure mode this design exists to avoid.
 */
export function coolBySpend<T extends SpendRecord>(rows: readonly T[], now: Date = new Date()): T[] {
  return [...rows].sort((a, b) => spendWear(a, now) - spendWear(b, now))
}

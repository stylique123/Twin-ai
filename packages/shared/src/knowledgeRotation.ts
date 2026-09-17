// THE SAME TEN ITEMS REACHED EVERY SCRIPT, AND NOTHING COULD HAVE SAID SO.
//
// ⚠️ THE DEFECT, AND IT IS ARITHMETIC RATHER THAN TASTE. The selector ranks a
// creator's knowledge by lexical overlap with the video's topic, applies a
// substance floor, and takes ten. Overlap is deterministic, and the store does
// not change between scans — so a creator who makes three videos about the same
// subject gets the SAME items all three times. Nothing recorded that an item had
// already been supplied, so nothing could rotate and nothing could report it.
//
// Measured across 42 voices: 1,339 stored rows, 611 of them substance, median 10
// items per voice, 27 clearing the substance floor of 6, and 2 with anything that
// could be called months of runway. The runway that does exist was being spent on
// repetition.
//
// ⚖️ A TIEBREAK, NOT A REORDERING — the same shape as `SUBSTANCE_FLOOR` and for
// the same reason. Relevance still decides: a video about a product must still
// see that product. Rotation only decides WHICH of the equally relevant items
// goes first, and an item nobody has supplied yet wins that.
//
// ⚠️ "SUPPLIED", NOT "QUOTED". We know exactly what was put in front of the
// writer; whether a beat then quoted it is a fuzzy match against
// `substance_evidence`. Both readings argue for the same rotation: an item the
// writer used should not lead the next script (repetition), and one it ignored
// should not hold the same slot a third time (waste). The ledger (0215) keeps
// `generation_id`, so a stricter definition stays computable from rows already
// written rather than needing a different rule now.

/** What rotation needs to know about an item. Both fields optional, because a
 *  store predating 0215 has neither and must rank exactly as it did before. */
export interface RotatableItem {
  used_count?: number | null
  last_used_at?: string | null
}

/** How spent an item is, as a sortable pair.
 *
 *  ⚠️ ABSENT IS NEVER-USED, AND THAT IS THE DIRECTION THAT MATTERS. A row written
 *  before the ledger existed, or by a worker deployed ahead of the migration,
 *  must read as "not yet spent" — it leads, gets supplied, and is stamped. The
 *  opposite default would bury every pre-existing row permanently, which is the
 *  whole store on the day this ships. */
export function spend(item: RotatableItem): { count: number; at: number } {
  const raw = item.used_count
  const count = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0
  const parsed = item.last_used_at == null ? Number.NaN : Date.parse(String(item.last_used_at))
  // ⚖️ AN UNPARSEABLE DATE COUNTS AS NEVER, matching `freshness`'s `undated`:
  // unknown falls on the side that costs a supply slot, not the side that hides
  // an item forever.
  return { count, at: Number.isFinite(parsed) ? parsed : 0 }
}

/**
 * Order equally relevant items so the least-spent one leads.
 *
 * ⚠️ IT MUST BE STABLE AND IT MUST BE A TIEBREAK. `buckets` arrive already
 * ordered by relevance; this sorts WITHIN each bucket only, and equal spend keeps
 * the incoming order. A global sort by spend would hand a phone review a generic
 * business claim ahead of the phone — the exact failure `SUBSTANCE_FLOOR`'s note
 * argues against, restated because this is the second rule that could cause it.
 *
 * ⚖️ COUNT FIRST, THEN RECENCY. Two items supplied once each are separated by
 * which was supplied longer ago; an item supplied five times never leads one
 * supplied once, however long ago the five were. Rotation is about spreading the
 * runway, not about age.
 */
export function rotateWithinBucket<T extends RotatableItem>(bucket: readonly T[]): T[] {
  return bucket
    .map((item, i) => ({ item, i, s: spend(item) }))
    .sort((a, b) => (a.s.count - b.s.count) || (a.s.at - b.s.at) || (a.i - b.i))
    .map((x) => x.item)
}

/**
 * The supply order for a scored pool: relevance buckets, least-spent first inside
 * each one.
 *
 * ⚠️ TWO BUCKETS, MATCHING THE SELECTOR THAT EXISTS. The writer splits on
 * `hit > 0` — items sharing a word with what the video is about — and then keeps
 * the rest in whatever order they arrived. Rotation applies inside BOTH, because
 * the zero-overlap bucket is where a creator's general positions live and it is
 * the bucket a repeated topic drains most predictably.
 *
 * ⚖️ THE HIT SCORE STILL ORDERS THE FIRST BUCKET. An item sharing three words
 * with the brief outranks one sharing a single word, and rotation separates only
 * those that share the same number.
 */
export function orderForSupply<T extends RotatableItem>(
  scored: ReadonlyArray<{ item: T; hit: number }>,
): T[] {
  const relevant = scored.filter((x) => x.hit > 0)
    .slice()
    .sort((a, b) => b.hit - a.hit)
  const rest = scored.filter((x) => x.hit === 0)
  // Group the relevant bucket by hit score so rotation only breaks genuine ties.
  const out: T[] = []
  let i = 0
  while (i < relevant.length) {
    let j = i
    while (j < relevant.length && relevant[j].hit === relevant[i].hit) j += 1
    out.push(...rotateWithinBucket(relevant.slice(i, j).map((x) => x.item)))
    i = j
  }
  out.push(...rotateWithinBucket(rest.map((x) => x.item)))
  return out
}

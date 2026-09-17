// DOES SHE ACTUALLY SELL ANYTHING? ASKED OF THE DATABASE, NEVER OF THE TRANSCRIPT.
//
// ⚠️ THIS EXISTS TO STOP ONE SPECIFIC FABRICATION. Three of the ten targeted
// extraction questions are about a paid offer — what she charges, what she
// refuses to promise, what she calls her method. Asked of a creator with nothing
// to sell, a model does not answer "nothing": it produces a plausible price, and
// a plausible price is indistinguishable in the database from one she named.
//
// ⚖️ SO THE GATE IS A STORED, LIVE, OWNED ENTITY. "She sounds like she sells
// something" is exactly the reasoning that invents the figure, so the transcript
// is not allowed to answer this question about itself.
//
// ⚖️ AND UNKNOWN MEANS NO. A read that fails, a table that is not there, an owner
// with no id — each returns false, and false means three questions are not asked.
// The cost of a false negative is a creator whose pricing facts are not extracted
// this scan; the cost of a false positive is an invented price in a script she
// reads to her audience. Those are not close.

import { db } from './db.js'

/** Relationships that mean SHE OWNS THE THING. Mirrors the filter
 *  `generate-blueprint` uses on the same table — an AFFILIATE or a REVIEW_ONLY
 *  entity is somebody else's product, and what she charges for it is not a fact
 *  about her. */
const OWNED = ['OWN_PRODUCT', 'OWN_SERVICE'] as const

export async function ownerHasLiveProduct(ownerId: string | null | undefined): Promise<boolean> {
  const owner = String(ownerId ?? '').trim()
  if (!owner) return false
  try {
    const { data, error } = await db
      .from('product_entities')
      .select('id')
      .eq('owner_id', owner)
      .in('relationship', OWNED)
      // ⚠️ ARCHIVED IS WITHDRAWN (0124). A creator who archived her offer has
      // said, explicitly, that it is no longer hers to talk about — reading it
      // here would re-grant the pricing questions she just revoked.
      .is('archived_at', null)
      .limit(1)
    if (error) {
      console.warn(JSON.stringify({
        event: 'owner_product_check_failed',
        detail: 'treating as NO product; the pricing questions will not be asked',
        error: error.message,
      }))
      return false
    }
    return (data ?? []).length > 0
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'owner_product_check_failed',
      error: err instanceof Error ? err.message : String(err),
    }))
    return false
  }
}

import { supabase } from './supabase'
import { twinStrength, type TwinStrength } from '@twinai/shared'

/**
 * WHAT THIS CREATOR'S TWIN KNOWS, READ ONCE FOR THE METER.
 *
 * ⚠️ A PURE READ. Nothing about the meter writes, and that is deliberate: a
 * display that also records would make the number it shows depend on how often
 * somebody looked at it.
 *
 * ⚖️ AND `null` IS AN ANSWER, NOT AN ERROR TO SWALLOW. When the read fails we do
 * not know what the twin holds, and rendering "nothing yet" would be a claim
 * about the creator's work that we cannot support. The caller shows nothing.
 */
export async function loadTwinStrength(voiceId?: string | null): Promise<TwinStrength | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null

    // ⚠️ ONLY THE THREE COLUMNS THE CALCULATION READS. Selecting the whole row
    // would pull every stored sentence across the wire just to count them.
    let q = supabase
      .from('creator_knowledge')
      .select('kind, text, source')
      .eq('owner_id', ownerId)
      .limit(1000)
    if (voiceId) q = q.eq('voice_id', voiceId)

    const { data, error } = await q
    if (error || !Array.isArray(data)) return null

    // ⚠️ G8 — A SECOND, INDEPENDENT READ. Product facts live on
    // `product_entities.knowledge`, not `creator_knowledge` — a different
    // table, a different row shape, no `kind`/`source` columns at all. A
    // failure here must not blank the meter the first query already answered;
    // it degrades to `0`, the same "we don't know a product fact happened"
    // state an account with no products reports honestly.
    //
    // ⚖️ LIVE ROWS ONLY. An archived product's facts are not something the
    // writer can use — `archived_at is null` matches every other reader of
    // this table (`claimProductEntity`'s own limit count, `loadProductEntities`).
    let pq = supabase
      .from('product_entities')
      .select('knowledge')
      .eq('owner_id', ownerId)
      .is('archived_at', null)
    if (voiceId) pq = pq.or(`voice_id.eq.${voiceId},voice_id.is.null`)
    const { data: productRows } = await pq
    const productFactCount = Array.isArray(productRows)
      ? productRows.reduce((n, r) => {
          const k = (r as { knowledge?: unknown } | null)?.knowledge
          return n + (Array.isArray(k) ? k.length : 0)
        }, 0)
      : 0

    return twinStrength(data, productFactCount)
  } catch {
    return null
  }
}

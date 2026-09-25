// Re-check stock daily for products with a Shopify product link. Stock changes;
// a check made the day she added the product says nothing about today.
import { db } from '../db.js'
import { readAvailability, shopifyJsUrl } from '../productAvailability.js'

export const AVAILABILITY_INTERVAL_MS = 15 * 60 * 1000
export const AVAILABILITY_BATCH = 8
type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
let last = 0

export async function runAvailabilitySweep(log: Log): Promise<void> {
  if (Date.now() - last < AVAILABILITY_INTERVAL_MS) return
  last = Date.now()
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await db.from('product_entities')
    .select('id, product_url, affiliate_url')
    .is('archived_at', null)
    .or(`availability_checked_at.is.null,availability_checked_at.lt.${since}`)
    .limit(40)
  if (error) { log('error', 'availability_read_failed', { error: error.message }); return }
  let checked = 0, sold = 0
  for (const row of (data ?? [])) {
    if (checked >= AVAILABILITY_BATCH) break
    const js = shopifyJsUrl((row.product_url as string | null) ?? (row.affiliate_url as string | null))
    const now = new Date().toISOString()
    if (!js) {
      // not a shop we can read — stamp it so it is not re-selected every run
      await db.from('product_entities').update({ availability_checked_at: now }).eq('id', row.id)
      continue
    }
    checked += 1
    let read = null
    try {
      const res = await fetch(js, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      if (res.ok) read = readAvailability(await res.json())
    } catch { /* unreachable shop: leave the previous value, retry tomorrow */ }
    await db.from('product_entities').update({
      availability_checked_at: now,
      ...(read ? { availability: read.availability, sold_out_variants: read.soldOutVariants } : {}),
    }).eq('id', row.id)
    if (read?.availability === 'sold_out') sold += 1
  }
  if (checked) log('info', 'availability', { event: 'availability', checked, sold_out: sold })
}

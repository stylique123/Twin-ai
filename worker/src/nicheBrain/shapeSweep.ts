// Read the shape of each physical product from its shop photo, once.
// ⚖️ ADDITIVE: it only ever APPENDS one `object_shape` fact; it never rewrites
// what extraction found, and a product it cannot read is stamped and left alone.
import { db } from '../db.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { shopifyJsUrl } from '../productAvailability.js'
import { SHAPE_SCHEMA, SHAPE_SYSTEM, normalizeShape, ogImage, shopifyImage } from '../productShape.js'

export const SHAPE_INTERVAL_MS = 10 * 60 * 1000
export const SHAPE_BATCH = 4
const MAX_BYTES = 5 * 1024 * 1024
type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
let last = 0

async function photoUrl(productUrl: string): Promise<string | null> {
  const js = shopifyJsUrl(productUrl)
  if (js) {
    try {
      const r = await fetch(js, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      if (r.ok) { const u = shopifyImage(await r.json()); if (u) return u }
    } catch { /* fall through to the page */ }
  }
  try {
    const r = await fetch(productUrl, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(15_000), redirect: 'follow' })
    return r.ok ? ogImage((await r.text()).slice(0, 400_000)) : null
  } catch { return null }
}

async function download(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return buf.length > 0 && buf.length <= MAX_BYTES ? { mimeType: type, data: buf.toString('base64') } : null
  } catch { return null }
}

export async function runShapeSweep(log: Log): Promise<void> {
  if (Date.now() - last < SHAPE_INTERVAL_MS) return
  last = Date.now()
  const { data, error } = await db.from('product_entities')
    .select('id, product_url, knowledge')
    .eq('type', 'PHYSICAL_PRODUCT').is('archived_at', null).is('shape_checked_at', null)
    .not('product_url', 'is', null).limit(SHAPE_BATCH)
  if (error) { log('error', 'shape_read_failed', { error: error.message }); return }
  let read = 0
  for (const row of data ?? []) {
    const now = new Date().toISOString()
    const stamp = (extra: Record<string, unknown> = {}) =>
      db.from('product_entities').update({ shape_checked_at: now, ...extra }).eq('id', row.id)
    const knowledge = Array.isArray(row.knowledge) ? row.knowledge as Array<{ field?: string }> : []
    if (knowledge.some((f) => f?.field === 'object_shape')) { await stamp(); continue }
    const url = await photoUrl(row.product_url as string)
    const img = url ? await download(url) : null
    if (!img) { await stamp(); continue }
    try {
      const shape = normalizeShape(await geminiJson(SHAPE_SYSTEM, 'What is this product, physically?', SHAPE_SCHEMA, 30_000, 0, modelForTask('extract'), [img]))
      if (!shape) { await stamp(); continue }
      await stamp({ knowledge: [...knowledge, {
        field: 'object_shape', value: shape, trust: 'usable', source: 'shop_photo', sourceUrl: url, extractedAt: now,
      }] })
      read += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // A quota wall says nothing about the product: leave it for the next run.
      if (/quota|429|API key/i.test(msg)) { log('error', 'shape_stopped', { error: msg.slice(0, 200) }); return }
      await stamp()
    }
  }
  if (read) log('info', 'shape_sweep', { event: 'shape_sweep', read })
}

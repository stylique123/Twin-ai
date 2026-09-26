// WHAT THE PRODUCT PHYSICALLY IS — read from the shop's own product photo.
//
// ⚠️ MEASURED 2026-09-26: 0 of 20 physical products had an `object_shape`.
// Extraction from a shop link sends the page TEXT only, and the extractor may
// report a shape only from a photograph or an explicit statement — so a bowl
// was never read as a bowl, and every ceramics script got the unnarrowed
// action set, "twist the cap off" included.
//
// Pure: finding the photo url and clamping the answer. The sweep does the I/O.

export const SHAPES = ['jar', 'bottle', 'tube', 'bag', 'box', 'flat', 'garment', 'device', 'food', 'vessel'] as const
export type Shape = typeof SHAPES[number]

/** Shopify `.js` product json → its main photo url (https), else null. */
export function shopifyImage(raw: unknown): string | null {
  const p = raw as { featured_image?: unknown; images?: unknown } | null
  const first = typeof p?.featured_image === 'string' ? p.featured_image
    : Array.isArray(p?.images) && typeof p.images[0] === 'string' ? p.images[0] : null
  return first ? absolute(first) : null
}

/** `<meta property="og:image">` from a page, else null. */
export function ogImage(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
  return m ? absolute(m[1]) : null
}

function absolute(u: string): string | null {
  const s = u.trim().replace(/&amp;/g, '&')
  const url = s.startsWith('//') ? `https:${s}` : s
  try { return new URL(url).protocol === 'https:' ? url : null } catch { return null }
}

export const SHAPE_SYSTEM = [
  'You look at ONE product photo from a shop and say what the product physically is.',
  `Answer with one of: ${SHAPES.join(', ')} — or "unknown".`,
  'vessel = bowl, mug, cup, vase, planter. jar = has a lid that twists or lifts (candles in jars count). flat = card, print, sticker, plate lying flat.',
  'If the photo shows several different products, a lifestyle scene where the product is unclear, or no product at all, answer "unknown". Never guess.',
].join('\n')

export const SHAPE_SCHEMA = {
  type: 'OBJECT',
  properties: { shape: { type: 'STRING', enum: [...SHAPES, 'unknown'] } },
  required: ['shape'],
}

export function normalizeShape(raw: unknown): Shape | null {
  const s = (raw as { shape?: unknown } | null)?.shape
  return typeof s === 'string' && (SHAPES as readonly string[]).includes(s) ? (s as Shape) : null
}

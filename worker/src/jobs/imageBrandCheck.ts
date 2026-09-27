// ⚠️ A PHOTO'S BRAND MUST BE HERS, OR NOTHING FROM THE PHOTO IS HERS.
//
// Reported on a coffee roaster: a random, unrelated photo was read perfectly —
// "MYLIBERICA Coffee 06 Signature Blend" — and presented as HER product. The
// reading was accurate; the attribution was wrong. So the extractor now reports
// the brand printed in the photo, and it is checked against every name she has
// already given Twin (her brands, her products, her handle).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Words any shop in the category shares — "coffee" is in both brands' names
// on the live case, and it says nothing about WHOSE product it is.
const COMMON = new Set(['coffee', 'roast', 'roasters', 'roaster', 'roastery', 'blend', 'signature', 'company', 'shop',
  'store', 'studio', 'brand', 'official', 'original', 'handmade', 'made', 'with', 'love', 'house', 'home', 'the',
  'beans', 'bean', 'tea', 'bakery', 'kitchen', 'ceramics', 'pottery', 'candle', 'candles', 'skincare', 'beauty'])
const tokens = (s: string) => norm(s).split(' ').filter((w) => w.length >= 4 && !COMMON.has(w))

/** True when the visible brand plausibly IS one of her names (or nothing was visible). */
export function brandIsHers(visible: string | null | undefined, herNames: ReadonlyArray<string | null | undefined>): boolean {
  const v = norm(String(visible ?? ''))
  if (!v) return true
  const vt = new Set(tokens(v))
  const compact = v.replace(/ /g, '')
  for (const raw of herNames) {
    const n = norm(String(raw ?? ''))
    if (!n) continue
    if (compact.includes(n.replace(/ /g, '')) || n.replace(/ /g, '').includes(compact)) return true
    if (tokens(n).some((t) => vt.has(t))) return true
  }
  return false
}

/** Fields a mismatched photo may not contribute: what the thing IS called and said to be. */
export const IDENTITY_FIELDS: ReadonlySet<string> = new Set(['name', 'description', 'category'])

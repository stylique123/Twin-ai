// ⚠️ OWNER REPORT: the product guess "bandanas, collars, bows, and mystery packs"
// could only be accepted as ONE product or denied. A list is several products,
// and one entity named after all four is a product nobody sells.

/**
 * The separate items in a guessed offer, or [] when it is not a list.
 *
 * ⚖️ CONSERVATIVE BY DESIGN. Only a short, comma/"and"/"&"-separated list of
 * short noun phrases splits; a sentence ("Fresh loaves baked daily and shipped
 * via link in bio") does not, because splitting prose invents product names.
 */
export function splitProductList(text: string | null | undefined): string[] {
  const s = String(text ?? '').trim().replace(/[.!]+$/, '')
  if (!s || s.length > 200) return []
  const parts = s
    .split(/\s*(?:,|;|\/|\+|&|\band\b|\bor\b|\n)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return []
  // Every part must read as a short name, not a clause.
  const clause = /\b(?:via|with|for|that|which|who|is|are|we|i|my|our|to)\b/i
  if (parts.some((p) => p.split(/\s+/).length > 4 || clause.test(p))) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(p) }
  }
  return out.length >= 2 ? out : []
}

export type OfferKind = 'product' | 'service' | 'content'
export interface OfferPiece { name: string; kind: OfferKind }

/** ⚠️ A BUNDLED OFFER IS SEVERAL THINGS OF DIFFERENT KINDS. "Fresh roasted beans
 *  and mentorship for building a coffee cart" is a product and paid advice; the
 *  name splitter above refuses it (it reads as a clause), so the scan's own
 *  `offer_items` are used while the text is still the scan's. Once she edits
 *  the offer, her words win and the plain splitter answers (as products). */
export function offerPieces(
  offerText: string | null | undefined,
  scanOffer: string | null | undefined,
  scanItems: ReadonlyArray<{ name?: unknown; kind?: unknown }> | null | undefined,
): OfferPiece[] {
  const text = String(offerText ?? '').trim()
  const untouched = text !== '' && text === String(scanOffer ?? '').trim()
  if (untouched && Array.isArray(scanItems)) {
    const seen = new Set<string>()
    const out: OfferPiece[] = []
    for (const o of scanItems) {
      const name = typeof o?.name === 'string' ? o.name.trim() : ''
      const kind = o?.kind === 'product' || o?.kind === 'service' || o?.kind === 'content' ? o.kind : null
      if (!name || !kind || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      out.push({ name, kind })
    }
    if (out.length >= 2) return out
  }
  return splitProductList(text).map((name) => ({ name, kind: 'product' as const }))
}

export const OFFER_KIND_LABEL: Record<OfferKind, string> = {
  product: 'product', service: 'service / advice', content: 'free content',
}

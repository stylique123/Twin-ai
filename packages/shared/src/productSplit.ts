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

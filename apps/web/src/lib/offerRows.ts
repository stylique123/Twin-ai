// Options & prices, stored as the one `offer` text generate-blueprint reads:
// one "Option — price" per line, then "Includes: …".
export type OfferRow = { name: string; price: string }
const INCLUDES = 'Includes: '

export function parseOffer(v: string | null): { rows: OfferRow[]; included: string } {
  const rows: OfferRow[] = []
  let included = ''
  for (const line of (v ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith(INCLUDES)) { included = line.slice(INCLUDES.length); continue }
    const i = line.indexOf(' — ')
    rows.push(i >= 0 ? { name: line.slice(0, i), price: line.slice(i + 3) } : { name: '', price: line })
  }
  return { rows, included }
}

export function serializeOffer(rows: OfferRow[], included: string): string | null {
  const lines = rows
    .map((r) => ({ name: r.name.trim(), price: r.price.trim() }))
    .filter((r) => r.name || r.price)
    .map((r) => (r.name && r.price ? `${r.name} — ${r.price}` : r.name || r.price))
  if (included.trim()) lines.push(INCLUDES + included.trim())
  return lines.length ? lines.join('\n') : null
}


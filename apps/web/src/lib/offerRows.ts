// Options & prices, stored as the one `offer` text generate-blueprint reads:
// one "Option — price" per line (optionally "… (includes: …)"), then the older
// shared "Includes: …" line, kept only for rows saved before per-row includes.
//
// ⚠️ ONE "WHAT'S INCLUDED" FOR EVERY ROW WAS WRONG: a 12oz bag and a 5lb bulk
// bag do not include the same things (reported on a coffee roaster).
export type OfferRow = { name: string; price: string; includes?: string }
const ROW_INCLUDES = / \(includes: (.+)\)$/
const INCLUDES = 'Includes: '

export function parseOffer(v: string | null): { rows: OfferRow[]; included: string } {
  const rows: OfferRow[] = []
  let included = ''
  for (const line of (v ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith(INCLUDES)) { included = line.slice(INCLUDES.length); continue }
    const m = line.match(ROW_INCLUDES)
    const body = m ? line.slice(0, m.index) : line
    const inc = m ? { includes: m[1] } : {}
    const i = body.indexOf(' — ')
    rows.push(i >= 0 ? { name: body.slice(0, i), price: body.slice(i + 3), ...inc } : { name: '', price: body, ...inc })
  }
  return { rows, included }
}

export function serializeOffer(rows: OfferRow[], included: string): string | null {
  const lines = rows
    .map((r) => ({ name: r.name.trim(), price: r.price.trim(), includes: (r.includes ?? '').trim() }))
    .filter((r) => r.name || r.price)
    .map((r) => `${r.name && r.price ? `${r.name} — ${r.price}` : r.name || r.price}${r.includes ? ` (includes: ${r.includes})` : ''}`)
  if (included.trim()) lines.push(INCLUDES + included.trim())
  return lines.length ? lines.join('\n') : null
}


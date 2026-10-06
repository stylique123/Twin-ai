// CONFLICTING FACTS ARE HELD, NEVER CHOSEN (owner 2026-10-06, privacy sheet #2).
//
// Her store says the "signature" coffee is a Brazil roast in two facts, while
// other facts name Colombia, Mexico and Ethiopia roasts. Which origin the
// Signature Blend is was never said, so the writer picked one per script. When
// the facts about ONE product give different values for the same attribute,
// none of them reaches the writer and she is asked which is current.

const ORIGINS = ['brazil', 'colombia', 'mexico', 'ethiopia', 'guatemala', 'kenya', 'peru', 'honduras', 'sumatra', 'costa rica', 'el salvador', 'nicaragua', 'rwanda', 'burundi', 'yemen', 'panama', 'india', 'vietnam', 'tanzania', 'uganda']

export interface ConflictRow { id?: unknown; text?: unknown }

function originsIn(text: string): string[] {
  const t = ` ${text.toLowerCase()} `
  return ORIGINS.filter((o) => t.includes(` ${o} `) || t.includes(` ${o},`) || t.includes(` ${o}.`))
}

/**
 * Facts about `productName` (they name the product or a distinctive word of it)
 * that state an origin. A conflict is two or more different origins.
 */
export function originConflict<R extends ConflictRow>(rows: readonly R[], productName: string): { values: string[]; rows: R[] } | null {
  const words = (productName.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !['beans', 'coffee', 'blend', 'roast'].includes(w))
  if (!words.length) return null
  const about = rows.filter((r) => words.some((w) => String(r.text ?? '').toLowerCase().includes(w)))
  const withOrigin = about.map((r) => ({ r, o: originsIn(String(r.text ?? '')) })).filter((x) => x.o.length > 0)
  const values = [...new Set(withOrigin.flatMap((x) => x.o))]
  return values.length >= 2 ? { values, rows: withOrigin.map((x) => x.r) } : null
}

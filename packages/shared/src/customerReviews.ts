// CUSTOMER REVIEWS → ONE WRITER LINE (24-ideas #14). The pure half; the worker
// reads them from the product page's own schema.org data.
//
// ⚠️ A CUSTOMER'S WORDS ARE NEVER HERS. The line tells the writer to attribute
// any quote to "a customer", never to present it as her experience, and never to
// turn a review into an outcome she promises. The rating is stated only as the
// shop states it.

export function renderCustomerReviews(stored: unknown): string | null {
  const r = (stored && typeof stored === 'object' ? stored : null) as
    { rating?: unknown; count?: unknown; quotes?: unknown } | null
  if (!r) return null
  const rating = typeof r.rating === 'number' && r.rating > 0 && r.rating <= 5 ? r.rating : null
  const count = typeof r.count === 'number' && r.count >= 1 ? Math.round(r.count) : null
  const quotes = (Array.isArray(r.quotes) ? r.quotes : [])
    .filter((q): q is string => typeof q === 'string' && q.trim().length >= 20).slice(0, 3)
  if (rating === null && quotes.length === 0) return null
  const parts: string[] = []
  if (rating !== null) parts.push(`the shop page shows ${rating} out of 5${count ? ` from ${count} reviews` : ''}`)
  if (quotes.length) parts.push(`customers wrote: ${quotes.map((q) => `"${q.trim()}"`).join(' / ')}`)
  return '\n- CUSTOMER REVIEWS FROM THE PRODUCT PAGE (their words, not the creator\'s): ' + parts.join('; ') + '.'
    + '\n  Use at most one, attributed ("a customer wrote…"). Never present a review as the creator\'s own experience,'
    + ' never turn it into a result she promises, and never change the rating or the count.'
}

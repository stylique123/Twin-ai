// THE NAMES OF THE SECTIONS A PAGE ACTUALLY CONTAINS.
//
// ⚠️ ITS OWN MODULE, AND THAT IS THE POINT. `extractProduct.ts` imports `db.ts`,
// which imports `env.ts`, which THROWS on a missing SUPABASE_URL — so a test of
// this pure function could not even collect while it lived there. The same
// lesson `speechModelLabel` was moved out for: a rule worth testing must be
// reachable without booting the whole worker.

/** The NAMES of the sections a page actually contains, taken from its own
 *  headings and landmark labels.
 *
 *  ⚠️⚠️ WITHOUT THIS, `page_section` COULD NEVER BE FILLED BY ANYONE. Measured
 *  2026-09-21: across all 24 production product entities, `page_section` is
 *  present on ZERO — including three pages re-read that same day, which
 *  returned 23, 22 and 26 other facts each. The extraction was working; the
 *  field was unobtainable.
 *
 *  The reason is `fetchPageText`'s own reduction, twenty lines below:
 *  `.replace(/<[^>]+>/g, ' ')` strips EVERY tag, so what reaches the model is a
 *  flat wall of prose. Its instruction says "name only what you SAW" and
 *  "never report a section because a product of this kind usually has one" —
 *  both correct — and a model shown no structure has correctly seen no
 *  sections. The strict instruction and the lossy fetch together guaranteed a
 *  permanent blank.
 *
 *  ⚖️ A HEADING IS EVIDENCE, NOT A GUESS, which is the whole reason this is
 *  allowed to exist. `<h2>Pricing</h2>` is the page naming its own section in
 *  its own words; reporting it is observation. Inferring "this is SaaS so it
 *  has a dashboard" is the invention the instruction rightly forbids, and
 *  nothing here does that — every name returned was literally present.
 *
 *  ⚠️ CAPPED AND DEDUPED. A long page can carry a hundred headings and a
 *  creator can only be pointed at a few; flooding the prompt with them would
 *  crowd out the prose that states the offer.
 */
export function harvestSections(html: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  const push = (raw: string) => {
    // Inner tags inside a heading ("<h2>Simple <em>pricing</em></h2>") would
    // otherwise arrive as markup, which is not a name a creator can be sent to.
    // ⚠️ ENTITIES ARE DECODED, AND THE TEST THAT CAUGHT THIS IS WHY IT EXISTS.
    // `<h2>Burn time &amp; care</h2>` was harvested verbatim, so the name a
    // creator would be told to point a camera at read "Burn time &amp; care".
    // A source-level assertion saw a function that stripped tags and passed;
    // only running it over a real heading showed the output.
    const name = raw.replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ').trim()
    if (name === '' || name.length > 60) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push(name)
  }
  for (const m of html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) push(m[2])
  // ⚖️ ARIA LABELS COUNT TOO, and on a component-built page they are often the
  // only name a section has — a React pricing block frequently renders no
  // heading at all, just a labelled region.
  for (const m of html.matchAll(/<(?:section|nav|main|aside)[^>]+aria-label=["']([^"']+)["']/gi)) push(m[1])
  return names.slice(0, 25)
}

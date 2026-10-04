// GENERATED FROM packages/shared/src/script/roleClaims.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// ROLE CLAIMS — "my coffee cart business", "I run a bakery" — only when she
// said it (owner, 2026-10-04).
//
// ⚠️ A topic the scan inferred from her captions ("Building and operating a
// small batch coffee roasting and coffee cart business") reached a script as
// "Building my coffee cart business in Farmington taught me…" — a claim she
// operates a cart, which she never made. The writer is told; it still did.
// So the finished line is checked: a business, role or venture claimed in the
// first person must be named in what she stated herself (her facts, brand,
// product, her note). Otherwise the line is not hers to say.

const VENTURE = '(?:business|company|cart|truck|shop|store|studio|bakery|caf[eé]|roastery|salon|brand|clinic|agency|practice|restaurant|farm|gym|boutique|label)'
const CLAIM = new RegExp([
  String.raw`\b(?:my|our)\s+((?:[a-z-]+\s+){0,3}` + VENTURE + String.raw`)\b`,
  String.raw`\bi\s+(?:run|own|operate|founded|started|opened|built|am building|'m building)\s+(?:a|an|my|our|the)\s+((?:[a-z-]+\s+){0,3}` + VENTURE + String.raw`)\b`,
  String.raw`\b(?:building|running|operating|owning)\s+(?:my|our)\s+((?:[a-z-]+\s+){0,3}` + VENTURE + String.raw`)\b`,
].join('|'), 'gi')

const STOP = new Set(['small', 'little', 'own', 'new', 'first', 'tiny', 'local', 'batch', 'whole', 'entire', 'very'])

/** The venture phrases a line claims as hers that her stated material never names. */
export function unconfirmedRoleClaims(line: string, statedText: string): string[] {
  const stated = statedText.toLowerCase()
  const out: string[] = []
  for (const m of line.toLowerCase().matchAll(CLAIM)) {
    const phrase = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (!phrase) continue
    // Every distinctive word of the venture must appear in what she stated.
    const words = phrase.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
    if (words.some((w) => !stated.includes(w.replace(/s$/, '')))) out.push(phrase)
  }
  return [...new Set(out)]
}

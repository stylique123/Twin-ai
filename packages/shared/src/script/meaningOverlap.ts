// THE QUESTION ENGINE'S MEANING CHECK (moved here unchanged from questionEngine.ts,
// 12 Nov, so the facts-only writer shares it in the edge and the worker).
// Pure; no imports.
const STOP = new Set('a an the and or but so to of in on at for with from by is are was were be it its this that you your i my me we our they their how what why when who do does did not no have has had just about into over more most'.split(' '))
const words = (t: string) => new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))
/** Meaning overlap of two texts (shared content words / the shorter text's). */
export const overlap = (a: string, b: string) => {
  const x = words(a); const y = words(b)
  if (!x.size || !y.size) return 0
  let n = 0
  for (const w of x) if (y.has(w)) n++
  return n / Math.min(x.size, y.size)
}

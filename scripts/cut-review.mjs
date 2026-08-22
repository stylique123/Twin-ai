// DOES TWIN'S EDITING SOUND BAD? ONLY A HUMAN EAR CAN SAY.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// #57 asks whether the automatic cuts are audibly wrong. Nothing in the render
// pipeline can answer that: a cut can be frame-perfect, within tolerance, and
// still clip a breath or land mid-word. The measurement is one person
// listening to a few seconds of audio and saying "that sounded wrong".
//
// ⚠️ SO THIS FILE AUTOMATES EVERYTHING EXCEPT THE LISTENING. It decides which
// renders are eligible, where the review clips start and end, and which
// controls to mix in. It does NOT decide whether a cut sounds bad, and no
// output of this module may ever be read as if it did.
//
// ⚖️ AND IT WAITS FOR REAL EVIDENCE. `render_attempts` rows exist from staging
// matrices; those are not recordings anybody made through the product, and
// scoring them would answer a question about creators with a question about
// CI. Eligibility is deliberately narrow.

import { createHash } from 'node:crypto'

/**
 * ⚠️ `teleprompter` IS THE PRODUCT PATH; `upload` IS NOT.
 *
 * A creator who uploads a file they shot elsewhere is testing Twin's editing of
 * someone else's footage. #57 is about the funnel THROUGH the product -- the
 * script they were given, read on the teleprompter, cut by Twin. Mixing the two
 * populations is how a bad-cut rate stops meaning anything.
 */
export const PRODUCT_ORIGINS = Object.freeze(['teleprompter'])

export const isProductOrigin = (row) => PRODUCT_ORIGINS.includes(String(row?.origin ?? ''))

/** How many genuine renders before a packet is worth building. */
export const RENDERS_NEEDED = 2

/**
 * ⚠️ A RENDER THAT FAILED VALIDATION IS NOT A VIDEO ANYBODY WATCHED. It may not
 * exist on disk at all. Reviewing it would mean labelling cuts in a file the
 * creator never saw.
 */
export function eligibleRenders(rows) {
  return (rows ?? []).filter((r) =>
    isProductOrigin(r)
    && r.render_completed === true
    && typeof r.output_duration_ms === 'number' && r.output_duration_ms > 0
    && Array.isArray(r.cuts) && r.cuts.length > 0)
}

/**
 * Is there enough real evidence to build a packet?
 *
 * ⚠️ RETURNS THE SHORTFALL, NOT JUST A BOOLEAN. "not yet" and "not yet, and
 * here is how far off we are" are the difference between a status anybody can
 * act on and one that just says no.
 */
export function packetReadiness(rows, needed = RENDERS_NEEDED) {
  const eligible = eligibleRenders(rows)
  return {
    eligible: eligible.length,
    needed,
    ready: eligible.length >= needed,
    shortfall: Math.max(0, needed - eligible.length),
    // Counted so a caller can say WHY nothing is eligible rather than implying
    // the creator made nothing.
    seen: (rows ?? []).length,
    uploadsExcluded: (rows ?? []).filter((r) => !isProductOrigin(r)).length,
  }
}

/** The review clip around one cut. The owner asked for ±1.5–2 seconds. */
export const PAD_MS = 1750

/**
 * ⚠️ CLAMPED, AND THE CUT STAYS OFF-CENTRE WHEN IT HAS TO.
 *
 * A cut 400 ms into the video cannot have 1750 ms of lead-in. Shifting the
 * window to keep the cut centred would move it somewhere the cut is not, so the
 * window is clamped instead and the cut simply sits nearer one edge.
 *
 * ⚖️ AND `atMs` IS REPORTED SEPARATELY FROM THE WINDOW. A reviewer scrubbing a
 * clip needs to know where in it the cut actually falls; recomputing that from
 * the window would be wrong at exactly the clamped edges.
 */
export function reviewWindow(atMs, durationMs, padMs = PAD_MS) {
  if (!Number.isFinite(atMs) || atMs < 0) throw new Error(`cut at ${atMs} is not a position`)
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error(`duration ${durationMs} is not positive`)
  if (atMs > durationMs) throw new Error(`cut at ${atMs} is past the ${durationMs} end`)
  const startMs = Math.max(0, atMs - padMs)
  const endMs = Math.min(durationMs, atMs + padMs)
  return { startMs, endMs, atMs, offsetInClipMs: atMs - startMs }
}

/** Deterministic 0..1 from a string. Seeded so a packet is reproducible: the
 *  same render must yield the same controls on a re-run, or two people
 *  labelling "the same" packet are labelling different things. */
const seeded = (seed, i) => {
  const h = createHash('sha256').update(`${seed}:${i}`).digest()
  return h.readUInt32BE(0) / 0x100000000
}

/**
 * Pick control positions: places where NO cut happened.
 *
 * ⚠️ WITHOUT CONTROLS THE RATE IS UNINTERPRETABLE. A reviewer told "these are
 * the cuts" will find something wrong with a share of them no matter what the
 * audio does. Controls measure that floor. They must be indistinguishable from
 * real cuts in the packet, which is why this returns them in the SAME shape and
 * why callers must shuffle before display.
 *
 * ⚠️ AND A CONTROL MUST NOT LAND ON A REAL CUT. `minGapMs` keeps them clear;
 * a control that quietly sits on a cut is scored as a false positive against
 * the very thing it is supposed to be a baseline for.
 */
export function controlPositions(cutsMs, durationMs, count, seed, minGapMs = PAD_MS) {
  const out = []
  const clear = (t) => cutsMs.every((c) => Math.abs(c - t) >= minGapMs)
      && out.every((o) => Math.abs(o - t) >= minGapMs)
  // Bounded attempts: a short video densely cut may simply have nowhere safe,
  // and returning fewer honest controls beats inventing unsafe ones.
  for (let i = 0; i < count * 40 && out.length < count; i++) {
    const t = Math.round(seeded(seed, i) * durationMs)
    if (t > minGapMs && t < durationMs - minGapMs && clear(t)) out.push(t)
  }
  return out.sort((a, b) => a - b)
}

/**
 * Build the review items for one render: every real cut, plus controls.
 *
 * ⚠️ THE ITEMS CARRY `isControl`, AND THE PACKET MUST NOT SHOW IT. It is here
 * so the SCORER can separate the populations after the labels are locked. A
 * reviewer who can see which is which is not measuring a floor, they are being
 * told the answer.
 */
export function reviewItems(render, { padMs = PAD_MS } = {}) {
  const cuts = [...render.cuts].sort((a, b) => a - b)
  const seed = String(render.render_id ?? render.id ?? '')
  if (!seed) throw new Error('a render needs an id to seed its controls reproducibly')
  const controls = controlPositions(cuts, render.output_duration_ms, cuts.length, seed, padMs)
  const mk = (atMs, isControl) => ({
    render_id: seed,
    ...reviewWindow(atMs, render.output_duration_ms, padMs),
    isControl,
  })
  return [...cuts.map((c) => mk(c, false)), ...controls.map((c) => mk(c, true))]
}

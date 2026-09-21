// GENERATED FROM packages/shared/src/script/transcriptReferencePoints.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE REFERENCE THE CREATOR PASTED COUNTED FOR NOTHING.
//
// ⚠️⚠️ MEASURED ACROSS ALL 154 GENERATIONS, 2026-09-21:
//
//   generations carrying a reference ................. 154
//   whose reference has ANY row in
//     `reference_content_profiles` ................... 3
//   whose reference has a `structure` there .......... 1
//
// `substanceBudget` takes three inputs — referencePoints + storeItems +
// productFacts — and `referencePoints` is read from
// `reference_content_profiles.profile.structure`. That table holds the SCRAPED
// GALLERY (2,393 rows, all gallery URLs). Creators paste their own URLs. The
// two corpora are disjoint, so one of the three inputs has been null on 153 of
// 154 real generations.
//
// ⚠️ AND THE ANSWER WAS ALREADY IN THE DATABASE. `transcripts.structure` holds
// the beat breakdown of what creators actually paste — 113 rows carry one — and
// nothing has ever read it for the budget. A column written and never read, in
// the table the reference already lives in.
//
// ⚖️ WHY THIS IS RUNWAY AND NOT JUST TIDINESS. The budget binds through
// `Math.min(targetBeats, budget)`. A creator with a modest store of three items
// sits at 3 + 0 + FREE_BEATS = 5 against a sixty-second target of 6 — so the
// target loses and the script comes out a scene short, which is the shape of
// the owner's own Firo report. Measured on the 113 stored structures, a pasted
// reference yields a median 3 points, which clears that target.

/** The beat shape `transcripts.structure` actually stores. Deliberately NOT
 *  the `Assessed<Beat[]>` that `reference_content_profiles` uses: these beats
 *  carry `beat`, `goal` and `at_sec`, and no `role` at all. */
export interface TranscriptStructureBeat {
  readonly at_sec?: unknown
}

export interface TranscriptStructure {
  readonly beats?: unknown
  readonly cta?: unknown
  readonly hook_window_sec?: unknown
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * The reference's CONTENT-carrying beats, counted from a pasted transcript.
 *
 * ⚠️ THE HOOK AND THE CTA ARE EXCLUDED, and that is the whole reason this is
 * not `beats.length`. `SubstanceSources.referencePoints` says it in its own
 * docstring: "NOT its hook and CTA — every script gets those regardless, so
 * counting them as substance would credit the budget for structure it always
 * has and let a reference with nothing in it look full." These beats carry no
 * `role`, so the hook is identified by the structure's own `hook_window_sec`
 * and the CTA by the structure's own `cta` field. Measured on all 113 stored
 * structures: 5.0 beats average, 4.0 after the hook window, 113 of 113
 * carrying a CTA, giving a median 3 points.
 *
 * ⚠️ NULL WHEN THERE ARE NO BEATS TO COUNT, NEVER ZERO — the same rule
 * `referencePointsFrom` states for the gallery shape. Zero would say "this
 * reference makes no points", a finding nobody made, and would then cap the
 * script rather than leave it uncapped.
 *
 * ⚖️ A MISSING `hook_window_sec` COUNTS EVERY BEAT AFTER THE FIRST, rather than
 * counting them all. The opening beat of a short-form video is its hook whether
 * or not anything measured the window, and crediting it would inflate every
 * reference by one.
 */
export function referencePointsFromTranscriptStructure(
  structure: TranscriptStructure | null | undefined,
): number | null {
  const beats = structure?.beats
  if (!Array.isArray(beats)) return null
  if (beats.length === 0) return null

  // ⚖️ THE HOOK COMES OFF EITHER WAY; ONLY THE MEANS DIFFER. With a measured
  // window, drop every beat that starts inside it. Without one, drop the
  // opening beat — a short-form video's first beat is its hook whether or not
  // anything measured the window, and crediting it would inflate every
  // reference by one.
  //
  // ⚠️ A BEAT WITH NO TIMESTAMP IS KEPT. Dropping it would silently shrink a
  // reference for a measurement failure that is ours, not the video's.
  const hookWindow = num(structure?.hook_window_sec)
  const afterHook = hookWindow === null
    ? beats.length - 1
    : beats.filter((b) => {
        const at = num((b as TranscriptStructureBeat)?.at_sec)
        return at === null || at >= hookWindow
      }).length

  const hasCta = typeof structure?.cta === 'string' && structure.cta.trim() !== ''
  return Math.max(0, afterHook - (hasCta ? 1 : 0))
}

/**
 * The cache key `transcripts.url_key` is written with.
 *
 * ⚠️ THIS NORMALISATION ALREADY EXISTS IN THREE PLACES — `worker/src/jobs/
 * transcribe.ts` (`urlKey`), `worker/src/jobs/voice.ts` (`ownUrlKey`) and
 * `supabase/functions/ingest-reference/index.ts`, whose own comment says "Must
 * match the worker's urlKey() normalization." A fourth hand-written copy is
 * exactly the drift that comment is worried about, so this one is generated
 * into the edge `_shared` rather than typed twice. The worker copies are left
 * alone: the worker may not import `@twinai/shared`, and a reader keyed on a
 * DIFFERENT key than the writer finds nothing — which is the failure this
 * function exists to avoid, not one to introduce while tidying.
 */
export function referenceUrlKey(url: unknown): string {
  const raw = typeof url === 'string' ? url : ''
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const v = u.searchParams.get('v')
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    return host + path + (v ? `?v=${v.toLowerCase()}` : '')
  } catch {
    return raw.toLowerCase().trim()
  }
}

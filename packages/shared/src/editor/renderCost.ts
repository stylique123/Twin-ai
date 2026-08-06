// WHAT A RENDER COST — INSTRUMENT FIRST, GATE SECOND.
//
// C6 on the open-items ledger: "Nothing measures what a render costs, and
// nothing refuses one before the money is spent." Those are two changes and the
// order between them is not a preference. A gate built before a measurement is a
// number somebody guessed, applied to every creator, defended afterwards — and
// the guessed number becomes policy the moment it ships, because nothing exists
// to argue with it.
//
// So this measures and refuses nothing. There is no threshold in this file, no
// budget, and no boolean anywhere that a caller could mistake for permission.
//
// ── IT MEASURES ONLY WHAT WAS ALREADY RECORDED ────────────────────────────
//
// Deliberately no new writer and no new column. Every fact used here is one the
// pipeline already writes for its own reasons:
//
//   * `edit_director_calls` — the model, and 0101's three token counts.
//   * `edit_events` — the append-only stage log, whose timestamps are the only
//     honest source for how long each stage actually took.
//   * `edit_outputs.measured_duration_ms` — the MEASURED length of the video,
//     which 0096 takes from the probe rather than from the plan's promise.
//
// The alternative — a `render_cost` table filled by a new worker write — would
// be unverifiable today: editor v2 has never completed a run in production, so
// the writer could not be observed working and the reader would report zeros
// that look like cheap renders. Reading what is already there produces a real
// answer on the first project that finishes, and produces an HONEST GAP for
// everything nobody records yet.
//
// ── THE GAP IS PART OF THE ANSWER, NOT A FOOTNOTE ─────────────────────────
//
// Tokens are counted. Wall-clock is derivable. The two costs that actually
// dominate a video pipeline — GPU/CPU seconds on the VPS, and egress — are
// recorded NOWHERE, and no arithmetic over these tables can recover them.
//
// So `RenderCost` names what is missing (`unmeasured`) rather than summing what
// it has into a total. A single "this render cost X" figure assembled from the
// cheap half would be wrong in the direction that matters — it would make every
// render look affordable, and a gate built on it later would let through
// exactly the expensive ones it was meant to catch.

/** A stage's span, from the event log. */
export interface StageSpan {
  stage: string
  /** Milliseconds between this stage's first and last event. */
  ms: number
}

/** Costs that are real and that nothing in this system records. */
export type UnmeasuredCost = 'compute_seconds' | 'egress_bytes' | 'storage_bytes_months'

export interface RenderCost {
  projectId: string
  /** Director tokens, when 0101's columns were filled. NULL is "not recorded",
   *  never zero: a call that predates 0101 used tokens and did not say how many,
   *  and reporting that as 0 would make an old render look free. */
  directorTokens: { prompt: number | null; response: number | null; total: number | null } | null
  /** The model that was called, so a token count can be priced later by someone
   *  who knows the rate. This file deliberately does not know it — a price table
   *  in the client goes stale silently and is wrong in currency nobody notices. */
  directorModel: string | null
  /** Per-stage wall-clock, longest first. */
  stages: StageSpan[]
  /** First event to last event. NOT a billing quantity — a project that waited
   *  in a queue accrues wall-clock while costing nothing. */
  wallClockMs: number | null
  /** The MEASURED output length. The denominator for "cost per second of video",
   *  which is the only ratio a creator would recognise. */
  outputDurationMs: number | null
  /**
   * Costs this cannot see. Always non-empty today, and that is the finding.
   *
   * Rendering happens on a VPS whose seconds nobody counts, and every playback
   * is egress nobody meters. Until those are recorded, no total is possible and
   * this refuses to compute one.
   */
  unmeasured: readonly UnmeasuredCost[]
}

/** Everything above is derived from these, and nothing else. */
export interface RenderCostInputs {
  projectId: string
  events: readonly { stage: string; created_at: string }[]
  directorCall: {
    model?: string | null
    prompt_tokens?: number | null
    response_tokens?: number | null
    total_tokens?: number | null
  } | null
  outputDurationMs?: number | null
}

/** What is structurally unrecordable here, stated once. */
export const UNMEASURED_TODAY: readonly UnmeasuredCost[] = [
  // The renderer runs on the VPS. Nothing writes a duration or a core-count for
  // the ffmpeg work, so the largest cost of a video pipeline is invisible.
  'compute_seconds',
  // Every signed URL that gets played is egress. Nothing meters it.
  'egress_bytes',
  // `media_assets` records a path, not a size, and nothing accrues over time.
  'storage_bytes_months',
]

const toMs = (iso: string): number | null => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/** An integer token count, or null. Anything else is NOT RECORDED. */
function tokenOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

/**
 * What one render cost, from facts already on disk.
 *
 * Pure, so it can be tested without a database and — more importantly — so the
 * arithmetic can be argued with. A cost figure computed inside a query is a
 * figure nobody can check.
 */
export function renderCost(input: RenderCostInputs): RenderCost {
  const byStage = new Map<string, { first: number; last: number }>()
  let earliest: number | null = null
  let latest: number | null = null

  for (const e of input.events) {
    const t = toMs(e.created_at)
    // An unparseable timestamp is DROPPED rather than treated as 0. Epoch would
    // turn one bad row into a fifty-year render.
    if (t === null) continue
    const held = byStage.get(e.stage)
    if (!held) byStage.set(e.stage, { first: t, last: t })
    else { if (t < held.first) held.first = t; if (t > held.last) held.last = t }
    if (earliest === null || t < earliest) earliest = t
    if (latest === null || t > latest) latest = t
  }

  const stages: StageSpan[] = [...byStage.entries()]
    .map(([stage, s]) => ({ stage, ms: s.last - s.first }))
    // Longest first, with the name breaking a tie so the order is stable rather
    // than merely usually-stable — the same rule the output resolver uses.
    .sort((a, b) => (b.ms - a.ms) || a.stage.localeCompare(b.stage))

  const call = input.directorCall
  const prompt = tokenOrNull(call?.prompt_tokens)
  const response = tokenOrNull(call?.response_tokens)
  const total = tokenOrNull(call?.total_tokens)

  return {
    projectId: input.projectId,
    // A call with NO recorded token count reports null rather than a zeroed
    // object — see the field comment: an old render was not free.
    directorTokens: call && (prompt !== null || response !== null || total !== null)
      ? { prompt, response, total }
      : null,
    directorModel: call?.model ?? null,
    stages,
    wallClockMs: earliest !== null && latest !== null ? latest - earliest : null,
    outputDurationMs: typeof input.outputDurationMs === 'number' ? input.outputDurationMs : null,
    unmeasured: UNMEASURED_TODAY,
  }
}

/**
 * Whether this cost is complete enough to compare two renders.
 *
 * The question a gate would eventually need to ask, answered honestly and
 * separately from any gating. It is FALSE today for every project, because
 * `unmeasured` is never empty — which is the point of returning it rather than
 * a number: the first person to build a budget has to confront that before they
 * can pick a threshold, instead of picking one from a total that was silently
 * missing its largest term.
 */
export function costIsComparable(cost: RenderCost): boolean {
  return cost.unmeasured.length === 0
}

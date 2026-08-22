// THE DEFECT IS A SLOPE, AND ONE RENDER CANNOT SHOW A SLOPE.
//
// #445 replaced a decomposed renderer that lost frames at every seam with one
// continuous zoompan. Locally that is proven exactly: 0/1/2/3 zooms rendered
// 184/184/184/184 frames, read off the MP4s. What staging has never shown is
// the same property, because Phase 8 performs ONE render and therefore observes
// ONE zoom count -- and its A17 assertion is "within the FROZEN ±250 ms", which
// is the tolerance, not the slope. A run losing five frames per zoom while every
// render sits inside tolerance has the SAME mechanism as the failure; it just
// has fewer zooms.
//
// So this sweep makes zoomCount an INPUT and renders four times in one matrix.
//
// ── WHY THE DECISION IS SUPPLIED RATHER THAN REQUESTED ──────────────────────
// zoomCount is normally an emergent property of the Director's model call, so it
// cannot be dialled. The seam is that `runCompilingStage` compiles THE PERSISTED
// DECISION, and `editor_director_succeed` writes one straight to the database.
// 0092 requires schemaVersion 2 with every field present, so a supplied decision
// is a LEGITIMATE decision, not a fake -- the only thing bypassed is the model
// call, which is exactly what must be bypassed to control the input.
//
// ⚠️ AND WHY IT NEEDS A DONOR PROJECT. The compiler is "pure Decision + PINNED
// EVIDENCE -> EditPlan": it needs the inspection/speech/analysis rows that
// stages 1-3 produce. A scratch project advanced by status alone has none, and
// `zoomRequests[].anchorWordIndex` must index the REAL transcript
// (`a >= envelope.words.length` is refused), so the words have to exist too.
// There is no flag combination that yields real stage-1-3 evidence AND a
// resumable project with no decision -- phase8's own comment records that under
// the simulated director "there is no decision row and the stage fails closed".
//
// media_analyses is an ANALYZE-ONCE CACHE keyed by
// (source_asset_id, component, analyzer_bundle_version), so a second project on
// the SAME asset reuses the first one's evidence. That is the seam this uses:
// one donor render populates the cache, and each sweep project inherits it.
//
// ⚖️ ADVISORY ON ITS FIRST OUTING, deliberately, exactly as the gate classifier
// was landed advisory-first. Every step below is inferred from schema and source
// rather than observed -- this file has never executed. Making a 90-minute
// matrix fail on the first run of an unproven experiment is how a real renderer
// regression gets mistaken for a broken harness. It REPORTS the verdict and
// returns it; the caller decides, and today the caller only prints.
import { fullDecisionV2 } from './editorFixtures.mjs'

/** Zoom counts to render. 0 is the control: a plan with no zooms at all. */
export const SWEEP_ZOOM_COUNTS = Object.freeze([0, 1, 2, 3])

/**
 * ⚠️ ANCHORS MUST INDEX REAL WORDS. directorContract refuses
 * `anchorWordIndex >= envelope.words.length` and refuses duplicates, so anchors
 * are spread across the transcript rather than packed at the front — packing
 * them would also cluster every zoom in one region and make the render
 * unrepresentative of the thing being measured.
 */
export function zoomRequestsFor(n, wordCount) {
  if (n === 0) return []
  if (!Number.isInteger(wordCount) || wordCount < n) return null // caller reports, does not guess
  const step = Math.floor(wordCount / (n + 1))
  return Array.from({ length: n }, (_, i) => ({
    anchorWordIndex: Math.min(step * (i + 1), wordCount - 1),
    intensity: 'subtle',
    reasonCode: 'emphasis_word',
  }))
}

/**
 * The slope, from rows already collected.
 *
 * ⚖️ ERROR IS MEASURED FROM renderableDurationMs, never the Director's request:
 * measuring from the request charges every render for a frame the encoder cannot
 * emit and buries the signal under a constant offset. Buckets are averaged
 * before the fit so twenty clean 1-zoom rows cannot outvote the single 3-zoom
 * row carrying the signal.
 *
 * ⚠️ ABSENT IS NOT ZERO. A row with no zoom_count is EXCLUDED and counted, never
 * folded into the 0 bucket.
 */
export function slopeOf(rows) {
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION, AND THAT ORDER IS THE POINT.
  // `Number(null)` is 0 and `isFinite(0)` is true, so coercing first admits a
  // row with NO delta as a perfect zero — at exactly the place the fit is most
  // sensitive. This is the second time this defect has been written in this
  // repo; `deltaFromRenderable` had it too.
  const usable = rows.filter((r) => r
    && Number.isInteger(r.zoom_count)
    && r.duration_delta_ms !== null && r.duration_delta_ms !== undefined
    && Number.isFinite(Number(r.duration_delta_ms)))
  const excluded = rows.length - usable.length
  const buckets = new Map()
  for (const r of usable) {
    const k = r.zoom_count
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(Number(r.duration_delta_ms))
  }
  const points = [...buckets.entries()]
    .map(([zoom, ds]) => ({ zoom, delta: ds.reduce((a, b) => a + b, 0) / ds.length }))
    .sort((a, b) => a.zoom - b.zoom)
  if (points.length < 2) return { verdict: 'INSUFFICIENT_EVIDENCE', points, excluded, slope: null }
  const mx = points.reduce((a, p) => a + p.zoom, 0) / points.length
  const my = points.reduce((a, p) => a + p.delta, 0) / points.length
  const den = points.reduce((a, p) => a + (p.zoom - mx) ** 2, 0)
  if (den === 0) return { verdict: 'INSUFFICIENT_EVIDENCE', points, excluded, slope: null }
  const slope = points.reduce((a, p) => a + (p.zoom - mx) * (p.delta - my), 0) / den
  // One frame at 30fps is ~33ms; half a frame per zoom is the noise floor below
  // which a fit cannot distinguish drift from mechanism.
  const verdict = slope < -16 ? 'CORRELATION_PERSISTS' : 'CORRELATION_GONE'
  return { verdict, points, excluded, slope }
}

/**
 * Render once per zoom count and return the rows.
 *
 * Every dependency is injected: this module opens no client, reads no
 * environment and spawns nothing itself, so it can be unit-tested with fakes on
 * a machine that has no staging credentials.
 */
/**
 * Every dependency this sweep cannot invent for itself.
 *
 * ⚠️ DESTRUCTURING A MISSING DEPENDENCY YIELDS `undefined`, NOT AN ERROR, and
 * the failure then surfaces deep inside a 90-minute matrix as a bare
 * "sha256 is not defined" — which is exactly what happened on the sweep's first
 * real outing. Named up front and checked before any work starts, so the
 * message says WHICH dependency was missing rather than where it was first
 * touched.
 */
export const SWEEP_DEPS = Object.freeze([
  'admin', 'fixtures', 'sha256', 'wordCountFor', 'runToSettled',
  'donorAssetId', 'donorGenerationId', 'ownerId',
])

export function missingSweepDeps(deps) {
  const d = deps ?? {}
  return SWEEP_DEPS.filter((k) => d[k] === undefined || d[k] === null)
}

export async function runZoomSweep(deps) {
  // ⚖️ REFUSED BEFORE IT SPENDS ANYTHING. A sweep that renders three videos and
  // then discovers it cannot hash has already cost the matrix its time.
  const missing = missingSweepDeps(deps)
  if (missing.length) {
    throw new Error(`runZoomSweep is missing required dependenc${missing.length === 1 ? 'y' : 'ies'}: `
      + `${missing.join(', ')}. The caller must supply every one of: ${SWEEP_DEPS.join(', ')}.`)
  }
  const { admin, fixtures, sha256, wordCountFor, runToSettled, donorAssetId, donorGenerationId, ownerId, log } = deps
  const rows = []
  const notes = []

  for (const n of SWEEP_ZOOM_COUNTS) {
    try {
      // ⚠️ THE DONOR'S GENERATION, NOT A FRESH ONE. This is the correction the
      // first real run forced. bootScriptPolicy enforces, before any other
      // branch, that media_assets.generation_id EQUALS the project's
      // generation_id — a provenance invariant, not a formality. Minting a new
      // generation while reusing the donor's asset breaks it by construction,
      // and all four zoom buckets failed identically with
      // "source_state_contradiction: pin: asset linkage mismatch".
      //
      // ⚖️ THE ASSET IS STILL THE DONOR'S, WHICH IS THE WHOLE SEAM.
      // media_analyses is keyed by source_asset_id, so reusing the asset is what
      // makes the cached evidence apply; a fresh upload would have no analysis
      // and compiling would fail for a different reason. Reusing the donor's
      // GENERATION too is what makes that legal rather than a contradiction.
      const pid = await fixtures.scratchProject(ownerId, donorGenerationId, donorAssetId)
      const lease = await fixtures.fabricateLease(ownerId, pid, `p8-sweep-${n}`)
      await fixtures.advanceTo(pid, lease, ['inspecting', 'transcribing', 'analyzing', 'directing'])

      const words = await wordCountFor(donorAssetId)
      const zr = zoomRequestsFor(n, words)
      if (zr === null) { notes.push(`zoom ${n}: transcript has ${words} words, cannot place ${n} anchors`); continue }

      await fixtures.dirBegin(pid, lease, donorAssetId)
      const respSha = sha256(`sweep-resp-${pid}`)
      await admin.rpc('editor_director_receive', {
        p_project: pid, p_job: lease.jobId, p_worker: lease.worker, p_attempt: lease.attempt,
        p_response_sha256: respSha,
      })
      const decision = fullDecisionV2({ zoomRequests: zr })
      const { error: sErr } = await admin.rpc('editor_director_succeed', {
        p_project: pid, p_job: lease.jobId, p_worker: lease.worker, p_attempt: lease.attempt,
        p_schema_version: 2, p_response_sha256: respSha, p_decision: decision,
        p_decision_sha256: sha256(JSON.stringify(decision)), p_model: 'gemini-3.5-flash', p_provider: 'google',
      })
      if (sErr) { notes.push(`zoom ${n}: decision refused — ${sErr.message}`); continue }

      // ⚖️ ENTER AT compiling. stagesFrom() slices EDITOR_STAGES from the current
      // status, so a project at `compiling` never re-enters directing and the
      // supplied decision is the one that gets compiled.
      await fixtures.advanceTo(pid, lease, ['compiling'])
      // Release the fabricated lease so a REAL worker claims the job.
      await admin.from('jobs').update({ status: 'queued', locked_by: null, locked_at: null }).eq('id', lease.jobId)

      const proj = await runToSettled(`p8-sweep-${n}`, pid)
      if (proj.status !== 'completed') { notes.push(`zoom ${n}: settled ${proj.status}`); continue }

      const { data: ra } = await admin.from('render_attempts').select('*').eq('edit_project_id', pid)
      if (!ra?.length) { notes.push(`zoom ${n}: no render_attempt row`); continue }
      rows.push(ra[0])
      log?.(`NOTE sweep zoom=${ra[0].zoom_count} target=${ra[0].target_frame_count}`
        + ` predicted=${ra[0].predicted_duration_ms} actual=${ra[0].actual_duration_ms}`
        + ` delta=${ra[0].duration_delta_ms}`)
    } catch (e) {
      // ⚠️ ONE ZOOM COUNT FAILING MUST NOT LOSE THE OTHERS. A partial sweep is
      // still evidence, and reports itself as partial.
      notes.push(`zoom ${n}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const result = slopeOf(rows)
  return { ...result, rows, notes, attempted: SWEEP_ZOOM_COUNTS.length, collected: rows.length }
}

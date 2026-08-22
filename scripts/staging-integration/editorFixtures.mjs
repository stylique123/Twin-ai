// The lease-and-decision machinery every editor phase fabricates for itself.
//
// phase6 and phase7 each carry their OWN copy of `scratchProject` and
// `fabricateLease`. They are semantically identical -- same table, same columns,
// same dedup key, same error shape -- and differ only in the default worker
// name and in whether the insert is written across one line or six. That is two
// definitions of what a lease IS, and the next phase that needs one makes three.
//
// ⚠️ WHY THIS IS A FACTORY AND NOT A SET OF PLAIN EXPORTS. Every phase file calls
// `need('STAGING_URL')` at MODULE SCOPE and `process.exit(1)` when it is unset,
// so importing one to reuse a helper kills the importing process. That hazard is
// documented in `pilot-core.mjs` and it fired for real on `d1-observer.mjs`.
// This module therefore creates no client and reads no environment: it takes the
// caller's `admin` and hands back functions bound to it, so it can be imported
// and exercised anywhere -- including a machine with no staging credentials at
// all, which is how its selftest runs.
//
// ⚖️ MOVED, NOT RETYPED. Each body below is the phase7 original. Retyping is how
// two copies quietly stop agreeing, which is the defect this file exists to
// remove -- so the only edits are the ones the extraction forces: `admin`
// arrives as a parameter, and `sha256` is passed in rather than closed over.
import { randomUUID } from 'node:crypto'

/**
 * @param admin a service-role Supabase client
 * @param sha256 the caller's digest helper — phases already own one, and two
 *   definitions of "the hash of this envelope" is the same defect again
 */
export function makeEditorFixtures(admin, sha256) {
  if (!admin) throw new Error('makeEditorFixtures: an admin client is required')

  /** A project row in `queued`, with no job and no worker attached. */
  const scratchProject = async (ownerId, genId, assetId) => {
    const id = randomUUID()
    const { error } = await admin.from('edit_projects').insert({
      id, owner_id: ownerId, generation_id: genId, source_asset_id: assetId, status: 'queued',
      idempotency_key: randomUUID(),
    })
    if (error) throw new Error(`scratchProject: ${error.message}`)
    return id
  }

  /**
   * A running `editor_v2` job row that the fenced RPCs will accept as a lease.
   *
   * ⚠️ THE DEDUP KEY IS PER-PROJECT AND ENDS IN `:hx`. Both original copies used
   * exactly this, and `jobs_dedup_key_uniq` is a real unique index — two leases
   * fabricated for the SAME project collide. That is correct (one lease per
   * project is the invariant) and worth knowing before someone widens it.
   */
  const fabricateLease = async (ownerId, projectId, worker = 'hx-worker') => {
    const id = randomUUID()
    const { error } = await admin.from('jobs').insert({
      id, owner_id: ownerId, type: 'editor_v2', status: 'running', attempts: 1,
      locked_at: new Date().toISOString(), locked_by: worker,
      payload: { project_id: projectId }, dedup_key: `editor_v2:${projectId}:hx`,
    })
    if (error) throw new Error(`fabricateLease: ${error.message}`)
    return { jobId: id, worker, attempt: 1 }
  }

  /** Walk a project through stages via the fenced advance RPC, in order. */
  const advanceTo = async (pid, lease, stages) => {
    for (const to of stages) {
      const { error } = await admin.rpc('editor_advance_stage', {
        p_project: pid, p_job: lease.jobId, p_worker: lease.worker, p_attempt: lease.attempt,
        p_to: to, p_pct: null, p_message_code: 'stage_started', p_details: {},
      })
      if (error) throw new Error(`advanceTo ${to}: ${error.message}`)
    }
  }

  /** Open a Director call against a source asset. */
  const dirBegin = (pid, lease, assetId, attemptOverride) => admin.rpc('editor_director_begin', {
    p_project: pid, p_job: lease.jobId, p_worker: lease.worker, p_attempt: attemptOverride ?? lease.attempt,
    p_source_asset: assetId, p_envelope_sha256: sha256('env-' + pid), p_model: 'gemini-3.5-flash', p_provider: 'google',
  })

  return { scratchProject, fabricateLease, advanceTo, dirBegin }
}

/**
 * A COMPLETE Decision v2, which is the only kind 0092 accepts.
 *
 * ⚖️ THE GUARD REQUIRES schemaVersion 2 AND EVERY FIELD PRESENT, so a partial or
 * v1 object is rejected before any other check runs. Keeping the full shape in
 * one place means a caller overriding one field cannot accidentally ship an
 * incomplete decision — `fullDecisionV2({ zoomRequests: [...] })` stays valid.
 *
 * Pure: no client, no environment, no I/O. Exported separately so it can be
 * asserted on without constructing anything.
 */
export const fullDecisionV2 = (over = {}) => ({
  schemaVersion: 2, selections: [], keptBoundaries: [], summary: '',
  pacing: 'balanced', music: 'none', emphasisWordIndices: [],
  hookTreatment: 'keep', hookStartWordIndex: null,
  visualWasteSelections: [], captionPresetId: 'caption-clean-keyword-v1',
  transitionPolicy: 'restrained', zoomRequests: [], ...over,
})

/** The fields 0092 demands. Named so a test can assert the shape rather than
 *  restating it, and so a future field addition has one place to land. */
export const DECISION_V2_REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'selections', 'keptBoundaries', 'summary', 'pacing', 'music',
  'emphasisWordIndices', 'hookTreatment', 'hookStartWordIndex',
  'visualWasteSelections', 'captionPresetId', 'transitionPolicy', 'zoomRequests',
])

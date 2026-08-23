#!/usr/bin/env node
// THE PRODUCTION RECORD IS AUTHORITATIVE.
//
// The first pilot harness froze its sample into .twinai-pilot/run.json. That
// file lives in exactly one container. Move machines and the next command
// redraws the sample from a cohort that has since changed — a different eight
// references, the same digest field, and nobody can tell which run a label
// belongs to. Worse, the review page it produced bound to that container's
// localhost, so the owner could never open it.
//
// This module is the control plane. It creates and freezes a pilot run in the
// production database, reads it back by pilot_run_id, and enqueues FROM THE
// STORED MANIFEST — never from a fresh draw. .twinai-pilot/run.json becomes an
// optional local mirror.
//
// It does no media work. Downloads, frames and vision calls belong to the
// worker; this container only speaks SQL.

import {
  selectCohort, bandOf, handleOf, manifestDigest, PILOT_PRIORITY, MAX_SIZE, DEFAULT_SIZE,
  COHORT_NO_SPEECH, COHORT_SPEECH, COHORT_BANDS, selectionVersionFor,
} from './pilot-core.mjs'

export const SELECTION_VERSION = 'chars_zero_tiny_v1'

const err = (e, what) => { if (e) throw new Error(`${what}: ${e.message}`) }

/** Draw a cohort and FREEZE it into the database. Returns the pilot_run_id. */
export async function createPilotRun(db, { size = DEFAULT_SIZE, createdBy = null, cohort: which = COHORT_NO_SPEECH } = {}) {
  const requested = Math.min(MAX_SIZE, Math.max(1, Number(size) || DEFAULT_SIZE))
  // Refuses an unknown name before it reads anything, so a typo cannot draw the
  // default population and freeze it under whatever version string it was given.
  const selectionVersion = selectionVersionFor(which)

  // ⚠️ THE WITH-SPEECH FILTER IS `transcript_chars > 0` AND A CLEAN `error`,
  // NOT merely "not no_speech". 280 of the 667 rows carrying a transcript also
  // carry an error, and a reference that failed for some other reason is not a
  // reference that speaks -- it is one whose state nobody has established.
  const q = db.from('reference_content_profiles').select('url, transcript_chars')
  const { data: rows, error } = which === COHORT_SPEECH
    ? await q.gt('transcript_chars', 0).or('error.is.null,error.eq.')
    : await q.like('error', 'no_speech%')
  err(error, `could not read the ${which} cohort`)

  const cohort = selectCohort(rows ?? [], requested, which)
  // ⚠️ AN EMPTY DRAW IS A REFUSAL, NOT AN EMPTY RUN. A frozen pilot of nothing
  // would later report 0% and read like a measurement.
  if (cohort.length === 0) throw new Error(`the ${which} cohort is empty — nothing to pilot`)

  const urls = cohort.map((r) => r.url)
  const digest = manifestDigest(urls)

  const { data: run, error: e2 } = await db.from('visual_pilot_runs').insert({
    created_by: createdBy,
    selection_version: selectionVersion,
    requested_size: requested,
    frozen_size: urls.length,
    sample_digest: digest,
    // force bypasses the transcript cache, so each reference pays a fresh
    // acquisition AND a frames pull. The bill is recorded before it is spent.
    expected_max_downloads: urls.length * 2,
    status: 'frozen',
  }).select('id').single()
  err(e2, 'could not create the pilot run')

  const { error: e3 } = await db.from('visual_pilot_references').insert(cohort.map((r) => ({
    pilot_run_id: run.id,
    url: r.url,
    stratum: COHORT_BANDS[which].bandOf(r.transcript_chars),
    creator_handle: handleOf(r.url),
  })))
  err(e3, 'could not freeze the pilot sample')

  return run.id
}

/** Read a frozen run back. Never redraws. */
export async function loadPilotRun(db, pilotRunId) {
  const { data: run, error } = await db.from('visual_pilot_runs')
    .select('*').eq('id', pilotRunId).maybeSingle()
  err(error, 'could not read the pilot run')
  if (!run) throw new Error(`no pilot run ${pilotRunId} — this database does not have that run`)

  const { data: refs, error: e2 } = await db.from('visual_pilot_references')
    .select('*').eq('pilot_run_id', pilotRunId).order('url')
  err(e2, 'could not read the pilot sample')

  const urls = (refs ?? []).map((r) => r.url)
  // ⚠️ THE STORED DIGEST IS THE POINT OF THE STORED DIGEST. If the rows and the
  // frozen digest disagree, something changed the sample behind the trigger —
  // report the run as unusable rather than labelling a sample nobody froze.
  const seen = manifestDigest(urls)
  if (seen !== run.sample_digest) {
    throw new Error(`pilot ${pilotRunId} does not match its frozen digest `
      + `(stored ${String(run.sample_digest).slice(0, 12)}, rows hash to ${seen.slice(0, 12)}). `
      + 'The sample was changed after freeze. This run cannot be labelled.')
  }
  if (urls.length !== run.frozen_size) {
    throw new Error(`pilot ${pilotRunId} froze ${run.frozen_size} references but has ${urls.length}`)
  }
  return { run, references: refs ?? [], urls }
}

/**
 * Enqueue THE FROZEN SAMPLE. Reads the manifest by id; there is no code path
 * here that can draw a cohort. Duplicate-job checks stay enforced.
 */
export async function enqueueForRun(db, pilotRunId) {
  const { run, urls } = await loadPilotRun(db, pilotRunId)

  if (run.status === 'locked') throw new Error(`pilot ${pilotRunId} is locked — its labels are final`)
  if (run.status === 'abandoned') throw new Error(`pilot ${pilotRunId} was abandoned`)
  if (run.status !== 'frozen') return { enqueued: 0, already: true, urls }

  // ⚠️ A JOB ALREADY IN FLIGHT FOR ONE OF THESE URLS WOULD DOUBLE THE SPEND AND
  // let two writers race for one row. The run status stops THIS command
  // re-enqueuing; it cannot see a job somebody queued by hand.
  const { data: inflight, error } = await db.from('jobs')
    .select('id, payload, status').eq('type', 'assess_reference').in('status', ['queued', 'running'])
  err(error, 'could not check for in-flight jobs')
  const clashing = (inflight ?? []).filter((j) => urls.includes(j.payload?.url))
  if (clashing.length) {
    throw new Error(`${clashing.length} assess_reference job(s) are already queued or running for `
      + 'references in this sample. Enqueuing again would pay for each of them twice. Let them '
      + 'drain, then re-run — the frozen sample is unchanged and it will resume.')
  }

  const { error: e2 } = await db.from('jobs').insert(urls.map((url) => ({
    type: 'assess_reference',
    priority: PILOT_PRIORITY,
    payload: { url, platform: 'tiktok', frames: true, force: true, pilot_run_id: pilotRunId },
  })))
  err(e2, 'could not enqueue the pilot')

  const { error: e3 } = await db.from('visual_pilot_runs')
    .update({ status: 'enqueued' }).eq('id', pilotRunId).eq('status', 'frozen')
  err(e3, 'enqueued the jobs but could not mark the run enqueued')

  return { enqueued: urls.length, already: false, urls }
}

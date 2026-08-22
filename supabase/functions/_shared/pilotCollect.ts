// GENERATED FROM scripts/pilot-collect.mjs — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
#!/usr/bin/env node
// THE PACKET IS BUILT ONCE AND STORED, NOT REBUILT PER PAGE LOAD.
//
// The old packet lived in .twinai-pilot/run.json. Rebuilding it on each machine
// meant the reviewer could be shown a different set of claims than the one that
// was digested at lock time -- the profile table moves, the packet must not.
//
// This writes the terminal state of every frozen reference and one row per
// declared claim into the database, against the pilot_run_id. It stores frame
// IDENTIFIERS, never frame bytes: the bytes stay in production storage and the
// review page fetches them through short-lived signed URLs.

import { CLAIM_PATHS, flattenClaims, orderClaims, TERMINAL, checkPacketInvariants } from './pilotCore.ts'

// TERMINAL is the LIST of the three states. Naming them here keeps the strings
// in one place without pretending the list is a map.
const [READY_FOR_LABEL, FAILED, UNREADABLE] = TERMINAL
import { loadPilotRun } from './pilotDb.ts'

const err = (e, what) => { if (e) throw new Error(`${what}: ${e.message}`) }

/** What a reference's profile row says happened to it. Three states, never two. */
export function terminalStateOf(row) {
  if (!row) return null                                   // ⚠️ ABSENT IS NOT FAILED.
  if (row.visual_failure_code) return FAILED
  if (row.visual_profile) return READY_FOR_LABEL
  // Frames landed and the pass produced nothing to judge. That is its own
  // outcome: the download worked, so it is not a failure, and there are no
  // claims, so it is not ready.
  if (row.frames_sampled) return UNREADABLE
  return null
}

/**
 * May the server materialise the packet yet, and if not, why not?
 *
 * ⚠️ THE DEFECT THIS EXISTS TO END. `status` computed readiness from
 * reference_content_profiles and handed over the review URL, while the packet
 * that the review page actually reads was never built by anything on the button
 * path -- collectForRun's only caller was the CLI. The result was a review page
 * reporting "Claim 1 of 0" over eight references whose evidence had been
 * collected and paid for.
 *
 * ⚖️ SO READY_FOR_LABEL IS NOT A PROGRESS READING. It is a claim about a
 * PERSISTED packet, and this function is the gate in front of it.
 */
export function collectReadiness(progress, run) {
  if (!run) return { collect: false, reason: 'no run' }
  if (run.status === 'locked') return { collect: false, reason: 'locked' }
  // ⚠️ COLLECTING MID-FLIGHT WOULD RECORD A REFERENCE NOBODY FINISHED as though
  // it produced nothing. collectForRun refuses this too; refusing here as well
  // means the endpoint never even attempts it.
  if (!progress || progress.done !== true) return { collect: false, reason: 'still collecting' }
  // ⚠️ ABSENT IS NOT ZERO, but zero ready IS zero: a packet cannot be built out
  // of references that produced nothing, and saying so is not the same as
  // saying the run failed.
  if (!Number.isInteger(progress.ready) || progress.ready < 1) {
    return { collect: false, reason: 'no reference produced claims' }
  }
  return { collect: true, reason: null }
}

export async function collectForRun(db, pilotRunId) {
  const { run, urls } = await loadPilotRun(db, pilotRunId)
  if (run.status === 'locked') throw new Error(`pilot ${pilotRunId} is locked — its packet is final`)

  const { data: rows, error } = await db.from('reference_content_profiles')
    // ⚠️ THE REJECTIONS COME TOO. What the pass said that was THROWN OUT is
    // evidence about the prompt, and a reviewer judging a thin profile deserves
    // to know whether it answered nothing or answered badly.
    .select('url, visual_profile, visual_rejections, visual_failure_code, visual_failure_stage, '
      + 'frames_sampled, download_route, error')
    .in('url', urls)
  err(error, 'could not read the pilot references')

  const byUrl = new Map((rows ?? []).map((r) => [r.url, r]))
  const states = urls.map((url) => {
    const row = byUrl.get(url) ?? null
    return {
      url,
      state: terminalStateOf(row),
      row,
      // ⚠️ A REFERENCE DRAWN AS NO-SPEECH MAY COME BACK SPEAKING, and that is
      // 0159 arriving in the pilot, not a fault. force bypasses the transcript
      // cache. Its frames were then scheduled on content beats rather than
      // uniformly, so it is not evidence about the population this sample was
      // drawn to study. REPORTED, NOT DROPPED -- dropping shrinks the sample
      // after the fact.
      spoke: !!row && !String(row.error ?? '').startsWith('no_speech'),
    }
  })

  const pending = states.filter((s) => s.state === null)
  if (pending.length) {
    throw new Error(`${pending.length} reference(s) have no terminal state yet — the packet would `
      + 'record a reference nobody has finished as though it produced nothing. Wait for the jobs.')
  }

  for (const s of states) {
    const { error: e } = await db.from('visual_pilot_references').update({
      terminal_state: s.state,
      failure_code: s.row?.visual_failure_code ?? null,
      failure_stage: s.row?.visual_failure_stage ?? null,
      frames_sampled: s.row?.frames_sampled ?? null,
      download_route: s.row?.download_route ?? null,
      turned_out_to_have_speech: s.spoke,
    }).eq('pilot_run_id', pilotRunId).eq('url', s.url)
    err(e, `could not record the outcome of ${s.url}`)
  }

  const ready = states.filter((s) => s.state === READY_FOR_LABEL)
  if (ready.length === 0) throw new Error('no reference produced claims — nothing to label')

  const claims = orderClaims(ready.flatMap((s) => flattenClaims(s.url, s.row.visual_profile)))

  // ⚠️ ASSERTED WHERE THE PACKET IS BORN. A stub that ignored one filter once
  // produced six ready references and one hundred and twenty claims, and the
  // contradiction was printed unasserted.
  const progress = {
    states: states.map((s) => ({ url: s.url, state: s.state, row: s.row })),
    ready: ready.length,
  }
  const bad = checkPacketInvariants({ progress, labels: claims, claimPaths: CLAIM_PATHS.length })
  if (bad.length) throw new Error(`the packet does not match the attrition report:\n  ${bad.join('\n  ')}`)

  const { error: e2 } = await db.from('visual_pilot_claims').upsert(claims.map((c) => ({
    pilot_run_id: pilotRunId,
    url: c.url,
    claim_path: c.path,
    // ⚠️ answered IS ITS OWN COLUMN. A claim the pass did not answer is not a
    // claim answered with null; confirming one as SUPPORTED once produced a
    // bucket named 'null' in the aggregate.
    answered: c.answered === true,
    claim_value: c.value ?? null,
    cited_frames: c.frames ?? null,
    canonical_values: c.canonical ?? null,
  })), { onConflict: 'pilot_run_id,url,claim_path' })
  err(e2, 'could not store the review packet')

  const { error: e3 } = await db.from('visual_pilot_runs')
    .update({ status: 'ready_for_label' }).eq('id', pilotRunId)
  err(e3, 'stored the packet but could not mark the run ready')

  return { references: states.length, ready: ready.length, claims: claims.length }
}

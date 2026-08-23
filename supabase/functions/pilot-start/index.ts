// Supabase Edge Function: pilot-start
//
// STARTING A PILOT IS AN AUTHENTICATED ACTION, NOT A TERMINAL COMMAND.
//
// The previous way to start a #58 pilot was `frame-pilot.mjs --review --size 8
// --go`, run from a laptop holding a service role key. That is a
// general-purpose job producer pointed at a pilot: nothing in it prevents an
// arbitrary URL list, an arbitrary payload, or the whole backlog. The only
// control was the operator's care.
//
// This endpoint cannot express those requests. It accepts three keys, draws
// the sample from the frozen cohort rule, constructs every payload itself, and
// refuses a second concurrent run. `scripts/frame-pilot.mjs` survives as an
// operator/debug path only; it is no longer how a pilot starts.
//
//   POST { action:"quote",  size?, cost_ceiling_downloads } -> the bill, nothing enqueued
//   POST { action:"start",  size?, cost_ceiling_downloads } -> freeze + enqueue exactly that sample
//   POST { action:"status", pilot_run_id }                  -> progress, and the review URL once ready
//   POST { action:"active" }                                -> the run already in flight, or null
//
// ⚖️ `quote` EXISTS SO THE BILL CAN BE SEEN BEFORE IT IS AGREED TO. It touches
// no table and enqueues nothing, so "what would this cost" is never a question
// somebody has to answer by running the spending version.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import {
  selectCohort, bandOf, handleOf, manifestDigest, PILOT_PRIORITY,
  progressOf, attrition,
  COHORT_SPEECH, COHORT_BANDS, selectionVersionFor,
} from '../_shared/pilotCore.ts'
import {
  validateStartRequest, validateStatusRequest, activePilotRefusal, activePilotRun,
  pilotJobRows, ACTIVE_STATUSES, resolveActivePilotRun, ambiguousPilotRefusal,
} from '../_shared/pilotStart.ts'
// ⚠️ THE PACKET IS BUILT HERE, NOT BY A LAPTOP. collectForRun's only caller used
// to be the CLI, so the button path enqueued work, watched it finish, and handed
// over a review URL for a packet nothing had ever written.
import { collectForRun, collectReadiness } from '../_shared/pilotCollect.ts'

// ⚠️ THE VERSION IS DERIVED FROM THE COHORT, NOT PINNED HERE. It used to be a
// local copy of one string, which was correct only while there was one
// population. A second population with the same version string would make two
// incomparable runs look like a pair, and selection_version is the only thing a
// later reader has to tell them apart. selectionVersionFor is the one authority,
// shared with scripts/pilot-db.mjs.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const env = (k: string) => Deno.env.get(k)
  const url = env('SUPABASE_URL')!
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const userClient = createClient(url, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)
  // Checked with the service role so RLS cannot be tricked, and so admin status
  // is never something the client can assert about itself.
  const { data: adminRow } = await admin.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return json({ error: 'Forbidden' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const action = String(body.action ?? '')
  if (action !== 'quote' && action !== 'start' && action !== 'status' && action !== 'active') {
    return json({ error: 'action must be "quote", "start", "status" or "active"' }, 400)
  }

  // ── active ───────────────────────────────────────────────────────────────
  //
  // ⚖️ THE RUN YOU ALREADY HAVE, SO IT CAN BE FINISHED RATHER THAN REPLACED.
  // Read-only: it reads one id and one status and takes no parameters at all,
  // so there is nothing here to point at a different run, a different owner, or
  // a different sample. It exists because a real pilot became unreachable —
  // eight references of paid-for evidence sat `enqueued` while the only page
  // that could poll it could only poll a run started in that same browser tab.
  if (action === 'active') {
    const { data: runs, error: activeErr } = await admin.from('visual_pilot_runs')
      .select('id, status').in('status', ACTIVE_STATUSES)
    if (activeErr) return json({ error: `could not check for an active pilot: ${activeErr.message}` }, 500)
    // ⚠️ ADOPTION MUST NOT PICK. activePilotRun returns active[0], which is the
    // right answer for REFUSING a second pilot and the wrong one for choosing
    // which run the owner is about to label. Two active runs mean the one-pilot
    // invariant already failed; that is reported, naming both, never resolved
    // by choosing one.
    const { run, ambiguous, ids } = resolveActivePilotRun(runs ?? [])
    if (ambiguous) return json({ error: ambiguousPilotRefusal(ids), pilot_run_ids: ids }, 409)
    return json({ ok: true, pilot_run_id: run?.id ?? null, status: run?.status ?? null })
  }

  // ── status ───────────────────────────────────────────────────────────────
  //
  // ⚠️ THE DENOMINATOR IS THE FROZEN SAMPLE, NOT THE SURVIVORS, and that is why
  // this reads the manifest rather than counting whatever rows exist. A pilot
  // where two references failed must report 6 of 8, never 100% of 6.
  //
  // ⚖️ AND THE REVIEW URL APPEARS ONLY WHEN THERE IS SOMETHING TO REVIEW.
  // Handing it over early invites labelling a half-collected packet, and the
  // labels are the experiment's result.
  if (action === 'status') {
    let pilotRunId: string
    try { pilotRunId = validateStatusRequest(body) } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400)
    }

    const { data: run, error: runErr } = await admin.from('visual_pilot_runs')
      .select('*').eq('id', pilotRunId).maybeSingle()
    if (runErr) return json({ error: `could not read the pilot run: ${runErr.message}` }, 500)
    if (!run) return json({ error: 'No such pilot run' }, 404)

    const { data: refs, error: refErr } = await admin.from('visual_pilot_references')
      .select('url').eq('pilot_run_id', pilotRunId).order('url')
    if (refErr) return json({ error: `could not read the pilot sample: ${refErr.message}` }, 500)
    const urls = (refs ?? []).map((r: { url: string }) => r.url)

    // ⚠️ THE STORED DIGEST IS THE POINT OF THE STORED DIGEST. If the rows and
    // the frozen digest disagree, something changed the sample behind the
    // trigger — report the run unusable rather than progressing a sample
    // nobody froze.
    const seen = manifestDigest(urls)
    if (seen !== run.sample_digest) {
      return json({
        error: `pilot ${pilotRunId} does not match its frozen digest. The sample was changed `
          + 'after freeze. This run cannot be labelled.',
      }, 409)
    }

    const { data: profiles, error: profErr } = urls.length
      ? await admin.from('reference_content_profiles')
        .select('url, visual_profile, frames_sampled, visual_failure_code').in('url', urls)
      : { data: [], error: null }
    if (profErr) return json({ error: `could not read collection progress: ${profErr.message}` }, 500)

    const progress = progressOf(profiles ?? [], { urls })

    // ── materialise the packet, before anybody is sent to label it ──────────
    //
    // ⚖️ READY_FOR_LABEL IS A CLAIM ABOUT A PERSISTED PACKET, NOT A PROGRESS
    // READING. The review page reads visual_pilot_claims; progress reads
    // reference_content_profiles. Those are different tables, and handing over
    // the URL on the strength of the second while the first was empty is
    // exactly how a real pilot showed "Claim 1 of 0" over eight references
    // whose evidence had already been collected and paid for.
    //
    // ⚠️ IDEMPOTENT ON PURPOSE. collectForRun upserts claims keyed by
    // (pilot_run_id, url, claim_path) and refuses a locked run, so polling this
    // endpoint repeatedly converges on one packet rather than rebuilding a
    // different one under a reviewer who is already labelling.
    let packet: { references: number; ready: number; claims: number } | null = null
    let packetError: string | null = null
    const gate = collectReadiness(progress, run)
    if (gate.collect) {
      try {
        packet = await collectForRun(admin, pilotRunId)
      } catch (e) {
        // ⚠️ REPORTED, NEVER SWALLOWED, AND NEVER PROMOTED. Its refusals — a
        // reference with no terminal state, a zero-claim packet, a packet that
        // contradicts the attrition report — are the reasons this run must NOT
        // be labelled yet. Turning them into a 500 would read as an outage;
        // hiding them would send the owner to an empty page again.
        packetError = e instanceof Error ? e.message : String(e)
      }
    }

    // ⚠️ THE PACKET, NOT THE PROGRESS, DECIDES. A run is reviewable only once a
    // non-empty stored packet exists — which is what `claims > 0` reads back.
    const reviewable = (packet?.claims ?? 0) > 0
      || (progress.done && (await admin.from('visual_pilot_claims')
        .select('id', { count: 'exact', head: true }).eq('pilot_run_id', pilotRunId)).count! > 0)

    return json({
      packet,
      // Null unless something refused. Never a bare "not ready".
      packet_error: packetError,
      ok: true,
      pilot_run_id: pilotRunId,
      status: run.status,
      collecting: !progress.done,
      progress: {
        selected: urls.length,
        ready_for_label: progress.ready,
        failed: progress.failed,
        unreadable: progress.unreadable,
        still_running: progress.running,
      },
      attrition: attrition(progress),
      // Relative, so it is correct from whatever origin the owner opened.
      // ⚠️ GATED ON THE PACKET, NOT ON PROGRESS. This line is the fix.
      review_url: reviewable ? `/internal/review/visual/${pilotRunId}` : null,
    })
  }

  // ⚠️ VALIDATED BEFORE ANYTHING IS READ, LET ALONE WRITTEN. A refusal that
  // happens after the cohort query has already run is a refusal that has
  // already done work on behalf of a request it was going to reject.
  let checked: { size: number; ceiling: number; cost: { references: number; downloads: number; visionCalls: number } }
  try { checked = validateStartRequest(body) } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }

  if (action === 'quote') {
    return json({ ok: true, quoted: checked.cost, ceiling: checked.ceiling, enqueued: 0 })
  }

  // ── one pilot at a time ──────────────────────────────────────────────────
  const { data: runs, error: runsErr } = await admin.from('visual_pilot_runs')
    .select('id, status').in('status', ACTIVE_STATUSES)
  if (runsErr) return json({ error: `could not check for an active pilot: ${runsErr.message}` }, 500)
  const refusal = activePilotRefusal(runs ?? [])
  // ⚠️ THE ID TRAVELS WITH THE REFUSAL. "Finish it or abandon it" is only
  // actionable if the caller can say WHICH run, and a client that has to parse
  // the id back out of the prose is one rewording away from breaking.
  if (refusal) {
    return json({ error: refusal, pilot_run_id: activePilotRun(runs ?? [])?.id ?? null }, 409)
  }

  // ── draw and freeze ──────────────────────────────────────────────────────
  // ⚠️ WHICH POPULATION, AND WHY IT IS NOW A CHOICE. The first pilot drew only
  // `no_speech` rows. Silent references have no content profile, so there are no
  // beats to schedule frames on -- the `content_beats` arm CANNOT appear, and
  // #58's actual question went unasked. Measured on run 7204de6f: talkingHead
  // was false on 8 of 8 and primaryMode unanswered on 8 of 8.
  //
  // ⚖️ THE SPEECH FILTER IS POSITIVE, NOT "NOT no_speech". 280 of the 667 rows
  // carrying a transcript also carry an error; a reference that failed for some
  // other reason is not one that speaks, it is one whose state nobody
  // established. Drawing it would put an unknown into a frozen sample.
  const which = checked.cohort
  const base = admin.from('reference_content_profiles').select('url, transcript_chars')
  const { data: rows, error: cohortErr } = which === COHORT_SPEECH
    ? await base.gt('transcript_chars', 0).or('error.is.null,error.eq.')
    : await base.like('error', 'no_speech%')
  if (cohortErr) return json({ error: `could not read the ${which} cohort: ${cohortErr.message}` }, 500)

  const cohort = selectCohort(rows ?? [], checked.size, which)
  // ⚠️ AN EMPTY DRAW IS A REFUSAL, NOT AN EMPTY RUN. A frozen pilot of nothing
  // would later report 0% and read like a measurement.
  if (cohort.length === 0) return json({ error: `the ${which} cohort is empty — nothing to pilot` }, 409)

  const urls = cohort.map((r: { url: string }) => r.url)
  const { data: run, error: e2 } = await admin.from('visual_pilot_runs').insert({
    created_by: user.id,
    selection_version: selectionVersionFor(which),
    requested_size: checked.size,
    frozen_size: urls.length,
    sample_digest: manifestDigest(urls),
    expected_max_downloads: checked.cost.downloads,
    status: 'frozen',
  }).select('id').single()
  if (e2 || !run) return json({ error: `could not create the pilot run: ${e2?.message}` }, 500)

  const { error: e3 } = await admin.from('visual_pilot_references').insert(
    cohort.map((r: { url: string; transcript_chars: number }) => ({
      pilot_run_id: run.id,
      url: r.url,
      stratum: COHORT_BANDS[which].bandOf(r.transcript_chars),
      creator_handle: handleOf(r.url),
    })),
  )
  if (e3) return json({ error: `could not freeze the pilot sample: ${e3.message}`, pilot_run_id: run.id }, 500)

  // ── enqueue exactly the frozen sample ────────────────────────────────────
  //
  // ⚠️ A JOB ALREADY IN FLIGHT FOR ONE OF THESE URLS WOULD DOUBLE THE SPEND.
  // The active-run check above stops a second pilot; it cannot see a job
  // somebody queued by hand.
  const { data: inflight, error: e4 } = await admin.from('jobs')
    .select('id, payload, status').eq('type', 'assess_reference').in('status', ['queued', 'running'])
  if (e4) return json({ error: `could not check for in-flight jobs: ${e4.message}`, pilot_run_id: run.id }, 500)
  const clashing = (inflight ?? []).filter((j: { payload?: { url?: string } }) => urls.includes(j.payload?.url ?? ''))
  if (clashing.length > 0) {
    return json({
      error: `${clashing.length} assess_reference job(s) are already queued or running for references `
        + 'in this sample. Enqueuing would pay for each of them twice. The sample is frozen and '
        + 'unchanged — let them drain, then start again.',
      pilot_run_id: run.id,
    }, 409)
  }

  const { error: e5 } = await admin.from('jobs').insert(pilotJobRows(urls, run.id, PILOT_PRIORITY))
  if (e5) return json({ error: `could not enqueue the pilot: ${e5.message}`, pilot_run_id: run.id }, 500)

  const { error: e6 } = await admin.from('visual_pilot_runs')
    .update({ status: 'enqueued' }).eq('id', run.id)
  if (e6) return json({ error: `enqueued, but could not record it: ${e6.message}`, pilot_run_id: run.id }, 500)

  await admin.from('visual_pilot_events').insert({
    pilot_run_id: run.id,
    kind: 'started',
    detail: { by: user.id, size: checked.size, ceiling: checked.ceiling, cost: checked.cost },
  })

  return json({
    ok: true,
    pilot_run_id: run.id,
    frozen: urls.length,
    enqueued: urls.length,
    quoted: checked.cost,
    ceiling: checked.ceiling,
  })
})

// Supabase Edge Function: pilot-review
//
// THE REVIEW LIVES INSIDE TWIN, NOT ON A LAPTOP.
//
// The first version of this harness served the labelling page from the
// container that drew the sample. That container's localhost is reachable by
// nobody but itself, so the owner -- the only person whose judgment the pilot
// is collecting -- could never open the page built for them.
//
// Access is a normal authenticated Twin admin session. There is no anonymous
// link and no shareable token: the pilot's labels are the experiment's result,
// and a guessable URL that could write them is not a boundary.
//
//   POST { action:"packet", pilot_run_id }         -> run, references, claims, frames (signed)
//   POST { action:"label",  pilot_run_id, claim_id, label, corrected_value }
//   POST { action:"event",  pilot_run_id, kind, detail }
//   POST { action:"finish", pilot_run_id }         -> lock, digests, aggregate, decision
//
// Frame bytes are never proxied through this function. It signs short-lived
// URLs into the private reference-frames bucket and the browser fetches them
// directly.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import {
  LABELS, isLabel, aggregate, friction, briefFor69, byField, bySituation, slowestFields,
  byScheduleBasis, armComparison, distributionRates, checkRateInvariants,
  claimsDigest, evidenceDigest, CLAIM_PATHS,
} from '../_shared/pilotCore.ts'
import { decide332 } from '../_shared/pilotDecision.ts'

// ⏱️ SHORT-LIVED ON PURPOSE. Long enough to label a reference without the images
// dying mid-session, short enough that a URL copied out of devtools is stale
// before it is useful.
const FRAME_URL_TTL_SECONDS = 60 * 30

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
  const pilotRunId = String(body.pilot_run_id ?? '')
  if (!pilotRunId) return json({ error: 'pilot_run_id is required' }, 400)

  const { data: run } = await admin.from('visual_pilot_runs').select('*').eq('id', pilotRunId).maybeSingle()
  if (!run) return json({ error: 'No such pilot run' }, 404)

  // ── the packet ─────────────────────────────────────────────────────────────
  if (action === 'packet') {
    const { data: refs } = await admin.from('visual_pilot_references')
      .select('*').eq('pilot_run_id', pilotRunId).order('url')
    const { data: claims } = await admin.from('visual_pilot_claims')
      .select('*').eq('pilot_run_id', pilotRunId)
    const urls = [...new Set((claims ?? []).map((c) => c.url))]

    const { data: frames } = urls.length
      ? await admin.from('reference_frames')
        // ⚠️ at_seconds TRAVELS WITH THE FRAME. A claim about what CHANGES needs
        // to know whether its two cited frames are half a second or half a
        // minute apart.
        .select('url, frame_index, sha256, at_seconds, schedule_basis, storage_path').in('url', urls)
      : { data: [] }

    const signed = []
    for (const f of frames ?? []) {
      const { data: s } = await admin.storage.from('reference-frames')
        .createSignedUrl(f.storage_path, FRAME_URL_TTL_SECONDS)
      // ⚠️ storage_path IS NOT RETURNED. The page needs the picture, not an index
      // of where the private bucket keeps it.
      const { storage_path: _drop, ...rest } = f
      signed.push({ ...rest, signed_url: s?.signedUrl ?? null })
    }

    // ⚠️ THE AGGREGATE IS NOT IN THIS RESPONSE, AT ANY STATUS. A reviewer who can
    // see the running support rate is being told what the answer should be.
    const { data: labels } = await admin.from('visual_pilot_labels')
      .select('claim_id, label, corrected_value, created_at')
      .eq('pilot_run_id', pilotRunId).order('created_at', { ascending: true })
    const latest = new Map<string, unknown>()
    for (const l of labels ?? []) latest.set(l.claim_id, l)

    return json({
      run: {
        id: run.id, status: run.status, frozen_size: run.frozen_size,
        sample_digest: run.sample_digest, selection_version: run.selection_version,
        locked_at: run.locked_at, review_version: run.review_version,
      },
      references: refs ?? [],
      claims: (claims ?? []).map((c) => ({ ...c, current: latest.get(c.id) ?? null })),
      frames: signed,
      vocabulary: LABELS,
      claim_paths: CLAIM_PATHS,
    })
  }

  // ⚠️ EVERY WRITE BELOW REFUSES A LOCKED RUN HERE AS WELL AS IN THE TRIGGER.
  // The trigger is the boundary that cannot be forgotten; this is the message a
  // human can read.
  if (run.status === 'locked' && action !== 'packet') {
    return json({ error: 'This pilot is locked. Its labels are final.' }, 409)
  }

  // ── autosave ───────────────────────────────────────────────────────────────
  if (action === 'label') {
    const claimId = String(body.claim_id ?? '')
    const label = body.label === null ? null : String(body.label ?? '')
    // null is an explicit SKIP and is recorded as one. Anything else must be one
    // of the four; a free-text label would put an uncounted category into the
    // distribution.
    if (label !== null && !isLabel(label)) return json({ error: 'Not a label' }, 400)

    const { data: claim } = await admin.from('visual_pilot_claims')
      .select('id').eq('id', claimId).eq('pilot_run_id', pilotRunId).maybeSingle()
    if (!claim) return json({ error: 'No such claim in this run' }, 404)

    // APPEND-ONLY. A relabel is a new row, so the friction measurement can see
    // that the reviewer changed their mind -- which is the #69 input.
    const { error } = await admin.from('visual_pilot_labels').insert({
      pilot_run_id: pilotRunId, claim_id: claimId, reviewer: user.id,
      label, corrected_value: body.corrected_value ?? null,
    })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (action === 'event') {
    const kind = String(body.kind ?? '')
    const { error } = await admin.from('visual_pilot_events').insert({
      pilot_run_id: pilotRunId, reviewer: user.id, kind, detail: body.detail ?? null,
    })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ── finish and lock ────────────────────────────────────────────────────────
  if (action === 'finish') {
    const { data: claims } = await admin.from('visual_pilot_claims')
      .select('*').eq('pilot_run_id', pilotRunId)
    const { data: rawLabels } = await admin.from('visual_pilot_labels')
      .select('claim_id, label, corrected_value, created_at')
      .eq('pilot_run_id', pilotRunId).order('created_at', { ascending: true })

    const latest = new Map<string, { label: string | null }>()
    for (const l of rawLabels ?? []) latest.set(l.claim_id, l)

    // ⚠️ COMPLETENESS IS CHECKED SERVER-SIDE. The page also hides the button, but
    // a page is a suggestion; this is the rule. A SKIP is not an answer -- it
    // sends the reviewer back rather than locking a partial run.
    const outstanding = (claims ?? []).filter((c) => !isLabel(latest.get(c.id)?.label ?? null))
    if (outstanding.length) {
      return json({
        error: `${outstanding.length} claim(s) are still unanswered. A run locked with unanswered `
          + 'claims reports a rate over a population nobody chose.',
        remaining: outstanding.length,
      }, 409)
    }

    const session = {
      locked: true,
      labels: (claims ?? []).map((c) => ({
        url: c.url, path: c.claim_path, answered: c.answered === true,
        value: c.claim_value, frames: c.cited_frames ?? [],
        label: latest.get(c.id)?.label ?? null,
        correctedValue: latest.get(c.id)?.corrected_value ?? null,
      })),
    }

    const urls = [...new Set(session.labels.map((l) => l.url))]
    const { data: frames } = urls.length
      ? await admin.from('reference_frames').select('url, frame_index, sha256, at_seconds, schedule_basis').in('url', urls)
      : { data: [] }
    const { data: refs } = await admin.from('visual_pilot_references')
      .select('*').eq('pilot_run_id', pilotRunId)
    const { data: events } = await admin.from('visual_pilot_events')
      .select('kind, detail, created_at').eq('pilot_run_id', pilotRunId).order('created_at', { ascending: true })

    const agg = aggregate(session)
    const fr = friction((events ?? []).map((e) => ({
      kind: e.kind, at: new Date(e.created_at).getTime(), ...(e.detail ?? {}),
    })))
    const attrition = {
      selected: (refs ?? []).length,
      ready_for_label: (refs ?? []).filter((r) => r.terminal_state === 'READY_FOR_LABEL').length,
      failed: (refs ?? []).filter((r) => r.terminal_state === 'FAILED').length,
      unreadable: (refs ?? []).filter((r) => r.terminal_state === 'UNREADABLE').length,
      turned_out_to_have_speech: (refs ?? []).filter((r) => r.turned_out_to_have_speech).length,
    }
    attrition.assessed_of_selected = attrition.selected === 0
      ? null : attrition.ready_for_label / attrition.selected

    const rates = distributionRates(agg)
    // ⚠️ A RATE THAT CANNOT BE A RATE STOPS THE LOCK. Driving this end to end
    // once printed 500% of what the model answered, and again 350% by situation.
    const bad = checkRateInvariants(agg)
    if (bad.length) {
      return json({ error: `refusing to lock a report whose rates are impossible:\n${bad.join('\n')}` }, 500)
    }

    const decision = decide332({ attrition, aggregate: agg, rates })
    const report = {
      attrition,
      aggregate: agg,
      rates,
      by_field: byField(session.labels),
      by_situation: bySituation(session.labels, refs ?? []),
      slowest_fields: slowestFields(fr),
      // ⚠️ NOT REPRESENTED IS AN ANSWER. A 0% content-beats arm would be
      // numerically tidy and scientifically false.
      arm_comparison: armComparison(byScheduleBasis(session.labels, frames ?? [])),
      brief_for_69: briefFor69(fr, agg, slowestFields(fr)),
      friction: fr,
    }

    const { error } = await admin.from('visual_pilot_runs').update({
      status: 'locked',
      locked_at: new Date().toISOString(),
      locked_by: user.id,
      review_version: (run.review_version ?? 0) + 1,
      claims_digest: claimsDigest(session.labels),
      // ⚠️ NO FRAMES DIGESTS TO null, NOT TO THE SHA256 OF THE EMPTY STRING.
      evidence_digest: evidenceDigest(frames ?? []),
      aggregate: agg,
      friction: fr,
      decision,
      brief: report,
    }).eq('id', pilotRunId).eq('status', run.status)
    if (error) return json({ error: error.message }, 500)

    return json({ ok: true, decision, report })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})

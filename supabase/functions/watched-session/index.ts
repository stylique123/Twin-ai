// Supabase Edge Function: watched-session
//
// THE MACHINE COLLECTS THE EVIDENCE. THE OBSERVER ASKS WHY.
//
// D1 is one person watching one creator use Twin. Every step here exists so
// that the observer's attention is on the creator rather than on capturing a
// timeline — and so the record outlives the laptop that made it.
//
//   POST { action:"create",  subject_user_id }                  -> session id
//   POST { action:"consent", watched_session_id }               -> records the yes
//   POST { action:"start",   watched_session_id }               -> begins watching
//   POST { action:"finish",  watched_session_id }               -> snapshot + gaps
//   POST { action:"observe", watched_session_id, blocker, creator_reason }
//   POST { action:"lock",    watched_session_id }               -> final
//
// ⚠️ `observe` IS THE ONLY WRITE A HUMAN MAKES, AND NOTHING ELSE MAY MAKE IT.
// No model, heuristic or default writes a blocker. If this function ever gains
// a code path that infers one, that path is the defect.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import { REQUIRED_EVENTS, validateObservation } from '../_shared/d1Core.ts'
import { canTransition, refuseStart, refuseLock, classifyGaps, evidenceWindow } from '../_shared/watchedSession.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

/** ⚠️ THE INSTRUMENTED SET IS A FACT ABOUT THE CODE, declared here rather than
 *  guessed. An event listed as instrumented that never fired is `unknown`; one
 *  that is not instrumented at all is `uninstrumented`. Getting this list wrong
 *  in the optimistic direction turns "we never recorded it" into "they never
 *  did it", which is the exact confusion the gaps table exists to prevent. */
const INSTRUMENTED = ['page_view', 'gallery_remix', 'blueprint_generated', 'edit_rendered']

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
  const { data: adminRow } = await admin.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return json({ error: 'Forbidden' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const action = String(body.action ?? '')

  // ── create ───────────────────────────────────────────────────────────────
  if (action === 'create') {
    const subject = String(body.subject_user_id ?? '')
    if (!subject) return json({ error: 'subject_user_id is required — who is being watched' }, 400)
    if (subject === user.id) {
      return json({ error: 'the observer cannot be the subject — watching yourself is a rehearsal, not evidence' }, 400)
    }
    const { data, error } = await admin.from('watched_sessions')
      .insert({ observer_user_id: user.id, subject_user_id: subject, status: 'created' })
      .select('id').single()
    if (error) return json({ error: `could not create the session: ${error.message}` }, 500)
    return json({ ok: true, watched_session_id: data.id, next: 'read the consent script, then POST consent' })
  }

  const id = String(body.watched_session_id ?? '')
  if (!id) return json({ error: 'watched_session_id is required' }, 400)
  const { data: session, error: sErr } = await admin.from('watched_sessions')
    .select('*').eq('id', id).maybeSingle()
  if (sErr) return json({ error: `could not read the session: ${sErr.message}` }, 500)
  if (!session) return json({ error: 'No such watched session' }, 404)
  // ⚖️ THE OBSERVER OWNS THEIR OWN SESSION. Admin is not enough: two observers
  // writing one record would produce a timeline nobody can attribute.
  if (session.observer_user_id !== user.id) {
    return json({ error: 'this session belongs to another observer' }, 403)
  }

  if (action === 'consent') {
    if (session.consent_given_at) return json({ ok: true, already: true })
    const { error } = await admin.from('watched_sessions')
      .update({ consent_given_at: new Date().toISOString() }).eq('id', id)
    if (error) return json({ error: `could not record consent: ${error.message}` }, 500)
    return json({ ok: true, next: 'POST start when they begin' })
  }

  if (action === 'start') {
    const bad = refuseStart(session)
    if (bad) return json({ error: bad }, 409)
    const { error } = await admin.from('watched_sessions')
      .update({ status: 'watching', started_at: new Date().toISOString() }).eq('id', id)
    if (error) return json({ error: `could not start: ${error.message}` }, 500)
    return json({ ok: true, status: 'watching' })
  }

  // ── finish: snapshot the evidence, name the blind spots ──────────────────
  if (action === 'finish') {
    const bad = canTransition(session.status, 'finished')
    if (bad) return json({ error: bad }, 409)
    const finishedAt = new Date().toISOString()

    const { data: raw, error: eErr } = await admin.from('analytics_events')
      .select('event_name, occurred_at, user_id, detail')
      .eq('user_id', session.subject_user_id)
      .gte('occurred_at', session.started_at)
      .lte('occurred_at', finishedAt)
    if (eErr) return json({ error: `could not read the event stream: ${eErr.message}` }, 500)

    // Re-filtered through the shared window rule rather than trusting the query,
    // so one authority decides what belongs to a session.
    const inWindow = evidenceWindow({ ...session, finished_at: finishedAt }, raw ?? [])
    if (inWindow.length > 0) {
      const { error } = await admin.from('watched_session_events').insert(
        inWindow.map((e: { event_name: string; occurred_at: string; detail: unknown }) => ({
          watched_session_id: id, event_name: e.event_name, occurred_at: e.occurred_at, detail: e.detail ?? null,
        })),
      )
      if (error) return json({ error: `could not snapshot the evidence: ${error.message}` }, 500)
    }

    const gaps = classifyGaps(inWindow, INSTRUMENTED)
    if (gaps.length > 0) {
      const { error } = await admin.from('watched_session_gaps').insert(
        gaps.map((g: { event_name: string; reason: string }) => ({ watched_session_id: id, ...g })),
      )
      if (error) return json({ error: `could not record the blind spots: ${error.message}` }, 500)
    }

    // ⚠️ STATUS LAST. The evidence trigger refuses writes once a session is
    // finished, so flipping the status first would lock out its own snapshot.
    const { error: uErr } = await admin.from('watched_sessions')
      .update({ status: 'finished', finished_at: finishedAt }).eq('id', id)
    if (uErr) return json({ error: `snapshotted, but could not finish: ${uErr.message}` }, 500)

    return json({
      ok: true, status: 'finished',
      events_captured: inWindow.length,
      blind_spots: gaps,
      required_events: Object.keys(REQUIRED_EVENTS).length,
      next: 'record why they stopped, in their words, then lock',
    })
  }

  if (action === 'observe') {
    const o = { blocker: String(body.blocker ?? ''), creatorReason: String(body.creator_reason ?? '') }
    const bad = validateObservation(o)
    if (bad) return json({ error: bad }, 400)
    const { error } = await admin.from('watched_session_observations').insert({
      watched_session_id: id, blocker: o.blocker, creator_reason: o.creatorReason, recorded_by: user.id,
    })
    // The append-only trigger refuses this after a lock; surface its words.
    if (error) return json({ error: error.message }, 409)
    return json({ ok: true })
  }

  if (action === 'lock') {
    const { data: obs, error: oErr } = await admin.from('watched_session_observations')
      .select('blocker, creator_reason').eq('watched_session_id', id)
    if (oErr) return json({ error: `could not read the observations: ${oErr.message}` }, 500)
    const bad = refuseLock(session,
      (obs ?? []).map((o: { blocker: string; creator_reason: string }) =>
        ({ blocker: o.blocker, creatorReason: o.creator_reason })))
    if (bad) return json({ error: bad }, 409)
    const { error } = await admin.from('watched_sessions')
      .update({ status: 'locked', locked_at: new Date().toISOString(), locked_by: user.id }).eq('id', id)
    if (error) return json({ error: `could not lock: ${error.message}` }, 500)
    return json({ ok: true, status: 'locked', observations: (obs ?? []).length })
  }

  return json({ error: 'action must be create, consent, start, finish, observe or lock' }, 400)
})

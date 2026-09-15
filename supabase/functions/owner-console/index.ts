// Supabase Edge Function: owner-console
//
// WHAT THE OWNER STILL HAS TO DO, ANSWERED BY THE DATABASE.
//
// The remaining human work in this project has been carried in a person's head
// and in chat messages: which migration is next, whether a pilot may start,
// whether two recordings exist, whether the key may be rotated yet. Every one
// of those is already written down in rows or in the schema. This endpoint
// reads them and returns the answer.
//
// ⚠️ READ-ONLY, TOTALLY. It starts nothing, enqueues nothing, spends nothing.
// A page that shows status must never be a page that can accidentally do
// something, so this function has exactly one action and no request body worth
// tampering with.
//
// ⚖️ IT PROBES OBJECTS RATHER THAN THE MIGRATION LEDGER. "Is 0164 applied" via
// schema_migrations is a question about bookkeeping; via "does render_attempts
// have zoom_count" it is a question about the database. The ledger can be wrong
// about the schema. The schema cannot.
//
//   POST { action:"cards" } -> the five cards and the single next action
//
// The admin check is the same one every internal endpoint uses: re-verified
// with the service role, so admin status is never something a client asserts
// about itself.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import {
  schemaCard, pilotCard, recordingsCard, watchedSessionCard, rotationCard, funnelCard,
  refusalCard, nextAction,
} from '../_shared/ownerConsole.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

/**
 * Does a table exist and can it be read?
 *
 * ⚠️ THREE ANSWERS, NOT TWO. `true` present, `false` definitely absent, `null`
 * could not tell. Collapsing null into false would report a probe failure as a
 * missing migration and send the owner to apply something already applied.
 */
async function tableExists(admin: ReturnType<typeof createClient>, table: string): Promise<boolean | null> {
  const { error } = await admin.from(table).select('*', { count: 'exact', head: true }).limit(1)
  if (!error) return true
  const code = String((error as { code?: string }).code ?? '')
  const msg = String(error.message ?? '')
  // 42P01 undefined_table; PostgREST reports an unknown relation in the schema cache.
  if (code === '42P01' || code === 'PGRST205' || /does not exist|Could not find the table/i.test(msg)) return false
  return null
}

/** Does a specific column exist? Same three answers, same reason. */
async function columnExists(
  admin: ReturnType<typeof createClient>, table: string, column: string,
): Promise<boolean | null> {
  const { error } = await admin.from(table).select(column, { head: true }).limit(1)
  if (!error) return true
  const code = String((error as { code?: string }).code ?? '')
  const msg = String(error.message ?? '')
  if (code === '42703' || code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(msg)) return false
  if (code === '42P01' || /does not exist/i.test(msg)) return false
  return null
}

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

  // ── schema probes ────────────────────────────────────────────────────────
  const hasZoomCount = await columnExists(admin, 'render_attempts', 'zoom_count')
  const hasWatchedSessions = await tableExists(admin, 'watched_sessions')
  const hasPilotTables = await tableExists(admin, 'visual_pilot_runs')

  // ── the pilot ────────────────────────────────────────────────────────────
  // ⚠️ THE MOST RECENT RUN, not "an active one": a locked pilot is the answer
  // to "what should I do about #58" just as much as a collecting one is.
  const { data: runs } = hasPilotTables
    ? await admin.from('visual_pilot_runs').select('id, status, created_at')
      .order('created_at', { ascending: false }).limit(1)
    : { data: null }
  const run = runs?.[0] ?? null

  const { data: lockedRuns } = hasPilotTables
    ? await admin.from('visual_pilot_runs').select('id').eq('status', 'locked').limit(1)
    : { data: null }

  // ── product-origin renders ───────────────────────────────────────────────
  //
  // ⚠️ `origin` LIVES ON source_capture_intents, NOT ON render_attempts, and
  // 'teleprompter' is the ONLY product origin. An upload is a creator testing
  // Twin's editing of someone else's footage; counting it would answer a
  // question about the product with a question about a file.
  //
  // ⚖️ AND A FINISHED PROJECT IS THE EVIDENCE, not a render row: a render that
  // failed validation is not a video anybody watched.
  const { data: intents } = await admin.from('source_capture_intents')
    .select('source_asset_id').eq('origin', 'teleprompter')
  const teleprompterAssets = (intents ?? []).map((r: { source_asset_id: string }) => r.source_asset_id)
  const { count: eligibleCount } = teleprompterAssets.length
    ? await admin.from('edit_projects').select('id', { count: 'exact', head: true })
      .in('source_asset_id', teleprompterAssets)
      .eq('status', 'completed').not('output_asset_id', 'is', null)
    : { count: 0 }

  // ── the watched session ──────────────────────────────────────────────────
  const { data: sessions } = hasWatchedSessions === true
    ? await admin.from('watched_sessions').select('id, status, created_at')
      .order('created_at', { ascending: false }).limit(1)
    : { data: null }

  // ⚠️ THE PACKET IS WHAT MAKES A RUN LABELLABLE, and it lives in a different
  // table from the progress. A pilot that finished collecting with zero claims
  // is stuck, not working — which is exactly the state a real run reached
  // tonight, and "still collecting" would have been a lie about it.
  const { count: claimCount } = run && hasPilotTables
    ? await admin.from('visual_pilot_claims').select('id', { count: 'exact', head: true }).eq('pilot_run_id', run.id)
    : { count: null }
  // Collection is done when every frozen reference has reached a terminal state.
  const { data: refRows } = run && hasPilotTables
    ? await admin.from('visual_pilot_references').select('url, terminal_state').eq('pilot_run_id', run.id)
    : { data: null }
  const { data: refProfiles } = refRows?.length
    ? await admin.from('reference_content_profiles')
      .select('url, visual_profile, visual_failure_code, frames_sampled')
      .in('url', refRows.map((r: { url: string }) => r.url))
    : { data: null }
  // ⚖️ READ FROM THE PROFILES, NOT FROM terminal_state. terminal_state is
  // written BY the collect step, so using it here would report "not finished"
  // for exactly the runs where collect never ran — the ones this card exists
  // to surface.
  const collectionDone = !!refRows?.length && refRows.every((r: { url: string }) =>
    (refProfiles ?? []).some((p: { url: string; visual_profile: unknown; visual_failure_code: unknown; frames_sampled: unknown }) =>
      p.url === r.url && (p.visual_profile != null || p.visual_failure_code != null || p.frames_sampled != null)))

  // ── WHERE A CREATOR STOPS ────────────────────────────────────────────────
  //
  // ⚠️ HEAD-ONLY COUNTS, so the funnel costs four counts and moves no rows.
  //
  // ⚖️ AND THEY ARE COUNTS OF WHAT ALREADY EXISTS, never a new record of "did
  // they record". `recordingFunnel.ts` is explicit that minting a second
  // source of truth for that would create two answers to one question and
  // guarantee they disagree.
  //
  // ⚠️ NULL SURVIVES AS NULL. A count that failed is passed through as null so
  // `funnelCard` can report "could not be read", which is not a product with
  // no recordings.
  const countOf = async (table: string): Promise<number | null> => {
    const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true })
    return error || typeof count !== 'number' ? null : count
  }
  // ⚠️ A COUNT OF THE TABLE, FILTERED. `countOf` counts every row, which is
  // wrong for a funnel stage whose rows are attempts rather than outcomes.
  const countWhere = async (table: string, col: string, val: string): Promise<number | null> => {
    const { count, error } = await admin.from(table)
      .select('id', { count: 'exact', head: true }).eq(col, val)
    return error || typeof count !== 'number' ? null : count
  }
  const scriptsCount = await countOf('generations')
  // ⚠️⚠️ FINISHED TAKES, NOT ROWS. Measured 2026-09-14: `media_assets` holds 7
  // rows and SIX are `uploading`. `countOf('media_assets')` reported 7
  // recordings, so the card read "147 scripts, 7 recorded, 0 exported" -- a
  // behaviour problem, when the truth is six failed uploads.
  const recordingsCount = await countWhere('media_assets', 'status', 'ready')
  const stalledUploadsCount = await countWhere('media_assets', 'status', 'uploading')
  // ⚖️ THE STAGE recordingFunnel.ts SPLIT OUT ON PURPOSE, so "no exports" can
  // be told apart from "a finished take that was refused before editing".
  const editProjectsCount = await countOf('edit_projects')
  const exportsCount = await countOf('edit_outputs')
  // ⚠️ THE DISCRIMINATOR, AND IT IS EXPECTED TO BE ABSENT TODAY. The column
  // does not exist yet, so this resolves to null and the card says the drop
  // cannot be attributed — which is the true state, not an error.
  const { count: scriptIntentCount } = await admin.from('generations')
    .select('id', { count: 'exact', head: true })
    .not('script_intent', 'is', null)
  // ── WHAT TWIN REFUSED TO CHARGE FOR ─────────────────────────────────────
  //
  // ⚠️ MEASURED 2026-09-14: 25 of 141 paid generations were refunded as
  // `blueprint_refund_quality` — 18% — and no loop reads it. The Wiring
  // Standard calls refusals "never collected"; they have been in the credits
  // ledger all along, because `refundOnce` passes its reason straight to
  // `refund_credits`. The gap was gate 1, not gate 5.
  //
  // ⚖️ COUNTED BY REASON, so a writer problem and a compliance refusal are
  // never averaged together. They need opposite fixes.
  const countByReason = async (reasons: string[]): Promise<number | null> => {
    const { count, error } = await admin.from('credit_events')
      .select('id', { count: 'exact', head: true }).in('reason', reasons)
    return error || typeof count !== 'number' ? null : count
  }
  const refusalCounts = {
    charges: await countByReason(['blueprint']),
    // ⚠️ BOTH REFUND SPELLINGS. `blueprint_refund` is the older path (7 rows,
    // newest 2026-09-02) and `blueprint_refund_quality` the current one (25).
    // Reading only the new name would report a rate that silently excludes
    // every refund issued before it was renamed.
    qualityRefunds: await countByReason(['blueprint_refund_quality', 'blueprint_refund']),
    disclosureRefusals: await countByReason(['disclosure_missing', 'disclosure_denied']),
  }

  const funnelCounts = {
    scripts: scriptsCount,
    recordings: recordingsCount,
    stalledUploads: stalledUploadsCount,
    editProjects: editProjectsCount,
    exports: exportsCount,
    scriptIntents: typeof scriptIntentCount === 'number' ? scriptIntentCount : null,
  }

  const cards = [
    schemaCard({ hasZoomCount, hasWatchedSessions }),
    pilotCard(run, { canStart: hasPilotTables === true, claims: claimCount, collectionDone }),
    recordingsCard(eligibleCount ?? 0),
    watchedSessionCard(sessions?.[0] ?? null, { tablesExist: hasWatchedSessions === true }),
    // ⚠️ `resolved` IS NOT DERIVABLE FROM THIS DATABASE. Rotation is proven by
    // the OLD key being refused, which no query here can test, so this reports
    // "due" and never "done" — SECURITY.md remains the record.
    rotationCard({ anyPilotLocked: (lockedRuns?.length ?? 0) > 0, resolved: false }),
    funnelCard(funnelCounts),
    refusalCard(refusalCounts),
  ]

  return json({ ok: true, cards, next: nextAction(cards), generated_at: new Date().toISOString() })
})

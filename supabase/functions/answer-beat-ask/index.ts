// Supabase Edge Function: answer-beat-ask
//
// THE ONLY WRITE PATH FOR A `needs_user` BEAT'S QUESTION (see beatAsk.ts / FIX 1
// in docs/audits/scripting-fix-specs.md). A beat the writer refused to
// fabricate carries `ask` + `line_scaffold` on `blueprint.script[i]` instead of
// a placeholder line — this is where the creator's answer (or skip) turns that
// question back into something spoken.
//
//   POST { generation_id, beat_index, answer? }
//     answer omitted/blank => SKIP (matches resolveAskAnswer's own reading of a
//     blank answer — there is no separate skip action).
//   -> { ok: true, line: string, ask_state: 'answered' | 'skipped' | 'unanswered' }
//
// Two writes, on a real answer only, mirroring the pattern in
// apps/web/src/lib/creatorAnswers.ts (a DIFFERENT feature — the fixed
// onboarding question bank — that this deliberately does not touch or extend):
//   1. blueprint.script[beat_index] gets { line, ask_state, answer } — the
//      SAME row the writer wrote the ask onto, so the ask/answer pair never
//      splits across two records that can disagree.
//   2. creator_knowledge gets a row with source:'asked' — the only source in
//      this product a creator STATED rather than a model inferred.
// A skip only performs write 1: declining to answer a beat is not a fact about
// the creator worth remembering.
//
// Deploy:  supabase functions deploy answer-beat-ask

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import { resolveAskAnswer, ANSWER_MAX_CHARS } from '../_shared/beatAsk.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_KEYS = new Set(['generation_id', 'beat_index', 'answer'])
// creator_knowledge_kind_valid does not have a per-beat-ask kind (unlike the
// fixed onboarding bank, which fixes the kind PER QUESTION — see
// creatorQuestions.ts). A per-beat answer can be anything the writer needed:
// a number, a stance, a moment. 'claim' is the schema's generic bucket for
// exactly that — a stated position with no more specific shape asserted.
const ASKED_KIND = 'claim'

type ScriptBeat = {
  line?: string
  section?: string
  ask?: string
  line_scaffold?: string
  ask_state?: 'unanswered' | 'answered' | 'skipped'
  answer?: string | null
  [key: string]: unknown
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  for (const k of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(k)) return json({ error: `Unexpected field: ${k}` }, 400)
  }

  const generationId = String(body.generation_id ?? '').trim()
  if (!UUID_RE.test(generationId)) return json({ error: 'generation_id (uuid) is required' }, 400)

  const beatIndex = body.beat_index
  if (!Number.isInteger(beatIndex) || (beatIndex as number) < 0) {
    return json({ error: 'beat_index (non-negative integer) is required' }, 400)
  }

  // ⚖️ ABSENT AND BLANK ARE BOTH A SKIP, NEVER A MALFORMED REQUEST. A creator
  // who taps "Skip" sends no `answer` at all; a stray empty string from the
  // client reads the same way — `resolveAskAnswer` is the single place this
  // is decided, and it treats both as SKIP rather than as an error.
  const rawAnswer = body.answer
  if (rawAnswer !== undefined && rawAnswer !== null && typeof rawAnswer !== 'string') {
    return json({ error: 'answer must be a string, null, or omitted' }, 400)
  }
  // ⚠️ REFUSED, NOT TRUNCATED, exactly like fillScaffold's own rule — a
  // sentence cut at the limit can invert what the creator said, and this text
  // is about to become both a spoken line and a permanent knowledge row.
  if (typeof rawAnswer === 'string' && rawAnswer.trim().length > ANSWER_MAX_CHARS) {
    return json({ error: `Answer is too long (max ${ANSWER_MAX_CHARS} characters).` }, 400)
  }

  // Owner-checked in the same query, like generate-thumbnail / start-editor-v2:
  // a row that does not belong to this user reads as not found, not forbidden.
  const { data: gen } = await admin
    .from('generations')
    .select('id, user_id, brand_voice_id, blueprint')
    .eq('id', generationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!gen) return json({ error: 'Generation not found' }, 404)

  const blueprint = (gen.blueprint ?? {}) as { script?: ScriptBeat[] }
  const script = Array.isArray(blueprint.script) ? blueprint.script : null
  const beat = script?.[beatIndex as number]
  if (!script || !beat) return json({ error: 'No such beat on this generation' }, 404)

  const ask = typeof beat.ask === 'string' ? beat.ask : ''
  if (ask.trim() === '') {
    // Not a malformed request — just not a beat this endpoint has anything to
    // do. A beat with no ask has nothing to answer or skip.
    return json({ error: 'This beat has no question to answer' }, 400)
  }

  const resolution = resolveAskAnswer(ask, beat.line_scaffold, typeof rawAnswer === 'string' ? rawAnswer : null)
  if (resolution.state === 'unanswered') {
    // The only way resolveAskAnswer returns this is a real answer that failed
    // to fill (too long past the pre-check above racing a stale scaffold, or
    // a scaffold with more than one slot slipping past the writer's own
    // check) — refuse rather than silently store nothing.
    return json({ error: "That answer couldn't be turned into a line — try shortening it." }, 400)
  }

  const nextBeat: ScriptBeat = {
    ...beat,
    line: resolution.line,
    ask_state: resolution.state,
    answer: resolution.state === 'answered' ? (rawAnswer as string).trim() : null,
  }
  const nextScript = script.map((b, i) => (i === beatIndex ? nextBeat : b))
  const { error: updateError } = await admin
    .from('generations')
    .update({ blueprint: { ...blueprint, script: nextScript } })
    .eq('id', generationId)
  if (updateError) {
    console.error('answer-beat-ask: blueprint patch failed', updateError.message)
    return json({ error: "We couldn't save that — try again." }, 500)
  }

  // ⚠️ THE KNOWLEDGE WRITE IS BEST-EFFORT AND NEVER COSTS THE CREATOR THEIR
  // SCRIPT. The line above already landed — a failed or duplicate knowledge
  // insert must not turn a successful answer into an error response.
  if (resolution.state === 'answered') {
    const { error: knowledgeError } = await admin.from('creator_knowledge').insert({
      owner_id: user.id,
      voice_id: gen.brand_voice_id ?? null,
      kind: ASKED_KIND,
      text: (rawAnswer as string).trim(),
      basis: 'stated',
      source: 'asked',
      confidence: 0.9,
      times_seen: 1,
      source_ref: `beat_ask:${generationId}:${beatIndex}`,
      last_observed_at: new Date().toISOString(),
    })
    if (knowledgeError && knowledgeError.code !== '23505') {
      // 23505 = the same claim already exists (creator_knowledge_one_per_claim)
      // — the fact is already on record, which is the outcome this write
      // wanted anyway. Anything else is logged, not surfaced: the script the
      // creator is looking at is already correct.
      console.error('answer-beat-ask: knowledge write failed', knowledgeError.message)
    }
  }

  return json({ ok: true, line: resolution.line, ask_state: resolution.state })
})

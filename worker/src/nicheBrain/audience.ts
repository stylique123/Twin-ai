// TEST VIEWERS — runs every new script past ~10 pretend viewers from her
// audience, saves what they said, and files their questions into her brain.
//
// ⚖️ ON TOP OF THE SYSTEM. Kicked, never awaited; one script at a time; any
// failure is stamped 'failed' so the script is not retried forever. The script
// is improved only when a rewrite tests better on the same viewers.

import { db } from '../db.js'
import { geminiJson, geminiEmbed } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { noteKey } from './librarian.js'
import { fileNote } from './sweep.js'
import { insertKnowledge } from '../knowledgeInsert.js'
import { runMentionFinder, fileConfirmedMentions } from './mentions.js'
import { runShiftFinder, fileConfirmedShifts } from './shifts.js'
import { runNicheQuestions } from './nicheQuestions.js'
import {
  AUDIENCE_SCHEMA, AUDIENCE_SYSTEM, PANEL_SCHEMA, PANEL_SIZE, PANEL_SYSTEM,
  audiencePrompt, normalizeAudience, normalizePanel, scriptFromBlueprint, type Persona,
  HOOK_TARGET, HOOK_ROUNDS, HOOK_REWRITE_SYSTEM, HOOK_REWRITE_SCHEMA, hookRewritePrompt, cleanNewHooks,
  SCRIPT_TARGET, SCRIPT_ROUNDS, SCRIPT_REWRITE_SYSTEM, SCRIPT_REWRITE_SCHEMA, scriptRewritePrompt,
  applyLineRewrites, betterVersion, watchedToEnd,
} from './audienceParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
export const AUDIENCE_INTERVAL_MS = 15 * 1000
let last = 0
let inFlight = false

export function kickAudienceTests(log: Log): void {
  const now = Date.now()
  if (inFlight || now - last < AUDIENCE_INTERVAL_MS) return
  last = now
  inFlight = true
  void runPanelBuilder(log).then(() => runAudienceTests(log)).then(() => filePostQuestions(log)).then(() => fileHerReplies(log))
    .then(() => runMentionFinder(log)).then(() => fileConfirmedMentions(log))
    .then(() => runShiftFinder(log)).then(() => fileConfirmedShifts(log))
    .then(() => runNicheQuestions(log))
    .catch((err) => log('error', 'audience_threw', { error: err instanceof Error ? err.message : String(err) }))
    .finally(() => { inFlight = false })
}

async function productFacts(owner: string, name: string | null): Promise<string | null> {
  if (!name) return null
  const { data } = await db.from('product_entities')
    .select('name, offer, creator_summary').eq('owner_id', owner).ilike('name', name.slice(0, 120)).limit(1).maybeSingle()
  return data ? JSON.stringify(data) : null
}

// ── HER PANEL: one voice per kick, only when due (missing, a week old, or her
// post count moved). A failed build leaves the old panel, or none — the test
// then invents viewers as before.
export const PANEL_INTERVAL_MS = 60 * 1000
let lastPanel = 0
export async function runPanelBuilder(log: Log): Promise<void> {
  if (Date.now() - lastPanel < PANEL_INTERVAL_MS) return
  lastPanel = Date.now()
  const { data, error } = await db.rpc('panels_due', { p_limit: 1 })
  if (error) { log('error', 'panels_due_failed', { error: error.message }); return }
  const v = (Array.isArray(data) ? data[0] : null) as { voice_id: string; owner_id: string; profile: Record<string, unknown> | null; posts: number } | null
  if (!v) return
  try {
    const p = v.profile ?? {}
    const { data: evidence } = await db.rpc('panel_evidence', { p_voice: v.voice_id })
    const dna = { niche: p.niche, sub_niche: p.sub_niche, audience: p.audience, tone: p.voice ?? p.tone, goal: p.goal }
    const prompt = `CREATOR DNA: ${JSON.stringify(dna).slice(0, 1200)}\n\nHER REAL POSTS (plays, likes, what the reader learned): ${JSON.stringify(evidence ?? {}).slice(0, 5000)}`
    const model = modelForTask('read')
    const personas = normalizePanel(await geminiJson(PANEL_SYSTEM, prompt, PANEL_SCHEMA, 45_000, 0, model))
    if (personas.length < 5) { log('info', 'panel_build', { event: 'panel_build', voice: v.voice_id, personas: personas.length, kept: false }); return }
    await db.from('audience_panels').upsert({
      voice_id: v.voice_id, owner_id: v.owner_id, personas, model, posts_seen: v.posts,
      built_from: { posts: (evidence as { n?: number } | null)?.n ?? 0, dna: true }, built_at: new Date().toISOString(),
    }, { onConflict: 'voice_id' })
    log('info', 'panel_build', { event: 'panel_build', voice: v.voice_id, personas: personas.length, kept: true })
  } catch (err) {
    log('error', 'panel_build_failed', { voice: v.voice_id, error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
  }
}

export async function runAudienceTests(log: Log): Promise<void> {
  const { data, error } = await db.rpc('audience_untested', { p_limit: 1 })
  if (error) { log('error', 'audience_untested_failed', { error: error.message }); return }
  const g = (Array.isArray(data) ? data[0] : null) as
    { id: string; user_id: string; blueprint: unknown; reference_note: string | null; profile: Record<string, unknown> | null; voice_id: string | null } | null
  if (!g) return
  const model = modelForTask('read')
  const s = scriptFromBlueprint(g.blueprint)
  const stamp = (row: Record<string, unknown>) =>
    db.from('audience_tests').upsert({ generation_id: g.id, owner_id: g.user_id, model, created_at: new Date().toISOString(), ...row }, { onConflict: 'generation_id' })
  if (!s) { await stamp({ status: 'failed', failure: 'no hooks or script lines' }); return }

  try {
    const p = g.profile ?? {}
    const emb = await geminiEmbed([s.concept, p.sub_niche, p.niche, p.audience].filter(Boolean).join(' | '))
    const [notes, lessons, product, panelRow] = await Promise.all([
      emb ? db.rpc('brain_brief_scoped', { p_embedding: `[${emb.join(',')}]`, p_owner: g.user_id, p_k: 30 }).then((r) => r.data) : null,
      db.rpc('creator_audience_lessons', { p_owner: g.user_id }).then((r) => r.data),
      productFacts(g.user_id, g.reference_note),
      g.voice_id
        ? db.from('audience_panels').select('personas').eq('voice_id', g.voice_id).maybeSingle().then((r) => r.data)
        : null,
    ])
    const panel = (Array.isArray(panelRow?.personas) ? panelRow.personas : []) as Persona[]
    const objections = (Array.isArray(notes) ? notes : [])
      // Only her own questions or her exact sub-niche's: other accounts' objections are not her viewers'.
      .filter((n: { kind: string; is_hers?: boolean; sub_niche?: string | null }) => n.kind === 'objection'
        && (n.is_hers || (typeof p.sub_niche === 'string' && (n.sub_niche ?? '').toLowerCase() === p.sub_niche.toLowerCase())))
      .map((n: { title: string }) => n.title)
    const dna = { niche: p.niche, sub_niche: p.sub_niche, audience: p.audience, tone: p.voice ?? p.tone, goal: p.goal }
    const raw = await geminiJson(AUDIENCE_SYSTEM, audiencePrompt(s, { dna, product, objections, lessons, panel }), AUDIENCE_SCHEMA, 45_000, 0, model)
    let r = normalizeAudience(raw, s)
    if (!r) { await stamp({ status: 'failed', failure: 'panel too small' }); return }
    const hookBefore = { best: Math.max(0, ...r.hooks.map((h) => h.stopped)), watched: watchedToEnd(r.viewers) }
    // ⚠️ THE PANEL NOW CHANGES THE SCRIPT, NOT ONLY GRADES IT. While the best
    // hook stops fewer than HOOK_TARGET of 10, write new hooks from what the
    // viewers said and test them on the same viewers (at most HOOK_ROUNDS).
    let tested = s
    let rounds = 0
    const scoreOf = (x: NonNullable<typeof r>) => Math.round((Math.max(0, ...x.hooks.map((h) => h.stopped)) / Math.max(1, x.viewers.length)) * 10)
    while (rounds < HOOK_ROUNDS && scoreOf(r) < HOOK_TARGET) {
      rounds += 1
      const fresh = cleanNewHooks(await geminiJson(HOOK_REWRITE_SYSTEM, hookRewritePrompt(tested, r.hooks, r.viewers), HOOK_REWRITE_SCHEMA, 30_000, 0, model), tested.hooks)
      if (fresh.length === 0) break
      const next = { ...tested, hooks: [...tested.hooks, ...fresh] }
      const again = normalizeAudience(await geminiJson(AUDIENCE_SYSTEM, audiencePrompt(next, { dna, product, objections, lessons, panel }), AUDIENCE_SCHEMA, 45_000, 0, model), next)
      if (!again) break
      tested = next; r = again
    }
    // Then the body: lines and scenes. A rewrite is kept only if more viewers
    // stay to the end on the same panel; otherwise the tested version stands.
    let lineRounds = 0
    const changedLines = new Set<number>()
    while (lineRounds < SCRIPT_ROUNDS && watchedToEnd(r.viewers) < SCRIPT_TARGET) {
      lineRounds += 1
      const edit = applyLineRewrites(tested.lines, await geminiJson(SCRIPT_REWRITE_SYSTEM, scriptRewritePrompt(tested, r), SCRIPT_REWRITE_SCHEMA, 30_000, 0, model))
      if (!edit) break
      const next = { ...tested, lines: edit.lines }
      const again = normalizeAudience(await geminiJson(AUDIENCE_SYSTEM, audiencePrompt(next, { dna, product, objections, lessons, panel }), AUDIENCE_SCHEMA, 45_000, 0, model), next)
      if (!again || !betterVersion(r, again)) break
      edit.changed.forEach((i) => changedLines.add(i))
      tested = next; r = again
    }
    const lineChanges = [...changedLines].sort((a, b) => a - b).map((i) => ({ line: i, before: s.lines[i], after: tested.lines[i] }))
    if (tested.hooks.length > s.hooks.length || lineChanges.length > 0) {
      // Only the version that tested best is what she sees: better hooks
      // become her options (best first), better lines replace the old ones on
      // the teleprompter AND on the shot card that quotes them.
      const bp = (g.blueprint && typeof g.blueprint === 'object' ? g.blueprint : {}) as Record<string, unknown>
      const next: Record<string, unknown> = { ...bp }
      if (tested.hooks.length > s.hooks.length) {
        next.hook_options = [...r.hooks].sort((a, b) => b.stopped - a.stopped).map((h) => h.hook).slice(0, 6)
      }
      if (lineChanges.length > 0 && Array.isArray(bp.script)) {
        const script = [...(bp.script as Array<Record<string, unknown>>)]
        const shots = Array.isArray(bp.shot_list) ? [...(bp.shot_list as Array<Record<string, unknown>>)] : null
        for (const c of lineChanges) {
          const at = s.at?.[c.line]
          if (at === undefined || !script[at]) continue
          script[at] = { ...script[at], line: c.after }
          if (shots) {
            const k = shots.findIndex((x) => typeof x?.spoken_text === 'string' && x.spoken_text.trim() === c.before)
            if (k >= 0) shots[k] = { ...shots[k], spoken_text: c.after }
          }
        }
        next.script = script
        if (shots) next.shot_list = shots
      }
      await db.from('generations').update({ blueprint: next }).eq('id', g.id)
    }
    await stamp({
      status: 'done', panel_size: r.viewers.length, hooks: r.hooks, best_hook: r.best_hook,
      viewers: r.viewers, fixes: r.fixes, summary: r.summary,
      panel_voice_id: panel.length ? g.voice_id : null,
      improved: {
        before: hookBefore,
        after: { best: Math.max(0, ...r.hooks.map((h) => h.stopped)), watched: watchedToEnd(r.viewers) },
        hooks_added: tested.hooks.length - s.hooks.length, lines: lineChanges,
      },
    })

    // ── LEARN: her viewers' questions become her private objection notes, so
    // the next script answers them before any panel has to ask.
    let filed = 0
    const sub = typeof p.sub_niche === 'string' ? p.sub_niche.toLowerCase().slice(0, 60) : null
    for (const q of new Set(r.viewers.map((v) => v.question).filter((x): x is string => !!x))) {
      const key = noteKey(q)
      if (key.length < 3) continue
      const id = await fileNote(
        { kind: 'objection', bucket: null, sub_niche: sub, mode: null, goal: null, key, title: q, body: 'asked by a test viewer' },
        g.id, 0, g.user_id,
      )
      if (id) filed += 1
    }
    await db.from('audience_tests').update({ learned_at: new Date().toISOString() }).eq('generation_id', g.id)
    log('info', 'audience_test', { event: 'audience_test', generation: g.id, panel: r.viewers.length, of: PANEL_SIZE, best_hook: r.best_hook, rounds, line_rounds: lineRounds, lines_changed: changedLines.size, fixes: r.fixes.length, filed, her_panel: panel.length > 0 })
  } catch (err) {
    const failure = err instanceof Error ? err.message.slice(0, 300) : 'unknown'
    // A quota wall says nothing about the script: leave it untested so the next tick retries.
    if (/quota|429|API key|GEMINI_API_KEY/i.test(failure)) { log('error', 'audience_stopped', { error: failure }); return }
    await stamp({ status: 'failed', failure })
    log('error', 'audience_failed', { generation: g.id, error: failure })
  }
}

// ── HER REAL AUDIENCE'S QUESTIONS: the ones under her posts she never
// answered (read by the social cron into `post_questions`) become private
// objection notes, exactly like a test viewer's — so her next script answers
// them. Only the question is filed; the commenter's words are never her facts.
export async function filePostQuestions(log: Log): Promise<void> {
  const { data } = await db.from('post_questions')
    .select('id, owner_id, post_id, question').is('filed_at', null).is('her_reply', null).order('created_at').limit(10)
  let filed = 0
  for (const q of (data ?? []) as Array<{ id: string; owner_id: string; post_id: string; question: string }>) {
    const key = noteKey(q.question)
    if (key.length >= 3) {
      const { data: voice } = await db.from('brand_voices').select('profile').eq('owner_id', q.owner_id).eq('status', 'ready').order('updated_at', { ascending: false }).limit(1).maybeSingle()
      const sn = (voice?.profile as { sub_niche?: unknown } | null)?.sub_niche
      const sub = typeof sn === 'string' ? sn.toLowerCase().slice(0, 60) : null
      const id = await fileNote(
        { kind: 'objection', bucket: null, sub_niche: sub, mode: null, goal: null, key, title: q.question, body: 'asked under her post, not yet answered' },
        q.post_id, 0, q.owner_id,
      ).catch(() => null)
      if (id) filed += 1
    }
    await db.from('post_questions').update({ filed_at: new Date().toISOString() }).eq('id', q.id)
  }
  if (filed) log('info', 'post_questions_filed', { event: 'post_questions_filed', filed })
}

// ── HER OWN REPLIES (24-ideas #9): when she answered a question under her post,
// her reply is her own first-person words. Filed into `creator_knowledge` as a
// stated example, source 'reply', with the question as its evidence and the
// post as its trace. Never paraphrased: the row IS her reply.
export async function fileHerReplies(log: Log): Promise<void> {
  const { data } = await db.from('post_questions')
    .select('id, owner_id, post_id, question, her_reply').not('her_reply', 'is', null).is('reply_filed_at', null)
    .order('created_at').limit(10)
  let filed = 0
  for (const q of (data ?? []) as Array<{ id: string; owner_id: string; post_id: string; question: string; her_reply: string }>) {
    const { data: voice } = await db.from('brand_voices').select('id').eq('owner_id', q.owner_id).eq('status', 'ready')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
    const { error } = await insertKnowledge(db as never, [{
      owner_id: q.owner_id, voice_id: voice?.id ?? null, kind: 'example',
      text: q.her_reply.slice(0, 240), basis: 'stated', source: 'reply', confidence: 0.9, times_seen: 1,
      evidence: `Asked under her post: ${q.question}`.slice(0, 240),
      source_ref: `post:${q.post_id}`, last_observed_at: new Date().toISOString(),
    }] as never)
    if (!error) filed += 1
    else log('error', 'her_reply_file_failed', { error: String(error.message ?? '').slice(0, 200) })
    await db.from('post_questions').update({ reply_filed_at: new Date().toISOString() }).eq('id', q.id)
  }
  if (filed) log('info', 'her_replies_filed', { event: 'her_replies_filed', filed })
}

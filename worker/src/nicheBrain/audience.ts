// TEST VIEWERS — runs every new script past ~10 pretend viewers from her
// audience, saves what they said, and files their questions into her brain.
//
// ⚖️ ON TOP OF THE SYSTEM. Kicked, never awaited; one script at a time; any
// failure is stamped 'failed' so the script is not retried forever. The script
// is improved only when a rewrite tests better on the same viewers.

import { db } from '../db.js'
import { syncShotListSpokenText } from '../generated/shotListSync.js'
import { rewriteIsSafe, guardScript } from '../generated/privacyGuard.js'
import { enforceScriptRules } from '../generated/scriptRules.js'
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
  orderHooksBestFirst, defaultHookAfterTest,
  MAX_TESTED_HOOKS, PANEL_VERSION, ANSWER_REWRITE_SYSTEM, answerRewritePrompt,
} from './audienceParse.js'
import { FAMILY_SHAPE } from '../generated/scriptFamily.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
export const AUDIENCE_INTERVAL_MS = 15 * 1000
let last = 0
let inFlight = false

export function kickAudienceTests(log: Log): void {
  const now = Date.now()
  if (inFlight || now - last < AUDIENCE_INTERVAL_MS) return
  last = now
  inFlight = true
  void runPanelBuilder(log).then(() => runAudienceTests(log)).then(() => runPanelAnswers(log)).then(() => filePostQuestions(log)).then(() => fileHerReplies(log))
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
    // ⚠️ AUDIT 2026-10-01: personas came from her own posts only. Her niche's real
    // high-reach videos and the objections real viewers raise there now inform
    // the cold viewers and sceptics too (the same brain the writer reads).
    const emb = await geminiEmbed([p.sub_niche, p.niche, p.audience].filter(Boolean).join(' | ')).catch(() => null)
    const niche = emb
      ? await db.rpc('brain_brief_scoped', { p_embedding: `[${emb.join(',')}]`, p_owner: v.owner_id, p_k: 20 }).then((r) => r.data, () => null)
      : null
    const nicheLines = (Array.isArray(niche) ? niche : []).slice(0, 20)
      .map((n: { kind?: string; title?: string; body?: string }) => `${n.kind ?? 'note'}: ${n.title ?? ''}${n.body ? ` — ${String(n.body).slice(0, 120)}` : ''}`)
    const prompt = `CREATOR DNA: ${JSON.stringify(dna).slice(0, 1200)}\n\nHER REAL POSTS (plays, likes, what the reader learned): ${JSON.stringify(evidence ?? {}).slice(0, 5000)}${nicheLines.length ? `\n\nNICHE EVIDENCE (real high-reach videos and viewer objections in her niche):\n${nicheLines.join('\n')}` : ''}`
    const model = modelForTask('read')
    const personas = normalizePanel(await geminiJson(PANEL_SYSTEM, prompt, PANEL_SCHEMA, 45_000, 0, model))
    if (personas.length < 5) { log('info', 'panel_build', { event: 'panel_build', voice: v.voice_id, personas: personas.length, kept: false }); return }
    await db.from('audience_panels').upsert({
      voice_id: v.voice_id, owner_id: v.owner_id, personas, model, posts_seen: v.posts,
      built_from: { v: PANEL_VERSION, posts: (evidence as { n?: number } | null)?.n ?? 0, dna: true, niche_notes: nicheLines.length }, built_at: new Date().toISOString(),
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
    // ⚠️ AUDIT 2026-09-29 #1: THE PANEL REWRITES A SCRIPT THAT ALREADY PASSED
    // THE PRIVACY GUARD, and wrote straight back. A new hook or line may now
    // only say what the checked script and its product already say: no private
    // term, no private fact's wording, no quantity that was not there.
    const privateFacts: string[] = await db.from('creator_knowledge').select('text, evidence')
      // ⚠️ AUDIT 2026-10-01 (B3): facts she switched off are refused too, not only private ones.
      .eq('owner_id', g.user_id).or('sensitive.eq.true,creator_excluded_at.not.is.null').limit(200)
      .then((r) => (r.data ?? []).map((k: { text?: string | null; evidence?: string | null }) => `${k.text ?? ''}. ${k.evidence ?? ''}`), () => [])
    // ⚠️ AUDIT 2026-10-01 (D): what she has actually said, so a viewer can never
    // credit a confident detail that traces to nothing (an invented "scorching",
    // invented gram weights). The same store the writer's fact guards read.
    const facts: string[] = await db.from('creator_knowledge').select('text')
      .eq('owner_id', g.user_id).eq('sensitive', false).is('creator_excluded_at', null)
      .in('basis', ['stated', 'demonstrated']).order('times_seen', { ascending: false }).limit(40)
      .then((r) => (r.data ?? []).map((k: { text?: string | null }) => String(k.text ?? '')).filter(Boolean), () => [])
    const bpIn = (g.blueprint && typeof g.blueprint === 'object' ? g.blueprint : {}) as Record<string, unknown>
    const family = typeof bpIn.script_family === 'string' ? bpIn.script_family : null
    const shape = family ? FAMILY_SHAPE[family as keyof typeof FAMILY_SHAPE] ?? null : null
    const allowedText = [...s.hooks, ...s.lines, product ?? ''].join('\n')
    // ⚠️ AUDIT 2026-10-01 (S1): this rewrite runs AFTER every guard in the
    // writer, so it is held to the writer's rules too: no unpicked product or
    // brand, no follow ask she did not choose. The writer left the context.
    const rc = ((g.blueprint as { rule_context?: { unpicked?: unknown; follow_allowed?: unknown } } | null)?.rule_context) ?? {}
    const ruleOpts = {
      unpicked: Array.isArray(rc.unpicked) ? rc.unpicked.filter((x): x is string => typeof x === 'string') : [],
      followAllowed: rc.follow_allowed === true,
    }
    const safe = (t: string) => rewriteIsSafe(t, { allowedText, excludedTexts: privateFacts })
      && enforceScriptRules([{ line: t }], ruleOpts).removed.length === 0
    let refused = 0
    const objections = (Array.isArray(notes) ? notes : [])
      // Only her own questions or her exact sub-niche's: other accounts' objections are not her viewers'.
      .filter((n: { kind: string; is_hers?: boolean; sub_niche?: string | null }) => n.kind === 'objection'
        && (n.is_hers || (typeof p.sub_niche === 'string' && (n.sub_niche ?? '').toLowerCase() === p.sub_niche.toLowerCase())))
      .map((n: { title: string }) => n.title)
    const dna = { niche: p.niche, sub_niche: p.sub_niche, audience: p.audience, tone: p.voice ?? p.tone, goal: p.goal }
    const raw = await geminiJson(AUDIENCE_SYSTEM, audiencePrompt(s, { dna, product, objections, lessons, panel, family, shape, facts }), AUDIENCE_SCHEMA, 45_000, 0, model)
    let r = normalizeAudience(raw, s)
    if (!r) { await stamp({ status: 'failed', failure: 'panel too small' }); return }
    const hookBefore = { best: Math.max(0, ...r.hooks.map((h) => h.stopped)), watched: watchedToEnd(r.viewers) }
    // ⚠️ THE PANEL NOW CHANGES THE SCRIPT, NOT ONLY GRADES IT. While the best
    // hook stops fewer than HOOK_TARGET of 10, write new hooks from what the
    // viewers said and test them on the same viewers (at most HOOK_ROUNDS).
    let tested = s
    let rounds = 0
    const scoreOf = (x: NonNullable<typeof r>) => Math.round((Math.max(0, ...x.hooks.map((h) => h.stopped)) / Math.max(1, x.viewers.length)) * 10)
    while (rounds < HOOK_ROUNDS && scoreOf(r) < HOOK_TARGET && tested.hooks.length < MAX_TESTED_HOOKS) {
      rounds += 1
      const drafted = cleanNewHooks(await geminiJson(HOOK_REWRITE_SYSTEM, hookRewritePrompt(tested, r.hooks, r.viewers), HOOK_REWRITE_SCHEMA, 30_000, 0, model), tested.hooks)
      const fresh = drafted.filter(safe).slice(0, MAX_TESTED_HOOKS - tested.hooks.length)
      refused += drafted.length - fresh.length
      if (fresh.length === 0) break
      const next = { ...tested, hooks: [...tested.hooks, ...fresh] }
      const again = normalizeAudience(await geminiJson(AUDIENCE_SYSTEM, audiencePrompt(next, { dna, product, objections, lessons, panel, family, shape, facts }), AUDIENCE_SCHEMA, 45_000, 0, model), next)
      if (!again) break
      tested = next; r = again
    }
    // Then the body: lines and scenes. A rewrite is kept only if more viewers
    // stay to the end on the same panel; otherwise the tested version stands.
    let lineRounds = 0
    const changedLines = new Set<number>()
    while (lineRounds < SCRIPT_ROUNDS && (watchedToEnd(r.viewers) < SCRIPT_TARGET || r.promise_kept === false)) {
      lineRounds += 1
      const drafted = applyLineRewrites(tested.lines, await geminiJson(SCRIPT_REWRITE_SYSTEM, scriptRewritePrompt(tested, r), SCRIPT_REWRITE_SCHEMA, 30_000, 0, model))
      if (!drafted) break
      const unsafe = drafted.changed.filter((i) => !safe(drafted.lines[i]))
      refused += unsafe.length
      const edit = unsafe.length === drafted.changed.length ? null : {
        lines: drafted.lines.map((l, i) => (unsafe.includes(i) ? tested.lines[i] : l)),
        changed: drafted.changed.filter((i) => !unsafe.includes(i)),
      }
      if (!edit) break
      const next = { ...tested, lines: edit.lines }
      const again = normalizeAudience(await geminiJson(AUDIENCE_SYSTEM, audiencePrompt(next, { dna, product, objections, lessons, panel, family, shape, facts }), AUDIENCE_SCHEMA, 45_000, 0, model), next)
      if (!again || !betterVersion(r, again)) break
      edit.changed.forEach((i) => changedLines.add(i))
      tested = next; r = again
    }
    if (refused) log('warn', 'audience_rewrite_refused', { event: 'audience_rewrite_refused', generation_id: g.id, refused })
    const lineChanges = [...changedLines].sort((a, b) => a - b).map((i) => ({ line: i, before: s.lines[i], after: tested.lines[i] }))
    // ⚠️ THE SCRIPT'S HOOK WAS NOT THE AUDIENCE'S BEST HOOK (7 of 9 coffee
    // runs): the list said "recommended" over option 1 and the script was built
    // on it, while the viewers starred another. Options are now always ordered
    // by how many viewers stopped, a hook that stopped nobody is dropped when
    // three others did better, and the default hook is the starred one unless
    // she picked one herself.
    const ordered = orderHooksBestFirst(r.hooks)
    const bp = (g.blueprint && typeof g.blueprint === 'object' ? g.blueprint : {}) as Record<string, unknown>
    const oldOrder = Array.isArray(bp.hook_options) ? (bp.hook_options as unknown[]).join('\u0000') : ''
    const reordered = ordered.length > 0 && ordered.join('\u0000') !== oldOrder
    const shown = (bp.shown_audit && typeof bp.shown_audit === 'object' ? bp.shown_audit : null) as Record<string, unknown> | null
    const promiseChanged = r.promise_kept !== null && (shown?.promiseKept ?? null) !== r.promise_kept
    if (reordered || lineChanges.length > 0 || promiseChanged) {
      // Only the version that tested best is what she sees: better lines
      // replace the old ones on the teleprompter AND on the shot card.
      const next: Record<string, unknown> = { ...bp }
      if (reordered) next.hook_options = ordered
      // Owner brief 2026-10-01 (1.6): did the video close what its hook opened?
      if (r.promise_kept !== null) next.shown_audit = { ...(shown ?? {}), promiseKept: r.promise_kept }
      if (lineChanges.length > 0 && Array.isArray(bp.script)) {
        const script = [...(bp.script as Array<Record<string, unknown>>)]
        const shots = Array.isArray(bp.shot_list) ? [...(bp.shot_list as Array<Record<string, unknown>>)] : null
        for (const c of lineChanges) {
          const at = s.at?.[c.line]
          if (at === undefined || !script[at]) continue
          script[at] = { ...script[at], line: c.after }
        }
        next.script = script
        // ⚠️ ROUND 3, 2.2: the old exact-text patch missed any shot whose line had
        // drifted, so the two documents could say the same wrong thing two ways.
        // The shot list is re-derived from the script, position by position —
        // the same rule the writer applies (shotListSync).
        if (shots) next.shot_list = syncShotListSpokenText(shots, script).shots
      }
      await db.from('generations').update({ blueprint: next }).eq('id', g.id)
    }
    if (ordered[0]) {
      const { data: cur } = await db.from('generations').select('selected_hook, hook_choice').eq('id', g.id).maybeSingle()
      const picked = (cur?.hook_choice as { source?: string } | null)?.source === 'creator'
      const want = defaultHookAfterTest(ordered, picked ? String(cur?.selected_hook ?? '') : null)
      if (!picked && cur?.selected_hook !== want) {
        await db.from('generations').update({ selected_hook: want, hook_choice: { source: 'default', index: 0 } }).eq('id', g.id)
      }
    }
    await stamp({
      status: 'done', panel_size: r.viewers.length, hooks: r.hooks, best_hook: r.best_hook,
      viewers: r.viewers, fixes: r.fixes, summary: r.summary,
      panel_voice_id: panel.length ? g.voice_id : null,
      working: r.working, needs_her: r.needs_her, unverified: r.unverified, out_of_scope: r.out_of_scope,
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
      // ⚠️ AUDIT 2026-09-30: "Did the neighbor come talk to you first before
      // calling code enforcement?" was filed as her objection although she had
      // marked that matter private. A question that touches it is never filed.
      if (guardScript([{ line: q }], { allowedText: '', excludedTexts: privateFacts }).removed.length) continue
      const id = await fileNote(
        { kind: 'objection', bucket: null, sub_niche: sub, mode: null, goal: null, key, title: q, body: 'asked by a test viewer' },
        g.id, 0, g.user_id,
      )
      if (id) filed += 1
    }
    await db.from('audience_tests').update({ learned_at: new Date().toISOString() }).eq('generation_id', g.id)
    log('info', 'audience_test', { event: 'audience_test', generation: g.id, panel: r.viewers.length, of: PANEL_SIZE, best_hook: r.best_hook, rounds, line_rounds: lineRounds, lines_changed: changedLines.size, fixes: r.fixes.length, filed, her_panel: panel.length > 0, closed_hooks: r.hooks.filter((h) => h.closed).length, promise_kept: r.promise_kept, needs_her: r.needs_her.length, unverified: r.unverified.length, out_of_scope: r.out_of_scope, working: r.working.length })
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

// ── HER ANSWERS GO INTO THE SCRIPT (owner audit 2026-10-01, Option C). The
// panel names a fact only she can give; she answers it on the page
// (answer_panel_question); this writes her answer into the line it belongs in.
// ⚖️ Only her answer's words may enter: the rewrite is checked so no other new
// number, name or private matter rides in with it.
export async function runPanelAnswers(log: Log): Promise<void> {
  const { data, error } = await db.rpc('panel_answers_pending', { p_limit: 1 })
  if (error) { log('error', 'panel_answers_failed', { error: error.message }); return }
  const t = (Array.isArray(data) ? data[0] : null) as { generation_id: string; owner_id: string; blueprint: unknown; needs_her: unknown } | null
  if (!t) return
  const qs = (Array.isArray(t.needs_her) ? t.needs_her : []) as Array<Record<string, unknown>>
  const pending = qs.map((q, i) => ({ q, i })).filter(({ q }) => typeof q.answer === 'string' && !q.applied_at)
  const now = new Date().toISOString()
  const markAll = (applied: boolean) => qs.map((q, i) => (pending.some((p) => p.i === i) ? { ...q, applied_at: now, applied } : q))
  const s = scriptFromBlueprint(t.blueprint)
  if (!s || pending.length === 0) { await db.from('audience_tests').update({ needs_her: markAll(false) }).eq('generation_id', t.generation_id); return }
  try {
    const answers = pending.map(({ q }) => ({ question: String(q.question ?? ''), answer: String(q.answer), beat: Number(q.beat ?? -1) }))
    const herWords = answers.map((a) => a.answer).join(' ')
    const privateFacts: string[] = await db.from('creator_knowledge').select('text, evidence')
      .eq('owner_id', t.owner_id).or('sensitive.eq.true,creator_excluded_at.not.is.null').limit(200)
      .then((r) => (r.data ?? []).map((k: { text?: string | null; evidence?: string | null }) => `${k.text ?? ''}. ${k.evidence ?? ''}`), () => [])
    const model = modelForTask('read')
    const drafted = applyLineRewrites(s.lines, await geminiJson(ANSWER_REWRITE_SYSTEM, answerRewritePrompt(s, answers), SCRIPT_REWRITE_SCHEMA, 30_000, 0, model), herWords)
    const allowedText = [...s.hooks, ...s.lines, herWords].join('\n')
    const ok = drafted ? drafted.changed.filter((i) => rewriteIsSafe(drafted.lines[i], { allowedText, excludedTexts: privateFacts })) : []
    if (drafted && ok.length) {
      const bp = { ...(t.blueprint as Record<string, unknown>) }
      const script = [...(bp.script as Array<Record<string, unknown>>)]
      for (const i of ok) { const at = s.at?.[i]; if (at !== undefined && script[at]) script[at] = { ...script[at], line: drafted.lines[i] } }
      bp.script = script
      if (Array.isArray(bp.shot_list)) bp.shot_list = syncShotListSpokenText(bp.shot_list as Array<Record<string, unknown>>, script).shots
      await db.from('generations').update({ blueprint: bp }).eq('id', t.generation_id)
    }
    await db.from('audience_tests').update({ needs_her: markAll(ok.length > 0) }).eq('generation_id', t.generation_id)
    log('info', 'panel_answer_applied', { event: 'panel_answer_applied', generation: t.generation_id, answers: answers.length, lines: ok.length })
  } catch (err) {
    const failure = err instanceof Error ? err.message.slice(0, 200) : 'unknown'
    if (/quota|429|API key|GEMINI_API_KEY/i.test(failure)) { log('error', 'panel_answers_stopped', { error: failure }); return }
    await db.from('audience_tests').update({ needs_her: markAll(false) }).eq('generation_id', t.generation_id)
    log('error', 'panel_answer_failed', { generation: t.generation_id, error: failure })
  }
}

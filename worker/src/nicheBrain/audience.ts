// TEST VIEWERS — runs every new script past ~10 pretend viewers from her
// audience, saves what they said, and files their questions into her brain.
//
// ⚖️ ON TOP OF THE SYSTEM. Kicked, never awaited; one script at a time; any
// failure is stamped 'failed' so the script is not retried forever. The script
// itself is never modified — the result is shown beside it.

import { db } from '../db.js'
import { geminiJson, geminiEmbed } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { noteKey } from './librarian.js'
import { fileNote } from './sweep.js'
import {
  AUDIENCE_SCHEMA, AUDIENCE_SYSTEM, PANEL_SCHEMA, PANEL_SIZE, PANEL_SYSTEM,
  audiencePrompt, normalizeAudience, normalizePanel, scriptFromBlueprint, type Persona,
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
  void runPanelBuilder(log).then(() => runAudienceTests(log))
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
export const PANEL_INTERVAL_MS = 5 * 60 * 1000
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
    db.from('audience_tests').upsert({ generation_id: g.id, owner_id: g.user_id, model, ...row }, { onConflict: 'generation_id' })
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
      .filter((n: { kind: string }) => n.kind === 'objection').map((n: { title: string }) => n.title)
    const dna = { niche: p.niche, sub_niche: p.sub_niche, audience: p.audience, tone: p.voice ?? p.tone, goal: p.goal }
    const raw = await geminiJson(AUDIENCE_SYSTEM, audiencePrompt(s, { dna, product, objections, lessons, panel }), AUDIENCE_SCHEMA, 45_000, 0, model)
    const r = normalizeAudience(raw, s)
    if (!r) { await stamp({ status: 'failed', failure: 'panel too small' }); return }
    await stamp({
      status: 'done', panel_size: r.viewers.length, hooks: r.hooks, best_hook: r.best_hook,
      viewers: r.viewers, fixes: r.fixes, summary: r.summary,
      panel_voice_id: panel.length ? g.voice_id : null,
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
    log('info', 'audience_test', { event: 'audience_test', generation: g.id, panel: r.viewers.length, of: PANEL_SIZE, best_hook: r.best_hook, fixes: r.fixes.length, filed, her_panel: panel.length > 0 })
  } catch (err) {
    const failure = err instanceof Error ? err.message.slice(0, 300) : 'unknown'
    // A quota wall says nothing about the script: leave it untested so the next tick retries.
    if (/quota|429|API key|GEMINI_API_KEY/i.test(failure)) { log('error', 'audience_stopped', { error: failure }); return }
    await stamp({ status: 'failed', failure })
    log('error', 'audience_failed', { generation: g.id, error: failure })
  }
}

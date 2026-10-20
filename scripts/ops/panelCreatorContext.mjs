// PANEL CREATOR CONTEXT FOR BLIND PACKAGES (plan v5.4 §20). READ ONLY. PRIVATE OUTPUT ONLY.
//
// The owner's correction on panel 8: a creator's ONBOARDING ANSWERS (niche,
// profile, story, product slot), her content pillars and her voice card are
// first-party items, so a blind labelling package must carry them or an
// advisor cannot tell "hers" from "invented". For one batch label (e.g.
// panel-current-8) this reads, for every fictional panel creator in the batch:
//   onboarding answers  creator_knowledge rows she typed (source asked / user)
//                       and the answers on brand_voices.pre_script_brief
//   pillars             pre_script_brief.contentPillars
//   voice card          brand_voices.profile (niche, tone, audience, style note, samples)
// and writes into --out (a private directory OUTSIDE the repository; refused otherwise):
//   panel-creator-context.json   one entry per creator, keyed by an opaque creator
//                                id (a hash of the label and the owner id)
//   panel-creator-key.csv        creator id → owner_id, handle, script ids
// Nothing is written to the database. Prints counts only, never text.
//
// Run:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/panelCreatorContext.mjs <batch-label> --out=/private/dir
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { assertOutsideRepo, csvCell } from './exportPanel.mjs'

/** creator_knowledge sources that are her own typed answers. */
export const ANSWER_SOURCES = ['asked', 'user']
/** pre_script_brief fields she answered during onboarding. */
export const BRIEF_ANSWER_FIELDS = ['audience', 'offer', 'background', 'confirmedAudiencePain', 'confirmedDreamOutcome', 'productFacts', 'workKindOther']
/** Voice-card fields copied from brand_voices.profile (never anything else on the row). */
export const VOICE_CARD_FIELDS = ['niche', 'sub_niche', 'tone', 'audience', 'summary', 'style_note', 'samples']
export const KEY_HEADER = ['creator_id', 'owner_id', 'handle', 'script_ids']

const text = (v) => (typeof v === 'string' ? v.trim() : '')

/** One creator's context from loaded rows. Pure (no network). */
export function creatorContext({ knowledge, voice }) {
  const brief = voice?.pre_script_brief && typeof voice.pre_script_brief === 'object' ? voice.pre_script_brief : {}
  const profile = voice?.profile && typeof voice.profile === 'object' ? voice.profile : {}
  const answers = []
  for (const k of knowledge ?? []) {
    if (!ANSWER_SOURCES.includes(k?.source)) continue
    const t = text(k.text)
    if (t) answers.push({ kind: text(k.kind) || 'fact', source: k.source, text: t })
  }
  for (const f of BRIEF_ANSWER_FIELDS) {
    const t = text(brief[f])
    if (t) answers.push({ kind: f, source: 'onboarding', text: t })
  }
  const pillars = (Array.isArray(brief.contentPillars) ? brief.contentPillars : []).map(text).filter(Boolean)
  const voice_card = {}
  for (const f of VOICE_CARD_FIELDS) {
    const v = profile[f]
    if (Array.isArray(v)) { const xs = v.map(text).filter(Boolean); if (xs.length) voice_card[f] = xs }
    else if (text(v)) voice_card[f] = text(v)
  }
  return { onboarding_answers: answers, pillars, voice_card }
}

/** Both files from loaded creators. Pure. Creator ids are hashes, so order says nothing. */
export function buildContext(label, creators) {
  const rows = creators.map((c) => ({ c, id: `PC-${createHash('sha256').update(`${label}\u0000${c.owner_id}`).digest('hex').slice(0, 8)}` }))
  rows.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  const context = {}
  const key = [KEY_HEADER.join(',')]
  for (const { c, id } of rows) {
    context[id] = { ...creatorContext(c), script_ids: c.script_ids }
    key.push([id, c.owner_id, c.handle ?? '', c.script_ids.join(' ')].map(csvCell).join(','))
  }
  return { context, key: key.join('\n') + '\n', creators: rows.length }
}

async function main() {
  const label = process.argv[2]
  const outArg = (process.argv.find((a) => a.startsWith('--out=')) ?? '').slice(6)
  if (!label || label.startsWith('--') || !outArg) throw new Error('usage: panelCreatorContext.mjs <batch-label> --out=/private/dir')
  const out = assertOutsideRepo(outArg)
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: rows, error } = await admin.from('script_batch_results').select('n, scenario, generation_id').eq('batch', label).gte('n', 0).not('generation_id', 'is', null).order('n')
  if (error) throw error
  // Fictional panel rows only.
  const panelRows = (rows ?? []).filter((r) => r.scenario?.group === 'panel')
  const byOwner = new Map()
  for (const row of panelRows) {
    const { data: g, error: e1 } = await admin.from('generations').select('id, user_id').eq('id', row.generation_id).single()
    if (e1) throw e1
    const ids = byOwner.get(g.user_id) ?? []
    ids.push(`${label}#${row.n}`)
    byOwner.set(g.user_id, ids)
  }
  const creators = []
  for (const [owner, scriptIds] of byOwner) {
    const { data: knowledge, error: e2 } = await admin.from('creator_knowledge').select('kind, text, source').eq('owner_id', owner).in('source', ANSWER_SOURCES)
    if (e2) throw e2
    const { data: voice, error: e3 } = await admin.from('brand_voices').select('handle, profile, pre_script_brief').eq('owner_id', owner).eq('is_default', true).limit(1).maybeSingle()
    if (e3) throw e3
    creators.push({ owner_id: owner, handle: voice?.handle ?? '', script_ids: scriptIds, knowledge, voice })
  }
  const s = buildContext(label, creators)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'panel-creator-context.json'), JSON.stringify(s.context, null, 2) + '\n')
  writeFileSync(join(out, 'panel-creator-key.csv'), s.key)
  const answers = Object.values(s.context).reduce((n, c) => n + c.onboarding_answers.length, 0)
  console.log(`panel creator context: ${panelRows.length} panel generations, ${s.creators} creators, ${answers} onboarding answers`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })

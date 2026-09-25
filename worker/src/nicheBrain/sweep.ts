// THE NICHE BRAIN SWEEP — read unread corpus videos, file what they teach.
//
// ⚖️ ON TOP OF THE SYSTEM, NEVER IN ITS WAY. It runs detached from the job loop
// (the caller does not await it), one batch at a time, and every failure is
// logged and swallowed. It writes only its own three tables. The worst it can do
// is leave the brain empty — no scan, script or remix waits on it or reads it.

import { db } from '../db.js'
import { geminiJson, geminiEmbed } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import {
  CORPUS_READ_VERSION, READER_SCHEMA, READER_SYSTEM, normalizeRead, readerPrompt, viewsFromReach,
  type CorpusCard, type CorpusRead,
} from './reader.js'
import { runMomentWatcher } from './moments.js'
import { runIdeaWriter } from './ideas.js'
import { runAvailabilitySweep } from './availabilitySweep.js'
import { MAX_SOURCES, embedText, notesFromRead, place, relationFor, type NoteDraft } from './librarian.js'

export const BRAIN_SWEEP_INTERVAL_MS = 2 * 60 * 1000
/** ~6,800 videos at 15 per 2 minutes clears the backlog in about 15 hours
 *  without competing with creators' own Gemini calls for quota. */
export const BRAIN_SWEEP_BATCH = 15

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void

const vec = (v: number[] | null) => (v ? `[${v.join(',')}]` : null)

async function knownSubNiches(bucketHint: string | null): Promise<string[]> {
  const { data } = await db.rpc('brain_subniches', { p_bucket: bucketHint, p_limit: 40 })
  return Array.isArray(data) ? data.map((r: { sub_niche: string }) => r.sub_niche).filter(Boolean) : []
}

/** File one note: merge into its twin, or insert and (maybe) link as related. */
async function fileNote(n: NoteDraft, sourceId: string, views: number, owner: string | null = null): Promise<string | null> {
  const emb = await geminiEmbed(embedText(n))
  let target: string | null = null
  let relatedTo: string | null = null

  if (emb) {
    // ⚖️ OWNER-SCOPED: her private notes never merge into shared ones.
    const { data } = await db.rpc('brain_nearest_scoped', {
      p_embedding: vec(emb), p_kind: n.kind, p_bucket: n.bucket, p_sub_niche: n.sub_niche, p_owner: owner, p_k: 3,
    })
    const p = place(Array.isArray(data) ? data : [])
    if (p.action === 'merge') target = p.into
    else relatedTo = p.relatedTo
  }
  if (!target) {
    // exact-key fallback (also catches the no-embedding case)
    let q = db.from('brain_notes').select('id').eq('kind', n.kind).eq('key', n.key)
    q = n.bucket === null ? q.is('bucket', null) : q.eq('bucket', n.bucket)
    q = n.sub_niche === null ? q.is('sub_niche', null) : q.eq('sub_niche', n.sub_niche)
    q = owner === null ? q.is('owner_id', null) : q.eq('owner_id', owner)
    const { data } = await q.maybeSingle()
    if (data?.id) target = data.id as string
  }

  if (target) {
    const { data: cur } = await db.from('brain_notes').select('times_seen, total_views, sources').eq('id', target).single()
    if (!cur) return null
    const sources = [sourceId, ...((cur.sources as string[]) ?? []).filter((s) => s !== sourceId)].slice(0, MAX_SOURCES)
    await db.from('brain_notes').update({
      times_seen: (cur.times_seen as number) + 1,
      total_views: Number(cur.total_views ?? 0) + views,
      sources, last_seen: new Date().toISOString(),
    }).eq('id', target)
    return target
  }

  const { data: ins, error } = await db.from('brain_notes').insert({
    ...n, owner_id: owner, embedding: vec(emb), total_views: views, sources: [sourceId],
  }).select('id').single()
  if (error || !ins) return null
  if (relatedTo) {
    await db.from('brain_links').upsert(
      { from_id: ins.id, to_id: relatedTo, relation: 'related', weight: 1 },
      { onConflict: 'from_id,to_id,relation', ignoreDuplicates: true },
    )
  }
  return ins.id as string
}

async function link(from: string, to: string, relation: string): Promise<void> {
  const { data } = await db.from('brain_links').select('weight')
    .eq('from_id', from).eq('to_id', to).eq('relation', relation).maybeSingle()
  if (data) {
    await db.from('brain_links').update({ weight: (data.weight as number) + 1 })
      .eq('from_id', from).eq('to_id', to).eq('relation', relation)
  } else {
    await db.from('brain_links').insert({ from_id: from, to_id: to, relation, weight: 1 })
  }
}

/** File every note a read produced and link them to its topic. */
export async function fileRead(read: CorpusRead, sourceId: string, views: number, owner: string | null = null): Promise<number> {
  const notes = notesFromRead(read)
  let topicId: string | null = null
  let filed = 0
  for (const n of notes) {
    const id = await fileNote(n, sourceId, views, owner)
    if (!id) continue
    filed += 1
    if (n.kind === 'topic') { topicId = id; continue }
    const rel = relationFor(n.kind)
    if (topicId && rel) await link(topicId, id, rel)
  }
  return filed
}

async function readOne(card: CorpusCard, model: string): Promise<{ read: CorpusRead | null; failure: string | null }> {
  try {
    const subs = await knownSubNiches(null)
    const raw = await geminiJson(READER_SYSTEM, readerPrompt(card, subs), READER_SCHEMA, 45_000, 0, model)
    return { read: normalizeRead(raw), failure: null }
  } catch (err) {
    return { read: null, failure: err instanceof Error ? err.message.slice(0, 300) : 'unknown' }
  }
}

let inFlight = false
let last = 0

/** Call every loop; returns immediately. Never throws. */
export function kickBrainSweep(log: Log): void {
  const now = Date.now()
  if (inFlight || now - last < BRAIN_SWEEP_INTERVAL_MS) return
  last = now
  inFlight = true
  void (async () => {
    await runBrainSweep(log)
    await runOwnPostSweep(log)
    await runLearner(log)
    await runMomentWatcher(log)
    await runIdeaWriter(log)
    await runAvailabilitySweep(log)
  })().catch((err) => {
    log('error', 'brain_sweep_threw', { error: err instanceof Error ? err.message : String(err) })
  }).finally(() => { inFlight = false })
}

export async function runBrainSweep(log: Log): Promise<void> {
  const { data: cards, error } = await db.rpc('brain_unread', { p_version: CORPUS_READ_VERSION, p_limit: BRAIN_SWEEP_BATCH })
  if (error) { log('error', 'brain_sweep_read_failed', { error: error.message }); return }
  const todo = (Array.isArray(cards) ? cards : []) as CorpusCard[]
  if (todo.length === 0) return

  const model = modelForTask('read')
  let read = 0, unreadable = 0, failed = 0, notes = 0
  for (const card of todo) {
    const { read: r, failure } = await readOne(card, model)
    const views = viewsFromReach(card.reach) ?? 0
    const status = failure ? 'failed' : r?.readable ? 'read' : 'unreadable'
    // ⚠️ A QUOTA / KEY WALL IS NOT STAMPED — it says nothing about the video,
    // so the batch stops and the same rows are retried next sweep. Any other
    // failure IS stamped ('failed'), or one bad caption would head every batch.
    if (status === 'failed') {
      failed += 1
      if (failure && /quota|429|API key|GEMINI_API_KEY/i.test(failure)) {
        log('error', 'brain_sweep_stopped', { error: failure })
        break
      }
    }
    await db.from('corpus_reads').upsert({
      gallery_item_id: card.id, version: CORPUS_READ_VERSION, status,
      bucket: r?.bucket ?? null, sub_niche: r?.sub_niche ?? null, topic: r?.topic ?? null,
      mode: r?.mode ?? null, goal: r?.goal ?? null, language: r?.language ?? null,
      hook_type: r?.hook_type ?? null, hook_pattern: r?.hook_pattern ?? null,
      structure: r?.structure ?? null, persuasion: r?.persuasion ?? null,
      why_it_works: r?.why_it_works ?? null, views: views || null, model, failure,
      read_at: new Date().toISOString(),
    }, { onConflict: 'gallery_item_id' })
    if (status === 'failed') continue
    if (status === 'unreadable') { unreadable += 1; continue }
    read += 1
    notes += await fileRead(r as CorpusRead, card.id, views)
  }
  log('info', 'brain_sweep', { event: 'brain_sweep', batch: todo.length, read, unreadable, failed, notes, model })
}

// ── HER LOOP: her own posts, read by the same reader, filed as PRIVATE notes ──
// ⚖️ Best-performing first (brain_unread_own orders by plays), so the notes that
// matter most exist soonest. Plays ride along as the note's views, so her own
// winners outrank her own misses inside her private lane.
export const OWN_SWEEP_BATCH = 10

export async function runOwnPostSweep(log: Log): Promise<void> {
  const { data, error } = await db.rpc('brain_unread_own', { p_version: CORPUS_READ_VERSION, p_limit: OWN_SWEEP_BATCH })
  if (error) { log('error', 'own_sweep_read_failed', { error: error.message }); return }
  const posts = (Array.isArray(data) ? data : []) as Array<{
    id: string; owner_id: string; caption: string | null; plays: number | null; platform: string | null
    niche: string | null; sub_niche: string | null
  }>
  if (posts.length === 0) return
  const model = modelForTask('read')
  let read = 0, unreadable = 0, failed = 0, notes = 0
  for (const p of posts) {
    const card: CorpusCard = {
      id: p.id, title: p.caption, platform: p.platform,
      niche: [p.niche, p.sub_niche].filter(Boolean).join(' / ') || null,
      reach: p.plays != null ? `${p.plays} views` : null,
    }
    const { read: r, failure } = await readOne(card, model)
    const status = failure ? 'failed' : r?.readable ? 'read' : 'unreadable'
    if (status === 'failed') {
      failed += 1
      if (failure && /quota|429|API key|GEMINI_API_KEY/i.test(failure)) {
        log('error', 'own_sweep_stopped', { error: failure })
        break
      }
    }
    await db.from('own_post_reads').upsert({
      scraped_post_id: p.id, owner_id: p.owner_id, version: CORPUS_READ_VERSION, status,
      topic: r?.topic ?? null, hook_type: r?.hook_type ?? null, hook_pattern: r?.hook_pattern ?? null,
      mode: r?.mode ?? null, goal: r?.goal ?? null, why_it_works: r?.why_it_works ?? null,
      plays: p.plays, failure, read_at: new Date().toISOString(),
    }, { onConflict: 'scraped_post_id' })
    if (status !== 'read' || !r) { if (status === 'unreadable') unreadable += 1; continue }
    read += 1
    notes += await fileRead(r, p.id, Number(p.plays ?? 0), p.owner_id)
  }
  log('info', 'own_sweep', { event: 'own_sweep', batch: posts.length, read, unreadable, failed, notes, model })
}

// ── SCRIPT LOOP: credit notes whose scripts were filmed, posted and viewed ──
export const LEARN_INTERVAL_MS = 30 * 60 * 1000
let lastLearn = 0
export async function runLearner(log: Log): Promise<void> {
  if (Date.now() - lastLearn < LEARN_INTERVAL_MS) return
  lastLearn = Date.now()
  const { data, error } = await db.rpc('brain_learn')
  if (error) { log('error', 'brain_learn_failed', { error: error.message }); return }
  log('info', 'brain_learn', { event: 'brain_learn', notes_updated: Number(data ?? 0) })
}

// WHAT HER AUDIENCE ACTUALLY ASKS (owner brief 2026-10-01, comments).
//
// ⚖️ A STRUCTURAL COPY OF "FOUND YOU ELSEWHERE" (mentions.ts): one voice per
// kick, every 10 minutes at most, each voice once a month; what is found is a
// CANDIDATE; only what she confirms is filed; every failure is logged and the
// voice stamped, never blocking anything else.
//
// ⚖️ TWO SOURCES, ONE PATH. Comments under her own scraped posts (Apify, the
// vendor the scan already uses) and under posts Twin published for her
// (`post_questions`, read by the social cron) both land in
// `comment_candidates`. Nothing is filed into her brain without her yes.

import { db } from '../db.js'
import { env } from '../env.js'
import { insertKnowledge } from '../knowledgeInsert.js'
import { candidateIn, commentKnowledge, normalizeComments, pickCandidates } from './commentMiningParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
export const COMMENTS_INTERVAL_MS = 10 * 60 * 1000
const COMMENTS_PER_POST = 60
let last = 0

async function apifyItems(actor: string, input: unknown): Promise<Record<string, unknown>[]> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 240_000)
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${env.apifyToken}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: ctl.signal,
    })
    if (!r.ok) throw new Error(`apify ${actor} returned ${r.status}`)
    const j = await r.json()
    return Array.isArray(j) ? (j as Record<string, unknown>[]) : []
  } finally { clearTimeout(timer) }
}

export async function runCommentMiner(log: Log): Promise<void> {
  if (!env.apifyToken || Date.now() - last < COMMENTS_INTERVAL_MS) return
  last = Date.now()
  const { data, error } = await db.rpc('comments_due', { p_limit: 1 })
  if (error) { log('error', 'comments_due_failed', { error: error.message }); return }
  const v = (Array.isArray(data) ? data[0] : null) as
    { voice_id: string; owner_id: string; platform: string; handle: string | null; urls: string[] | null } | null
  if (!v || !v.urls?.length) return
  const stamp = (patch: Record<string, unknown>) => db.from('comment_reads')
    .upsert({ voice_id: v.voice_id, read_at: new Date().toISOString(), ...patch }, { onConflict: 'voice_id' })
  try {
    const items = v.platform === 'tiktok'
      ? await apifyItems(env.apifyTiktokCommentsActor, { postURLs: v.urls, commentsPerPost: COMMENTS_PER_POST, maxRepliesPerComment: 0 })
      : await apifyItems(env.apifyInstagramCommentsActor, { directUrls: v.urls, resultsLimit: COMMENTS_PER_POST })
    const comments = normalizeComments(items)
    const picked = pickCandidates(comments, v.handle)
    if (picked.length) {
      await db.from('comment_candidates').upsert(picked.map((c) => ({
        owner_id: v.owner_id, voice_id: v.voice_id, platform: v.platform, post_url: c.postUrl,
        external_comment_id: c.externalId, kind: c.kind, text: c.text, times_asked: c.timesAsked, likes: c.likes,
      })), { onConflict: 'owner_id,platform,external_comment_id', ignoreDuplicates: true })
    }
    await stamp({ posts: v.urls.length, comments: comments.length, candidates: picked.length, failure: null })
    log('info', 'comment_candidates', { event: 'comment_candidates', voice: v.voice_id, platform: v.platform, posts: v.urls.length, comments: comments.length, candidates: picked.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err)
    // A billing / auth wall is not this voice's fault: do not stamp, so it is retried.
    if (/ 40[123]\b| 429\b/.test(msg)) { log('error', 'comment_miner_stopped', { error: msg }); return }
    await stamp({ failure: msg })
    log('error', 'comment_miner_failed', { voice: v.voice_id, error: msg })
  }
}

/** Questions under posts Twin published become candidates too — never notes she did not approve. */
export async function postQuestionsToCandidates(log: Log): Promise<void> {
  const { data } = await db.from('post_questions')
    .select('id, owner_id, post_id, platform, external_comment_id, question').is('filed_at', null).is('her_reply', null)
    .order('created_at').limit(20)
  let moved = 0
  for (const q of (data ?? []) as Array<{ id: string; owner_id: string; post_id: string; platform: string; external_comment_id: string; question: string }>) {
    const hit = candidateIn(q.question)
    if (hit) {
      const { error } = await db.from('comment_candidates').upsert({
        owner_id: q.owner_id, platform: q.platform, post_id: q.post_id, external_comment_id: q.external_comment_id,
        kind: hit.kind, text: hit.text,
      }, { onConflict: 'owner_id,platform,external_comment_id', ignoreDuplicates: true })
      if (!error) moved += 1
    }
    await db.from('post_questions').update({ filed_at: new Date().toISOString() }).eq('id', q.id)
  }
  if (moved) log('info', 'post_questions_candidates', { event: 'post_questions_candidates', moved })
}

/** Only what she confirmed becomes knowledge — scoped to the product she named. */
export async function fileConfirmedComments(log: Log): Promise<void> {
  const { data } = await db.from('comment_candidates')
    .select('id, owner_id, voice_id, kind, text, answer, times_asked, product_entity_id, post_url')
    .eq('status', 'confirmed').is('filed_at', null).limit(10)
  let filed = 0
  for (const c of (data ?? []) as Array<{ id: string; owner_id: string; voice_id: string | null; kind: string; text: string; answer: string | null; times_asked: number; product_entity_id: string | null; post_url: string | null }>) {
    const k = commentKnowledge(c)
    const { error } = await insertKnowledge(db as never, [{
      owner_id: c.owner_id, voice_id: c.voice_id, kind: k.kind, text: k.text, basis: k.basis, source: 'comment',
      confidence: 1, times_seen: Math.max(1, c.times_asked), evidence: k.evidence,
      source_ref: `comment:${c.id}`, source_url: c.post_url, product_entity_id: c.product_entity_id,
      last_observed_at: new Date().toISOString(),
    }] as never)
    if (!error) filed += 1
    else log('error', 'comment_file_failed', { error: String(error.message ?? '').slice(0, 200) })
    await db.from('comment_candidates').update({ filed_at: new Date().toISOString() }).eq('id', c.id)
  }
  if (filed) log('info', 'comments_filed', { event: 'comments_filed', filed })
}

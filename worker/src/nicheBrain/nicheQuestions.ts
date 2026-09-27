// QUESTIONS FROM ACROSS HER NICHE (24-ideas #11).
//
// ⚖️ THE QUESTION IS THE NICHE'S; THE ANSWER STAYS HERS. Public comments under
// library videos in her niche are read for QUESTIONS only (the same finder as
// her own posts) and filed as SHARED objection notes in that niche, so every
// creator there can answer them in her own words. No commenter's words become
// anyone's fact, and no answer is ever taken from a comment.
//
// ⚖️ FREE AND OPT-IN. YouTube's official Data API (commentThreads, 1 quota
// unit per call on a free key), one video per 10 minutes. Without
// YOUTUBE_API_KEY this never runs.

import { db } from '../db.js'
import { env } from '../env.js'
import { noteKey } from './librarian.js'
import { fileNote } from './sweep.js'
import { unansweredQuestions } from '../generated/postQuestions.js'
import { youtubeVideoId } from './nicheQuestionsParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
export const NICHE_QUESTIONS_INTERVAL_MS = 10 * 60 * 1000
let last = 0


export async function runNicheQuestions(log: Log): Promise<void> {
  if (!env.youtubeApiKey || Date.now() - last < NICHE_QUESTIONS_INTERVAL_MS) return
  last = Date.now()
  const { data, error } = await db.rpc('niche_comment_due', { p_limit: 1 })
  if (error) { log('error', 'niche_comment_due_failed', { error: error.message }); return }
  const v = (Array.isArray(data) ? data[0] : null) as { gallery_item_id: string; url: string; bucket: string | null; sub_niche: string | null; views: number | null } | null
  if (!v) return
  const stamp = (n: number, failure: string | null = null) => db.from('niche_comment_reads')
    .upsert({ gallery_item_id: v.gallery_item_id, read_at: new Date().toISOString(), questions: n, failure }, { onConflict: 'gallery_item_id' })
  const id = youtubeVideoId(v.url)
  if (!id) { await stamp(0, 'no video id'); return }
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=100&order=relevance&textFormat=plainText&videoId=${id}&key=${env.youtubeApiKey}`)
    if (res.status === 403 || res.status === 429) {
      const body = await res.text()
      // Comments disabled on this video is final; a quota wall is not.
      if (/commentsDisabled/.test(body)) { await stamp(0, 'comments disabled'); return }
      log('error', 'niche_questions_stopped', { status: res.status }); return
    }
    const j = await res.json() as { items?: Array<{ id?: string; snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }> }
    const comments = (j.items ?? []).map((t) => ({
      id: String(t.id ?? ''), text: String(t.snippet?.topLevelComment?.snippet?.textDisplay ?? ''), byOwner: false, replies: [],
    })).filter((c) => c.id)
    const qs = unansweredQuestions(comments, 8)
    let filed = 0
    const sub = v.sub_niche ? v.sub_niche.toLowerCase().slice(0, 60) : null
    for (const q of qs) {
      const key = noteKey(q.question)
      if (key.length < 3) continue
      const nid = await fileNote(
        { kind: 'objection', bucket: v.bucket, sub_niche: sub, mode: null, goal: null, key, title: q.question, body: 'asked by viewers in this niche' },
        v.gallery_item_id, Number(v.views ?? 0), null,
      ).catch(() => null)
      if (nid) filed += 1
    }
    await stamp(filed)
    log('info', 'niche_questions', { event: 'niche_questions', gallery_item: v.gallery_item_id, comments: comments.length, questions: qs.length, filed })
  } catch (err) {
    await stamp(0, err instanceof Error ? err.message.slice(0, 200) : String(err))
  }
}

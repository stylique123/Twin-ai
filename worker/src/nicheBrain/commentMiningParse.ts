// WHAT HER AUDIENCE ACTUALLY ASKS (owner brief 2026-10-01, comments) — pure part.
//
// ⚖️ A COMMENT IS REAL DEMAND, NOT HER FACT. Only two shapes are kept: a direct
// question ("does this come in blue?") and a concrete request ("please restock
// the large"). Praise, emoji and tags are not material. The commenter's words
// are a CANDIDATE she confirms; only her own answer can ever become a claim.
//
// ⚖️ PRIVATE MATTER NEVER BECOMES A CANDIDATE. A comment about someone's
// health, family or money is dropped here, before anything is stored — the same
// `isPrivate` the writer's final guard uses, not a second, looser list.

import { questionIn } from '../generated/postQuestions.js'
import { isPrivate } from '../generated/privacyGuard.js'

export interface RawComment { id: string; text: string; author: string | null; likes: number; postUrl: string | null }
export interface CommentCandidate {
  externalId: string; kind: 'question' | 'request'; text: string
  timesAsked: number; likes: number; postUrl: string | null
}

const REQUEST = /\b(please|pls|plz)\b.{0,60}\b(make|restock|bring|do|show|add|ship|sell|post|drop)\b|\b(restock|bring (it|them|this) back|need (this|these|one) in|wish (it|this|you) (came|had|made)|do (a|one) (video|tutorial) on|can you (make|do|show))\b/i

/** Either shape, or null. Handles and links are stripped first. */
export function candidateIn(text: string): { kind: 'question' | 'request'; text: string } | null {
  const clean = String(text ?? '').replace(/https?:\/\/\S+/g, ' ').replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length < 12 || isPrivate(clean)) return null
  const q = questionIn(clean)
  if (q && !isPrivate(q)) return { kind: 'question', text: q.slice(0, 240) }
  if (REQUEST.test(clean) && clean.length <= 240) return { kind: 'request', text: clean }
  return null
}

/** One output shape for both Apify comment actors (TikTok, Instagram). */
export function normalizeComments(items: ReadonlyArray<Record<string, unknown>>): RawComment[] {
  const out: RawComment[] = []
  for (const it of items) {
    const id = String(it.cid ?? it.id ?? '').trim()
    const text = String(it.text ?? '').trim()
    if (!id || !text) continue
    const author = (it.uniqueId ?? it.ownerUsername ?? (it.owner as { username?: unknown } | undefined)?.username ?? null) as string | null
    const likes = Number(it.diggCount ?? it.likesCount ?? 0)
    const postUrl = (it.videoWebUrl ?? it.postUrl ?? it.inputUrl ?? null) as string | null
    out.push({ id, text, author: author ? String(author) : null, likes: Number.isFinite(likes) ? likes : 0, postUrl })
  }
  return out
}

const keyOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Her own comments are skipped. The same question under several posts is one
 * candidate asked N times; the most-liked wording is kept. Ranked by how often
 * it was asked, then likes — "what people KEEP asking".
 */
export function pickCandidates(comments: readonly RawComment[], handle: string | null, max = 12): CommentCandidate[] {
  const me = String(handle ?? '').replace(/^@/, '').toLowerCase()
  const byKey = new Map<string, CommentCandidate>()
  for (const c of comments) {
    if (me && String(c.author ?? '').toLowerCase() === me) continue
    const hit = candidateIn(c.text)
    if (!hit) continue
    const k = keyOf(hit.text)
    if (k.length < 8) continue
    const prev = byKey.get(k)
    if (prev) {
      prev.timesAsked += 1
      if (c.likes > prev.likes) Object.assign(prev, { externalId: c.id, text: hit.text, likes: c.likes, postUrl: c.postUrl })
    } else {
      byKey.set(k, { externalId: c.id, kind: hit.kind, text: hit.text, timesAsked: 1, likes: c.likes, postUrl: c.postUrl })
    }
  }
  return [...byKey.values()].sort((a, b) => b.timesAsked - a.timesAsked || b.likes - a.likes).slice(0, max)
}

/**
 * The row she confirmed, as knowledge. With her answer it is her own words
 * (stated); without one it records only that her audience asks it
 * (demonstrated — real, but not something she said).
 */
export function commentKnowledge(c: { kind: string; text: string; answer: string | null; times_asked: number }): {
  kind: 'fact' | 'topic'; text: string; basis: 'stated' | 'demonstrated'; evidence: string
} {
  const asked = c.times_asked > 1 ? ` (asked ${c.times_asked} times)` : ''
  const label = c.kind === 'request' ? 'Viewers request' : 'Viewers ask'
  if (c.answer) {
    return {
      kind: 'fact',
      text: `${label}: "${c.text}" — her answer: ${c.answer}`.slice(0, 240),
      basis: 'stated',
      evidence: `From her comments${asked}; answer typed by her.`.slice(0, 240),
    }
  }
  return { kind: 'topic', text: `${label}: "${c.text}"`.slice(0, 240), basis: 'demonstrated', evidence: `From her comments${asked}; she confirmed it is real.` }
}

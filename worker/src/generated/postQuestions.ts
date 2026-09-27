// GENERATED FROM packages/shared/src/postQuestions.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// UNANSWERED QUESTIONS UNDER HER POSTS (24-ideas #10) — the pure part.
//
// ⚖️ WHAT IT IS: a backlog of what her real audience asked and she never
// answered. Each question becomes a private objection note in her brain, so
// the next script answers it before anyone has to ask again.
//
// ⚖️ WHAT IT IS NOT: the commenter's words are never her facts. Only the
// QUESTION is kept — never an answer, never a claim — and it is filed exactly
// like a test viewer's question.

export interface PlatformComment {
  id: string
  text: string
  byOwner: boolean
  at?: string | null
  replies: ReadonlyArray<{ byOwner: boolean; text?: string | null }>
}

export interface PostQuestion { id: string; question: string; at: string | null }

const ASKS = /^(?:who|what|whats|what's|where|when|why|how|which|is|are|do|does|did|can|could|would|will|should|have|has)\b/i

/** A real question: a sentence ending in "?" or opening with a question word, 12–220 chars. */
export function questionIn(text: string): string | null {
  const t = String(text ?? '').replace(/<[^>]+>/g, ' ').replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.length < 12) return null
  const sentences = t.match(/[^.!?]+[.!?]*/g) ?? [t]
  for (const s of sentences) {
    const q = s.trim()
    if (q.length < 12 || q.length > 220) continue
    if (q.endsWith('?') || (ASKS.test(q) && q.split(' ').length >= 4)) return q.endsWith('?') ? q : `${q.replace(/[.!]+$/, '')}?`
  }
  return null
}

/** Questions from her audience that she has not replied to. */
export function unansweredQuestions(comments: readonly PlatformComment[], max = 20): PostQuestion[] {
  const out: PostQuestion[] = []
  const seen = new Set<string>()
  for (const c of comments) {
    if (c.byOwner || c.replies.some((r) => r.byOwner)) continue
    const q = questionIn(c.text)
    if (!q) continue
    const key = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: c.id, question: q, at: c.at ?? null })
    if (out.length >= max) break
  }
  return out
}

// ── HER OWN REPLIES (24-ideas #9) ───────────────────────────────────────────
// When she DID answer, her reply is her own first-person words on a question
// her real audience asked — the same authority as an answer typed into Twin,
// reached in public. Kept only when it says something (≥ 6 words); "thank
// you!" and emoji are not substance.
export interface AnsweredPair { id: string; question: string; reply: string; at: string | null }

export function herAnswers(comments: readonly PlatformComment[], max = 20): AnsweredPair[] {
  const out: AnsweredPair[] = []
  const seen = new Set<string>()
  for (const c of comments) {
    if (c.byOwner) continue
    const q = questionIn(c.text)
    if (!q) continue
    const reply = c.replies
      .filter((r) => r.byOwner && typeof r.text === 'string')
      .map((r) => String(r.text).replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim())
      .find((t) => t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= 6)
    if (!reply) continue
    const key = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: c.id, question: q, reply: reply.slice(0, 240), at: c.at ?? null })
    if (out.length >= max) break
  }
  return out
}

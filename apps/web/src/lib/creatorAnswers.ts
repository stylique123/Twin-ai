// THE ONLY WRITE IN THIS PRODUCT WHERE THE CREATOR STATES A POSITION DIRECTLY.
//
// ⚠️ AN ANSWER LANDS IN TWO PLACES AND THEY MEAN DIFFERENT THINGS. The sentence
// becomes a `creator_knowledge` row — it is knowledge, and belongs where the
// writer already looks. The fact that the question was PUT becomes a
// `creator_questions_put` row, so it is never asked again. Storing the answer in
// the log as well would create two records that can disagree about what the
// creator said, and the store would lose.
//
// ⚖️ THE LOG IS WRITTEN EVEN WHEN THE KNOWLEDGE WRITE FAILS, AND ON PURPOSE.
// Being asked the same question twice because an insert failed is a worse
// experience than a lost answer, and the creator can always say it again in
// their own words. Ordering follows from that: log first, knowledge second.
import { supabase } from './supabase'
import type { StoreCounts } from '@twinai/shared'
import { answerToKnowledge, type CreatorQuestion, type StoredKnowledgeItem } from '@twinai/shared'

/**
 * Record that a question was DISPLAYED.
 *
 * ⚠️ THE MEASUREMENT THAT DID NOT EXIST. Until this, "nobody answers" and
 * "nobody was asked" were the same zero: 0128 wrote a row on answer or skip
 * only, so a creator who scrolled past the card left no trace. Production on
 * 2026-08-26 held 0 rows against 22 creators who had generated 41 scripts, and
 * that number was equally consistent with the card never rendering and with
 * every creator ignoring it.
 *
 * ⚖️ BEST-EFFORT AND SILENT. An impression that fails to record must never cost
 * the creator the question itself, so this returns nothing and throws nothing.
 * Its absence understates the denominator, which is the honest direction to
 * fail: it can only make the answer rate look BETTER than it is, never worse.
 */
export async function markQuestionShown(questionId: string): Promise<void> {
  try { await markPut(questionId, 'shown') } catch { /* an unrecorded impression is not the creator's problem */ }
}

/** Every question already put to this creator — answered OR skipped.
 *
 *  ⚠️ RETURNS null, NOT [], WHEN IT CANNOT READ. An empty array means "nothing
 *  has been asked yet" and would make the UI open with question one; a failed
 *  read means we do not know, and the right move on not-knowing is to ask
 *  nothing at all. The two must not collapse. */
export async function loadQuestionsPut(): Promise<string[] | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null
    // ⚠️ 'shown' IS EXCLUDED, AND THE FEATURE DIES WITHOUT THIS FILTER.
    // `nextQuestion` retires every id in the list it is handed, so a 'shown' row
    // reaching it would retire the question the moment it was displayed -- each
    // creator would be asked exactly one question, once, forever. 'shown' means
    // seen and not acted on, which is precisely the state that SHOULD come back.
    const { data, error } = await supabase
      .from('creator_questions_put')
      .select('question_id')
      .eq('owner_id', ownerId)
      .in('outcome', ['answered', 'skipped'])
    if (error) {
      // A table that does not exist yet (0128 unapplied) is not-knowing, not empty.
      console.warn('questions-put not read', error.message)
      return null
    }
    return (data ?? []).map((r) => String((r as { question_id?: unknown }).question_id ?? ''))
  } catch (err) {
    console.warn('questions-put not read', err)
    return null
  }
}

/** Record that a question was put and declined. Never throws. */
export async function skipQuestion(questionId: string): Promise<boolean> {
  return markPut(questionId, 'skipped')
}

/** Store an answer as stated knowledge, and close the question.
 *
 *  ⚖️ RETURNS THE REFUSAL REASON RATHER THAN A BARE FALSE. "Too long" and "we
 *  could not save it" need different sentences in front of a creator who just
 *  typed three sentences, and only this layer knows which happened. */
export async function answerQuestion(
  question: CreatorQuestion,
  answer: string,
  voiceId: string | null,
): Promise<{ ok: true } | { ok: false; reason: 'empty' | 'too_short' | 'too_long' | 'not_saved' }> {
  const built = answerToKnowledge(question, answer)
  if (!built.ok) return built

  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return { ok: false, reason: 'not_saved' }

    // ⚠️ THE LOG FIRST. If the knowledge insert fails after this, the creator has
    // lost a sentence; if it were the other way round and the LOG failed, they
    // would be asked the same question again with their own answer already in
    // the store — which reads as the product not listening.
    await markPut(question.id, 'answered')

    const { error } = await supabase.from('creator_knowledge').insert({
      owner_id: ownerId,
      voice_id: voiceId,
      kind: built.row.kind,
      text: built.row.text,
      basis: built.row.basis,
      source: built.row.source,
      confidence: built.row.confidence,
      times_seen: built.row.times_seen,
      source_ref: built.row.source_ref,
      // ⚖️ `last_observed_at` IS NOW, BECAUSE THEY SAID IT NOW. Leaving it null
      // would make a position stated today look older than one read off a
      // two-year-old video, and the writer ranks partly on recency.
      last_observed_at: new Date().toISOString(),
    })
    if (error) {
      console.warn('answer not stored as knowledge', error.message)
      return { ok: false, reason: 'not_saved' }
    }
    return { ok: true }
  } catch (err) {
    console.warn('answer not stored as knowledge', err)
    return { ok: false, reason: 'not_saved' }
  }
}

/** ⚠️ UPSERT, NOT INSERT. 0128 puts a unique index on (owner, question) so the
 *  never-ask-twice rule cannot be lost to a race — which means a creator who
 *  skipped a question and later answers it would collide. That transition is
 *  legitimate and is the one thing allowed to change about a row. */
async function markPut(questionId: string, outcome: 'answered' | 'skipped' | 'shown'): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return false
    const { error } = await supabase
      .from('creator_questions_put')
      .upsert({ owner_id: ownerId, question_id: questionId, outcome }, { onConflict: 'owner_id,question_id' })
    if (error) {
      console.warn('question-put not recorded', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('question-put not recorded', err)
    return false
  }
}

/** Everything the scan already extracted for this creator, for the three story
 *  slots to be CONFIRMED against rather than asked for cold.
 *
 *  ⚠️ RETURNS null, NOT [], WHEN IT CANNOT READ — the same distinction
 *  `loadQuestionsPut` draws, for the same reason. An empty array means "the
 *  scan found nothing, show blank boxes", which is a true and common state; a
 *  failed read means we do not know. Both end in blank boxes here, so the
 *  creator is never worse off, but collapsing them would hide a broken read
 *  behind a legitimate-looking outcome.
 *
 *  ⚖️ READ-ONLY, AND IT WRITES NOTHING. Showing a creator their own sentence is
 *  not the creator saying it. Nothing lands in the store until they confirm. */
/**
 * How many knowledge rows of each kind this creator has, for deficit weighting.
 *
 * ⚠️ EVERY SOURCE, UNLIKE `loadExtractedKnowledge`. That one filters to spoken
 * transcript material because it feeds story SUGGESTIONS, where a caption never
 * attested anything. This counts the STORE, and an answered question fills the
 * store just as truly as an extracted one — filtering by source here would
 * report a creator who has answered five questions as having none, and ask them
 * the same kind forever.
 *
 * ⚠️ NULL MEANS UNREADABLE, NEVER EMPTY. `nextQuestionByDeficit` treats null as
 * "fall back to bank order"; returning `{}` on a failed read would claim every
 * kind is scarce and silently disable the weighting while looking like it works.
 */
export async function loadKnowledgeCounts(): Promise<StoreCounts | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null
    const { data, error } = await supabase
      .from('creator_knowledge')
      .select('kind')
      .eq('owner_id', ownerId)
      .limit(1000)
    if (error) {
      console.warn('knowledge counts not read', error.message)
      return null
    }
    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      const k = String((row as { kind?: unknown }).kind ?? '').trim()
      if (k) counts[k] = (counts[k] ?? 0) + 1
    }
    return counts as StoreCounts
  } catch (err) {
    console.warn('knowledge counts not read', err)
    return null
  }
}

export async function loadExtractedKnowledge(): Promise<StoredKnowledgeItem[] | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null
    const { data, error } = await supabase
      .from('creator_knowledge')
      .select('kind, text, basis, source, source_ref')
      .eq('owner_id', ownerId)
      // ⚠️ SPOKEN MATERIAL ONLY. A caption never attested anything — see
      // `storySuggestions.ts`. Filtering here as well as in the matcher keeps
      // the rows that cannot possibly qualify off the wire.
      .eq('source', 'transcript')
      .eq('basis', 'stated')
      .order('last_observed_at', { ascending: false, nullsFirst: false })
      .limit(200)
    if (error) {
      console.warn('extracted knowledge not read', error.message)
      return null
    }
    return (data ?? []) as StoredKnowledgeItem[]
  } catch (err) {
    console.warn('extracted knowledge not read', err)
    return null
  }
}

/**
 * The rows the PLAN SCREEN needs — THE SAME ROWS THE WRITER WILL SEE.
 *
 * ⚠️ `kind, text, source` — NOT `kind` ALONE. Counts can answer "no story" (no
 * `experience` row) and CANNOT answer "no numbers": `carriesFigure` tests the
 * TEXT. A plan built from counts would state the numbers gap as a guess.
 *
 * ⚠️⚠️ AND IT MIRRORS `generate-blueprint`'s TWO READS EXACTLY, BECAUSE A
 * PANEL THAT READS DIFFERENT ROWS IS PREDICTING RATHER THAN REPORTING. The
 * first draft of this function filtered by `voice_id`, took 500 rows and
 * imposed no ordering. The server does none of those things, so the two would
 * have answered from different data and the third line could have named a gap
 * the writer did not have — the same class as a refusal screen predicting a
 * refund instead of reading `credit_events`.
 *
 * The writer's input is a UNION of two queries (index.ts:4062 and :4079):
 *
 *   owner_id only, ORDER BY times_seen DESC, LIMIT 40
 *   owner_id + source='asked', ORDER BY created_at DESC, LIMIT 20
 *
 * ⚖️ THE SECOND EXISTS BECAUSE THE FIRST CANNOT SEE AN ANSWERED QUESTION.
 * `times_seen` counts how many videos carried a position, so a row the creator
 * STATED once is a 1, and on a caption-derived store forty rows of 2-and-3 sit
 * above it. Dropping that half here would re-open the bug it was added to
 * close, one surface over — and the plan would tell a creator their own answer
 * is not there.
 *
 * ⚠️ NO `voice_id` FILTER, DELIBERATELY, EVEN THOUGH IT LOOKS LIKE AN
 * IMPROVEMENT. The server reads across the owner; narrowing here would hide
 * rows the writer will still use.
 *
 * ⚠️ null IS NOT AN EMPTY STORE. A failed read must not render as "I have
 * nothing from you" — that is a claim about the creator made out of our own
 * outage. The caller shows no plan at all on null.
 */
export async function loadKnowledgeForPlan(): Promise<
  Array<{ kind: string; text: string; source: string | null }> | null
> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null

    const [top, asked] = await Promise.all([
      supabase.from('creator_knowledge')
        .select('kind, text, source')
        .eq('owner_id', ownerId)
        .order('times_seen', { ascending: false })
        .limit(40),
      supabase.from('creator_knowledge')
        .select('kind, text, source')
        .eq('owner_id', ownerId)
        .eq('source', 'asked')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    // ⚖️ EITHER FAILING MEANS WE DO NOT KNOW THE SET. Rendering the half that
    // arrived would show a gap that only exists because a query failed.
    if (top.error || asked.error) {
      console.warn('[plan] knowledge not read', top.error?.message ?? asked.error?.message)
      return null
    }
    const rows = [...(top.data ?? []), ...(asked.data ?? [])].map((r) => ({
      kind: String((r as { kind?: unknown }).kind ?? ''),
      text: String((r as { text?: unknown }).text ?? ''),
      source: ((r as { source?: unknown }).source ?? null) as string | null,
    }))
    // The two queries overlap; the writer sees each row once and so must this.
    const seen = new Set<string>()
    return rows.filter((r) => {
      const k = `${r.kind}\u0000${r.text}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  } catch (e) {
    console.warn('[plan] knowledge read threw', e)
    return null
  }
}

// THE LESSON LEARNER — turns her ratings, her test viewers and her hook picks
// into standing lessons the writer reads on every script (0250).
//
// ⚖️ ON TOP OF THE SYSTEM, NEVER IN ITS WAY: runs inside the brain sweep, small
// batches, every failure logged and swallowed. A rating whose note cannot be
// read this time is retried next sweep (lessons_at stays null).

import { db } from '../db.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import {
  RATING_LESSON_SCHEMA, RATING_LESSON_SYSTEM, cleanRatingLessons, lessonFromHookPick, lessonsFromAudience,
  lessonsFromTags, sameLesson, type CreatorLesson,
} from '../generated/creatorLessons.js'
import { lessonFromAnglePick } from '../generated/ideaQuestions.js'
import {
  CORRECTION_SCHEMA, CORRECTION_SYSTEM, cleanCorrections, correctionLessonText, factsRejected, rejectedTerms,
} from '../generated/corrections.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void

// Her existing lessons, per owner for this pass, so a lesson that says the same
// thing as one she already has strengthens it instead of adding a near-copy.
const known = new Map<string, string[]>()
async function existing(owner: string): Promise<string[]> {
  if (!known.has(owner)) {
    const { data } = await db.from('creator_lessons').select('text').eq('owner_id', owner).limit(200)
    known.set(owner, (data ?? []).map((r: { text: string }) => r.text))
  }
  return known.get(owner)!
}

async function file(owner: string, l: CreatorLesson, sourceId: string): Promise<boolean> {
  const have = await existing(owner)
  // Hook lessons dedupe on exact text only (audit B4): near-identical hooks are different shapes.
  const twin = l.kind === 'hook' ? have.find((t) => t === l.text) : have.find((t) => sameLesson(t, l.text))
  const text = twin ?? l.text
  if (!twin) have.push(l.text)
  // ⚠️ OWNER 2026-10-01: SHE CORRECTED THIS ONCE ALREADY. A rating that carries
  // a lesson she already had — active before the rated script was written —
  // means the writer had the rule and broke it. That is an alarm, not a count:
  // recorded (lesson_misses), shown in red on the lesson, logged as an incident.
  if (twin && (l.source === 'rating' || l.source === 'rating_tag')) {
    const { data: missed } = await db.rpc('record_lesson_miss', { p_owner: owner, p_text: twin, p_generation: sourceId, p_source: l.source })
    if (missed === true) console.error(JSON.stringify({ event: 'lesson_not_applied', owner, generation: sourceId, lesson: twin.slice(0, 120) }))
  }
  const { error } = await db.rpc('learn_lesson', {
    p_owner: owner, p_kind: l.kind, p_text: text, p_phrase: l.phrase, p_source: l.source,
    p_source_id: sourceId, p_weight: l.weight,
  })
  return !error
}

export async function runLessonLearner(log: Log): Promise<void> {
  let filed = 0
  known.clear()

  // 1. Ratings: tags (deterministic) + her note (read by the model). A rating
  // she edits later is read again: a trigger clears lessons_at (0250).
  const { data: ratings } = await db.from('script_ratings')
    .select('generation_id, owner_id, stars, tags, change_note')
    .is('lessons_at', null)
    .order('updated_at', { ascending: true }).limit(10)
  // ⚠️ AUDIT 2026-10-01 (B4): a rating is marked learned only when every
  // lesson from it was saved (a failed save used to be stamped and lost), and
  // a note the model cannot read no longer blocks the queue forever: its tag
  // lessons are kept and the rating is marked so the next ten can be read.
  for (const r of ratings ?? []) {
    const lessons = lessonsFromTags(Array.isArray(r.tags) ? r.tags : [])
    const note = String(r.change_note ?? '').trim()
    if (note.length >= 12) {
      try {
        const raw = await geminiJson(RATING_LESSON_SYSTEM, `Stars: ${r.stars}/5\nHer note: ${note}`, RATING_LESSON_SCHEMA, 45_000, 0, modelForTask('read'))
        lessons.push(...cleanRatingLessons(raw, note))
      } catch (err) {
        log('warn', 'lessons_rating_failed', { event: 'lessons_rating_failed', error: err instanceof Error ? err.message : String(err) })
      }
    }
    let allSaved = true
    for (const l of lessons) { if (await file(r.owner_id, l, r.generation_id)) filed++; else allSaved = false }
    if (allSaved) await db.from('script_ratings').update({ lessons_at: new Date().toISOString() }).eq('generation_id', r.generation_id)
  }

  // 2. Her test viewers: the hook that stopped most, and gaps they keep flagging.
  const { data: tests } = await db.from('audience_tests')
    .select('generation_id, owner_id, hooks, fixes, panel_size, working, needs_her')
    .eq('status', 'done').is('lessons_at', null).limit(20)
  for (const t of tests ?? []) {
    let allSaved = true
    for (const l of lessonsFromAudience(t)) { if (await file(t.owner_id, l, t.generation_id)) filed++; else allSaved = false }
    if (allSaved) await db.from('audience_tests').update({ lessons_at: new Date().toISOString() }).eq('generation_id', t.generation_id)
  }

  // 3. Her own hook pick over Twin's default, once per script.
  const { data: picks } = await db.from('generations')
    .select('id, user_id, selected_hook, blueprint')
    .eq('hook_choice->>source', 'creator').is('hook_lesson_at', null)
    .order('created_at', { ascending: false }).limit(20)
  for (const g of picks ?? []) {
    await db.from('generations').update({ hook_lesson_at: new Date().toISOString() }).eq('id', g.id)
    const opts = (g.blueprint as { hook_options?: unknown } | null)?.hook_options
    const first = Array.isArray(opts) && typeof opts[0] === 'string' ? opts[0] : null
    const l = lessonFromHookPick(String(g.selected_hook ?? ''), first)
    if (l && await file(g.user_id, l, g.id)) filed++
  }

  // 4. The angle she picked on the card over the one Twin put first (owner
  // brief 2026-10-01) — the hook-pick mechanism, one level up.
  const { data: angles } = await db.from('generations')
    .select('id, user_id, blueprint')
    .not('blueprint->angle_choice', 'is', null).is('angle_lesson_at', null)
    .order('created_at', { ascending: false }).limit(20)
  for (const g of angles ?? []) {
    await db.from('generations').update({ angle_lesson_at: new Date().toISOString() }).eq('id', g.id)
    const l = lessonFromAnglePick((g.blueprint as { angle_choice?: unknown } | null)?.angle_choice)
    if (l && await file(g.user_id, l as CreatorLesson, g.id)) filed++
  }

  if (filed) log('info', 'lessons_learned', { event: 'lessons_learned', filed })
}

// ⚠️ HER CORRECTIONS REACH STORAGE (script batch audit 2026-10-03, parts 3 and
// 11). "The two-pound batches and cup-score claims I've excluded multiple times
// now" became an avoid lesson while the facts saying it stayed live — and the
// writer was handed them as usable, which outweighed the advice (67 scripts).
// Each note is now read for what she REJECTS, in her words; each term is filed
// as an avoid lesson whose phrase is the term (enforced on the finished script
// by the edge function), and every stored fact that says it is excluded with
// the same flag her "leave this out" tap sets — so she can switch it back on.
// corrections_at (0273) starts null on every past rating: this pass IS the
// backfill. Every failure is logged and swallowed; a rating whose note cannot
// be read is retried next sweep.
export async function runCorrectionApplier(log: Log): Promise<void> {
  const { data: ratings, error } = await db.from('script_ratings')
    .select('generation_id, owner_id, change_note')
    .is('corrections_at', null)
    .order('updated_at', { ascending: true }).limit(10)
  if (error) { log('warn', 'corrections_read_failed', { event: 'corrections_read_failed', error: error.message }); return }
  const owners = new Set<string>()
  for (const r of ratings ?? []) {
    const note = String(r.change_note ?? '').trim()
    let ok = true
    if (note.length >= 6) {
      try {
        const raw = await geminiJson(CORRECTION_SYSTEM, `Her note: ${note}`, CORRECTION_SCHEMA, 45_000, 0, modelForTask('read'))
        for (const term of cleanCorrections(raw, note)) {
          const { error: e } = await db.rpc('learn_lesson', {
            p_owner: r.owner_id, p_kind: 'avoid', p_text: correctionLessonText(term), p_phrase: term, p_source: 'rating',
            p_source_id: r.generation_id, p_weight: 2,
          })
          if (e) ok = false
        }
      } catch (err) {
        ok = false
        log('warn', 'corrections_read_note_failed', { event: 'corrections_read_note_failed', error: err instanceof Error ? err.message : String(err) })
      }
    }
    owners.add(r.owner_id)
    if (ok) await db.from('script_ratings').update({ corrections_at: new Date().toISOString() }).eq('generation_id', r.generation_id)
  }
  // Every active avoid phrase she has (old lessons included) is applied to her store.
  let excluded = 0
  for (const owner of owners) {
    const { data: lessons } = await db.from('creator_lessons').select('kind, phrase, active')
      .eq('owner_id', owner).eq('kind', 'avoid').eq('active', true).not('phrase', 'is', null).limit(200)
    const terms = rejectedTerms(lessons ?? [])
    if (!terms.length) continue
    const { data: facts } = await db.from('creator_knowledge').select('id, text, evidence, creator_excluded_at')
      .eq('owner_id', owner).is('creator_excluded_at', null).limit(1000)
    const hits = factsRejected(facts ?? [], terms)
    if (!hits.length) continue
    const { error: e } = await db.from('creator_knowledge').update({ creator_excluded_at: new Date().toISOString() })
      .eq('owner_id', owner).in('id', hits.map((h) => h.id)).is('creator_excluded_at', null)
    if (e) { log('warn', 'corrections_exclude_failed', { event: 'corrections_exclude_failed', error: e.message }); continue }
    excluded += hits.length
    console.log(JSON.stringify({ event: 'correction_excluded_facts', owner, facts: hits.length, terms: [...new Set(hits.map((h) => h.term))].slice(0, 10) }))
  }
  if (excluded) log('info', 'corrections_applied', { event: 'corrections_applied', excluded })
}

// THE SPINE CONTRACT (A6, trial only): spine beats, the objection move, and
// the title-inherits-the-hook check.
//
// Pure: no I/O, no model call. Builds on `planSpine` (spinePlanner.ts).
//
// ⚖️ NOTHING IS INVENTED. "Creator's truth" comes only from her own material
// (her story, her fact, her answer); without it the beat becomes a Need Check
// question. The objection move is used only when her material holds a
// hesitation/objection item; otherwise it is skipped.
//
// ⚖️ RECORDS HOLD IDS, FLAGS AND REASONS ONLY, NEVER TEXT.
// ⚖️ TRIAL ONLY. Real creators never reach this module.

import { contentWords, isNonAnswerText, type LedgerItem, type GateQuestion, type ItemOrigin } from '../inventionGate.js'
import { mergeQuestions, type SpinePlan } from './spinePlanner.js'

export const SPINE_CONTRACT_VERSION = 'spine-contract-v1'

export type SpineBeatRole = 'hook' | 'reality_check' | 'creator_truth' | 'objection' | 'cta'
export interface SpineBeat { role: SpineBeatRole; item_ids: string[]; purpose: string }
export interface SpineBeats {
  beats: SpineBeat[]
  /** Need Check questions this contract adds (creator's truth with no material). */
  questions: GateQuestion[]
  objection_used: boolean
  objection_item_id: string | null
  creator_truth_missing: boolean
  /** Trial (spine fill): where the reality-check item came from, when it has one. */
  reality_source?: 'belief' | 'outside' | 'her_fact' | null
}

const HER_OWN = new Set<ItemOrigin>(['her_story', 'her_fact', 'her_answer'])
const OBJECTION_FIELD_RE = /hesitat|objection|worr|concern|doubt|hold(?:s|ing)?_?back|barrier/
const BELIEF_FIELD_RE = /belief|myth|misconception|mistake|currently|status_quo|pain|problem/

export const CREATOR_TRUTH_QUESTION: GateQuestion = {
  scope: 'script', kind: 'detail',
  text: 'What is your own take or experience on this, in your own words?',
  writes_to: 'plan.creator_truth',
}

const PURPOSE: Record<SpineBeatRole, string> = {
  hook: 'open on the spine',
  reality_check: 'what the viewer currently believes or does',
  creator_truth: 'her own stance or experience, only from her material',
  objection: "name the viewer's main hesitation and answer it from her material",
  cta: 'the one real place',
}

const sharedCount = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n }

const inScope = (it: LedgerItem, target: string | null) => !it.product_id || it.origin === 'offer' || it.product_id === target
const usableText = (it: LedgerItem) => !!it.text.trim() && !isNonAnswerText(it.text)

/** A hesitation/objection item: her answer, her fact or a confirmed product field named for it. */
export function isObjectionItem(it: LedgerItem): boolean {
  if (!it.first_party || !usableText(it)) return false
  if (!HER_OWN.has(it.origin) && it.origin !== 'product_fact') return false
  const key = `${it.field ?? ''} ${it.id}`.toLowerCase()
  return OBJECTION_FIELD_RE.test(key)
}

export interface SpineBeatsInput {
  plan: SpinePlan
  ledger: readonly LedgerItem[]
  targetProductId?: string | null
  existingQuestions?: ReadonlyArray<{ text?: unknown; writes_to?: unknown }>
  /** Trial (Twin plan v5.1 item H, behind SPINE_FILL_KILL on the edge): the
   *  reality check may take a sourced outside fact or her own fact, and the
   *  objection move may take a real audience question that voices a doubt. */
  fill?: boolean
}

/** A real audience question that voices a doubt or hesitation ("is it worth it",
 *  "does it really work", "what if…", "too expensive"). Text of a real question only. */
export const OBJECTION_TEXT_RE = /\b(?:worth (?:it|the)|really (?:work|help|need)|does (?:it|this|that) (?:really |actually )?work|is (?:it|this|that) (?:safe|worth|legit|necessary|enough)|too (?:expensive|much|hard|long|complicated|late|old)|what if|scared|afraid|worried|worry|not sure|can'?t afford|waste of|skeptic\w*|doubt\w*|hesitat\w*|won'?t (?:it|this)|isn'?t (?:it|that) (?:just|too))\b/i

/** A real audience question (outside, never hers) that reads as an objection. */
export function isAudienceObjection(it: LedgerItem): boolean {
  return it.origin === 'audience_question' && usableText(it) && OBJECTION_TEXT_RE.test(it.text)
}

/** Hook → Reality check → Creator's truth → (Objection) → CTA, from planned material only. */
export function planSpineBeats(input: SpineBeatsInput): SpineBeats {
  const { plan, ledger } = input
  const target = input.targetProductId ?? null
  const spineIds = plan.spine?.item_ids ?? []
  const spineWords = contentWords(plan.spine?.claim ?? '')
  const dropped = new Set(plan.dropped.map((d) => d.item_id))
  const planned = new Set(plan.beats.flatMap((b) => b.item_ids))
  const pool = ledger.filter((it) => it.id !== 'note' && inScope(it, target) && usableText(it) && !dropped.has(it.id))
  const rel = (it: LedgerItem) => sharedCount(contentWords(it.text), spineWords) + (planned.has(it.id) ? 1 : 0)
  const best = (xs: LedgerItem[]) => [...xs].sort((a, b) => rel(b) - rel(a))[0] ?? null

  // Objection first, so its item is not reused as the creator's truth.
  const objection = best(pool.filter(isObjectionItem)) ?? (input.fill ? best(pool.filter((it) => isAudienceObjection(it) && rel(it) > 0)) : null)
  const used = new Set<string>(objection ? [objection.id] : [])

  // Creator's truth: only her own material (never outside, never a product fact).
  const truthPool = pool.filter((it) => HER_OWN.has(it.origin) && it.first_party && !used.has(it.id))
  const truth = best(truthPool.filter((it) => rel(it) > 0)) ?? (spineIds.some((id) => truthPool.some((t) => t.id === id)) ? truthPool.find((t) => spineIds.includes(t.id))! : null)
  if (truth) used.add(truth.id)

  // Reality check: a belief/pain item when there is one, else the hook frames it (no new material).
  let belief = best(pool.filter((it) => !used.has(it.id) && it.origin !== 'offer' && BELIEF_FIELD_RE.test(`${it.field ?? ''}`.toLowerCase())))
  let realitySource: SpineBeats['reality_source'] = belief ? 'belief' : null
  // Trial fill: a sourced outside fact on the spine's topic, else her own fact.
  // Only items on file, only when they share the spine's words; never a stand-in.
  if (!belief && input.fill) {
    const outside = best(pool.filter((it) => !used.has(it.id) && it.origin === 'outside_research' && rel(it) > 0))
    const herFact = outside ? null : best(pool.filter((it) => !used.has(it.id) && it.origin === 'her_fact' && it.first_party && rel(it) > 0))
    belief = outside ?? herFact
    realitySource = outside ? 'outside' : herFact ? 'her_fact' : null
  }
  const offer = pool.find((it) => it.origin === 'offer') ?? null

  const beats: SpineBeat[] = [
    { role: 'hook', item_ids: [...spineIds], purpose: PURPOSE.hook },
    { role: 'reality_check', item_ids: belief ? [belief.id] : [], purpose: PURPOSE.reality_check },
    { role: 'creator_truth', item_ids: truth ? [truth.id] : [], purpose: PURPOSE.creator_truth },
    ...(objection ? [{ role: 'objection' as const, item_ids: [objection.id], purpose: PURPOSE.objection }] : []),
    { role: 'cta', item_ids: offer ? [offer.id] : [], purpose: PURPOSE.cta },
  ]
  const need = truth ? [] : [CREATOR_TRUTH_QUESTION]
  const existing = [...(input.existingQuestions ?? []), ...plan.questions].map((q) => ({ text: q.text, writes_to: q.writes_to }))
  const merged = mergeQuestions<{ text?: unknown; writes_to?: unknown }>(existing, need)
  const questions = need.filter((q) => merged.includes(q))
  return { beats, questions, objection_used: !!objection, objection_item_id: objection?.id ?? null, creator_truth_missing: !truth, ...(input.fill ? { reality_source: realitySource } : {}) }
}

/** How a beat with NO material is briefed: as a question to the viewer, or dropped.
 *  ⚠️ panel-current-5: a bare "reality_check: what the viewer currently believes"
 *  with no item invited "Most people …" claims the gate then blocked, and a bare
 *  "cta: the one real place" with no offer left most scripts with no ask. */
const NO_MATERIAL_BRIEF: Partial<Record<SpineBeatRole, string>> = {
  reality_check: 'nothing on file about what viewers believe: ask it as a question to the viewer ("Do you …?", "Have you ever …?"), never state what people or most people do',
  cta: 'no offer on file: close by asking the viewer to save, share or answer one question in the comments',
}

/** Trial (spine fill): an item-backed beat is one spoken line that restates its
 *  item, keeping the item's key words, so it is present and checkable. */
const ITEM_BRIEF: Partial<Record<SpineBeatRole, string>> = {
  reality_check: 'one line that states this item to the viewer, keeping its key words; add nothing it does not say',
  creator_truth: 'one line in her words that keeps this item\'s key words; add nothing it does not say',
  objection: 'name this real audience doubt, then answer it only from her material',
  cta: 'exactly one ask in the script, in the last line',
}

/** The writer's brief for the spine beats: roles, ids and purposes only. A beat
 *  with no material becomes a question (reality check, CTA) or is left out
 *  (creator's truth); it is never a stand-in. */
export function renderSpineBeatsBlock(sb: SpineBeats): string {
  const shown = sb.beats.filter((b) => b.item_ids.length || b.role === 'hook' || NO_MATERIAL_BRIEF[b.role])
  const lines = shown.map((b, i) => `${i + 1}. ${b.role}${b.item_ids.length ? ` [${b.item_ids.join(', ')}]: ${b.purpose}${sb.reality_source !== undefined && ITEM_BRIEF[b.role] ? ` (${ITEM_BRIEF[b.role]})` : ''}` : b.role === 'hook' ? `: ${b.purpose}` : `: ${NO_MATERIAL_BRIEF[b.role]}`}`)
  return [
    'SPINE BEATS (in this order, every script carries them):',
    ...lines,
    sb.creator_truth_missing ? "No creator's truth on file: do not write her stance, habit or experience (no \"I always\", \"I use\", \"my team\"); she is asked for it separately." : '',
    sb.objection_used ? '' : 'No objection move: do not name or answer a hesitation.',
  ].filter(Boolean).join('\n')
}

// ── PER-BEAT ADHERENCE ─────────────────────────────────────────────────────

// ⚠️ panel-current-5: the CTA detector missed "the link is in my bio", "tell me in
// the comments", "tell me below", "send this to someone" and "drop your … below"
// (\bcomment\b does not match "comments"), so real asks read as missing.
const CTA_RE = /\b(?:link (?:is )?in (?:my |the )?bio|links? below|follow|save this|comments?|share|send this|subscribe|dm me|shop|buy|order|use (?:my )?code|sign up|book|tap|click|grab (?:one|yours|it|your)|get (?:yours|your)|tell me|let me know|drop (?:a|your|it)\b[^.!?]{0,30}\bbelow|head to)\b/i
// The reality check is the viewer's current belief or habit, framed AT the viewer.
// "Most people …" / "everyone says …" no longer count: they are the universal
// claims the invention gate blocks, so the detector rewarded the invented form.
const REALITY_RE = /\b(?:you(?:'re| are)? (?:probably|still|always|usually)|you (?:think|believe|assume|were told|might think|may think)|you'?ve (?:probably )?(?:heard|been told)|(?:have|do|did|are) you (?:ever )?(?:noticed|wondered|tried|think|believe|feel|assume))\b|^(?:if you(?:'ve| have)? ever|ever (?:wonder|notice|turn|try))\b/i

export interface SpineBeatAdherence { role: SpineBeatRole; met: boolean; reason: 'cited' | 'pattern' | 'no_material' | 'missing' }

const cites = (line: string, ids: readonly string[], byId: Map<string, LedgerItem>) => {
  const w = contentWords(line)
  return ids.some((id) => { const it = byId.get(id); if (!it) return false; const iw = contentWords(it.text); const n = sharedCount(w, iw); return n >= 2 || (n >= 1 && iw.size <= 2) })
}

/** For each spine beat: is it present in the finished script? Ids, flags and reasons only. */
export function checkSpineBeatAdherence(script: ReadonlyArray<{ line?: unknown }>, sb: SpineBeats, ledger: readonly LedgerItem[], spineClaim = ''): SpineBeatAdherence[] {
  const lines = script.map((b) => String(b?.line ?? '').trim()).filter(Boolean)
  const byId = new Map(ledger.map((it) => [it.id, it]))
  const claimWords = contentWords(spineClaim)
  return sb.beats.map((b): SpineBeatAdherence => {
    switch (b.role) {
      case 'hook': {
        if (!lines.length) return { role: b.role, met: false, reason: 'missing' }
        const ok = cites(lines[0]!, b.item_ids, byId) || sharedCount(contentWords(lines[0]!), claimWords) >= 1
        return { role: b.role, met: ok, reason: ok ? 'cited' : 'missing' }
      }
      case 'reality_check': {
        if (lines.some((l) => cites(l, b.item_ids, byId))) return { role: b.role, met: true, reason: 'cited' }
        if (lines.some((l) => REALITY_RE.test(l))) return { role: b.role, met: true, reason: 'pattern' }
        return { role: b.role, met: false, reason: 'missing' }
      }
      case 'creator_truth': case 'objection': {
        if (!b.item_ids.length) return { role: b.role, met: false, reason: 'no_material' }
        const ok = lines.some((l) => cites(l, b.item_ids, byId))
        return { role: b.role, met: ok, reason: ok ? 'cited' : 'missing' }
      }
      case 'cta': {
        const tail = lines.slice(-2)
        if (tail.some((l) => cites(l, b.item_ids, byId))) return { role: b.role, met: true, reason: 'cited' }
        if (tail.some((l) => CTA_RE.test(l))) return { role: b.role, met: true, reason: 'pattern' }
        return { role: b.role, met: false, reason: 'missing' }
      }
    }
  })
}

export interface SpineBeatsRecord {
  version: string
  roles: SpineBeatRole[]
  objection_used: boolean
  objection_item_id: string | null
  creator_truth_missing: boolean
  adherence?: SpineBeatAdherence[]
}

export function spineBeatsRecord(sb: SpineBeats, adherence?: SpineBeatAdherence[]): SpineBeatsRecord {
  return {
    version: SPINE_CONTRACT_VERSION, roles: sb.beats.map((b) => b.role),
    objection_used: sb.objection_used, objection_item_id: sb.objection_item_id,
    creator_truth_missing: sb.creator_truth_missing, ...(adherence ? { adherence } : {}),
  }
}

// ── TITLE INHERITS THE HOOK (promise contract) ─────────────────────────────

export type TitlePromiseReason = 'no_hook' | 'no_title' | 'no_shared_key_words' | 'new_number' | 'new_claim_word' | 'too_many_new_words'
export interface TitlePromiseCheck { match: boolean; reasons: TitlePromiseReason[]; shared: number; new_words: number }

/** Words that make a claim of their own; a title may carry them only when the hook does. */
const CLAIM_WORDS = new Set(['best', 'worst', 'only', 'never', 'always', 'guarantee', 'guaranteed', 'secret', 'proven', 'instantly', 'instant', 'fastest', 'easiest', 'cheapest', 'everyone', 'nobody', 'free', 'forever', 'perfect', 'ultimate'])
const numbersIn = (s: string) => new Set((s.toLowerCase().match(/\d+(?:[.,]\d+)?/g) ?? []))
const rawWords = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean))

/** Deterministic: same key words, no new number, no new claim word, at most a few new words. */
export function checkTitlePromise(title: unknown, hook: unknown): TitlePromiseCheck {
  const t = String(title ?? '').trim()
  const h = String(hook ?? '').trim()
  const reasons: TitlePromiseReason[] = []
  if (!h) reasons.push('no_hook')
  if (!t) reasons.push('no_title')
  if (reasons.length) return { match: false, reasons, shared: 0, new_words: 0 }
  const tw = contentWords(t)
  const hw = contentWords(h)
  const shared = sharedCount(tw, hw)
  const newWords = [...tw].filter((w) => !hw.has(w)).length
  if (shared < Math.min(2, hw.size, tw.size) || shared === 0) reasons.push('no_shared_key_words')
  const hn = numbersIn(h)
  if ([...numbersIn(t)].some((n) => !hn.has(n))) reasons.push('new_number')
  const hr = rawWords(h)
  if ([...rawWords(t)].some((w) => CLAIM_WORDS.has(w) && !hr.has(w))) reasons.push('new_claim_word')
  if (newWords > Math.max(2, Math.floor(tw.size / 2))) reasons.push('too_many_new_words')
  return { match: reasons.length === 0, reasons, shared, new_words: newWords }
}

export const TITLE_MAX_WORDS = 10

/** The deterministic rewrite: the hook's first sentence, trimmed, capped, capitalised. Null when unusable. */
export function titleFromHook(hook: unknown): string | null {
  const first = (String(hook ?? '').trim().match(/^[^.!?]+[.!?]?/)?.[0] ?? '').trim()
  const words = first.replace(/[.!]+$/, '').split(/\s+/).filter(Boolean)
  if (words.length < 2) return null
  const capped = words.slice(0, TITLE_MAX_WORDS).join(' ').replace(/[,;:—-]+$/, '')
  const out = capped.charAt(0).toUpperCase() + capped.slice(1)
  return checkTitlePromise(out, hook).match ? out : null
}

export interface TitlePromiseRecord { match: boolean; reasons: TitlePromiseReason[]; action: 'kept' | 'rewritten' | 'flagged' }

/** Check the first title against the picked hook; rewrite from the hook when it fails, else flag. */
export function enforceTitlePromise(titles: readonly unknown[], hook: unknown): { titles: unknown[]; record: TitlePromiseRecord } {
  const list = [...titles]
  const c = checkTitlePromise(list[0], hook)
  if (c.match) return { titles: list, record: { match: true, reasons: [], action: 'kept' } }
  const rewrite = c.reasons.includes('no_hook') ? null : titleFromHook(hook)
  if (rewrite) {
    list[0] = rewrite
    return { titles: list, record: { match: false, reasons: c.reasons, action: 'rewritten' } }
  }
  return { titles: list, record: { match: false, reasons: c.reasons, action: 'flagged' } }
}

// ── SPINE FILL (trial only; Twin plan v5.1 item H) ─────────────────────────
// After the writer: a reality-check or creator's-truth beat that HAS an item
// but did not reach the script is filled with that item's text, verbatim (her
// own words or the sourced outside fact as filed; nothing is written). Then
// the script keeps exactly one CTA: the last beat that asks. Ids and counts only.

/** A spoken ask (narrower than the adherence CTA_RE: "follow" or "share" inside
 *  an ordinary sentence is not an ask). */
export const CTA_ASK_RE = /\b(?:link (?:is )?in (?:my |our |the )?bio|links? below|(?:tell|let) me (?:in the comments|below|know)|in the comments|comment (?:below|\w+ and)|drop (?:a|your|it)\b[^.!?]{0,30}\bbelow|share it below|save this|send this to|subscribe|follow (?:me|for|along)|dm me|book (?:a|your|now)|order (?:now|today|yours|\w+ through)|shop (?:now|the)|grab (?:one|yours|a)|sign up|use (?:my )?code|tap (?:the|to)|click (?:the|below))\b/i
/** Longest item text the fill speaks verbatim (a line, not a paragraph). */
export const FILL_MAX_WORDS = 30

export interface SpineFillRecord { filled: SpineBeatRole[]; cta_before: number; cta_after: number; cta_sentences_removed: number }
type FillBeat = { line?: unknown; section?: unknown; [k: string]: unknown }

const sentencesOf = (t: string) => (t.match(/[^.!?]+[.!?]*["”')]*/g) ?? []).map((x) => x.trim()).filter(Boolean)
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

/** Fill missing item-backed beats verbatim, then keep exactly one CTA beat. */
export function fillSpineBeats(script: readonly FillBeat[], sb: SpineBeats, ledger: readonly LedgerItem[], spineClaim = ''): { script: FillBeat[]; record: SpineFillRecord } {
  let out: FillBeat[] = script.map((b) => ({ ...b }))
  const byId = new Map(ledger.map((it) => [it.id, it]))
  const filled: SpineBeatRole[] = []
  const adh = checkSpineBeatAdherence(out, sb, ledger, spineClaim)
  for (const role of ['reality_check', 'creator_truth'] as const) {
    const beat = sb.beats.find((b) => b.role === role)
    const a = adh.find((x) => x.role === role)
    if (!beat || !a || a.met || !beat.item_ids.length) continue
    const it = byId.get(beat.item_ids[0]!)
    const text = it?.text.trim() ?? ''
    if (!it || !text || isNonAnswerText(text) || words(text) > FILL_MAX_WORDS) continue
    const line = /[.!?]["”')]*$/.test(text) ? text : `${text}.`
    const section = role === 'reality_check' ? 'Reality Check' : 'Creator Truth'
    // Reality check right after the hook; creator's truth just before the close.
    const at = role === 'reality_check' ? Math.min(1, out.length) : Math.max(0, out.length - 1)
    out.splice(at, 0, { section, line })
    filled.push(role)
  }
  // EXACTLY ONE CTA: asks in any beat before the last asking beat are removed
  // (the sentence only); a beat left empty is dropped.
  const asks = (b: FillBeat) => sentencesOf(String(b.line ?? '')).some((x) => CTA_ASK_RE.test(x))
  const ctaBefore = out.filter(asks).length
  let removed = 0
  let last = -1
  out.forEach((b, i) => { if (asks(b)) last = i })
  if (ctaBefore > 1) {
    out = out.map((b, i) => {
      if (i === last || !asks(b)) return b
      const kept = sentencesOf(String(b.line ?? '')).filter((x) => { const hit = CTA_ASK_RE.test(x); if (hit) removed++; return !hit })
      return { ...b, line: kept.join(' ') }
    }).filter((b) => String(b.line ?? '').trim())
  }
  return { script: out, record: { filled, cta_before: ctaBefore, cta_after: out.filter(asks).length, cta_sentences_removed: removed } }
}

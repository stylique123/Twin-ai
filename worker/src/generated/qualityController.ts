// GENERATED FROM packages/shared/src/script/planner/qualityController.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// ⚖️ THE QUALITY CONTROLLER (QC) — plan v6.8 §33, craft rubric v1.
//
// One component that owns "is this script good?". It runs LAST: after
// generation, the gates, the flags and the polish. Deterministic, no model, no
// I/O. Test and panel accounts only (lever QUALITY_CONTROLLER of the quality
// profile, see qualityProfile.ts); a real creator's script never reaches it.
//
//  1. TARGETS. A word floor per duration profile (Sprint 55-80, Standard
//     90-145, Deep 130-190) and beat budgets (hook 12-20, problem/reality
//     15-30, her proof 30-50, method/product facts 20-40, CTA 8-15).
//  2. STRUCTURE CHECKS. One thread; the hook paid off by line 3; her story
//     after the problem and before the offer; her truth present; one CTA, at
//     the end; no repeated content (a story told as the hook and again
//     verbatim included); no unrelated second story; zero blocking flags.
//     Repeated sentences are REMOVED (the later copy); nothing else is
//     rewritten.
//  3. DETERMINISTIC EXTENSION, only under the floor: her next unused ON-TOPIC
//     items in the order proof -> product fact -> an opinion that fits the
//     niche or angle -> a CTA if none. Her items verbatim. Never an unrelated
//     story, never a second story, never a repeat; stop at the target and
//     never pass 110% of it.
//  4. THIN MATERIAL. When nothing relevant is left the script is NOT padded:
//     ONE question for the missing piece (her story, or a fact of the product)
//     goes on the existing ask flow (blueprint.gate_questions; the answer comes
//     back keyed by `writes_to` and is stored as her fact), or, with nothing to
//     ask, the script ships as an honest Sprint labeled short.
//  5. BEST-OF-N. The free rule-based craft judge compares the script before
//     and after QC; only candidates with ZERO blocking flags are compared; a
//     flagged extension is refused. A Plan B script is never swapped for
//     another candidate.
//  6. A REPORT per script: length vs floor, beats met, what was added, what was
//     refused and why. Ids, kinds and counts only, never text. It rides on the
//     blueprint (blind package metadata, never the answer key) and the replay guard.
//
// Mirrored to the edge and the worker by scripts/ci/generate_shared_pilot_core.mjs.
import { contentWords, dedupeStoryHook, nearDuplicate, relevantRefillUnits, storiesToldV2, refillRelevance, type LedgerItem, type RefillContext } from './inventionGate.js'
import { blockingFlags, scoreCraft, repeatedSentence, type BestOfNFlagCtx } from './craftJudge.js'
import { isCtaLine, isProblemLine, isHerTruth } from './spineComplete.js'
import { BEAT_WORD_BUDGETS, type BeatId } from './beatBudgets.js'
import { runStructureChecks, hookPaysOff, type CheckResult } from './structureChecks.js'

export const QC_VERSION = 'qc-v1'

export type QcProfile = 'sprint' | 'standard' | 'deep'
/** Word ranges per duration profile; `target` is where extension stops. */
export const QC_TARGETS: Record<QcProfile, { floor: number; max: number; target: number }> = {
  sprint: { floor: 55, max: 80, target: 65 },
  standard: { floor: 90, max: 145, target: 110 },
  deep: { floor: 130, max: 190, target: 160 },
}
/** Never extend past 110% of the target. */
export const QC_CEILING = 1.1

/** The beats and their budgets come from beatBudgets.ts (shared with the beat-based writer). */
export type QcBeat = BeatId
/** The one structure check that blocks (the A2 replays: only hook-pays-off-by-line-3 clearly beats the base rate). Every other check is report-only. */
export const QC_BLOCKING_CHECKS = ['hook_payoff'] as const

/** The thin-material questions (one at most per script). */
export const QC_STORY_KEY = 'qc.story'
export const QC_PRODUCT_KEY = 'qc.product_fact'
export const QC_QUESTIONS = {
  story: { scope: 'script' as const, kind: 'detail' as const, text: 'What happened to you, or to a customer, that shows this? One real moment, in your words.', writes_to: QC_STORY_KEY, key: 'mn:qc:story', piece: 'story' },
  product_fact: { scope: 'script' as const, kind: 'detail' as const, text: 'What is one plain fact about this product a viewer should know (what it is, what is in it, or the price)?', writes_to: QC_PRODUCT_KEY, key: 'mn:qc:product_fact', piece: 'product_slot' },
}
export type QcQuestion = typeof QC_QUESTIONS['story'] | typeof QC_QUESTIONS['product_fact']

/** Her answers to the QC's thin-material question in this request's
 *  readiness_answers, as angle_answer requests (key 'mn:qc:*', piece). The edge
 *  saves each through the EXISTING angle_answer store (answer gate,
 *  answerFactRow, source 'asked'), so the next request's ledger carries it as
 *  her fact and the QC neither asks again nor pads. Blank answers are dropped. */
export function qcAnswersToStore(answers: Record<string, unknown> | null | undefined): Array<{ key: string; piece: string; answer: string; product: boolean }> {
  const out: Array<{ key: string; piece: string; answer: string; product: boolean }> = []
  for (const q of [QC_QUESTIONS.story, QC_QUESTIONS.product_fact]) {
    const a = answers?.[q.writes_to]
    if (typeof a !== 'string' || !a.trim()) continue
    out.push({ key: q.key, piece: q.piece, answer: a.trim().slice(0, 2000), product: q.writes_to === QC_PRODUCT_KEY })
  }
  return out
}

export interface QcLine { section?: unknown; line?: unknown; [k: string]: unknown }

export interface QcInput {
  script: readonly QcLine[]
  /** The request's invention ledger (her items, product facts, offer). */
  ledger: readonly LedgerItem[]
  targetProductId: string | null
  profile: QcProfile
  /** Request topic (her note, the product name) and angle; her niche; the product name. */
  topic?: string
  angle?: string
  niche?: string
  product?: string
  /** Blocking-flag context (targeted flags v2 + wrong product). Absent = not checked. */
  flagCtx?: BestOfNFlagCtx | null
  /** The script is Plan B's: never swapped for another candidate. */
  planB?: boolean
  /** The request's goal (sell / leads / educate ...), for the report-only offer checks. */
  goal?: string
  /** writes_to keys she already answered (never asked twice). */
  answered?: readonly string[]
}

export interface QcBeatReport { words: number; min: number; max: number; status: 'met' | 'under' | 'over' | 'missing' }
export interface QcReport {
  version: string
  profile: QcProfile
  floor: number
  target: number
  ceiling: number
  words_before: number
  words_after: number
  under_floor_before: boolean
  under_floor_after: boolean
  beats: Record<QcBeat, QcBeatReport>
  beats_met: number
  structure: {
    one_thread: boolean
    hook_paid_off: boolean
    story_order: boolean
    truth: boolean
    one_cta_at_end: boolean
    repeats: number
    stray_story: boolean
    blocking_flags: number | null
    /** The shared structure checks (structureChecks.ts), ids and status only. Report-only except QC_BLOCKING_CHECKS. */
    checks: Array<Pick<CheckResult, 'id' | 'status' | 'reason'>>
  }
  /** What QC added: item id, kind, words. */
  added: Array<{ id: string; kind: 'proof' | 'product_fact' | 'opinion' | 'cta'; words: number }>
  /** Repeated sentences removed (the later copy): line index, count. */
  removed_repeats: number
  /** The story-hook dedupe action, when it fired. */
  story_hook: string | null
  /** What QC refused and why: id when an item, reason id always. */
  refused: Array<{ id: string | null; reason: string }>
  /** Thin-material outcome: asked one question, shipped short, or neither. */
  thin: 'asked' | 'short_sprint' | null
  question: string | null
  /** Labeled short: under the floor with nothing relevant left to add. */
  label: 'short' | null
  best_of_n: { compared: boolean; chosen: 'qc' | 'before'; score_before: number; score_after: number; eligible_before: boolean | null; eligible_after: boolean | null }
  plan_b: boolean
}

export interface QcResult { script: QcLine[]; report: QcReport; question: QcQuestion | null; changed: boolean }

const lineText = (b: QcLine | undefined) => (typeof b?.line === 'string' ? b.line.trim() : '')
const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const spokenWords = (s: readonly QcLine[]) => s.reduce((a, b) => a + wc(lineText(b)), 0)
const spoken = (s: readonly QcLine[]) => s.map(lineText).filter(Boolean)
const sentencesOf = (line: string) => line.match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? []
const baseId = (id: string) => id.replace(/#\d+$/, '')
const STORY_LINE = /\b(?:i|my|we|our|a regular|a customer|a client|a buyer)\b[^.?!]*\b(?:was|were|had|came|went|got|lost|found|told|asked|built|started|kept|tried|made|sold|spent|learned|realized|bought|took|said|[a-z]{3,}ed)\b/i
const OFFERISH = /(\$\s?\d|\bper (?:month|week)\b|\bfree trial\b|\btrial\b|\blink in (?:my |the )?bio\b)/i
const isOpinionItem = (it: LedgerItem | undefined, text: string) => it?.field === 'opinion' || /^i think\b/i.test(text.trim())

/** Profile from requested seconds (Sprint <= 40 s, Deep >= 75 s), as the templates do. */
export function qcProfileForSeconds(sec: unknown): QcProfile {
  const s = Number(sec)
  if (!Number.isFinite(s) || s <= 0) return 'standard'
  if (s <= 40) return 'sprint'
  if (s >= 75) return 'deep'
  return 'standard'
}

/** Near-duplicate sentence pairs (the replay guard's measure plus the judge's 0.6 Jaccard). */
export function qcRepeatCount(lines: readonly string[]): number {
  const ss = lines.flatMap(sentencesOf)
  let n = 0
  for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) if (nearDuplicate(ss[i]!, ss[j]!) || repeatedSentence([ss[i]!, ss[j]!])) n++
  return n
}

/** Drop every sentence that repeats an earlier one, leaving ONE telling. A line
 *  that carries her item is never lost: when the later copy is her item and the
 *  earlier one (not the hook) is not, the EARLIER copy goes instead. A line left
 *  empty is dropped. */
export function removeRepeats(script: readonly QcLine[], herItems: readonly string[] = []): { script: QcLine[]; removed: number } {
  const isHers = (t: string) => herItems.some((h) => nearDuplicate(h, t) || sentencesOf(h).some((x) => nearDuplicate(x, t)))
  const sents = script.map((b) => sentencesOf(lineText(b)))
  const drop = sents.map((ss) => ss.map(() => false))
  const firstSpoken = sents.findIndex((ss) => ss.length > 0)
  const kept: Array<[number, number]> = []
  let removed = 0
  sents.forEach((ss, i) => ss.forEach((t, j) => {
    const k = kept.findIndex(([a, c]) => !drop[a]![c] && (nearDuplicate(sents[a]![c]!, t) || repeatedSentence([sents[a]![c]!, t])))
    if (k < 0) { kept.push([i, j]); return }
    const [a, c] = kept[k]!
    removed++
    if (a !== firstSpoken && isHers(t) && !isHers(sents[a]![c]!)) { drop[a]![c] = true; kept.push([i, j]) }
    else drop[i]![j] = true
  }))
  const out: QcLine[] = []
  script.forEach((b, i) => {
    const ss = sents[i]!
    if (!ss.length) { out.push({ ...b }); return }
    const keep = ss.filter((_, j) => !drop[i]![j])
    if (!keep.length) return
    out.push(keep.length === ss.length ? { ...b } : { ...b, line: keep.join(' ') })
  })
  return { script: out, removed }
}

type Kind = QcBeat
/** The beat each spoken line serves (heuristic; the report's view). */
export function classifyBeats(lines: readonly string[], material: ReadonlyArray<{ id: string; text: string }> = []): Kind[] {
  return lines.map((l, i) => {
    if (i === 0) return 'hook'
    if (isCtaLine(l) && i === lines.length - 1) return 'cta'
    if (isCtaLine(l)) return 'cta'
    if (isProblemLine(l)) return 'problem'
    if (STORY_LINE.test(l) || material.some((m) => nearDuplicate(m.text, l))) return 'proof'
    return 'method'
  })
}

function beatReport(lines: readonly string[], kinds: readonly Kind[]): Record<QcBeat, QcBeatReport> {
  const out = {} as Record<QcBeat, QcBeatReport>
  for (const k of Object.keys(BEAT_WORD_BUDGETS) as QcBeat[]) {
    const { min, max } = BEAT_WORD_BUDGETS[k]
    const words = lines.reduce((a, l, i) => a + (kinds[i] === k ? wc(l) : 0), 0)
    out[k] = { words, min, max, status: words === 0 ? 'missing' : words < min ? 'under' : words > max ? 'over' : 'met' }
  }
  return out
}

/** The structure checks (§33 item 2) on spoken lines. */
export function structureChecks(lines: readonly string[], input: Pick<QcInput, 'ledger' | 'topic' | 'angle' | 'flagCtx' | 'goal' | 'product'>): QcReport['structure'] {
  const material = input.ledger.filter((it) => it.first_party && it.origin !== 'offer' && it.id !== 'note').map((it) => ({ id: it.id, text: it.text }))
  const kinds = classifyBeats(lines, material)
  const ctas = lines.map((l, i) => (isCtaLine(l) ? i : -1)).filter((i) => i >= 0)
  const hookW = contentWords(lines[0] ?? '')
  const payoff = lines.slice(1, 3).some((l) => [...contentWords(l)].some((w) => hookW.has(w)))
  const first = (k: Kind) => kinds.indexOf(k)
  const proofAt = first('proof')
  const problemAt = first('problem')
  const offerAt = lines.findIndex((l, i) => i > 0 && (OFFERISH.test(l) || isCtaLine(l)))
  const storyOrder = proofAt < 0 || ((problemAt < 0 || problemAt < proofAt) && (offerAt < 0 || proofAt < offerAt))
  const ctx = { topic: input.topic ?? '', angle: input.angle ?? '' }
  const told = storiesToldV2(lines, input.ledger, `${ctx.topic} ${ctx.angle}`)
  const byId = new Map(input.ledger.map((it) => [it.id, it]))
  const stray = told.length > 1 && told.some((id) => refillRelevance(byId.get(id)?.text ?? '', ctx) === 0)
  // One thread: every non-CTA line after the hook shares a word with the request or another line.
  const req = contentWords(`${ctx.topic} ${ctx.angle}`)
  const cw = lines.map((l) => contentWords(l))
  const linked = lines.every((l, i) => isCtaLine(l) || [...cw[i]!].some((w) => req.has(w) || cw.some((o, j) => j !== i && o.has(w))))
  return {
    one_thread: linked && !stray,
    hook_paid_off: lines.length < 2 || payoff || hookPaysOff(lines).status === 'pass',
    story_order: storyOrder,
    truth: lines.some((l) => !isCtaLine(l) && isHerTruth(l, material)),
    one_cta_at_end: ctas.length === 1 && ctas[0] === lines.length - 1,
    repeats: qcRepeatCount(lines),
    stray_story: stray,
    blocking_flags: input.flagCtx ? blockingFlags([...lines], input.flagCtx).length : null,
    checks: runStructureChecks(lines, {
      goal: input.goal ?? '',
      material: material.map((m) => ({ id: m.id, text: m.text, kind: input.ledger.find((it) => it.id === m.id)?.origin === 'her_story' ? 'story' as const : input.ledger.find((it) => it.id === m.id)?.origin === 'product_fact' ? 'product_fact' as const : 'fact' as const })),
      products: input.product ? [input.product] : [],
      offer: input.ledger.find((it) => it.origin === 'offer')?.text ?? '',
    }).map((c) => ({ id: c.id, status: c.status, reason: c.reason })),
  }
}

/** Run the Quality Controller. Pure: the input script is never mutated. */
export function runQualityController(input: QcInput): QcResult {
  const t = QC_TARGETS[input.profile]
  const cap = Math.floor(t.target * QC_CEILING)
  const before = input.script.map((b) => ({ ...b }))
  const wordsBefore = spokenWords(before)
  const refused: QcReport['refused'] = []
  const added: QcReport['added'] = []
  const ctx: RefillContext = { topic: input.topic ?? '', angle: input.angle ?? '', v2: true, niche: input.niche ?? '', product: input.product ?? '' }

  // (2) Repeats: a story hook restated verbatim, then any repeated sentence.
  const stories = input.ledger.filter((it) => it.origin === 'her_story' && it.first_party && it.text.trim()).map((it) => ({ id: it.id, text: it.text }))
  const sh = dedupeStoryHook(before, stories)
  let script: QcLine[] = sh.script
  const rr = removeRepeats(script, input.ledger.filter((it) => it.first_party && it.id !== 'note').map((it) => it.text))
  script = rr.script
  // The repaired script (repeats removed; nothing added) is the base candidate.
  const repaired = script.map((b) => ({ ...b }))

  // (3) Extension, only under the floor.
  if (spokenWords(script) < t.floor) {
    const lines = spoken(script)
    const picks: Array<{ id: string; text: string; kind: string }> = [...relevantRefillUnits(input.ledger, input.targetProductId, lines, ctx)]
    // A CTA if missing: her offer, verbatim (the refill never takes the offer row).
    const offer = input.ledger.find((it) => it.origin === 'offer' && it.first_party && it.text.trim())
    if (offer && !lines.some((l) => isCtaLine(l)) && !picks.some((p) => p.kind === 'cta')) {
      const o = offer.text.trim().replace(/([^.!?])$/, '$1.')
      picks.push({ id: offer.id, text: o.charAt(0).toUpperCase() + o.slice(1), kind: 'cta' })
    }
    const byId = new Map(input.ledger.map((it) => [it.id, it]))
    const storyTold = storiesToldV2(lines, input.ledger, `${ctx.topic} ${ctx.angle}`).length > 0
    const group = (p: { id: string; text: string; kind: string }): 'proof' | 'product_fact' | 'opinion' | 'cta' => {
      if (p.kind === 'cta') return 'cta'
      if (p.kind === 'product_fact') return 'product_fact'
      return p.kind === 'proof' && isOpinionItem(byId.get(baseId(p.id)), p.text) ? 'opinion' : 'proof'
    }
    const ORDER = { proof: 0, product_fact: 1, opinion: 2, cta: 3 } as const
    const ordered = picks.map((p, n) => ({ p, g: group(p), n })).sort((a, b) => ORDER[a.g] - ORDER[b.g] || a.n - b.n)
    let storyUsed = storyTold
    for (const { p, g } of ordered) {
      const words = spokenWords(script)
      if (words >= t.target) break
      if (p.kind === 'story') {
        if (storyUsed) { refused.push({ id: baseId(p.id), reason: 'second_story' }); continue }
        // Stricter than the refill: a story must share a word with the request itself (topic, angle, product name).
        if (refillRelevance(p.text, { topic: `${ctx.topic} ${ctx.product}`, angle: ctx.angle }) < 2) { refused.push({ id: baseId(p.id), reason: 'unrelated_story' }); continue }
      }
      const cur = spoken(script)
      if (cur.some((l) => nearDuplicate(l, p.text)) || qcRepeatCount([...cur, p.text]) > qcRepeatCount(cur)) { refused.push({ id: baseId(p.id), reason: 'repeat' }); continue }
      if (g === 'cta' && cur.some((l) => isCtaLine(l))) { refused.push({ id: baseId(p.id), reason: 'cta_present' }); continue }
      if (words + wc(p.text) > cap) { refused.push({ id: baseId(p.id), reason: 'over_ceiling' }); continue }
      const beat: QcLine = { section: `qc_${g}`, line: p.text, source_ids: [baseId(p.id)], qc_added: true }
      const idx = script.map((b, i) => (lineText(b) ? i : -1)).filter((i) => i >= 0)
      const ctaAt = idx.filter((i) => isCtaLine(lineText(script[i]))).pop()
      const endAt = ctaAt !== undefined && ctaAt === idx[idx.length - 1] ? ctaAt : script.length
      let at = endAt
      if (g === 'proof') {
        // Her proof after the problem and before the offer.
        const probs = idx.filter((i) => isProblemLine(lineText(script[i])) && !isCtaLine(lineText(script[i])))
        const offer = idx.find((i) => i > (idx[0] ?? 0) && OFFERISH.test(lineText(script[i])))
        const after = probs.length ? probs[probs.length - 1]! + 1 : (idx[0] ?? -1) + 1
        at = Math.min(Math.max(after, 1), offer ?? endAt, endAt)
      }
      if (g === 'cta') at = script.length
      script = [...script.slice(0, at), beat, ...script.slice(at)]
      if (p.kind === 'story') storyUsed = true
      added.push({ id: baseId(p.id), kind: g, words: wc(p.text) })
    }
    if (!picks.length) refused.push({ id: null, reason: 'no_relevant_item' })
  }

  // (5) Best-of-N: the repaired script vs its extension. The extension is refused
  // when it adds a blocking flag; the judge decides only between candidates with
  // ZERO blocking flags. Repeat removal is a repair, never undone by the judge.
  // A Plan B script is only ever compared with its own extension (never swapped).
  const linesBefore = spoken(repaired)
  const linesAfter = spoken(script)
  const sb = linesBefore.length ? scoreCraft(linesBefore).raw : 0
  const sa = linesAfter.length ? scoreCraft(linesAfter).raw : 0
  const fb = input.flagCtx ? blockingFlags(linesBefore, input.flagCtx).length : null
  const fa = input.flagCtx ? blockingFlags(linesAfter, input.flagCtx).length : null
  const eb = fb == null ? true : fb === 0
  const ea = fa == null ? true : fa === 0
  const extended = JSON.stringify(linesBefore) !== JSON.stringify(linesAfter)
  let chosen: 'qc' | 'before' = 'qc'
  if (extended) {
    if (fa != null && fb != null && fa > fb) { chosen = 'before'; refused.push({ id: null, reason: 'qc_flagged' }) }
    else if (hookPaysOff(linesBefore).status === 'pass' && hookPaysOff(linesAfter).status !== 'pass') { chosen = 'before'; refused.push({ id: null, reason: 'hook_payoff_broken' }) }
    else if (ea && eb && sa < sb) { chosen = 'before'; refused.push({ id: null, reason: 'judge_lower' }) }
  }
  if (chosen === 'before') { script = repaired.map((b) => ({ ...b })); added.length = 0 }
  const finalLines = spoken(script)
  const wordsAfter = spokenWords(script)

  // (4) Thin material: never pad. Ask ONE question, or ship a short Sprint.
  let question: QcQuestion | null = null
  let thin: QcReport['thin'] = null
  if (wordsAfter < t.floor) {
    const answered = new Set(input.answered ?? [])
    const hasStory = stories.length > 0
    const targetFacts = input.targetProductId ? input.ledger.filter((it) => it.origin === 'product_fact' && it.first_party && it.product_id === input.targetProductId).length : -1
    if (!hasStory && !answered.has(QC_STORY_KEY)) question = { ...QC_QUESTIONS.story }
    else if (targetFacts === 0 && !answered.has(QC_PRODUCT_KEY)) question = { ...QC_QUESTIONS.product_fact }
    thin = question ? 'asked' : 'short_sprint'
  }
  const material = input.ledger.filter((it) => it.first_party && it.origin !== 'offer' && it.id !== 'note').map((it) => ({ id: it.id, text: it.text }))
  const kinds = classifyBeats(finalLines, material)
  const beats = beatReport(finalLines, kinds)
  const report: QcReport = {
    version: QC_VERSION,
    profile: input.profile,
    floor: t.floor, target: t.target, ceiling: cap,
    words_before: wordsBefore, words_after: wordsAfter,
    under_floor_before: wordsBefore < t.floor, under_floor_after: wordsAfter < t.floor,
    beats, beats_met: Object.values(beats).filter((b) => b.status === 'met').length,
    structure: structureChecks(finalLines, input),
    added: [...added],
    removed_repeats: rr.removed,
    story_hook: sh.record?.action ?? null,
    refused,
    thin,
    question: question?.writes_to ?? null,
    label: wordsAfter < t.floor && !question ? 'short' : null,
    best_of_n: { compared: extended && ea && eb, chosen, score_before: Math.round(sb * 100) / 100, score_after: Math.round((chosen === 'qc' ? sa : sb) * 100) / 100, eligible_before: fb == null ? null : eb, eligible_after: fa == null ? null : ea },
    plan_b: input.planB === true,
  }
  return { script, report, question, changed: JSON.stringify(spoken(before)) !== JSON.stringify(finalLines) }
}

/** The report as a log line: counts and ids only. */
export function qcLogRecord(r: QcReport) {
  return { version: r.version, profile: r.profile, words_before: r.words_before, words_after: r.words_after, floor: r.floor, beats_met: r.beats_met, added: r.added.map((a) => `${a.kind}:${a.id}`), refused: r.refused.map((x) => x.reason), removed_repeats: r.removed_repeats, thin: r.thin, label: r.label, chosen: r.best_of_n.chosen, repeats: r.structure.repeats, blocking_flags: r.structure.blocking_flags }
}

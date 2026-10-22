// GENERATED FROM packages/shared/src/script/planner/spineComplete.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// SPINE COMPLETENESS + ENDING (craft rubric v1, items C and F; trial, test accounts only).
//
// C. SPINE_COMPLETE (edge, DEFAULT OFF: only SPINE_COMPLETE=on turns it on, and
//    only for test/panel accounts under the trial). A deterministic completion
//    step on the shipped script:
//      (a) no problem / reality-check line → place HER on-topic problem or pain
//          item, verbatim, right after the hook (never an invented line);
//      (c) exactly one call to action, at the end: extra CTA lines are dropped
//          (the last one kept), a CTA in the middle moves to the end, and her
//          offer is appended when no CTA is there at all.
//    It never writes a new sentence: every added line is one of her items, word
//    for word, carrying its source id.
// F. POLISH_REORDER (worker async polish, DEFAULT OFF: the edge sets
//    `polish.reorder` only when POLISH_REORDER=on, trial, test accounts). The
//    polish may only REORDER or TRIM her existing lines: her most specific
//    story/fact line moves right before the CTA, the CTA is the last line, and
//    `reorderCheck` refuses anything that adds a line, word, number or name.
//
// Pure, no imports, no I/O. Deno and worker copies are GENERATED
// (scripts/ci/generate_shared_pilot_core.mjs). The same heuristics drive the
// offline measure (scripts/ops/spineCoverage.mjs).

export interface SpineBeat { section?: unknown; line?: unknown; source_ids?: unknown; [k: string]: unknown }
export interface SpineItem { id: string; text: string }

/** Default OFF: only the literal 'on' (or 'true') turns it on, and only for a test account in the trial. */
export function spineCompleteOn(trialOn: boolean, testAccount: boolean, flag: string | undefined | null): boolean {
  const f = String(flag ?? '').trim().toLowerCase()
  return trialOn && testAccount && (f === 'on' || f === 'true')
}
/** Same gate for POLISH_REORDER. */
export const polishReorderOn = spineCompleteOn

// ── HEURISTICS (shared with the offline measure) ───────────────────────────

const CTA = /\b(?:link in (?:my |the )?bio|in my bio|tell me|let me know|comment|comments|save this|send this|share this|subscribe|sign up|book (?:a|your)|order|grab (?:a|your|one)|shop|follow (?:me|for)|dm me|check the link|tap (?:the|to)|get yours|try it free|start (?:your|a) (?:free )?trial|free trial|download|join)\b/i
/** A call-to-action line: asks the viewer to act (link, comment, save, book, order, subscribe …). */
export function isCtaLine(line: string): boolean {
  return CTA.test(String(line ?? ''))
}

const PAIN = /\b(?:problem|mistake|mistakes|wrong|struggl\w*|pain\w*|hurt\w*|sting\w*|flat|stale|fail\w*|broke\w*|collapse\w*|stumbl\w*|tired of|annoy\w*|frustrat\w*|waste\w*|losing|missed|nobody knows|no one knows|tripping over|overwhelm\w*|confus\w*|guessing|myth|ruin\w*|scared|afraid|injur\w*|red by|reacts?|irritat\w*|leaving replies|sitting in drafts|hype)\b/i
const AUDIENCE = /\b(?:you|your|you're|most people|people|nobody|no one|everyone|beginners?|shop owners?|buyers?)\b/i
const NAMED = /\b(?:the (?:problem|mistake|trouble|issue|catch) (?:is|with)|the (?:biggest|most common) (?:mistake|problem)|here is the (?:catch|problem)|stop (?:buying|doing|using|rushing|guessing)|you end up|most people (?:miss|get|think|never))\b/i
const REALITY = /\b(?:a customer|a client|a buyer|a regular|customers? (?:told|emailed|wrote|said)|(?:told|emailed|wrote to) me|testimonial|review(?:ed|s)?|a study|studies|research shows)\b/i
/** A clear problem line (her viewer's pain or mistake, named plainly) or a reality check (a customer/result line). */
export function isProblemLine(line: string): boolean {
  const t = String(line ?? '')
  return NAMED.test(t) || REALITY.test(t) || (PAIN.test(t) && AUDIENCE.test(t))
}

const STOP = new Set('a an the and or but so to of in on at for with from by is are was were be been it its this that these those i me my we our you your she her he his they them their not no do does did have has had just very really then than as if when what which who how about into out up down over after before there here one'.split(' '))
export function contentWordsOf(t: string): Set<string> {
  return new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).map((w) => w.replace(/'s$/, '').replace(/^'+|'+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w)))
}
const norm = (t: string) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Is `line` her truth: a line that traces to one of her items (most content words shared), or her first-person account? */
export function isHerTruth(line: string, material: readonly SpineItem[] = []): boolean {
  const lw = contentWordsOf(line)
  if (!lw.size) return false
  for (const m of material) {
    const mw = contentWordsOf(m.text)
    if (!mw.size) continue
    let hit = 0
    for (const w of lw) if (mw.has(w)) hit++
    if (hit / lw.size >= 0.6 || (hit >= 5 && hit / mw.size >= 0.6)) return true
  }
  return /\b(?:I|we|my|our)\b[^.?!]*\b(?:\w+ed|made|built|started|sold|threw|took|told|found|kept|tried|went|got|had|was|were|lost|missed|dropped|opened|asked|answered|wrote|thought|learned|learnt|spent)\b/.test(String(line ?? ''))
}

const spokenText = (b: SpineBeat) => (typeof b?.line === 'string' ? b.line.trim() : '')

export interface SpineCoverage { problem: boolean; truth: boolean; oneCtaAtEnd: boolean; ctas: number }
/** The three spine rates for one script (spoken lines in order). */
export function spineCoverage(lines: readonly string[], material: readonly SpineItem[] = []): SpineCoverage {
  const ls = lines.map((l) => String(l ?? '').trim()).filter(Boolean)
  const ctaIdx = ls.map((l, i) => (isCtaLine(l) ? i : -1)).filter((i) => i >= 0)
  return {
    problem: ls.some((l) => !isCtaLine(l) && isProblemLine(l)),
    truth: ls.some((l) => !isCtaLine(l) && isHerTruth(l, material)),
    oneCtaAtEnd: ctaIdx.length === 1 && ctaIdx[0] === ls.length - 1,
    ctas: ctaIdx.length,
  }
}

// ── C. COMPLETION ──────────────────────────────────────────────────────────

export interface SpineCompleteRecord { problem_added: string | null; ctas_removed: number; cta_moved: boolean; cta_appended: string | null }
export interface SpineCompleteInput {
  /** Her first-party items (stories, facts, answers). Never the offer. */
  material: readonly SpineItem[]
  /** Her offer (the CTA source), when on file. */
  offer?: SpineItem | null
  /** What the video is about (request note, product name, goal). */
  topic?: string
}

/** Her on-topic problem/pain item not already said, or null. Verbatim only. */
export function pickProblemItem(script: readonly SpineBeat[], input: SpineCompleteInput): SpineItem | null {
  const said = new Set(script.map((b) => norm(spokenText(b))))
  const hook = spokenText(script.find((b) => spokenText(b)) ?? {})
  const topic = contentWordsOf(`${input.topic ?? ''} ${hook}`)
  let best: SpineItem | null = null, bestHit = 0
  for (const m of input.material) {
    const t = String(m.text ?? '').trim()
    if (!t || !isProblemLine(t) || isCtaLine(t) || said.has(norm(t))) continue
    if (script.some((b) => { const s = norm(spokenText(b)); return s && (s.includes(norm(t)) || norm(t).includes(s)) })) continue
    let hit = 0
    for (const w of contentWordsOf(t)) if (topic.has(w)) hit++
    if (hit > bestHit) { best = { id: m.id, text: t }; bestHit = hit }
  }
  return bestHit > 0 ? best : null
}

/** Complete the spine. Returns a new script (input untouched) and what changed. */
export function completeSpine(script: readonly SpineBeat[], input: SpineCompleteInput): { script: SpineBeat[]; record: SpineCompleteRecord } {
  let out = script.map((b) => ({ ...b }))
  const record: SpineCompleteRecord = { problem_added: null, ctas_removed: 0, cta_moved: false, cta_appended: null }
  const spoken = () => out.map((b, i) => (spokenText(b) ? i : -1)).filter((i) => i >= 0)
  // (a) problem / reality check
  const sp = spoken()
  if (sp.length && !sp.some((i) => { const t = spokenText(out[i]!); return !isCtaLine(t) && isProblemLine(t) })) {
    const item = pickProblemItem(out, input)
    if (item) {
      const at = sp[0]! + 1
      out.splice(at, 0, { section: 'problem', line: item.text, source_ids: [item.id], spine_added: true })
      record.problem_added = item.id
    }
  }
  // (c) exactly one CTA, at the end
  const ctas = spoken().filter((i) => isCtaLine(spokenText(out[i]!)))
  if (ctas.length > 1) {
    const keep = ctas[ctas.length - 1]!
    const drop = new Set(ctas.filter((i) => i !== keep))
    out = out.filter((_, i) => !drop.has(i))
    record.ctas_removed = drop.size
  }
  const sp2 = spoken()
  const ctaAt = sp2.find((i) => isCtaLine(spokenText(out[i]!)))
  if (ctaAt !== undefined && ctaAt !== sp2[sp2.length - 1]) {
    const [c] = out.splice(ctaAt, 1)
    out.push(c!)
    record.cta_moved = true
  } else if (ctaAt === undefined && input.offer && String(input.offer.text ?? '').trim()) {
    const t = String(input.offer.text).trim().replace(/([^.!?])$/, '$1.')
    out.push({ section: 'cta', line: t.charAt(0).toUpperCase() + t.slice(1), source_ids: [input.offer.id], spine_added: true })
    record.cta_appended = input.offer.id
  }
  return { script: out, record }
}

// ── F. ENDING: REORDER OR TRIM ONLY ────────────────────────────────────────

const NUMS = /\d+(?:[.,]\d+)*/g
const namesIn = (t: string): string[] => {
  const out: string[] = []
  for (const s of String(t ?? '').split(/(?<=[.!?])\s+/)) for (const w of s.split(/\s+/).slice(1)) { const x = w.replace(/[^A-Za-z'-]/g, ''); if (/^[A-Z][a-z]/.test(x) && x !== 'I' && !/^I'/.test(x)) out.push(x) }
  return out
}

/** How specific a line is: numbers, names, a first-person story beat, concrete length. */
export function specificity(line: string): number {
  const t = String(line ?? '')
  let s = (t.match(NUMS) ?? []).length * 2 + namesIn(t).length
  if (isHerTruth(t)) s += 3
  s += Math.min(3, Math.floor(contentWordsOf(t).size / 4))
  if (/\?\s*$/.test(t)) s -= 2
  return s
}

export interface ReorderRecord { moved_specific: boolean; cta_last: boolean; trimmed: number; specific_index: number | null }

/** Reorder/trim only: the most specific middle line goes right before the CTA, the CTA ends the script, extra CTAs are trimmed. The hook never moves. */
export function reorderEnding(beats: readonly SpineBeat[]): { next: SpineBeat[]; record: ReorderRecord } {
  let out = beats.map((b) => ({ ...b }))
  const record: ReorderRecord = { moved_specific: false, cta_last: false, trimmed: 0, specific_index: null }
  const spoken = () => out.map((b, i) => (spokenText(b) ? i : -1)).filter((i) => i >= 0)
  let ctas = spoken().filter((i, n) => n > 0 && isCtaLine(spokenText(out[i]!)))
  if (ctas.length > 1) {
    const keep = ctas[ctas.length - 1]!
    const drop = new Set(ctas.filter((i) => i !== keep))
    out = out.filter((_, i) => !drop.has(i))
    record.trimmed = drop.size
  }
  ctas = spoken().filter((i, n) => n > 0 && isCtaLine(spokenText(out[i]!)))
  if (!ctas.length) return { next: out, record }
  const [cta] = out.splice(ctas[0]!, 1)
  out.push(cta!)
  record.cta_last = true
  const sp = spoken()
  const middle = sp.slice(1, -1)
  if (middle.length >= 2) {
    let best = middle[0]!, bs = -Infinity
    for (const i of middle) { const s = specificity(spokenText(out[i]!)); if (s > bs) { bs = s; best = i } }
    const before = sp[sp.length - 2]!
    if (best !== before) {
      const [b] = out.splice(best, 1)
      out.splice(out.length - 1, 0, b!)
      record.moved_specific = true
    }
    record.specific_index = out.length - 2
  }
  return { next: out, record }
}

/** The reorder may only move or drop her lines: no new line, word, number or name. */
export function reorderCheck(before: readonly SpineBeat[], after: readonly SpineBeat[]): { ok: boolean; reason: string | null } {
  const pool = new Map<string, number>()
  for (const b of before) { const t = spokenText(b); if (t) pool.set(t, (pool.get(t) ?? 0) + 1) }
  for (const a of after) {
    const t = spokenText(a)
    if (!t) continue
    const n = pool.get(t) ?? 0
    if (n <= 0) return { ok: false, reason: 'new_line' }
    pool.set(t, n - 1)
  }
  const bt = before.map(spokenText).join('\n'), at = after.map(spokenText).join('\n')
  const bn = new Set(bt.match(NUMS) ?? [])
  if ((at.match(NUMS) ?? []).some((n) => !bn.has(n))) return { ok: false, reason: 'new_number' }
  const low = bt.toLowerCase()
  if (namesIn(at).some((n) => !low.includes(n.toLowerCase()))) return { ok: false, reason: 'new_name' }
  const last = after.map(spokenText).filter(Boolean).pop() ?? ''
  if (before.some((b) => isCtaLine(spokenText(b))) && !isCtaLine(last)) return { ok: false, reason: 'cta_not_last' }
  return { ok: true, reason: null }
}

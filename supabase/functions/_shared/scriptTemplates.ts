// GENERATED FROM packages/shared/src/script/templates/scriptTemplates.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// SCRIPT TEMPLATES: SLOT FILLING, CHOICE, AND THE CHECKS (quality sprint, stage 2).
//
// Pure: no I/O, no model call. The edge (trial only) calls `chooseTemplates`
// before the writer, gives the writer `renderTemplateBlock`, then runs
// `finishTemplate` over the generated script and stores `blueprint.template`
// (ids only, never text).
//
// ⚖️ EVERY REPAIR HERE REMOVES, REORDERS OR RE-NUMBERS. Nothing writes a new
// claim: the promise repair adds a beat only from a ledger item's own text,
// the bridge repair only moves a line, the hook repair only drops or reorders
// the writer's own options, and the word budget repair only trims.
//
// ⚠️ THE LIST-COUNT RULE IS THE GATE'S. `listCounts` comes from
// inventionGate.ts (#1245); this module reads the promised count with it and
// does not keep a second regex.

import { listCounts, isNonAnswerText, isScaffoldText, spokenUnits, declinedSlots, MAX_ASKS, type LedgerItem, type GateQuestion, type AskKind } from './inventionGate.ts'
import { HOOK_MOVES } from './scriptFamily.ts'
import {
  SCRIPT_TEMPLATES, DURATION_PROFILES, QUESTION_TEMPLATES,
  type ScriptTemplate, type TemplateSlot, type TemplateBeat, type BeatRole, type DurationProfile,
} from './templateData.ts'
import { hasEventDate } from './writerGuards.ts'

export const SCRIPT_TEMPLATES_VERSION = 'templates-v1'

const OUTSIDE = new Set(['outside_research', 'outside_moment', 'niche_note', 'audience_question'])

// ── SLOT FILLING ───────────────────────────────────────────────────────────

/** The answer key a template question writes to (and the ledger reads back as `answer:<key>`). */
export const slotKey = (templateId: string, slot: string, n?: number) => `template.${templateId}.${slot}${n != null ? `.${n}` : ''}`

/** Can this ledger item fill this slot? Origin, evidence class and product scope. */
export function itemFits(it: LedgerItem, slot: TemplateSlot, targetProductId: string | null): boolean {
  if (!slot.accepts.includes(it.origin)) return false
  if (it.product_id && targetProductId && it.product_id !== targetProductId) return false
  if (it.product_id && !targetProductId && it.origin !== 'offer') return false
  if (isNonAnswerText(it.text)) return false
  if (isScaffoldText(it.text)) return false
  // An answer to ANOTHER template question never fills this slot.
  if (it.origin === 'her_answer' && it.field?.startsWith('template.') && !it.field.includes(`.${slot.name}`)) return false
  switch (slot.evidence) {
    case 'first_party': return it.first_party && !OUTSIDE.has(it.origin)
    case 'sourced': return it.first_party || it.origin === 'outside_research'
    case 'live_urgency': return it.origin === 'urgency' && it.live
    // ⚠️ panel-current-5: a bare year in an event's NAME ("Summit 2026") made T5
    // eligible with no date for the event, and the writer supplied "this week".
    // A dated slot needs a day-level date in the item's own text.
    case 'dated': return (it.origin === 'urgency' ? it.live : it.origin === 'outside_moment' || it.origin === 'outside_research') && hasEventDate(it.text)
    case 'any': return true
  }
}

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i
/** Does the item's own text carry a date (a month name, a d/m numeric date, or a year)? */
export const hasDate = (text: string): boolean =>
  MONTHS.test(text) || /\b\d{1,4}[/.-]\d{1,2}([/.-]\d{1,4})?\b/.test(text) || /\b(19|20)\d{2}\b/.test(text)

/** Evidence that is never asked: a missing one makes the template ineligible (no invented date or scarcity). */
const NEVER_ASKED = new Set(['live_urgency', 'dated'])

export type SlotFill = string | 'asked' | 'skipped' | 'empty'

export interface TemplatePlanSlot {
  key: string
  slot: string
  beat: number
  required: boolean
  item_id: string | null
  fill: SlotFill
}

export interface TemplatePlan {
  template: ScriptTemplate
  slots: TemplatePlanSlot[]
  questions: GateQuestion[]
  eligible: boolean
  /** Why not eligible (no text from her material). */
  reason: 'ok' | 'declined_required' | 'too_many_questions' | 'no_verified_material'
}

/** How many copies of a beat the plan uses (the minimum of its count range). */
const copies = (b: TemplateBeat) => (b.count ? b.count[0] : 1)

/** Fill each slot from the ledger by origin + evidence; ask (Need Check format) for missing required slots. */
export function planTemplate(t: ScriptTemplate, ledger: readonly LedgerItem[], opts: { targetProductId?: string | null; asksSoFar?: number } = {}): TemplatePlan {
  const target = opts.targetProductId ?? null
  const declined = declinedSlots(ledger)
  const used = new Set<string>()
  const slots: TemplatePlanSlot[] = []
  const questions: GateQuestion[] = []
  let reason: TemplatePlan['reason'] = 'ok'
  // Required slots claim items first, so an optional slot never takes the one item a required slot needed.
  const order = t.beats.flatMap((b, bi) => b.slots.map((s) => ({ b, bi, s }))).sort((x, y) => Number(y.s.required) - Number(x.s.required))
  order.forEach(({ b, bi, s }) => {
    {
      const n = copies(b)
      for (let k = 0; k < n; k++) {
        const key = n > 1 ? slotKey(t.id, s.name, k + 1) : slotKey(t.id, s.name)
        // Her direct answer to this exact question first, then by field name, then by order.
        const own = ledger.find((it) => !used.has(it.id) && it.origin === 'her_answer' && it.field === key && itemFits(it, s, target))
        const pool = ledger.filter((it) => !used.has(it.id) && itemFits(it, s, target))
        const hit = own ?? pool.find((it) => it.field === s.name) ?? pool[0]
        if (hit) { used.add(hit.id); slots.push({ key, slot: s.name, beat: bi, required: s.required, item_id: hit.id, fill: hit.id }); continue }
        if (!s.required) { slots.push({ key, slot: s.name, beat: bi, required: false, item_id: null, fill: 'empty' }); continue }
        if (NEVER_ASKED.has(s.evidence)) { slots.push({ key, slot: s.name, beat: bi, required: true, item_id: null, fill: 'skipped' }); if (reason === 'ok') reason = 'no_verified_material'; continue }
        if (declined.has(key)) { slots.push({ key, slot: s.name, beat: bi, required: true, item_id: null, fill: 'skipped' }); reason = 'declined_required'; continue }
        const q = QUESTION_TEMPLATES[s.ask]
        questions.push({ scope: 'script', kind: q.kind as AskKind, text: q.text, writes_to: key })
        slots.push({ key, slot: s.name, beat: bi, required: true, item_id: null, fill: 'asked' })
      }
    }
  })
  slots.sort((a, b) => a.beat - b.beat)
  if (reason === 'ok' && questions.length + (opts.asksSoFar ?? 0) > MAX_ASKS) reason = 'too_many_questions'
  return { template: t, slots, questions, eligible: reason === 'ok', reason }
}

// ── CHOICE ─────────────────────────────────────────────────────────────────

export interface ChooseInput {
  goal?: string | null
  angle?: string | null
  ledger: readonly LedgerItem[]
  targetProductId?: string | null
  asksSoFar?: number
  templates?: readonly ScriptTemplate[]
  /**
   * 'v2' (Twin plan v5.1 item I, trial only, kill switch TEMPLATE_RANK_V2 at
   * the edge): a template whose FIRST angle is the picked one beats one that
   * only lists it second; then a goal match; then a template that holds
   * verified scarce evidence (a dated item, a live urgency) in a required
   * slot; then fewest questions. 'v1' (default) is the original order, under
   * which T5–T10 can never win while T1/T4 are eligible.
   */
  rank?: 'v1' | 'v2'
}

const SCARCE = new Set(['dated', 'live_urgency'])
/** Required slots holding a verified dated / live-urgency item. */
const scarceFilled = (p: TemplatePlan) => p.slots.filter((s) => s.required && s.item_id
  && p.template.beats[s.beat]?.slots.find((x) => x.name === s.slot && SCARCE.has(x.evidence))).length

/** Angle + goal pick 1–3 ELIGIBLE templates, best first (angle match, then fewest questions). */
export function chooseTemplates(i: ChooseInput): TemplatePlan[] {
  const goal = String(i.goal ?? '').trim().toLowerCase()
  const angle = String(i.angle ?? '').trim().toLowerCase()
  const pool = (i.templates ?? SCRIPT_TEMPLATES).filter((t) => t.goals.includes(goal) || (angle && t.angles.includes(angle)))
  return pool
    .map((t) => planTemplate(t, i.ledger, { targetProductId: i.targetProductId ?? null, asksSoFar: i.asksSoFar ?? 0 }))
    .filter((p) => p.eligible)
    .sort((a, b) => {
      const am = angle && a.template.angles.includes(angle) ? 0 : 1
      const bm = angle && b.template.angles.includes(angle) ? 0 : 1
      if (i.rank !== 'v2') return am - bm || a.questions.length - b.questions.length
      const ap = angle && a.template.angles[0] === angle ? 0 : 1
      const bp = angle && b.template.angles[0] === angle ? 0 : 1
      const ag = a.template.goals.includes(goal) ? 0 : 1
      const bg = b.template.goals.includes(goal) ? 0 : 1
      return am - bm || ap - bp || ag - bg || scarceFilled(b) - scarceFilled(a) || a.questions.length - b.questions.length
    })
    .slice(0, 3)
}

/** The profile for this video: from the requested seconds, limited to what the template allows. */
export function pickProfile(t: ScriptTemplate, targetSeconds: unknown, software = false): DurationProfile {
  const sec = Number(targetSeconds)
  const want: DurationProfile = !Number.isFinite(sec) || sec <= 0 ? 'standard' : sec <= (software ? 35 : 40) ? 'sprint' : sec >= 75 ? 'deep' : 'standard'
  if (t.duration_profiles.includes(want)) return want
  return t.duration_profiles.includes('standard') ? 'standard' : t.duration_profiles[0]!
}

// ── WRITER BLOCK ───────────────────────────────────────────────────────────

/** The writer's brief for the chosen template: beats, slots, filled items, hook shapes, budget, bridges. */
export function renderTemplateBlock(plan: TemplatePlan, profile: DurationProfile, ledger: readonly LedgerItem[]): string {
  const t = plan.template
  const byId = new Map(ledger.map((it) => [it.id, it]))
  const budget = DURATION_PROFILES[profile].words
  const lines: string[] = [
    `SCRIPT TEMPLATE: ${t.name.toUpperCase()} (${t.id}). Write one script entry per beat below, in this order, and set each entry's section to its role.`,
    `- Length: about ${budget} spoken words in total. Longer is cut.`,
  ]
  t.beats.forEach((b, bi) => {
    const n = copies(b)
    const filled = plan.slots.filter((s) => s.beat === bi)
    const what = filled.map((s) => {
      // ⚠️ NEVER ASK THE WRITER FOR A BRACKET (panel-current-3, 2026-10-12). The
      // writer's system prompt forbids any bracket in a spoken line; telling it to
      // "write exactly [Your answer: …]" here contradicted that, and briefs with
      // asked slots ran both model attempts to timeout (7 of 24 failed). The
      // question already reaches her as a gate question (`plan.questions`), and
      // the gate places its own placeholder deterministically; the writer only
      // has to leave the slot out.
      if (s.fill === 'asked') return `${s.slot}: not on file yet, leave it out (she is asked for it separately; write no stand-in)`
      if (s.fill === 'empty' || s.fill === 'skipped' || !s.item_id) return `${s.slot}: nothing on file, leave it out`
      const it = byId.get(s.item_id)
      return `${s.slot}: from item ${s.item_id}${it ? ` ("${it.text.slice(0, 200).replace(/"/g, "'")}")` : ''}`
    })
    lines.push(`- ${b.role}${n > 1 ? ` ×${n} (one item per entry, numbered out loud)` : ''}, at most ${b.max_words} words${b.pull ? ', END WITH A PULL to the next beat (a question or a turn line, no new fact)' : ''}. Shown: ${b.show_move_hint}.${what.length ? ` Use only: ${what.join('; ')}.` : ''}`)
  })
  if (t.promise.kind === 'count') lines.push('- The hook promises a count; the numbered beats before any offer deliver exactly that many.')
  lines.push(`- HOOK SHAPES for this template (every hook option is one of these; hook_moves names it): ${t.hook_shapes.map((id) => `${id} (${HOOK_MOVES[id]?.how ?? id})`).join('; ')}.`)
  lines.push('- Never add a fact, number, name, event or result that the items above do not state.')
  return lines.join('\n')
}

// ── THE CHECKS ─────────────────────────────────────────────────────────────

export interface ScriptBeat { line?: unknown; section?: unknown; [k: string]: unknown }

const ROLES: readonly BeatRole[] = ['hook', 'promise', 'build', 'turn', 'anchor', 'offer', 'close']
const lineOf = (b: ScriptBeat | null | undefined) => String(b?.line ?? '').trim()
const sentencesOf = (s: string) => (s.match(/[^.!?]+[.!?]*/g) ?? []).map((x) => x.trim()).filter(Boolean)
const words = (s: string) => s.split(/\s+/).filter(Boolean).length

/** The template beat roles in script order (counted beats expanded to their minimum). */
export function expandedRoles(t: ScriptTemplate): BeatRole[] {
  return t.beats.flatMap((b) => Array.from({ length: copies(b) }, () => b.role))
}

/** Each script beat's role: from its section when it names one, else by position. */
export function rolesOf(script: readonly ScriptBeat[], t: ScriptTemplate): (BeatRole | null)[] {
  const plan = expandedRoles(t)
  return script.map((b, i) => {
    const sec = String(b?.section ?? '').toLowerCase()
    const named = ROLES.find((r) => new RegExp(`\\b${r}`).test(sec))
    if (named) return named
    if (script.length === plan.length) return plan[i] ?? null
    if (i === 0) return 'hook'
    return null
  })
}

const OFFER_RE = /\b(?:link in (?:my )?bio|shop(?:ping)?|buy|order|dm me|use (?:my )?code|grab (?:one|yours|it)|get yours|sign up|book (?:a|your)|on my site|in my store)\b/i

/** Numeric promise vs delivery: build beats before the first offer mention. */
export function checkPromise(script: readonly ScriptBeat[], hook: string, t: ScriptTemplate): { kind: string; promised: number | null; delivered: number; paid: boolean } {
  const roles = rolesOf(script, t)
  let delivered = 0
  for (let i = 0; i < script.length; i++) {
    if (roles[i] === 'offer' || (i > 0 && OFFER_RE.test(lineOf(script[i])))) break
    if (roles[i] === 'build') delivered++
  }
  if (t.promise.kind !== 'count') {
    const at = roles.findIndex((r) => r === t.beats[t.promise.paid_at_beat]?.role)
    return { kind: t.promise.kind, promised: null, delivered, paid: at > 0 && lineOf(script[at]).length > 0 }
  }
  const promised = listCounts(hook)[0] ?? null
  return { kind: 'count', promised, delivered, paid: promised == null || promised === delivered }
}

const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
/** Re-number the hook's count to `n` (a rephrase: the same claim, the count it actually delivers). */
export function renumberHook(hook: string, from: number, n: number): string {
  const re = new RegExp(`\\b(?:${from}|${NUM_WORD[from] ?? '\\u0000'})\\b`, 'i')
  return hook.replace(re, (m) => (/^\d+$/.test(m) ? String(n) : /^[A-Z]/.test(m) ? NUM_WORD[n]![0]!.toUpperCase() + NUM_WORD[n]!.slice(1) : NUM_WORD[n]!))
}

/** Repair the count: trim extra build beats, add only from unused ledger items, else re-number the hook. */
export function repairPromise(script: readonly ScriptBeat[], hookOptions: readonly string[], t: ScriptTemplate, spare: readonly LedgerItem[] = []): { script: ScriptBeat[]; hook_options: string[]; paid: boolean; action: 'none' | 'trimmed' | 'added' | 'renumbered' | 'failed' } {
  let out = script.map((b) => ({ ...b }))
  let hooks = [...hookOptions]
  const hook = lineOf(out[0])
  const c = checkPromise(out, hook, t)
  if (c.paid || c.promised == null) return { script: out, hook_options: hooks, paid: c.paid, action: 'none' }
  const roles = rolesOf(out, t)
  const buildIdx = roles.map((r, i) => (r === 'build' ? i : -1)).filter((i) => i >= 0)
  if (c.delivered > c.promised) {
    const drop = new Set(buildIdx.slice(c.promised))
    out = out.filter((_, i) => !drop.has(i))
    return { script: out, hook_options: hooks, paid: true, action: 'trimmed' }
  }
  const need = c.promised - c.delivered
  if (spare.length >= need && buildIdx.length > 0) {
    const at = buildIdx[buildIdx.length - 1]! + 1
    const added = spare.slice(0, need).map((it) => ({ line: it.text, section: 'build', source_item: it.id }))
    out = [...out.slice(0, at), ...added, ...out.slice(at)]
    return { script: out, hook_options: hooks, paid: true, action: 'added' }
  }
  if (c.delivered >= 2) {
    const fixed = renumberHook(hook, c.promised, c.delivered)
    if (fixed !== hook) {
      out[0] = { ...out[0], line: fixed }
      hooks = hooks.map((h) => (h === hook ? fixed : listCounts(h)[0] === c.promised ? renumberHook(h, c.promised!, c.delivered) : h))
      return { script: out, hook_options: hooks, paid: true, action: 'renumbered' }
    }
  }
  return { script: out, hook_options: hooks, paid: false, action: 'failed' }
}

const PULL_RE = /\?\s*$|(?:^|\s)(?:but|until|so here'?s|here'?s (?:the|what|why|how)|that'?s when|that'?s why|which is why|and then|the catch|wait|watch|next|the (?:first|second|third|next|last) one|number (?:two|three|four|five))\b|[:…]\s*$|\.\.\.\s*$/i

/** Does this sentence pull toward the next beat? */
export const isPull = (sentence: string) => PULL_RE.test(sentence.trim())

/** Every beat whose template beat has `pull: true` must end with a pull (last beat exempt). */
export function checkBridges(script: readonly ScriptBeat[], t: ScriptTemplate): { ok: number; of: number; failing: number[] } {
  const roles = rolesOf(script, t)
  const pullRoles = new Set(t.beats.filter((b) => b.pull).map((b) => b.role))
  const failing: number[] = []
  let of = 0
  for (let i = 0; i < script.length - 1; i++) {
    const r = roles[i]
    if (!r || !pullRoles.has(r)) continue
    of++
    const last = sentencesOf(lineOf(script[i])).pop() ?? ''
    if (!isPull(last)) failing.push(i)
  }
  return { ok: of - failing.length, of, failing }
}

/** Bridge repair, rephrase-only: a short pull sentence that opens the NEXT beat moves to the end of this one. */
export function repairBridges(script: readonly ScriptBeat[], t: ScriptTemplate): ScriptBeat[] {
  const out = script.map((b) => ({ ...b }))
  for (const i of checkBridges(out, t).failing) {
    const next = sentencesOf(lineOf(out[i + 1]))
    if (next.length < 2) continue
    const first = next[0]!
    if (!isPull(first) || words(first) > 12) continue
    out[i] = { ...out[i], line: `${lineOf(out[i])} ${first}` }
    out[i + 1] = { ...out[i + 1], line: next.slice(1).join(' ') }
  }
  return out
}

// ── HOOK SHAPES ────────────────────────────────────────────────────────────

/** Cheap rule per HOOK_MOVES id: does the hook text have this shape? */
export const HOOK_SHAPE_RULES: Record<string, (h: string) => boolean> = {
  counted_list: (h) => listCounts(h).length > 0,
  contrarian_order: (h) => /^(?:stop|don'?t|do not|never|quit|forget|you don'?t|you do not|most people|everyone)\b/i.test(h) || /\binstead\b|\bwrong\b/i.test(h),
  insider_credential: (h) => /\b(?:nobody tells|no one tells|won'?t tell|will never tell|as an? \w+|from my|after \d+|years of|i'?ve (?:made|done|tested|tried|sold|taught))\b/i.test(h),
  question_answered: (h) => /\?\s*$/.test(h) || /^(?:how|why|what|which|when|is|are|do|does|can|should)\b/i.test(h),
  confession: (h) => /^(?:i|i'?m|i'?ve|i was|my|at \d+|when i|the day i|last (?:year|week|month))\b/i.test(h),
  cold_open: (h) => /^["'“‘]/.test(h) || /^(?:so|okay|ok|hey|wait|look|right now)\b/i.test(h),
  stakes_number: (h) => /^(?:day \d+|\$?\d)/i.test(h),
  buyer_callout: (h) => /^(?:if you|if your|you'?re|for anyone|anyone who|this is for|struggling|tired of|have you ever)\b/i.test(h),
  mid_step: (h) => /^(?:first|step \w+|watch|start by|take|grab|put|place|here'?s how)\b/i.test(h),
  reveal_verdict: (h) => /^(?:this|these|that)\b/i.test(h),
}

/** Which declared shape each hook option matches (null = none). */
export function checkHookShapes(hooks: readonly string[], shapes: readonly string[]): { shapes: (string | null)[]; ok: number } {
  const matched = hooks.map((h) => shapes.find((s) => HOOK_SHAPE_RULES[s]?.(String(h ?? '').trim())) ?? null)
  return { shapes: matched, ok: matched.filter(Boolean).length }
}

/** Keep options that match a declared shape (first a matching one); never below 2 options, never new text. */
export function repairHookShapes(hooks: readonly string[], shapes: readonly string[]): string[] {
  const c = checkHookShapes(hooks, shapes)
  const good = hooks.filter((_, i) => c.shapes[i])
  if (good.length >= 2) return good
  if (good.length === 1) return [good[0]!, ...hooks.filter((h) => h !== good[0])]
  return [...hooks]
}

// ── WORD BUDGET ────────────────────────────────────────────────────────────

/** Spoken words over the profile budget (10% slack). */
export function checkWordBudget(script: readonly ScriptBeat[], profile: DurationProfile): { words: number; budget: number; over: boolean } {
  const total = script.reduce((n, b) => n + words(lineOf(b)), 0)
  const budget = DURATION_PROFILES[profile].words
  return { words: total, budget, over: total > Math.round(budget * 1.1) }
}

/** Trim-only repair: drop sentences from the longest middle beat (keeping its pull line and ≥1 sentence) until in budget. */
export function trimToBudget(script: readonly ScriptBeat[], profile: DurationProfile): ScriptBeat[] {
  const out = script.map((b) => ({ ...b }))
  const limit = Math.round(DURATION_PROFILES[profile].words * 1.1)
  for (let guard = 0; guard < 50; guard++) {
    const total = out.reduce((n, b) => n + words(lineOf(b)), 0)
    if (total <= limit) break
    let best = -1
    let bestWords = 0
    for (let i = 1; i < out.length - 1; i++) {
      const ss = sentencesOf(lineOf(out[i]))
      const w = words(lineOf(out[i]))
      if (ss.length >= 2 && w > bestWords) { best = i; bestWords = w }
    }
    if (best < 0) break
    const ss = sentencesOf(lineOf(out[best]))
    // Keep the closing pull: drop the sentence before it.
    const endsInPull = isPull(ss[ss.length - 1]!)
    ss.splice(endsInPull ? ss.length - 2 : ss.length - 1, 1)
    out[best] = { ...out[best], line: ss.join(' ') }
  }
  return out
}

// ── WORD BUDGET FOR EVERY SCRIPT (panel-current-3, 2026-10-13) ─────────────
// Median 75 words (~30 s) against a Standard budget of 140: the budget was a
// prompt hint plus a template-only trim, and the model "lengthen" pass is off
// on test traffic. This is the CHECK + deterministic REPAIR for every script,
// template or not: trim when over, lengthen when under. The lengthen only ever
// adds a ledger item's OWN text (her story, her fact, her answer, the target
// product's fact) that the script does not already say. Nothing she did not
// supply is written; short with nothing left on file stays short and is
// recorded as `short_no_material`.

/** Lower edge of the budget band: under this, the script is lengthened. */
export const WORD_BUDGET_FLOOR = 0.85
/** Upper edge (matches `checkWordBudget`): over this, the script is trimmed. */
export const WORD_BUDGET_CEIL = 1.1

/** The profile for a requested length, with no template involved. */
export function profileForSeconds(targetSeconds: unknown, software = false): DurationProfile {
  const sec = Number(targetSeconds)
  if (!Number.isFinite(sec) || sec <= 0) return 'standard'
  if (sec <= (software ? 35 : 40)) return 'sprint'
  if (sec >= 75) return 'deep'
  return 'standard'
}

export interface WordBand { words: number; budget: number; min: number; max: number; under: boolean; over: boolean }

/** Spoken words against the profile band [85%, 110%]. */
export function checkWordBand(script: readonly ScriptBeat[], profile: DurationProfile): WordBand {
  const total = script.reduce((n, b) => n + words(lineOf(b)), 0)
  const budget = DURATION_PROFILES[profile].words
  const min = Math.round(budget * WORD_BUDGET_FLOOR)
  const max = Math.round(budget * WORD_BUDGET_CEIL)
  return { words: total, budget, min, max, under: total < min, over: total > max }
}

const QUOTED_FIELD_RE = /testimonial|review|quote/i
const LENGTHEN_ORIGINS = new Set(['her_story', 'her_fact', 'her_answer', 'product_fact'])
const termsOf = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9']{4,}/g) ?? []))

/** Already said: half the item's content words are in the script. */
function alreadySaid(text: string, lines: readonly string[]): boolean {
  const own = termsOf(text)
  if (own.size === 0) return true
  const all = termsOf(lines.join(' '))
  let inAll = 0
  for (const w of own) if (all.has(w)) inAll++
  return inAll / own.size >= 0.5
}

/** Ledger items that may lengthen a script: first-party, on this product, not already said. */
export function lengthenCandidates(script: readonly ScriptBeat[], ledger: readonly LedgerItem[], targetProductId: string | null = null, opts: LengthenOpts = {}): LedgerItem[] {
  const lines = script.map(lineOf)
  // PANEL-7 (trial, `units`): every item spanning lines was rejected whole, so
  // Standard scripts recorded short_no_material while her items sat unused.
  // Each line of an item is now its own candidate, verbatim, same filters.
  const pool = opts.units
    ? ledger.flatMap((it) => (/\n/.test(it.text) || words(it.text) > 45 ? spokenUnits(it.text).map((u, n) => ({ ...it, id: `${it.id}#${n}`, text: u })) : [it]))
    : ledger
  return pool.filter((it) => {
    if (!LENGTHEN_ORIGINS.has(it.origin) || !it.first_party) return false
    if (it.field === 'note' || it.field?.startsWith('template.')) return false
    if (it.product_id && it.product_id !== targetProductId) return false
    if (isNonAnswerText(it.text)) return false
    // ⚠️ panel-current-5: lengthening pasted a testimonial item's text verbatim as
    // her spoken line. Another person's words are never added as hers, and
    // scaffolding is never added at all.
    if (isScaffoldText(it.text) || QUOTED_FIELD_RE.test(it.field ?? '')) return false
    const n = words(it.text)
    if (n < 5 || n > 45 || /\n/.test(it.text)) return false
    return !alreadySaid(it.text, lines)
  })
}

const asSentence = (t: string) => {
  const s = t.trim().replace(/\s+/g, ' ')
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/([^.!?])$/, '$1.')
}

/** Add unused ledger items (their own text) as build beats before the close until the band floor is met. */
export interface LengthenOpts { units?: boolean }

export function lengthenFromLedger(script: readonly ScriptBeat[], profile: DurationProfile, ledger: readonly LedgerItem[], targetProductId: string | null = null, opts: LengthenOpts = {}): { script: ScriptBeat[]; added: string[] } {
  let out = script.map((b) => ({ ...b }))
  const added: string[] = []
  for (const it of lengthenCandidates(out, ledger, targetProductId, opts)) {
    const band = checkWordBand(out, profile)
    if (!band.under) break
    if (band.words + words(it.text) > band.max) continue
    if (alreadySaid(it.text, out.map(lineOf))) continue
    const spoken = out.map((b, i) => (lineOf(b) ? i : -1)).filter((i) => i >= 0)
    // ⚠️ PANEL-6: her opinion was pasted as its own beat just before the close,
    // wherever that fell. It now joins the body beat it shares the most words
    // with (never the hook or the close); other items follow that beat.
    const body = spoken.slice(1, -1)
    const terms = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9']{4,}/g) ?? [])
    const own = terms(it.text)
    let best = -1, bestHit = 0
    for (const i of body) { let h = 0; for (const w of terms(lineOf(out[i]))) if (own.has(w)) h++; if (h > bestHit) { bestHit = h; best = i } }
    if (it.origin === 'her_fact' && best >= 0) {
      out[best] = { ...out[best], line: `${lineOf(out[best]).replace(/\s+$/, '')} ${asSentence(it.text)}` }
    } else {
      const at = best >= 0 ? best + 1 : spoken.length >= 2 ? spoken[spoken.length - 1]! : out.length
      out = [...out.slice(0, at), { line: asSentence(it.text), section: 'build', source_item: it.id }, ...out.slice(at)]
    }
    added.push(it.id)
  }
  return { script: out, added }
}

export interface WordBudgetRecord {
  profile: DurationProfile
  budget: number
  words_before: number
  words_after: number
  action: 'none' | 'trimmed' | 'lengthened' | 'short_no_material'
  added: string[]
}

/** The check + repair for every script: trim when over, lengthen from the ledger when under. */
export function enforceWordBudget(script: readonly ScriptBeat[], profile: DurationProfile, ledger: readonly LedgerItem[], targetProductId: string | null = null, opts: LengthenOpts = {}): { script: ScriptBeat[]; record: WordBudgetRecord } {
  const before = checkWordBand(script, profile)
  let out = script.map((b) => ({ ...b }))
  let action: WordBudgetRecord['action'] = 'none'
  let added: string[] = []
  if (before.over) {
    out = trimToBudget(out, profile)
    action = 'trimmed'
  } else if (before.under) {
    const l = lengthenFromLedger(out, profile, ledger, targetProductId, opts)
    out = l.script
    added = l.added
    action = added.length ? 'lengthened' : 'short_no_material'
  }
  const after = checkWordBand(out, profile)
  return { script: out, record: { profile, budget: before.budget, words_before: before.words, words_after: after.words, action, added } }
}

/** The template id a blueprint records: the template's id, or 'none'. Always a string. */
export function templateIdOf(template: unknown): string {
  const id = (template as { id?: unknown } | null)?.id
  return typeof id === 'string' && id.trim() ? id : 'none'
}

// ── FINISH + RECORD ────────────────────────────────────────────────────────

export interface TemplateRecord {
  id: string
  version: string
  profile: DurationProfile
  slots: Record<string, string>
  promise_paid: boolean
  bridges_ok: string
  hook_shapes: (string | null)[]
  words: number
  trimmed: boolean
  promise_repair: string
}

export interface FinishInput {
  plan: TemplatePlan
  profile: DurationProfile
  script: readonly ScriptBeat[]
  hook_options: readonly string[]
  ledger: readonly LedgerItem[]
}

/** Run every check + repair over the generated script; returns the repaired script and the ids-only record. */
export function finishTemplate(i: FinishInput): { script: ScriptBeat[]; hook_options: string[]; record: TemplateRecord } {
  const t = i.plan.template
  const usedIds = new Set(i.plan.slots.map((s) => s.item_id).filter(Boolean) as string[])
  const itemsSlot = t.beats.find((b) => b.count)?.slots[0]
  const spare = itemsSlot ? i.ledger.filter((it) => !usedIds.has(it.id) && itemFits(it, itemsSlot, null) && !QUOTED_FIELD_RE.test(it.field ?? '')) : []
  let hooks = repairHookShapes(i.hook_options.map(String), t.hook_shapes)
  let script = repairBridges(i.script, t)
  const p = repairPromise(script, hooks, t, spare)
  script = p.script
  hooks = p.hook_options
  const before = checkWordBudget(script, i.profile)
  if (before.over) script = trimToBudget(script, i.profile)
  const after = checkWordBudget(script, i.profile)
  const br = checkBridges(script, t)
  const promise = checkPromise(script, lineOf(script[0]), t)
  const slots: Record<string, string> = {}
  for (const s of i.plan.slots) slots[s.key.replace(`template.${t.id}.`, '')] = s.fill === 'empty' ? 'skipped' : s.fill
  return {
    script,
    hook_options: hooks,
    record: {
      id: t.id, version: SCRIPT_TEMPLATES_VERSION, profile: i.profile, slots,
      promise_paid: promise.paid, bridges_ok: `${br.ok}/${br.of}`,
      hook_shapes: checkHookShapes(hooks, t.hook_shapes).shapes,
      words: after.words, trimmed: before.over, promise_repair: p.action,
    },
  }
}

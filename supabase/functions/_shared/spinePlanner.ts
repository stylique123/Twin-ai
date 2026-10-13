// GENERATED FROM packages/shared/src/script/planner/spinePlanner.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE PLANNER: ONE SPINE PER SCRIPT (Phase 4.1, trial only).
//
// Before any line is written, decide the ONE point the script makes (the
// spine), then a beat plan in which every beat serves that spine. Material
// that does not serve the spine is DROPPED and logged, never stuffed in.
//
// Pure: no I/O, no model call. The edge (trial only) calls `planSpine` after
// the template is chosen, gives the writer `renderPlanBlock`, stores
// `planRecord` on blueprint.plan (ids and counts only, never text) and runs
// `checkPlanAdherence` over the finished script.
//
// ⚖️ THE SPINE IS BUILT ONLY FROM LEDGER ITEMS OR THE REQUEST'S OWN WORDS.
// The claim is a verbatim span of one first-party item (or of her request
// note). Nothing here writes a new word. Outside material may support a beat
// but is never the spine (plan pack: "gaps only, never the spine").
//
// ⚖️ TRIAL ONLY. Real creators never reach `planSpine`.

import { contentWords, isNonAnswerText, MAX_ASKS, type LedgerItem, type GateQuestion, type ItemOrigin } from './inventionGate.ts'
import { QUESTION_TEMPLATES, type BeatRole, type DurationProfile } from './templateData.ts'
import { expandedRoles, type TemplatePlan } from './scriptTemplates.ts'

export const SPINE_PLANNER_VERSION = 'spine-planner-v1'

/** The claim is one sentence, at most this many words (a span, never a rewrite). */
export const SPINE_MAX_WORDS = 25

export interface PlannerRequest { goal?: string | null; angle?: string | null; note?: string | null }

export interface PlannerInput {
  request: PlannerRequest
  ledger: readonly LedgerItem[]
  template?: TemplatePlan | null
  profile?: DurationProfile
  targetProductId?: string | null
  /** Questions already queued (gate_questions, template questions): deduped against, counted toward the cap. */
  existingQuestions?: ReadonlyArray<{ text?: unknown; writes_to?: unknown }>
}

export interface PlanSpine { claim: string; item_ids: string[]; source: 'item' | 'request' }
export interface PlanBeat { role: BeatRole; item_ids: string[]; purpose: string }
export type DropReason = 'off_spine' | 'other_product' | 'unconfirmed' | 'non_answer' | 'over_budget'
export interface PlanDrop { item_id: string; reason: DropReason }

export interface SpinePlan {
  spine: PlanSpine | null
  beats: PlanBeat[]
  questions: GateQuestion[]
  dropped: PlanDrop[]
}

const FIRST_PARTY_RANK: Partial<Record<ItemOrigin, number>> = { her_story: 0, her_answer: 1, her_fact: 2, product_fact: 3 }
const SUPPORT_RANK: Record<ItemOrigin, number> = {
  her_story: 0, her_answer: 1, her_fact: 2, product_fact: 3, offer: 4, urgency: 5,
  outside_research: 6, outside_moment: 7, niche_note: 8, audience_question: 9,
}
const OUTSIDE = new Set<ItemOrigin>(['outside_research', 'outside_moment', 'niche_note', 'audience_question'])
/** Build beats each profile has room for (one item each). */
export const BUILD_CAPACITY: Record<DurationProfile, number> = { sprint: 1, standard: 3, deep: 5 }

const PURPOSE: Record<BeatRole, string> = {
  hook: 'open on the spine',
  promise: 'say what the viewer gets from the spine',
  build: 'one support for the spine',
  turn: 'what changes once the spine is understood',
  anchor: 'her own take on the spine',
  offer: 'the one real place, tied to the spine',
  close: 'land the spine; transition or CTA only',
}

const firstSentence = (s: string) => (s.trim().match(/^[^.!?]+[.!?]?/)?.[0] ?? '').trim()
const capWords = (s: string, n: number) => {
  const w = s.split(/\s+/).filter(Boolean)
  return w.length <= n ? s : w.slice(0, n).join(' ')
}
const shares = (a: Set<string>, b: Set<string>) => { for (const w of a) if (b.has(w)) return true; return false }
const sharedCount = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n }
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function defaultRoles(profile: DurationProfile, hasOffer: boolean): BeatRole[] {
  const builds = Array.from({ length: BUILD_CAPACITY[profile] }, () => 'build' as BeatRole)
  if (profile === 'sprint') return ['hook', ...builds, ...(hasOffer ? ['offer' as BeatRole] : []), 'close']
  return ['hook', 'promise', ...builds, 'turn', ...(hasOffer ? ['offer' as BeatRole] : []), 'close']
}

/** Merge question lists: dedupe by writes_to and by normalized text; total at most `max`. */
export function mergeQuestions<Q extends { text?: unknown; writes_to?: unknown }>(existing: readonly Q[], extra: readonly Q[], max = MAX_ASKS): Q[] {
  const out: Q[] = []
  const keys = new Set<string>()
  for (const q of [...existing, ...extra]) {
    const k1 = `w:${String(q.writes_to ?? '')}`
    const k2 = `t:${norm(q.text)}`
    if ((q.writes_to && keys.has(k1)) || keys.has(k2)) continue
    if (out.length >= max) break
    if (q.writes_to) keys.add(k1)
    keys.add(k2)
    out.push(q)
  }
  return out
}

/** Plan one spine and the beats that serve it. */
export function planSpine(input: PlannerInput): SpinePlan {
  const profile = input.profile ?? 'standard'
  const target = input.targetProductId ?? null
  const req = input.request ?? {}
  const note = String(req.note ?? '').trim()
  const requestWords = contentWords([req.goal, req.angle, note].map((x) => String(x ?? '').replace(/_/g, ' ')).join(' '))
  const dropped: PlanDrop[] = []
  const drop = (id: string, reason: DropReason) => dropped.push({ item_id: id, reason })

  // 1. Usable items: in scope, confirmed, real answers.
  const usable: LedgerItem[] = []
  for (const it of input.ledger) {
    if (it.id === 'note' && it.origin === 'her_answer') { if (note && !isNonAnswerText(it.text)) usable.push(it); continue }
    if (isNonAnswerText(it.text)) { drop(it.id, 'non_answer'); continue }
    if (it.product_id && it.origin !== 'offer' && it.product_id !== target) { drop(it.id, 'other_product'); continue }
    if (it.origin === 'product_fact' && !it.first_party) { drop(it.id, 'unconfirmed'); continue }
    if (it.origin === 'urgency' && !it.live) { drop(it.id, 'unconfirmed'); continue }
    usable.push(it)
  }

  // 2. The spine: the first-party item that best matches the request (never outside, never the offer).
  const candidates = usable
    .filter((it) => it.first_party && !OUTSIDE.has(it.origin) && FIRST_PARTY_RANK[it.origin] != null && it.id !== 'note')
    .map((it, i) => ({ it, i, hit: sharedCount(contentWords(it.text), requestWords) }))
    .sort((a, b) => b.hit - a.hit || FIRST_PARTY_RANK[a.it.origin]! - FIRST_PARTY_RANK[b.it.origin]! || a.i - b.i)
  const pick = candidates.find((c) => c.hit > 0) ?? (requestWords.size === 0 ? candidates[0] : undefined)
  const noteItem = usable.find((it) => it.id === 'note')
  let spine: PlanSpine | null = null
  if (pick) {
    spine = { claim: capWords(firstSentence(pick.it.text), SPINE_MAX_WORDS), item_ids: [pick.it.id], source: 'item' }
  } else if (note) {
    spine = { claim: capWords(firstSentence(note), SPINE_MAX_WORDS), item_ids: noteItem ? [noteItem.id] : [], source: 'request' }
  }
  if (spine && !spine.claim) spine = null

  // 3. What serves the spine: shares a content word with it or the request. The offer serves the offer beat.
  const spineWords = new Set<string>([...contentWords(spine?.claim ?? ''), ...requestWords])
  const spineIds = new Set(spine?.item_ids ?? [])
  const serving: LedgerItem[] = []
  let offerItem: LedgerItem | null = null
  for (const it of usable) {
    if (spineIds.has(it.id)) continue
    if (it.id === 'note') continue
    if (it.origin === 'offer') { offerItem = it; continue }
    if (spine && shares(contentWords(it.text), spineWords)) serving.push(it)
    else drop(it.id, 'off_spine')
  }
  serving.sort((a, b) => SUPPORT_RANK[a.origin] - SUPPORT_RANK[b.origin])

  // 4. Beats: the template's roles when one is chosen, else the profile's default arc.
  const roles = input.template ? expandedRoles(input.template.template) : defaultRoles(profile, !!offerItem)
  const templateItem = new Map<number, string>()
  if (input.template) {
    const exp = input.template.template.beats.flatMap((b, bi) => Array.from({ length: b.count ? b.count[0] : 1 }, () => bi))
    const perBeat = new Map<number, string[]>()
    for (const s of input.template.slots) if (s.item_id) perBeat.set(s.beat, [...(perBeat.get(s.beat) ?? []), s.item_id])
    exp.forEach((bi, pos) => { const q = perBeat.get(bi); if (q?.length) templateItem.set(pos, q.shift()!) })
  }
  const servingIds = new Set(serving.map((s) => s.id))
  const taken = new Set<string>()
  const queue = [...serving]
  const nextSupport = (firstPartyOnly = false) => {
    const i = queue.findIndex((s) => !taken.has(s.id) && (!firstPartyOnly || (s.first_party && !OUTSIDE.has(s.origin))))
    if (i < 0) return null
    const [s] = queue.splice(i, 1)
    taken.add(s!.id)
    return s!.id
  }
  let builds = 0
  const beats: PlanBeat[] = []
  roles.forEach((role, pos) => {
    const tpl = templateItem.get(pos)
    const tplOk = tpl && (spineIds.has(tpl) || servingIds.has(tpl)) && !taken.has(tpl) ? tpl : null
    if (tplOk && !spineIds.has(tplOk)) taken.add(tplOk)
    let ids: string[] = []
    switch (role) {
      case 'hook': ids = [...spineIds]; break
      case 'promise': ids = [...spineIds]; break
      case 'build': {
        if (builds >= BUILD_CAPACITY[profile] && !input.template) return
        const id = tplOk ?? nextSupport()
        if (!id) return // an empty build beat is never planned
        builds++
        ids = [id]
        break
      }
      case 'turn': case 'anchor': { const id = tplOk ?? nextSupport(true); ids = id ? [id] : [...spineIds]; break }
      case 'offer': ids = offerItem ? [offerItem.id] : []; break
      case 'close': ids = []; break
    }
    beats.push({ role, item_ids: ids, purpose: PURPOSE[role] })
  })
  if (offerItem && !beats.some((b) => b.item_ids.includes(offerItem!.id))) drop(offerItem.id, 'off_spine')
  for (const s of queue) if (!taken.has(s.id)) drop(s.id, 'over_budget')

  // 5. Questions: only what the plan needs, deduped against what is already queued; total ≤ MAX_ASKS.
  const need: GateQuestion[] = []
  const firstPartySpine = spine?.source === 'item'
  if (!spine) need.push({ scope: 'script', kind: QUESTION_TEMPLATES.topic.kind, text: QUESTION_TEMPLATES.topic.text, writes_to: 'plan.spine' })
  else if (!firstPartySpine) need.push({ scope: 'script', kind: QUESTION_TEMPLATES.her_difference.kind, text: QUESTION_TEMPLATES.her_difference.text, writes_to: 'plan.spine_own' })
  if (spine && !beats.some((b) => b.role === 'build')) need.push({ scope: 'script', kind: QUESTION_TEMPLATES.list_item.kind, text: QUESTION_TEMPLATES.list_item.text, writes_to: 'plan.support' })
  const existing = (input.existingQuestions ?? []).map((q) => ({ text: q.text, writes_to: q.writes_to }))
  const merged = mergeQuestions<{ text?: unknown; writes_to?: unknown }>(existing, need)
  const questions = need.filter((q) => merged.includes(q))

  return { spine, beats, questions, dropped }
}

/** The writer's brief: short, ids and the spine sentence only. */
export function renderPlanBlock(plan: SpinePlan): string {
  if (!plan.spine) return ''
  const lines = plan.beats.map((b, i) => `${i + 1}. ${b.role}${b.item_ids.length ? ` [${b.item_ids.join(', ')}]` : ''}: ${b.purpose}`)
  return [
    'THE PLAN (one spine; every beat serves it):',
    `SPINE: ${plan.spine.claim}`,
    ...lines,
    'Use only the listed items in each beat. Material not listed is not part of this script; do not add it.',
  ].join('\n')
}

export interface PlanRecord { version: string; spine_item_ids: string[]; beat_count: number; questions: number; dropped_count: number }

/** What is stored on blueprint.plan: ids and counts only, never text. */
export function planRecord(plan: SpinePlan): PlanRecord {
  return { version: SPINE_PLANNER_VERSION, spine_item_ids: [...(plan.spine?.item_ids ?? [])], beat_count: plan.beats.length, questions: plan.questions.length, dropped_count: plan.dropped.length }
}

// ── THE POST-CHECK ─────────────────────────────────────────────────────────

const CTA_RE = /\b(?:link in (?:my )?bio|follow|save this|comment|share|subscribe|dm me|shop|buy|order|use (?:my )?code|sign up|book|tap|click|let me know|try it|grab (?:one|yours|it)|get yours)\b/i
const TRANSITION_MAX_WORDS = 6

export interface AdherenceResult { beats: number; cited: number; transition: number; uncited: number }

/** Each script beat cites ≥1 planned item (shares ≥2 content words, or all of a short item's) or is a pure transition/CTA. */
export function checkPlanAdherence(script: ReadonlyArray<{ line?: unknown }>, plan: SpinePlan, ledger: readonly LedgerItem[]): AdherenceResult {
  const planned = new Set<string>([...(plan.spine?.item_ids ?? []), ...plan.beats.flatMap((b) => b.item_ids)])
  const itemWords = ledger.filter((it) => planned.has(it.id)).map((it) => contentWords(it.text))
  if (plan.spine?.source === 'request') itemWords.push(contentWords(plan.spine.claim))
  const r: AdherenceResult = { beats: 0, cited: 0, transition: 0, uncited: 0 }
  for (const b of script) {
    const line = String(b?.line ?? '').trim()
    if (!line) continue
    r.beats++
    const w = contentWords(line)
    if (itemWords.some((iw) => { const n = sharedCount(w, iw); return n >= 2 || (n >= 1 && iw.size <= 2) })) { r.cited++; continue }
    if (CTA_RE.test(line) || line.split(/\s+/).length <= TRANSITION_MAX_WORDS) { r.transition++; continue }
    r.uncited++
  }
  return r
}

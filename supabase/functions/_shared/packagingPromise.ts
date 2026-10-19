// GENERATED FROM packages/shared/src/script/planner/packagingPromise.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// PACKAGING KEEPS THE SCRIPT'S PROMISE (Twin plan v5.1 item G; trial only,
// kill switch PACKAGING_PROMISE at the edge).
//
// Titles and publish captions must INHERIT THE WINNING HOOK (the first of the
// final hook_options) and must NEVER PROMISE WHAT THE SCRIPT DOES NOT PAY OFF.
// The A6 title check (spineContract.checkTitlePromise) compared only the first
// title with the engine's pick; this checks every title and every publish
// caption against the hook that actually shipped AND the script's own words.
//
// ⚖️ DETERMINISTIC AND SUBTRACTIVE. No model call. A failing title is dropped;
// when none is left, the title is rebuilt from the hook's own first sentence.
// A failing caption is replaced by that same hook sentence (its hashtags are
// kept). Nothing here writes a word that is not already in the hook.

import { contentWords } from './inventionGate.ts'
import { checkTitlePromise, titleFromHook, type TitlePromiseReason } from './spineContract.ts'

export const PACKAGING_PROMISE_VERSION = 'packaging-promise-v1'

export type PackagingReason = TitlePromiseReason | 'unpaid_number' | 'unpaid_claim_word' | 'unpaid_count' | 'unpaid_words'

/** Words that make a claim of their own (as spineContract's CLAIM_WORDS, plus a few caption favourites). */
const CLAIM_WORDS = new Set(['best', 'worst', 'only', 'never', 'always', 'guarantee', 'guaranteed', 'secret', 'secrets', 'proven',
  'instantly', 'instant', 'fastest', 'easiest', 'cheapest', 'everyone', 'nobody', 'free', 'forever', 'perfect', 'ultimate',
  'hack', 'hacks', 'cure', 'cures', 'overnight', 'results', 'transform', 'transforms', 'viral'])
const NUM_WORDS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' }
const COUNT_NOUN = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+)?(things?|tips?|ways?|reasons?|mistakes?|steps?|secrets?|rules?|signs?|lessons?|ideas?|tricks?|habits?|myths?)\b/gi

const numbersOf = (s: string) => new Set([...(s.toLowerCase().match(/\d+(?:[.,]\d+)?/g) ?? []),
  ...(s.toLowerCase().match(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/g) ?? []).map((w) => NUM_WORDS[w]!)])
const rawWords = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean))
const stripTags = (s: string) => s.replace(/(^|\s)#[\w-]+/g, ' ').replace(/\s+/g, ' ').trim()

/** A counted promise ("3 tips") in packaging; paid when the hook or the script names the same count. */
function countsOf(s: string): string[] {
  return [...s.matchAll(COUNT_NOUN)].map((m) => NUM_WORDS[m[1]!.toLowerCase()] ?? m[1]!)
}

export interface PackagingCheck { ok: boolean; reasons: PackagingReason[] }

/** Is everything this packaging text promises paid by the hook or the script? */
export function checkPaidOff(text: unknown, hook: unknown, scriptText: unknown): PackagingCheck {
  const t = stripTags(String(text ?? ''))
  const paid = `${String(hook ?? '')}\n${String(scriptText ?? '')}`
  const reasons: PackagingReason[] = []
  if (!t) return { ok: false, reasons: ['no_title'] }
  const pn = numbersOf(paid)
  if ([...numbersOf(t)].some((n) => !pn.has(n))) reasons.push('unpaid_number')
  const pw = rawWords(paid)
  if ([...rawWords(t)].some((w) => CLAIM_WORDS.has(w) && !pw.has(w))) reasons.push('unpaid_claim_word')
  const paidCounts = new Set(countsOf(paid))
  if (countsOf(t).some((c) => !paidCounts.has(c))) reasons.push('unpaid_count')
  // Most of its content words must appear somewhere in what she says.
  const tw = [...contentWords(t)]
  const pcw = contentWords(paid)
  if (tw.length >= 3 && tw.filter((w) => !pcw.has(w)).length > Math.max(1, Math.floor(tw.length / 2))) reasons.push('unpaid_words')
  return { ok: reasons.length === 0, reasons }
}

/** A title: inherits the hook (A6 rule) AND is paid off by the script. */
export function checkPackagedTitle(title: unknown, hook: unknown, scriptText: unknown): PackagingCheck {
  const a = checkTitlePromise(title, hook)
  const b = checkPaidOff(title, hook, scriptText)
  const reasons = [...new Set<PackagingReason>([...a.reasons, ...b.reasons])]
  return { ok: reasons.length === 0, reasons }
}

/** A publish caption: shares a key word with the hook and promises nothing the script does not pay. */
export function checkPackagedCaption(caption: unknown, hook: unknown, scriptText: unknown): PackagingCheck {
  const c = stripTags(String(caption ?? ''))
  const reasons: PackagingReason[] = [...checkPaidOff(c, hook, scriptText).reasons]
  const hw = contentWords(String(hook ?? ''))
  if (!hw.size) reasons.push('no_hook')
  else if (![...contentWords(c)].some((w) => hw.has(w))) reasons.push('no_shared_key_words')
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] }
}

export interface PackagingRecord {
  version: string
  hook: 'hook_options' | 'script' | 'none'
  titles: { checked: number; dropped: number; rebuilt: boolean; reasons: PackagingReason[] }
  captions: { checked: number; replaced: number; reasons: PackagingReason[] }
}

interface Blueprintish {
  hook_options?: unknown
  script?: unknown
  packaging?: { titles?: unknown[]; [k: string]: unknown } | null
  publish_plan?: unknown
  [k: string]: unknown
}

/** The hook that shipped: the first final hook option, else the first spoken line. */
export function winningHook(bp: Blueprintish): { text: string; from: PackagingRecord['hook'] } {
  const opts = Array.isArray(bp.hook_options) ? bp.hook_options : []
  const h = opts.find((x) => typeof x === 'string' && x.trim())
  if (typeof h === 'string') return { text: h.trim(), from: 'hook_options' }
  const first = Array.isArray(bp.script) ? (bp.script as Array<{ line?: unknown }>).find((b) => typeof b?.line === 'string' && b.line.trim()) : null
  return first ? { text: String(first.line).trim(), from: 'script' } : { text: '', from: 'none' }
}

const scriptTextOf = (bp: Blueprintish) => (Array.isArray(bp.script) ? (bp.script as Array<{ line?: unknown }>).map((b) => (typeof b?.line === 'string' ? b.line : '')).join('\n') : '')

/** Enforce on a blueprint (mutates a copy; returns it with the record). */
export function enforcePackagingPromise<T extends Blueprintish>(bp: T): { blueprint: T; record: PackagingRecord } {
  const out: T = { ...bp }
  const hook = winningHook(bp)
  const script = scriptTextOf(bp)
  const record: PackagingRecord = { version: PACKAGING_PROMISE_VERSION, hook: hook.from, titles: { checked: 0, dropped: 0, rebuilt: false, reasons: [] }, captions: { checked: 0, replaced: 0, reasons: [] } }
  if (!hook.text) return { blueprint: out, record }
  const titleReasons = new Set<PackagingReason>()
  const capReasons = new Set<PackagingReason>()
  const pk = bp.packaging && typeof bp.packaging === 'object' ? { ...bp.packaging } : null
  if (pk && Array.isArray(pk.titles)) {
    const kept: unknown[] = []
    for (const t of pk.titles) {
      record.titles.checked++
      const c = checkPackagedTitle(t, hook.text, script)
      if (c.ok) kept.push(t)
      else { record.titles.dropped++; c.reasons.forEach((r) => titleReasons.add(r)) }
    }
    if (kept.length === 0 && record.titles.checked > 0) {
      const rebuilt = titleFromHook(hook.text)
      if (rebuilt) { kept.push(rebuilt); record.titles.rebuilt = true }
    }
    pk.titles = kept
    ;(out as Blueprintish).packaging = pk
  }
  if (Array.isArray(bp.publish_plan)) {
    const hookSentence = (hook.text.match(/^[^.!?]+[.!?]?/)?.[0] ?? hook.text).trim()
    ;(out as Blueprintish).publish_plan = (bp.publish_plan as unknown[]).map((p) => {
      if (!p || typeof p !== 'object' || typeof (p as { caption?: unknown }).caption !== 'string') return p
      record.captions.checked++
      const cap = (p as { caption: string }).caption
      const c = checkPackagedCaption(cap, hook.text, script)
      if (c.ok) return p
      record.captions.replaced++
      c.reasons.forEach((r) => capReasons.add(r))
      const tags = cap.match(/(?:^|\s)(#[\w-]+)/g)?.map((x) => x.trim()) ?? []
      return { ...(p as object), caption: [hookSentence, ...tags].join(' ').trim() }
    })
  }
  record.titles.reasons = [...titleReasons]
  record.captions.reasons = [...capReasons]
  return { blueprint: out, record }
}

/** Kill switch: trial only; PACKAGING_PROMISE='false' turns it off. */
export function packagingPromiseOn(trialOn: boolean, flag: string | undefined | null): boolean {
  return trialOn && String(flag ?? '').trim().toLowerCase() !== 'false'
}

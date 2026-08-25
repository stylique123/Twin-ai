// GENERATED FROM packages/shared/src/script/hookContract.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * THE HOOK RULES, MADE DECIDABLE.
 *
 * ⚠️ A RULE WITHOUT A CHECK DRIFTS, AND THIS ONE ALREADY HAS. The writer's
 * prompt demands "one spoken line under ~12 words". A hook shipped to a real
 * creator at 28 words: "If you are a solo founder in your twenties right now,
 * you need to hear this, because your fear of judgement is literally cementing
 * you into a life you hate." At a natural pace that is ~9 seconds, and the
 * three-second scroll decision is over before the first clause ends.
 *
 * ⚖️ AND THE STALE HALF OF THE DIAGNOSIS IS CORRECTED HERE RATHER THAN
 * INHERITED. The code comment in `generate-blueprint` saying four of five hooks
 * "are never checked" is out of date: all five now face `entitlementFailures`,
 * so a fabricated personal history in an alternate hook is already dropped.
 * What is unchecked is LENGTH AND OPENER, and that is unchecked on ALL FIVE,
 * including the recommended one. This module is that check and nothing else.
 *
 * ⚖️ NOTHING HERE THROWS AND NOTHING HERE DELETES. Hooks are repairable
 * precisely because five are generated and one is chosen; a hook that fails
 * after repair is DEMOTED so the creator can still pick it, because a dropped
 * hook is a preference datapoint we never get back.
 */

/** ⚠️ 12 IS THE TARGET, 14 IS THE CEILING, AND THE GAP IS DELIBERATE. A sharp
 *  12 rejects legitimate output — measure before tightening. Reporting both
 *  means the tolerance is visible rather than folded into a single number. */
export const HOOK_TARGET_WORDS = 12
export const HOOK_MAX_WORDS = 14

/** The prompt's own list, plus the announcement-of-value family it misses.
 *  ⚠️ THIS LIVES TWICE — here and in the SYSTEM prompt — so a parity test
 *  compares the shipped sources rather than trusting they agree. */
export const BANNED_OPENERS: readonly string[] = Object.freeze([
  'hey guys', 'in this video', 'today i', 'so basically', 'let me tell you',
  'you need to hear this', 'listen to this', "i'm about to", 'im about to',
])

/** ⚖️ REMOVED ONLY WHEN REMOVAL ALONE RESCUES THE LINE. Stripping filler from a
 *  hook that already passes is an edit nobody asked for. */
const FILLER = /\b(literally|actually|basically|really|just)\b/gi

/** Connectors that fuse two hooks into one. ⚠️ AN EXPLICIT SHORT LIST, NEVER A
 *  GENERAL COMMA SPLIT: "Three things, and the third one costs you money" is one
 *  hook, and cutting it at the comma would inverts its meaning — the same
 *  truncation rule that governs spoken lines everywhere else. */
const FUSERS = /,\s*(?:because|so that|so|which is why|and that's why|and thats why)\s+/i

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'you', 'your', 'i',
  'me', 'my', 'it', 'its', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or',
  'but', 'that', 'this', 'with', 'into', 'right', 'now', 'if', 'so', 'because',
])

export function words(line: string): string[] {
  return String(line ?? '').trim().split(/\s+/).filter((w) => w !== '')
}

export function wordCount(line: string): number {
  return words(line).length
}

function contentWords(line: string): string[] {
  return words(line)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ''))
    .filter((w) => w !== '' && !STOPWORDS.has(w))
}

/** ⚠️ ANCHORED AT THE START, WORD-BOUNDED. A substring match would fire on
 *  "today improvements" for the opener "today i" — the normalisation lesson this
 *  repo has relearned more than once. */
export function bannedOpener(line: string): string | null {
  const norm = String(line ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const o of BANNED_OPENERS) {
    if (norm === o || norm.startsWith(o + ' ')) return o
  }
  return null
}

export interface HookVerdict {
  ok: boolean
  words: number
  overTarget: boolean
  overMax: boolean
  opener: string | null
}

export function judgeHook(line: string): HookVerdict {
  const n = wordCount(line)
  const opener = bannedOpener(line)
  return {
    ok: n <= HOOK_MAX_WORDS && opener === null && n > 0,
    words: n,
    overTarget: n > HOOK_TARGET_WORDS,
    overMax: n > HOOK_MAX_WORDS,
    opener,
  }
}

function tidy(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ').replace(/^[,;:\-\s]+/, '')
  if (t === '') return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** How a hook was rescued, so the audit can say which lever did it. */
export type HookRepair = 'none' | 'filler' | 'clause' | 'filler+clause' | 'unrepairable'

export interface RepairedHook {
  line: string
  repair: HookRepair
  before: HookVerdict
  after: HookVerdict
}

/**
 * The deterministic half of the repair ladder. No model call, no new words.
 *
 * ⚠️ IT MAY ONLY EVER SHORTEN, NEVER REPHRASE. Every output is a substring of
 * the input with filler removed — so a repair can drop emphasis but can never
 * introduce a claim the writer did not make, which is the property that makes
 * running this before a human sees it acceptable at all.
 */
export function repairHook(raw: string): RepairedHook {
  const before = judgeHook(raw)
  if (before.ok && !before.overTarget) return { line: String(raw ?? '').trim(), repair: 'none', before, after: before }

  let line = String(raw ?? '').trim()
  let usedFiller = false
  let usedClause = false

  const stripped = tidy(line.replace(FILLER, ' '))
  if (stripped !== '' && wordCount(stripped) < wordCount(line)) {
    // ⚖️ KEPT ONLY IF IT HELPS. A hook that still fails after stripping keeps
    // the strip anyway ONLY when the clause step is about to run on it —
    // otherwise we would silently edit a line we are not fixing.
    if (judgeHook(stripped).ok) { line = stripped; usedFiller = true }
    else { line = stripped; usedFiller = true }
  }

  if (!judgeHook(line).ok || judgeHook(line).overTarget) {
    // ⚠️ THE SECOND CLAUSE MUST CARRY THE PAYLOAD, and "carry" is measured, not
    // assumed: it must pass every check on its own AND hold at least as many
    // content words as the half being discarded. Dropping the informative half
    // to satisfy a word count would be the check making the script worse.
    const parts = line.split(FUSERS)
    if (parts.length === 2) {
      const tail = tidy(parts[1])
      const head = parts[0]
      const tailV = judgeHook(tail)
      const headHasDigit = /\d/.test(head)
      const tailHasDigit = /\d/.test(tail)
      const keepsInfo = contentWords(tail).length >= contentWords(head).length
        && (!headHasDigit || tailHasDigit)
      if (tailV.ok && !tailV.overTarget && keepsInfo) {
        line = tail
        usedClause = true
      }
    }
  }

  const after = judgeHook(line)
  const repair: HookRepair = after.ok
    ? (usedFiller && usedClause ? 'filler+clause' : usedClause ? 'clause' : usedFiller ? 'filler' : 'none')
    : 'unrepairable'
  // ⚖️ AN UNREPAIRABLE HOOK KEEPS ITS ORIGINAL TEXT. Shipping a half-trimmed
  // line would be worse than shipping the writer's own: it reads as a sentence
  // somebody started editing and abandoned.
  return { line: after.ok ? line : String(raw ?? '').trim(), repair, before, after: after.ok ? after : before }
}

export interface HookAudit {
  hooks: readonly string[]
  raw: number
  repaired: number
  shippedOver: number
  openersFound: number
}

/**
 * Apply the contract to all five hooks and reorder.
 *
 * ⚖️ DEMOTED, NOT DELETED. Five options exist so the creator chooses; a hook
 * removed for length is a preference datapoint destroyed. Failing hooks sink to
 * the bottom of the list and are still offered.
 */
export function applyHookContract(input: readonly unknown[] | null | undefined): HookAudit {
  const hooks = Array.isArray(input) ? input.filter((h): h is string => typeof h === 'string' && h.trim() !== '') : []
  if (hooks.length === 0) return { hooks: Object.freeze([]), raw: 0, repaired: 0, shippedOver: 0, openersFound: 0 }

  let raw = 0, repaired = 0, openersFound = 0
  const judged = hooks.map((h) => {
    const r = repairHook(h)
    if (!r.before.ok || r.before.overTarget) raw += 1
    if (r.repair !== 'none' && r.repair !== 'unrepairable') repaired += 1
    if (r.before.opener !== null) openersFound += 1
    return r
  })

  // ⚠️ STABLE WITHIN EACH GROUP. The writer's own ordering is a signal — hook 0
  // is its recommendation — so passing hooks keep their relative order rather
  // than being sorted by length, which would quietly install "shortest" as the
  // recommendation the doctrine has never actually tested.
  const pass = judged.filter((j) => j.after.ok).map((j) => j.line)
  const fail = judged.filter((j) => !j.after.ok).map((j) => j.line)
  return {
    hooks: Object.freeze([...pass, ...fail]),
    raw,
    repaired,
    shippedOver: fail.length,
    openersFound,
  }
}

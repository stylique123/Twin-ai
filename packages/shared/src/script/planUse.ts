// WHAT TWIN WILL USE, SHOWN SO SHE CAN TRUST IT (owner, 2026-09-28).
//
// ⚠️ The first version listed eight items, truncated, two of them the same cup
// score, one a legal deadline ("26 days … fines or a court date"). The rules:
//   · only facts that FIT this idea are shown first; the rest sit behind "See all";
//   · each says where it came from — "You wrote this" or "From your videos, not
//     confirmed";
//   · an unconfirmed number, "first/only" claim, or anything legal, health,
//     family or money-trouble shaped starts OFF; she can turn it on;
//   · near-duplicates are merged; full sentences, never cut.
// Pure, so the card only renders it and the tests pin it.

import { SENSITIVE } from './storyRotation'

export interface PlanUseItem {
  id: string
  text: string
  kind: string
  /** Her own words (answered in Twin), not read from her videos. */
  mine: boolean
  /** Shares a subject word with this idea. */
  fits: boolean
  /** Starts left out; she can turn it on. */
  defaultOff: boolean
  sensitive: boolean
  /** She left it out of an earlier video (0253); stays off until she turns it on. */
  leftOut: boolean
  reason: string
}

const USE_KINDS = new Set(['experience', 'story', 'claim', 'example', 'opinion', 'product', 'result', 'number'])
const MINE_SOURCES = new Set(['asked', 'reply', 'typed', 'onboarding', 'manual'])
/** Legal and regulatory matters, beyond the shared sensitive list. */
const LEGALISH = /\b(fines?|fined|court|permit\w*|inspection\w*|inspector\w*|enforcement|zoning|licen[cs]\w*|legal\w*|lawsuit|regulat\w*|compliance|citation)\b/i
const STRONG_CLAIM = /\b(first|only|best|never|always|guarantee\w*|number one|#1)\b/i
const HAS_NUMBER = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|hundred|thousand)\b/i
const STOP = new Set(['about', 'their', 'there', 'which', 'would', 'could', 'should', 'these', 'those', 'where', 'while', 'being', 'every', 'because', 'really', 'people', 'coffee'])

function words(t: string): Set<string> {
  const out = new Set<string>()
  for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 4 && !STOP.has(w)) out.add(w.slice(0, 5))
  return out
}
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / Math.min(a.size, b.size)
}

export function planUseItems(
  knowledge: readonly { id?: unknown; kind?: unknown; text?: unknown; source?: unknown; creator_confirmed_at?: unknown; creator_excluded_at?: unknown }[] | null | undefined,
  about: string,
): PlanUseItem[] {
  // ⚠️ ROUND 4, 3.3/3.4: "roasting" stemmed to "roasti" and never met "roast",
  // so her own origin story did not "fit" an idea about why she started roasting,
  // while a sticker-company line fit on the niche's commonest word. Stems are now
  // five letters, and a word shared by most of her store is too common to count.
  const allRows = (knowledge ?? []).map((k) => words(String(k?.text ?? '')))
  const df = new Map<string, number>()
  for (const w of allRows) for (const x of w) df.set(x, (df.get(x) ?? 0) + 1)
  const common = (x: string) => allRows.length >= 8 && (df.get(x) ?? 0) / allRows.length > 0.35
  const aboutWords = new Set([...words(about)].filter((x) => !common(x)))
  const out: PlanUseItem[] = []
  const seen: Array<Set<string>> = []
  // Her own words first, so a duplicate keeps the version she wrote.
  const rows = [...(knowledge ?? [])].sort((x, y) =>
    Number(MINE_SOURCES.has(String(y?.source ?? ''))) - Number(MINE_SOURCES.has(String(x?.source ?? ''))))
  for (const k of rows) {
    const id = String(k?.id ?? ''), kind = String(k?.kind ?? ''), text = String(k?.text ?? '').trim()
    if (!id || !text || !USE_KINDS.has(kind)) continue
    const w = words(text)
    if (seen.some((s) => overlap(s, w) >= 0.6)) continue
    seen.push(w)
    const mine = MINE_SOURCES.has(String(k?.source ?? '')) || !!k?.creator_confirmed_at
    const sensitive = SENSITIVE.test(text) || LEGALISH.test(text)
    const risky = !mine && (HAS_NUMBER.test(text) || STRONG_CLAIM.test(text))
    const leftOut = !!k?.creator_excluded_at
    out.push({
      id, text, kind, mine,
      fits: overlap(aboutWords, w) > 0 || [...w].some((x) => aboutWords.has(x)),
      defaultOff: sensitive || risky || leftOut,
      sensitive,
      leftOut,
      reason: sensitive
        ? 'Private or legal, so it stays out unless you turn it on'
        : leftOut ? 'You left this out before, so it stays out unless you turn it on'
        : mine ? 'You wrote this' : 'From your videos, not confirmed',
    })
  }
  return out
}

/** The most items the writer is handed; the server caps `use_knowledge_ids` the same. */
export const PLAN_USE_MAX = 10

/**
 * What starts OFF, decided once: flagged items, items that do not fit her
 * paragraph, and anything past the first PLAN_USE_MAX that would be on.
 * Everything else starts on, and that list is exactly what is sent.
 */
export function defaultExcluded(items: readonly PlanUseItem[]): string[] {
  let on = 0
  const off: string[] = []
  for (const i of items) {
    if (i.defaultOff || !i.fits || on >= PLAN_USE_MAX) off.push(i.id)
    else on++
  }
  return off
}

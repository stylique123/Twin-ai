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
  for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 4 && !STOP.has(w)) out.add(w.slice(0, 6))
  return out
}
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / Math.min(a.size, b.size)
}

export function planUseItems(
  knowledge: readonly { id?: unknown; kind?: unknown; text?: unknown; source?: unknown; creator_confirmed_at?: unknown }[] | null | undefined,
  about: string,
): PlanUseItem[] {
  const aboutWords = words(about)
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
    out.push({
      id, text, kind, mine,
      fits: overlap(aboutWords, w) > 0 || [...w].some((x) => aboutWords.has(x)),
      defaultOff: sensitive || risky,
      sensitive,
      reason: sensitive
        ? 'Private or legal, so it stays out unless you turn it on'
        : mine ? 'You wrote this' : 'From your videos, not confirmed',
    })
  }
  return out
}

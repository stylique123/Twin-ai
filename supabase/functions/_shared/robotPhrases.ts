// GENERATED FROM packages/shared/src/script/robotPhrases.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// ROBOT PHRASES + SPOKEN CADENCE (owner A4). A code filter on every script line.
//
// · The list is DATA: each entry has an id (what is recorded — ids and counts
//   only, never the line), a pattern, and a repair mode.
//     prefix  a removable lead-in ("Let's dive in.", "Here's the thing:").
//             Deleted; the rest of the sentence stays. Nothing is added.
//     filler  a sentence that says nothing on its own. Dropped when the
//             sentence is nothing else.
//     flag    a word or frame that cannot be cut without rewording
//             ("game-changer", "it's not just X, it's Y"). Counted, never
//             rewritten — a repair here would mean adding words.
// · The stock closer ("that is everything there is to say on it") reuses
//   beatCleanup.dropStockCloser rather than a second regex for the same thing.
// · Cadence: a spoken sentence over ~22 words or with 3+ commas is flagged and
//   split at a natural boundary (", and" / ", but" / ", so" / dash / semicolon
//   / comma nearest the middle). A comma becomes a full stop; no word is added.
import { dropStockCloser } from './beatCleanup.ts'

export type RobotMode = 'prefix' | 'filler' | 'flag'
export interface RobotPhrase { id: string; re: RegExp; mode: RobotMode }

const LEAD = String.raw`(?:^|(?<=[.!?]\s))\s*(?:(?:and|so|but|okay|ok|now)[, ]+)?`
const TAIL = String.raw`\s*(?:[,:;.!—–-]+\s*|\s+)`
const prefix = (id: string, body: string): RobotPhrase => ({ id, mode: 'prefix', re: new RegExp(`${LEAD}(?:${body})${TAIL}`, 'i') })
const flag = (id: string, body: string): RobotPhrase => ({ id, mode: 'flag', re: new RegExp(body, 'i') })

export const ROBOT_PHRASES: readonly RobotPhrase[] = [
  prefix('fast_paced_world', String.raw`in (?:today'?s|this) (?:fast[- ]paced|busy|modern|digital) world`),
  prefix('dive_in', String.raw`(?:let'?s|let us|time to|we'?re going to|we'?ll) (?:dive|jump|get) (?:right )?(?:in|into it|started)`),
  prefix('heres_the_thing', String.raw`here'?s the (?:thing|deal|kicker|truth)`),
  prefix('buckle_up', String.raw`buckle up`),
  prefix('without_further_ado', String.raw`without further ado`),
  prefix('in_conclusion', String.raw`in conclusion|to sum (?:it )?up|in summary`),
  prefix('end_of_the_day', String.raw`at the end of the day`),
  prefix('truth_is', String.raw`the truth is|truth be told|let'?s be honest|let me be honest`),
  prefix('ever_wondered', String.raw`have you ever wondered`),
  prefix('lets_talk_about', String.raw`let'?s talk about it`),
  { id: 'stock_closer', mode: 'filler', re: /^\s*(?:(?:and|so)\s+)?(?:that(?:'s| is)|this is)\s+(?:honestly\s+|really\s+|literally\s+|just\s+|basically\s+)?(?:(?:really\s+)?everything there is to (?:say|know|it)|all there is to (?:it|say)|the whole (?:story|lesson|point|thing)|the entire (?:lesson|story))\b[^.!?]{0,24}[.!]?\s*$/i },
  { id: 'stay_tuned', mode: 'filler', re: /^\s*(?:so\s+)?(?:stay tuned|let'?s get into it|you won'?t believe what happens next)[.!]?\s*$/i },
  flag('game_changer', String.raw`\bgame[- ]?changer\b|\bgame[- ]?changing\b`),
  flag('unlock', String.raw`\bunlock(?:s|ed|ing)?\b`),
  flag('elevate', String.raw`\belevat(?:e|es|ed|ing)\b`),
  flag('secret_sauce', String.raw`\bsecret sauce\b`),
  flag('level_up', String.raw`\blevel(?:\s|-)?up\b`),
  flag('not_just_x', String.raw`\b(?:it'?s|this is|that'?s|it is) not just\b[^.!?]{1,60}[,;—–-]\s*(?:it'?s|it is|this is|that'?s)\b`),
  flag('revolutionize', String.raw`\brevolutioni[sz](?:e|es|ed|ing)\b`),
  flag('supercharge', String.raw`\bsupercharg(?:e|es|ed|ing)\b`),
  flag('seamless', String.raw`\bseamless(?:ly)?\b`),
  flag('delve', String.raw`\bdelv(?:e|es|ing)\b`),
]

const sentencesOf = (line: string): string[] => line.match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? []
const words = (t: string): number => t.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length
const cap = (t: string): string => (t ? t[0]!.toUpperCase() + t.slice(1) : t)

export interface RobotRepair { line: string; hits: string[]; dropped: boolean }

/**
 * Repair one spoken line by deletion only. `line` is '' and `dropped` true when
 * every sentence was filler; the caller decides whether the beat may go.
 */
export function repairRobotLine(line: string): RobotRepair {
  const hits: string[] = []
  const kept: string[] = []
  const closerCut = dropStockCloser(line)
  if (closerCut !== line) hits.push('stock_closer')
  for (const s0 of sentencesOf(closerCut)) {
    let s = s0
    let cut = false
    for (const p of ROBOT_PHRASES) {
      if (p.mode !== 'prefix') continue
      if (p.re.test(s)) { hits.push(p.id); s = s.replace(p.re, '').trim(); cut = true }
    }
    const filler = ROBOT_PHRASES.find((p) => p.mode === 'filler' && p.re.test(s))
    if (filler) { hits.push(filler.id); continue }
    for (const p of ROBOT_PHRASES) if (p.mode === 'flag' && p.re.test(s)) hits.push(p.id)
    // A sentence left with fewer than three words after a prefix cut was
    // purely filler ("Let's dive in." → "") and goes.
    if (cut && words(s) < 3) continue
    kept.push(cut ? cap(s) : s)
  }
  const out = kept.join(' ').trim()
  return { line: out, hits, dropped: out === '' }
}

const BOUNDARIES: readonly RegExp[] = [/,\s+(?=(?:and|but|so|because|which|then)\b)/gi, /\s+[—–]\s+|;\s+/g, /,\s+/g]

/** Split one sentence once at the natural boundary nearest its middle; null if none fits. */
function splitOnce(s: string): [string, string] | null {
  const mid = s.length / 2
  for (const re of BOUNDARIES) {
    let best: { at: number; len: number } | null = null
    for (const m of s.matchAll(re)) {
      const at = m.index ?? 0
      const left = s.slice(0, at)
      const right = s.slice(at + m[0].length)
      if (words(left) < 4 || words(right) < 4) continue
      if (!best || Math.abs(at - mid) < Math.abs(best.at - mid)) best = { at, len: m[0].length }
    }
    if (best) {
      const left = s.slice(0, best.at).replace(/[,;]\s*$/, '').trim()
      const right = s.slice(best.at + best.len).trim()
      return [/[.!?]$/.test(left) ? left : `${left}.`, cap(right)]
    }
  }
  return null
}

export const CADENCE_MAX_WORDS = 22
export const CADENCE_MAX_COMMAS = 3
export const isOverlong = (s: string): boolean => words(s) > CADENCE_MAX_WORDS || (s.match(/,/g)?.length ?? 0) >= CADENCE_MAX_COMMAS

/** Split every overlong sentence in a line. No word is added or removed. */
export function splitForCadence(line: string): { line: string; flagged: number; split: number } {
  let flagged = 0
  let split = 0
  const out: string[] = []
  const queue = sentencesOf(line)
  let guard = 0
  while (queue.length) {
    const s = queue.shift()!
    if (!isOverlong(s) || guard > 12) { out.push(s); continue }
    flagged++
    const parts = splitOnce(s)
    if (!parts) { out.push(s); continue }
    split++
    guard++
    queue.unshift(parts[0], parts[1])
  }
  return { line: split ? out.join(' ') : line, flagged, split }
}

export interface RobotPassRecord { phrase_hits: Record<string, number>; lines_repaired: number; lines_dropped: number; cadence_flagged: number; cadence_split: number }

/**
 * Run both rules on every beat. A beat whose line became empty is dropped only
 * while at least `floor` spoken beats remain (the clean-up floor); otherwise it
 * keeps its original words.
 */
export function robotPass<T extends { line?: unknown }>(beats: readonly T[], floor = 3): { beats: T[]; record: RobotPassRecord } {
  const rec: RobotPassRecord = { phrase_hits: {}, lines_repaired: 0, lines_dropped: 0, cadence_flagged: 0, cadence_split: 0 }
  let spoken = beats.filter((b) => typeof b.line === 'string' && b.line.trim()).length
  const out: T[] = []
  for (const b of beats) {
    if (typeof b.line !== 'string' || !b.line.trim()) { out.push(b); continue }
    const r = repairRobotLine(b.line)
    for (const h of r.hits) rec.phrase_hits[h] = (rec.phrase_hits[h] ?? 0) + 1
    if (r.dropped) {
      if (spoken - 1 >= floor) { spoken--; rec.lines_dropped++; continue }
      out.push(b)
      continue
    }
    const c = splitForCadence(r.line)
    rec.cadence_flagged += c.flagged
    rec.cadence_split += c.split
    if (c.line !== b.line) { rec.lines_repaired++; out.push({ ...b, line: c.line }) } else out.push(b)
  }
  return { beats: out, record: rec }
}

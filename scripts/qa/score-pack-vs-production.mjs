#!/usr/bin/env node
// WHAT DOES THIS SYSTEM WRITE WHEN THE CREATOR'S REAL MATERIAL REACHES IT?
//
// ── WHY EVERY PREVIOUS SCORE IS SUSPECT ───────────────────────────────────
//
// Every quality measurement this project has made ran on the hand-written
// creator pack. Production says what that pack is made of:
//
//     caption-derived : 374 items, 13% substance, ZERO experiences, 2 with figures
//     transcript      : 178 items, 78% substance,    50 experiences, 23 with figures
//
// ⚠️ SO "THE SCRIPTS ARE ACCURATE AND DULL" WAS NEVER SEPARABLE FROM "THE INPUTS
// WERE EMPTY". A writer given no experiences cannot tell a story; a writer given
// two figures across 374 items cannot cite a number. Both were read as craft
// failures for months.
//
// This runs the SAME creators, SAME reference, SAME rules, changing only whether
// the store is the pack or what their account actually produced.
//
// ── THE METRICS, AND WHY THESE ONES ───────────────────────────────────────
//
// ⚖️ COUNTED FROM THE SCRIPT'S OWN DECLARATIONS, NOT FROM A JUDGEMENT ABOUT
// QUALITY. `substance` is a field the writer fills in per beat, so "how many
// beats claim to rest on this creator's knowledge" is arithmetic. The previous
// attempt at this failed by trying to judge invention with a string matcher —
// every invented item cited a real one, loosely, and the matcher passed it. So
// nothing here pretends to detect invention; it reports what the script SAYS,
// which is decidable, and leaves judgement to the panel.
import { readFileSync } from 'node:fs'

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))

/** A first-person account of something the creator did. The thing captions
 *  cannot produce and the thing a story is built out of. */
const STORY = /\bI (?:tried|built|spent|lost|made|started|failed|quit|tested|ran|hired|fired|sold|watched|realised|realized|learned)\b|\bwhen I\b|\bmy first\b|\bwe (?:tried|built|spent|lost|ran)\b/i
/** A measurement, not a count — the same line the count contract draws. */
const FIGURE = /\d[\d,.]*\s*(?:x\b|×|%|k\b|m\b|hours?|minutes?|days?|weeks?|months?|years?|dollars?|subscribers?|followers?|customers?|users?|views?|clients?)|[$£€]\s?\d/i

const byArm = {}
const perCreator = {}
for (const r of rows) {
  const arm = r.case?.label ?? '?'
  const script = r.blueprint?.script ?? []
  const lines = script.map((b) => String(b?.line ?? ''))
  const a = (byArm[arm] ??= { arm, cases: 0, beats: 0, grounded: 0, general: 0, story: 0, figures: 0 })
  a.cases++
  a.beats += script.length
  a.grounded += script.filter((b) => b?.substance === 'creator_knowledge').length
  a.general += script.filter((b) => b?.substance === 'general' || !b?.substance).length
  a.story += lines.filter((l) => STORY.test(l)).length
  a.figures += lines.filter((l) => FIGURE.test(l)).length
  const k = r.case?.creator
  ;(perCreator[k] ??= { creator: k })[{ A_pack: 'pack', B_production: 'all sources', C_transcript_only: 'transcript only' }[arm] ?? arm] =
    `${script.filter((b) => b?.substance === 'creator_knowledge').length}/${script.length} grounded`
    + ` · ${lines.filter((l) => STORY.test(l)).length} story · ${lines.filter((l) => FIGURE.test(l)).length} fig`
}

console.table(Object.values(byArm).map((a) => ({
  arm: { A_pack: 'hand pack', B_production: 'production (all sources)', C_transcript_only: 'production (TRANSCRIPT ONLY)' }[a.arm] ?? a.arm,
  scripts: a.cases,
  beats: a.beats,
  'grounded %': a.beats ? `${((100 * a.grounded) / a.beats).toFixed(0)}%` : '—',
  'generic %': a.beats ? `${((100 * a.general) / a.beats).toFixed(0)}%` : '—',
  'FIRST-PERSON STORY beats': a.story,
  'beats with a figure': a.figures,
})))
console.table(Object.values(perCreator))

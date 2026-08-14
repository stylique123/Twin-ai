#!/usr/bin/env node
// DOES FILLING THE CONTAINER ACTUALLY REDUCE INVENTION?
//
// §18a asserts it does: "an unresolved container handed to a writer does not
// come back empty; it comes back INVENTED, phrased with the same confidence as
// the resolved ones." Nothing had tested that, and the decision to put a
// gap-filling step in front of the creator rests entirely on it being true.
//
// Two arms per creator, same reference, same everything, differing ONLY in how
// many of their own list-fillable items reached the prompt.
//
// ⚠️ THE METRIC MUST BE DECIDABLE, NOT A JUDGEMENT. "Is this item invented" is a
// judgement in general. What is decidable: a beat DECLARED `creator_knowledge`
// whose cited evidence does not appear in the store the harness recorded having
// supplied. That is provenance, checkable by string, and it is the failure §18a
// names — a confident item with nothing behind it.
//
// ⚖️ AND `general` IS NOT COUNTED AS INVENTION. A beat claiming no provenance is
// making no claim to fail; conflating the two would report a cautious script as
// a fabricating one.
import { readFileSync } from 'node:fs'

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))

/** Loose containment: the citation traces to something supplied if a supplied
 *  item's text shares its distinctive words. Deliberately generous — this
 *  counts only CLEAR failures, so the arm difference is a floor, not a ceiling. */
function traces(cited, supplied) {
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const c = norm(cited)
  if (c === '') return true
  for (const item of supplied) {
    const t = norm(item.text)
    if (t === '') continue
    if (t.includes(c) || c.includes(t)) return true
    const ct = new Set(c.split(' ').filter((w) => w.length > 3))
    const tt = new Set(t.split(' ').filter((w) => w.length > 3))
    if (ct.size === 0) continue
    let both = 0
    for (const w of ct) if (tt.has(w)) both++
    if (both / ct.size >= 0.6) return true
  }
  return false
}

// ⚠️ THE FIRST METRIC HERE FOUND NOTHING, AND IT WAS THE METRIC THAT WAS WRONG.
// Counting citations that fail to trace reported 0/48 in the starved arm — while
// that arm's scripts were visibly inventing. A creator supplied FOUR usable
// items produced SEVEN, and the last five were "authentic connections",
// "unique experiences", "a founder-led brand", "innovation", "calculated risks":
// business platitudes, every one declared `creator_knowledge`, every one citing
// a real item loosely enough to pass.
//
// ⚖️ SO THE DECIDABLE QUESTION IS PIGEONHOLE, NOT PROVENANCE. A list of seven
// built from four distinct supplied items has three items that cannot be the
// creator's, whatever they cite — the same reason `checkSupply` counts DISTINCT
// material. Provenance per beat cannot see it, because each invented item is
// attached to a citation that genuinely exists.
function distinctSupplyReached(script, supplied) {
  const hit = new Set()
  for (const b of script) {
    if (b?.substance !== 'creator_knowledge') continue
    supplied.forEach((item, n) => { if (traces(b?.substance_evidence, [item])) hit.add(n) })
  }
  return hit.size
}

/** Items the script actually enumerates — "the first…", "the second…". */
function deliveredItems(script) {
  const ORD = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i
  let n = 0
  for (const b of script) if (ORD.test(String(b?.line ?? ''))) n++
  return n
}

const byArm = {}
for (const r of rows) {
  const arm = r.case?.label ?? '?'
  const script = r.blueprint?.script ?? []
  const supplied = r.supplied?.knowledge ?? []
  const a = (byArm[arm] ??= {
    arm, cases: 0, beats: 0, cited: 0, untraceable: 0, general: 0, creators: [],
  })
  a.cases++
  a.creators.push(r.case?.creator)
  for (const b of script) {
    a.beats++
    if (b?.substance === 'creator_knowledge') {
      a.cited++
      if (!traces(b?.substance_evidence, supplied)) a.untraceable++
    } else if (b?.substance === 'general' || !b?.substance) a.general++
  }
}

const table = Object.values(byArm).map((a) => ({
  arm: a.arm,
  cases: a.cases,
  beats: a.beats,
  'cites creator': a.cited,
  'CITATION DOES NOT TRACE': a.untraceable,
  'untraceable %': a.cited ? `${((100 * a.untraceable) / a.cited).toFixed(0)}%` : '—',
  'general beats': a.general,
}))
console.table(table)

// ⚠️ PER-CREATOR TOO. Six creators is small enough that one runaway case can
// carry an arm, and a mean that hides that is how a null result gets reported as
// an effect.
const perCreator = {}
for (const r of rows) {
  const k = r.case?.creator
  const arm = r.case?.label
  const script = r.blueprint?.script ?? []
  const supplied = r.supplied?.knowledge ?? []
  let cited = 0; let bad = 0
  for (const b of script) {
    if (b?.substance !== 'creator_knowledge') continue
    cited++
    if (!traces(b?.substance_evidence, supplied)) bad++
  }
  ;(perCreator[k] ??= { creator: k })[arm] = `${bad}/${cited}`
}
console.table(Object.values(perCreator))

// ── THE MEASUREMENT THAT ACTUALLY ANSWERS §18a ────────────────────────────
console.log('\nITEMS DELIVERED vs DISTINCT SUPPLIED MATERIAL REACHED')
const pigeon = {}
for (const r of rows) {
  const script = r.blueprint?.script ?? []
  const supplied = r.supplied?.knowledge ?? []
  const delivered = deliveredItems(script)
  const reached = distinctSupplyReached(script, supplied)
  const unbacked = Math.max(0, delivered - reached)
  ;(pigeon[r.case?.creator] ??= { creator: r.case?.creator })[r.case?.label] =
    `${delivered} delivered / ${reached} backed → ${unbacked} unbacked`
}
console.table(Object.values(pigeon))

let tA = 0; let tB = 0; let dA = 0; let dB = 0
for (const r of rows) {
  const delivered = deliveredItems(r.blueprint?.script ?? [])
  const reached = distinctSupplyReached(r.blueprint?.script ?? [], r.supplied?.knowledge ?? [])
  const unbacked = Math.max(0, delivered - reached)
  if (r.case?.label?.startsWith('A_')) { tA += unbacked; dA += delivered } else { tB += unbacked; dB += delivered }
}
console.log(`\nSHORT-SUPPLY arm : ${tA} unbacked of ${dA} items delivered`
  + ` (${dA ? ((100 * tA) / dA).toFixed(0) : 0}%)`)
console.log(`FULL-SUPPLY arm  : ${tB} unbacked of ${dB} items delivered`
  + ` (${dB ? ((100 * tB) / dB).toFixed(0) : 0}%)`)

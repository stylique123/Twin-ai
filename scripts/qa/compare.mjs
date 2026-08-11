#!/usr/bin/env node
// COMPARE TWO RUN SETS BY IDENTICAL CRITERIA.
//
// Cohort 1 (12 well-documented creators, hand-written knowledge) and cohort 2
// (5 product-led channels, NO knowledge, answers derived from what is visible on
// the page) differ in more than one variable, so this does not pretend to isolate
// one. What it does is apply the SAME checks to both, so a difference in the
// numbers is at least a difference in the output rather than in how it was
// judged — which is the failure that has bitten this harness family repeatedly.
//
//   node scripts/qa/compare.mjs a.json b.json
import { readFileSync } from 'node:fs'
// ⚠️ IMPORTED, NEVER RESTATED. This file carried its own copy of the sell
// pattern AND its own goal-only permission rule — the fourth and fifth copies
// of a rule production had already replaced. `check_cta_permission_authority`
// found it. One authority, imported, or the copies drift apart again.
import { SELL, mayPitch, relationshipFor } from './score-matrix.mjs'

// Every check reads the SPOKEN fields, never the metadata beside them. A run
// measured on `enumeration.unit` once reported nine problems where five existed.
const PLACEHOLDER = /\[[^\]]*\]/
const EMPTY_PROMISE = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(items?|things?|stuff|points?)\s*[.!?]*\s*$/i
const NOTES_ALOUD = /video on this|in my last video|already covered|my audience asks|you (guys )?(keep|always) ask|a lot of you ask/i
const HEX = /#[0-9a-fA-F]{6}\b/
// Earnings and outcome language — the class where a transferred claim is a
// regulatory problem rather than an aesthetic one.
const MONEY_CLAIM = /\$[\d,]+ ?(a|per) (day|week|month)|thousands of dollars|guaranteed|passive income|make you rich|dream car/i

function score(runs) {
  const s = {
    runs: 0, failed: 0, enumerated: 0, countInHook: 0,
    placeholderLines: 0, emptyPromiseHooks: 0, notesAloud: 0,
    sellOnNonSell: 0, hexLeak: 0, moneyClaims: 0, namedThings: 0, beats: 0,
  }
  for (const r of runs) {
    const bp = r.blueprint
    if (!bp || bp.error) { s.failed++; continue }
    s.runs++
    const hooks = (bp.hook_options ?? []).filter((h) => typeof h === 'string')
    const script = bp.script ?? []
    const m = bp.reference_read?.mechanism?.enumeration ?? {}
    s.beats += script.length
    if (String(m.is_enumerated) === 'true') {
      s.enumerated++
      if (hooks[0] && String(hooks[0]).includes(String(m.count))) s.countInHook++
    }
    for (const b of script) {
      const line = b.line ?? ''
      if (PLACEHOLDER.test(line)) s.placeholderLines++
      if (NOTES_ALOUD.test(line)) s.notesAloud++
      if (MONEY_CLAIM.test(line)) s.moneyClaims++
      // A specific is a proper noun or a figure — the thing an audience has not
      // already heard. Crude on purpose; it is a trend line, not a verdict.
      if (/\b[A-Z][a-z]+[A-Z0-9]\w*|\b\d+ ?(MP|GB|gig|inch|hour|day|year|%)\b/.test(line)) s.namedThings++
      if (HEX.test(b.location ?? '') || HEX.test(b.wardrobe ?? '')) s.hexLeak++
    }
    if (hooks.some((h) => EMPTY_PROMISE.test(h))) s.emptyPromiseHooks++
    // Permission comes from the RELATIONSHIP, never from the goal: no goal
    // creates a commercial tie that does not exist.
    if (!mayPitch(relationshipFor(r.case?.creator)) && SELL.test(bp.cta ?? '')) s.sellOnNonSell++
  }
  return s
}

const [a, b] = process.argv.slice(2)
const A = score(JSON.parse(readFileSync(a, 'utf8')))
const B = score(JSON.parse(readFileSync(b, 'utf8')))
const rows = Object.keys(A)
const pad = (v, n) => String(v).padStart(n)
console.log(`${'measure'.padEnd(20)} ${pad('A', 7)} ${pad('B', 7)}`)
console.log('-'.repeat(36))
for (const k of rows) console.log(`${k.padEnd(20)} ${pad(A[k], 7)} ${pad(B[k], 7)}`)

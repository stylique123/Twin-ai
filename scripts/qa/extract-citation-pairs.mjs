#!/usr/bin/env node
// G4 — THE CANDIDATE PAIR SET FOR THE GENERAL CITATION-SUPPORT CHECK.
//
// ⚠️ THE NUMERIC CASE IS ALREADY HANDLED. `entailment_gaps` (creator_knowledge)
// and `product_claim_gaps` (product_dna) both catch a FIGURE the citation does
// not carry. Neither can see an invented CAPABILITY that cites an unrelated
// real fact — "it syncs to your calendar" cited against a source that only
// ever mentions the price. That is the general case, and per this repo's own
// audit findings it needs a model call (an NLI-style "does source X support
// claim Y"), not a string match — a string match over prose blocks legitimate
// paraphrase, which is worse than the defect.
//
// ⚖️ SO THIS IS THE PREREQUISITE, NOT THE CHECK. A model call needs a labeled
// eval set to tune its prompt against and a false-positive rate to measure
// before anyone decides whether it may ever block. Every beat in production
// already carries its declared substance and, where it sources creator
// knowledge or product DNA, its citation — so the eval set does not need new
// data, only extraction. This script does exactly that extraction and nothing
// else: no model call, no verdict, no write. Its output is a candidate set for
// a human to hand-label SUPPORTED / NOT SUPPORTED / AMBIGUOUS before any check
// is built against it.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/qa/extract-citation-pairs.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

// ⚠️ THE SAME TWO SUBSTANCE KINDS THE EXISTING NUMERIC GUARDS ALREADY COVER —
// `creator_knowledge` (checked by entailment_gaps) and `product_dna` (checked
// by product_claim_gaps). A general check inherits their scope rather than
// widening it on its own authority; SUBSTANCE_ENUM's other values
// (creator_experience, creator_opinion, general, needs_user) either have no
// citation to check against or are not a factual claim at all.
const CITED_SUBSTANCE = new Set(['creator_knowledge', 'product_dna'])

const db = createClient(url, key)
const { data, error } = await db
  .from('generations')
  .select('id, blueprint, created_at')
  .not('blueprint', 'is', null)
  .order('created_at', { ascending: false })
  .limit(2000)
if (error) { console.error('read failed:', error.message); process.exit(1) }

const rows = data ?? []
const pairs = []
let beatsSeen = 0
let citedNoEvidence = 0

for (const row of rows) {
  const script = Array.isArray(row.blueprint?.script) ? row.blueprint.script : []
  script.forEach((beat, i) => {
    if (!beat || typeof beat !== 'object') return
    const substance = beat.substance
    if (!CITED_SUBSTANCE.has(substance)) return
    beatsSeen++
    const claim = typeof beat.line === 'string' ? beat.line.trim() : ''
    const source = typeof beat.substance_evidence === 'string' ? beat.substance_evidence.trim() : ''
    if (!claim) return
    // ⚠️ AN UNCITED CLAIM IS A DIFFERENT DEFECT, ALREADY COUNTED ELSEWHERE.
    // This extraction is for pairs a human can actually judge — claim against
    // source — so a beat with no citation at all is reported as its own count
    // rather than folded into the pair set as an empty-string source, which
    // would silently teach a future labeller that "no source" and "source
    // says nothing relevant" are the same failure. They are not.
    if (!source) { citedNoEvidence++; return }
    pairs.push({
      generation_id: row.id,
      beat: i + 1,
      substance,
      claim,
      source,
      label: null, // for a human: 'SUPPORTED' | 'NOT_SUPPORTED' | 'AMBIGUOUS'
    })
  })
}

console.log(`generations scanned: ${rows.length}`)
console.log(`beats with a checked substance (creator_knowledge/product_dna): ${beatsSeen}`)
console.log(`  cited but with no evidence text at all: ${citedNoEvidence}  (a different, already-counted defect — not in the pair set)`)
console.log(`  claim/source pairs extracted for hand-labelling: ${pairs.length}`)
console.log('\n(pairs written to stdout below as JSON — pipe to a file, then hand-label the `label` field before building anything against this set)')
console.log(JSON.stringify(pairs, null, 2))

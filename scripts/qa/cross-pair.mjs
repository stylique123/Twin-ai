#!/usr/bin/env node
// CROSS-PAIRING: every creator gets someone ELSE'S reference.
//
// The first matrix ran each creator against a reference from their own world,
// which tests almost nothing — a tech reviewer handed a tech reviewer's format
// will look fine whether or not the mechanism actually transferred. The
// interesting question is whether the MECHANISM survives the move: does Doctor
// Mike get Codie Sanchez's contrarian shape without her claims, does the
// enumerated list keep its count when the person counting is a physician.
//
// ⚖️ PAIRS ARE FIXED, NOT RANDOM. A random pairing cannot be compared against
// the next run, and every conclusion becomes "it was different this time".
// Each pair below also names what it is TRYING to break, so a clean result is
// evidence rather than an absence of complaints.
import { readFileSync } from 'node:fs'

const pack = JSON.parse(readFileSync('scripts/qa/creator-pack.json', 'utf8'))
const R = pack.references

/** Prose for the harness, built FROM the pack so the two cannot drift. */
export function refNote(key) {
  const r = R[key]
  if (!r) throw new Error(`unknown reference ${key}`)
  const lines = [
    `A proven short-form video by ${r.source}.`,
    `Its mechanism: ${r.mechanism ?? 'unstated'}.`,
  ]
  if (r.enumeratedCount) {
    lines.push(`It is an ENUMERATED LIST of ${r.enumeratedCount} items, and the hook states that number.`)
  }
  if (r.note) lines.push(r.note)
  return lines.join(' ')
}

// creator ← someone else's reference. `breaks` is the assertion this pair exists
// to test; `goal` exercises the newly-wired per-video intent.
export const PAIRS = [
  { creator: 'doctormike', ref: 'R_CODIE_DONT', goal: 'educate',
    breaks: 'contrarian negative advice handed to a REGULATED physician — the register must clamp and no medical certainty may appear' },
  { creator: 'cleo', ref: 'R_TECH_3AI', goal: 'followers',
    breaks: 'an enumerated count of 3 must be PROMISED in the hook and DELIVERED aloud by a science explainer' },
  { creator: 'hormozi', ref: 'R_TECH_3AI', goal: 'sell',
    breaks: 'count contract under a commercial goal — the newly wired sell intent must unlock a CTA without dropping the count' },
  { creator: 'mkbhd', ref: 'R_TILBURY_RAT', goal: 'authority',
    breaks: 'a money-psychology shape on a REVIEW_ONLY reviewer — no ownership language may appear' },
  { creator: 'techiela', ref: 'R_CODIE_DONT', goal: 'followers',
    breaks: 'business-contrarian shape on a screen-recording tool reviewer with an UNVERIFIED affiliate tie' },
  { creator: 'garyvee', ref: 'R_ALI_3X', goal: 'personal_brand',
    breaks: "Ali's self-reported '3x more productive' claim MUST NOT transfer to GaryVee" },
  { creator: 'ali', ref: 'R_GARY_MISTAKE', goal: 'sell',
    breaks: 'owns a course AND a book — a sell goal may name ONE offer, not invent a bundle' },
  { creator: 'codie', ref: 'R_HORMOZI_QA', goal: 'leads',
    breaks: 'leads intent must open a conversation, not close a sale' },
  { creator: 'arun', ref: 'R_ALI_3X', goal: 'educate',
    breaks: "a productivity result-claim shape on a gadget reviewer — the reference's number must stay behind" },
  { creator: 'simon', ref: 'R_TECH_3AI', goal: 'followers',
    breaks: 'enumerated count on a creator with no confirmed showability — no scene may depend on showing a product' },
  { creator: 'colinsamir', ref: 'R_TILBURY_RAT', goal: 'authority',
    breaks: 'money-tension shape on a creator-economy duo — must not become financial advice' },
  { creator: 'marktilbury', ref: 'R_GARY_MISTAKE', goal: 'entertain',
    breaks: 'entertain goal must NOT bolt a commercial ask onto the ending' },
]

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(PAIRS.map((p) => ({
    creator: p.creator,
    label: `${p.ref}->${p.creator}`,
    fidelity: 'balanced',
    tone: 'balanced',
    goal: p.goal,
    refNote: refNote(p.ref),
  })), null, 2))
}

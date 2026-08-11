#!/usr/bin/env node
// SCORE A MATRIX BY THE METRICS THAT NAME THE FOUNDING DEFECT.
//
// The old `compare.mjs` counts structure: placeholders, counts in hooks, hex
// leaks. Those were the right measures when the failure was shape. They cannot
// see the failure that replaced it — a script that is perfectly shaped and says
// nothing — so this scores SUBSTANCE, which is what #316 made observable.
//
//   node scripts/qa/score-matrix.mjs run.json [--by variant|label|creator]
//
// ⚠️ EVERY CHECK READS THE SPOKEN LINE, never the metadata beside it. A previous
// harness scored `enumeration.unit` and reported nine problems where five
// existed, which is how a harness becomes the thing under test.
import { readFileSync } from 'node:fs'

const PLACEHOLDER = /\[[^\]]*\]/
// Bracketless filler. Word-matched so real names survive: `Pixel 7a`, `M4`,
// `A80` are specifics, not templates.
const FILLER = /\b(xyz|abc123|brand\s?[xy]|product\s?[abx]|company\s?[xy]|insert\s+\w+\s+here|your\s+product\s+here|tbd|placeholder)\b/i
const NOTES_ALOUD = /video on this|in my last video|already covered|my audience asks|you (guys )?(keep|always) ask|a lot of you ask/i
// ⚠️ "NEVER BUY A CHROMEBOOK" IS A REVIEW, NOT A SALES PITCH.
//
// This pattern was `/…|buy |…|purchase|…/` and it cried wolf exactly the way
// the citation check did before it. Post-fix it flagged 8 spoken lines and 2
// CTAs, and ALL TEN were false: "three products I'd never buy again", "don't
// buy for the sake of buying", "what's one tech purchase you regret?" — the
// last two being the engagement CTA the rule asks for, scored as a violation.
//
// ⚖️ A PITCH ASKS THE VIEWER TO TRANSACT, or to go somewhere in order to. That
// is the decidable thing. A bare verb is not: reviewers talk about buying all
// day, and a checker that cannot tell a recommendation from a solicitation
// will report the product's best behaviour as its worst.
const SELL = /link in bio|link below|sign ?up|pre-?order|enroll|my course|subscribe to my|grab (my|the|yours)|buy (it|yours|one|now|here)|get yours|shop |use (my )?code|dm me/i
const MONEY_CLAIM = /\$[\d,]+ ?(a|per) (day|week|month)|thousands of dollars|guaranteed|passive income|make you rich|dream car/i
// Mirrors `FIRST_PERSON_HISTORY` in knowledgeResolver.ts: history, not stance.
// "I think" and "I'd say" are opinion and must not be counted.
const FIRST_PERSON_HISTORY =
  /\bI(?:'ve| have)?\s+(?:bought|owned|used|switched|returned|tested|kept|ran)\b|\bmy own\b|\bwhen I (?:got|bought|switched)\b/i
// A specific: a proper noun with internal capital/digit, or a figure with a
// unit. Crude on purpose — a trend line, never a verdict on one script.
const SPECIFIC = /\b[A-Z][a-z]+[A-Z0-9]\w*|\b\d+ ?(MP|GB|gig|inch|hour|day|year|%)\b/

const STOP = new Set(['this', 'that', 'with', 'from', 'they', 'them', 'what', 'when',
  'have', 'about', 'video', 'thing', 'things', 'your', 'their', 'more', 'than'])
const terms = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length > 3 && !STOP.has(w)))

/** Same loose containment `substanceIssues` uses: the beat need not quote, only
 *  overlap enough that the claim traces back to something real. */
// The prompt shows `* (product) X`, so citations come back prefixed. Strip it,
// or the kind word inflates the term set and short citations never match.
const KIND_PREFIX = /^\s*\((?:fact|opinion|topic|example|experience|framework|claim|product|covered)\)\s*/i
function tracesTo(cited, supplied) {
  const parts = cited.split(/[,;]/).map((x) => x.replace(KIND_PREFIX, '').trim()).filter(Boolean)
  return (parts.length ? parts : [cited]).some((part) => {
    const c = terms(part)
    if (!c.size) return false
    return supplied.some((i) => {
      const t = terms(i.text ?? '')
      return [...c].filter((w) => t.has(w)).length >= Math.min(2, c.size)
    })
  })
}

function scoreRun(r, knowledgeFor, relationshipFor) {
  const bp = r.blueprint
  const s = {
    runs: 1, failed: 0, beats: 0,
    placeholderBeats: 0, notesAloud: 0, moneyClaims: 0, specificBeats: 0,
    sellInCta: 0, sellInBody: 0,
    declared: 0, fromCreator: 0, fromProduct: 0, fromGeneral: 0, needsUser: 0, undeclaredSource: 0,
    unsupportedCreatorClaim: 0, undeclaredEvidence: 0, unearnedFirstPerson: 0,
  }
  if (!bp || bp.error) { s.failed = 1; return s }
  const supplied = r.case?.withKnowledge === false ? [] : (knowledgeFor(r.case?.creator) ?? [])
  const script = Array.isArray(bp.script) ? bp.script : []
  s.beats = script.length
  for (const b of script) {
    const line = String(b?.line ?? '')
    if (PLACEHOLDER.test(line) || FILLER.test(line)) s.placeholderBeats++
    if (NOTES_ALOUD.test(line)) s.notesAloud++
    if (MONEY_CLAIM.test(line)) s.moneyClaims++
    if (SPECIFIC.test(line)) s.specificBeats++

    const src = typeof b?.substance === 'string' ? b.substance.trim() : ''
    const cited = typeof b?.substance_evidence === 'string' ? b.substance_evidence.trim() : ''
    if (!src) s.undeclaredSource++
    else {
      s.declared++
      if (src === 'creator_knowledge') {
        s.fromCreator++
        if (!cited) s.undeclaredEvidence++
        else if (!tracesTo(cited, supplied)) s.unsupportedCreatorClaim++
      } else if (src === 'product_dna') s.fromProduct++
      else if (src === 'general') s.fromGeneral++
      else if (src === 'needs_user') s.needsUser++
    }
    // ⚖️ THE MOST EXPENSIVE ERROR. A personal history needs experience-level
    // evidence; caption-only knowledge has none, so ANY such line here is
    // unearned by construction.
    if (FIRST_PERSON_HISTORY.test(line)) {
      const licensed = supplied.some((k) => k.kind === 'experience' && k.basis === 'stated')
      if (!licensed) s.unearnedFirstPerson++
    }
  }
  // ⚠️ THE SCORER WAS BLIND TO THE LEAK IT EXISTS TO COUNT.
  //
  // This read `goal && !/sell|leads/.test(goal)` — excusing every commercial
  // goal, which is the goal-only rule `generate-blueprint` deleted when
  // permission moved to the RELATIONSHIP. So it reported 0 leaks across 112
  // runs while 14 of the 32 sell/leads cases ended on "Link in bio to get your
  // Smart Cooker!" for creators with no commercial tie to anything. A scorer
  // carrying the same stale rule as the harness cannot see the harness's bug.
  //
  // ⚖️ AND IT ONLY READ `bp.cta`. Nine more cases put the pitch in a SCRIPT
  // LINE, where it is spoken aloud and where the old check never looked.
  const rel = relationshipFor(r.case?.creator)
  const mayPitch = rel === 'OWN_PRODUCT' || rel === 'OWN_SERVICE'
    || rel === 'AFFILIATE' || rel === 'SPONSOR'
  if (!mayPitch) {
    if (SELL.test(String(bp.cta ?? ''))) s.sellInCta = 1
    if (script.some((b) => SELL.test(String(b?.line ?? '')))) s.sellInBody = 1
  }
  return s
}

const add = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]))

// ⚖️ EXPORTED SO NOBODY WRITES A SECOND SCORER. `diff-matrix.mjs` compares two
// runs, and a comparison computed by different code than the table it is
// compared against measures the difference between two scorers.
export { scoreRun, add, SELL }

const pack = JSON.parse(readFileSync('scripts/qa/creator-pack.json', 'utf8'))
const ALL = [...pack.creators, ...(pack.cohort2?.creators ?? []), ...(pack.cohort3?.creators ?? [])]
const knowledgeFor = (key) => ALL.find((c) => c.key === key)?.knowledge?.items ?? []
// The permission the CTA check needs. Missing is refused, not defaulted: a
// creator scored as NONE looks maximally compliant for the wrong reason.
const relationshipFor = (key) => {
  const c = ALL.find((x) => x.key === key)
  const rel = c?.truth?.relationshipCode
  if (!rel) {
    console.error(`FATAL: creator ${key} has no truth.relationshipCode — cannot score its CTA.`)
    process.exit(1)
  }
  return rel
}
export { knowledgeFor, relationshipFor }

// CLI only. Imported, this file scores nothing on its own.
const isMain = process.argv[1] && process.argv[1].endsWith('score-matrix.mjs')
if (!isMain) { /* imported for its exports */ } else {
const [file, , by = 'variant'] = process.argv.slice(2)
const runs = JSON.parse(readFileSync(file, 'utf8'))
const groups = new Map()
for (const r of runs) {
  const k = by === 'creator' ? (r.case?.creator ?? '?')
    : by === 'label' ? String(r.case?.label ?? '?').split(':')[0]
      : (r.case?.variant ?? '?')
  const cur = groups.get(k)
  const sc = scoreRun(r, knowledgeFor, relationshipFor)
  groups.set(k, cur ? add(cur, sc) : sc)
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '—')
const rows = [...groups.entries()].sort()
console.log(`\ngrouped by ${by} — ${runs.length} runs\n`)
const head = ['group', 'runs', 'fail', 'beats', 'declared', 'creator', 'general', 'needsUser', 'undecl', 'UNSUPPORTED', 'unearned1P', 'placeholder', 'specific', 'money', 'sellCTA', 'sellBODY']
console.log(head.map((h, i) => h.padEnd(i === 0 ? 10 : 12)).join(''))
console.log('-'.repeat(head.length * 12))
for (const [k, s] of rows) {
  console.log([
    k.padEnd(10), String(s.runs).padEnd(12), String(s.failed).padEnd(12), String(s.beats).padEnd(12),
    pct(s.declared, s.beats).padEnd(12), pct(s.fromCreator, s.beats).padEnd(12),
    pct(s.fromGeneral, s.beats).padEnd(12), pct(s.needsUser, s.beats).padEnd(12),
    String(s.undeclaredSource).padEnd(12),
    String(s.unsupportedCreatorClaim).padEnd(12), String(s.unearnedFirstPerson).padEnd(12),
    pct(s.placeholderBeats, s.beats).padEnd(12), pct(s.specificBeats, s.beats).padEnd(12),
    String(s.moneyClaims).padEnd(12), String(s.sellInCta).padEnd(12), String(s.sellInBody).padEnd(12),
  ].join(''))
}
console.log('\nUNSUPPORTED = beat cited creator knowledge the prompt never carried — a fabrication wearing a citation.')
console.log('unearned1P  = first-person HISTORY with no experience-level evidence behind it.')
}

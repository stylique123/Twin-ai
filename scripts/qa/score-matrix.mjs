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
const SELL = /link in bio|buy |pre-?order|sign ?up|subscribe to my|enroll|purchase|my course|grab (my|the)/i
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

function scoreRun(r, knowledgeFor) {
  const bp = r.blueprint
  const s = {
    runs: 1, failed: 0, beats: 0,
    placeholderBeats: 0, notesAloud: 0, moneyClaims: 0, specificBeats: 0,
    sellOnNonSell: 0,
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
  const goal = r.case?.goal
  if (goal && !/sell|leads/.test(goal) && SELL.test(String(bp.cta ?? ''))) s.sellOnNonSell = 1
  return s
}

const add = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]))

const [file, , by = 'variant'] = process.argv.slice(2)
const runs = JSON.parse(readFileSync(file, 'utf8'))
const pack = JSON.parse(readFileSync('scripts/qa/creator-pack.json', 'utf8'))
const ALL = [...pack.creators, ...(pack.cohort2?.creators ?? []), ...(pack.cohort3?.creators ?? [])]
const knowledgeFor = (key) => ALL.find((c) => c.key === key)?.knowledge?.items ?? []

const groups = new Map()
for (const r of runs) {
  const k = by === 'creator' ? (r.case?.creator ?? '?')
    : by === 'label' ? String(r.case?.label ?? '?').split(':')[0]
      : (r.case?.variant ?? '?')
  const cur = groups.get(k)
  const sc = scoreRun(r, knowledgeFor)
  groups.set(k, cur ? add(cur, sc) : sc)
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '—')
const rows = [...groups.entries()].sort()
console.log(`\ngrouped by ${by} — ${runs.length} runs\n`)
const head = ['group', 'runs', 'fail', 'beats', 'declared', 'creator', 'general', 'needsUser', 'undecl', 'UNSUPPORTED', 'unearned1P', 'placeholder', 'specific', 'money', 'sellLeak']
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
    String(s.moneyClaims).padEnd(12), String(s.sellOnNonSell).padEnd(12),
  ].join(''))
}
console.log('\nUNSUPPORTED = beat cited creator knowledge the prompt never carried — a fabrication wearing a citation.')
console.log('unearned1P  = first-person HISTORY with no experience-level evidence behind it.')

// SHE TYPED THE FACTS AND THE DATABASE THREW AWAY THE WHOLE ANSWER BATCH.
//
// ⚠️⚠️ ONE CAUSE, THREE MEASURED ZEROES. `generate-blueprint` writes
// `stable.productFacts` whenever a creator answers the readiness question
// labelled "Specific features, numbers or outcomes this video is allowed to
// state", then persists the WHOLE brief in one update:
//
//   update brand_voices set pre_script_brief = {...brief, ...stable}
//
// `productFacts` was in neither BRIEF_STORED_KEYS nor 0109's shape CHECK. So:
//
//   voices with a stored productFacts -> 0 of 52  (never storable at all)
//   voices with a stored defaultCta   -> 0 of 51  (an ALLOWED, WIRED key,
//                                         discarded alongside it — one update)
//   typed offer specifics in a script -> 5 of 6 dropped, audited over ten runs
//
// Probed against the live function on 2026-09-10:
//   is_pre_script_brief('{"productFacts":"wide band, 45 dollars"}') -> FALSE
//   is_pre_script_brief('{"productFacts":["wide band"]}')           -> FALSE
//   is_pre_script_brief('{"totallyMadeUpKey":"x"}')                 -> false (control)
//   is_pre_script_brief('{"confirmedAudiencePain":"x"}')             -> true
//
// ⚠️ MY FIRST PROBE WAS WRONG AND IT IS RECORDED RATHER THAN QUIETLY DROPPED. I
// tested `{"commercialTies":"affiliate"}` as a STRING, got false, and nearly
// concluded the constraint was unenforced — 10 voices store that key. It failed
// on the VALUE's type: `commercialTies` must be an array. The control above is
// what separates a key problem from a value problem, and `productFacts` fails
// both ways, which is what makes it the key.
//
// ⚖️ AND THE GUARD THAT EXISTS TO CATCH EXACTLY THIS COULD NOT SEE IT.
// `check_brief_consumers` demands a reader for every key in BRIEF_STORED_KEYS —
// and the one key nothing read was the one key outside that list. Its two new
// checks are exercised against the real pre-fix state in its own selftest.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { BRIEF_STORED_KEYS } from '../preScriptBrief'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(root, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const MIGRATION = readFileSync(join(root, 'supabase', 'migrations',
  '0198_the_answer_the_database_refused.sql'), 'utf8')

describe('the three lists that must agree', () => {
  it('productFacts is a stored key, not an undeclared write', () => {
    expect([...BRIEF_STORED_KEYS]).toContain('productFacts')
  })

  it('the shape CHECK accepts it', () => {
    // ⚖️ ASSERTED ON THE MIGRATION because that is what the database will run.
    const keyList = MIGRATION.slice(
      MIGRATION.indexOf('jsonb_object_keys(p) k'), MIGRATION.indexOf('jsonb_each(p) e'))
    expect(keyList).toContain("'productFacts'")
  })

  it('and the migration widens ONLY by that key, keeping every existing one', () => {
    // ⚠️⚠️ A `create or replace` THAT DROPS A KEY WOULD REJECT LIVE ROWS. Ten
    // voices store commercialTies, eighteen store audience; losing one from this
    // list would make their next write fail, which is a worse outage than the
    // bug being fixed.
    const keyList = MIGRATION.slice(
      MIGRATION.indexOf('jsonb_object_keys(p) k'), MIGRATION.indexOf('jsonb_each(p) e'))
    for (const key of ['goal', 'audience', 'workKind', 'workKindOther', 'offer',
      'forbiddenClaims', 'promotes', 'alsoWantsToMake', 'productEvidence',
      'audienceKnowledge', 'contentGoals', 'desiredFormats', 'formatExploration',
      'commercialTies', 'ownProductKind', 'ownServiceKind', 'defaultCta', 'onCamera',
      'confirmedAudiencePain', 'confirmedDreamOutcome']) {
      expect(keyList, `${key} must still be accepted`).toContain(`'${key}'`)
    }
  })

  it('the array-valued keys keep their array rule, and productFacts is not one', () => {
    // ⚖️ productFacts IS A PLAIN STRING, so it must NOT join the array branch —
    // putting it there would reject the very value the writer sends.
    const arrayRule = MIGRATION.slice(MIGRATION.indexOf("e.key in ('contentGoals'"))
    expect(arrayRule).not.toContain("'productFacts'")
  })
})

// ── THE READ HALF, EXECUTED ───────────────────────────────────────────────
function loadTypedFactsRule(): (value: unknown) => string[] {
  const start = EDGE.indexOf('const typedProductFacts = readyPresent(brief.productFacts)')
  expect(start, 'the typed-facts reader must exist').toBeGreaterThan(-1)
  const end = EDGE.indexOf('\n    }\n', start) + 7
  expect(end).toBeGreaterThan(start)
  const js = transformSync(
    'function rule(brief, readyPresent) {\n  const claimLines = []\n'
    + EDGE.slice(start, end) + '\n  return claimLines }',
    { loader: 'ts', format: 'cjs' },
  ).code
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${js}; return rule`)() as
    (b: unknown, r: (v: unknown) => boolean) => string[]
  const readyPresent = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return (value) => fn({ productFacts: value }, readyPresent)
}

const typedFacts = loadTypedFactsRule()
const HERS = 'Wide elastic band you wear under clothes. Three sizes. About 45 dollars.'

describe('what she typed reaches the writer', () => {
  it('the facts appear verbatim', () => {
    // ⚠️ THE AUDITED LOSS, EXACTLY: "wide elastic band you wear under clothes",
    // "three sizes" and "about 45 dollars" were all supplied and none survived.
    const out = typedFacts(HERS).join('')
    expect(out).toContain('Wide elastic band you wear under clothes')
    expect(out).toContain('Three sizes')
    expect(out).toContain('About 45 dollars')
  })

  it('marked as HERS, never as verified', () => {
    // ⚖️ THE WHOLE DIFFERENCE FROM THE BLOCK ABOVE IT. `usableProductFacts`
    // earned its grade from a classifier reading an authoritative page; this is a
    // sentence a person typed, and presenting the two identically would promote
    // an unchecked claim by sitting it next to checked ones.
    const out = typedFacts(HERS).join('')
    expect(out).toMatch(/in their own words/i)
    expect(out).toMatch(/NOT been verified/i)
    expect(out).toMatch(/do not restate them as proven/i)
  })

  it('and it is not a back door around outcome approval', () => {
    // ⚠️⚠️ THE FAILURE MODE OF THIS FIX. A free-text box that licensed outcomes
    // would undo `unionApproved` — seventy lines of claim gating defeated by
    // typing "fixes your core in six weeks" into a different field.
    const out = typedFacts('Fixes your core in six weeks').join('')
    expect(out).toMatch(/promises a RESULT is still not an approved outcome claim/i)
    expect(out).toMatch(/unless that outcome appears in the approved list/i)
  })

  it('silence stays silent', () => {
    expect(typedFacts('')).toEqual([])
    expect(typedFacts('   ')).toEqual([])
    expect(typedFacts(null)).toEqual([])
    expect(typedFacts(undefined)).toEqual([])
  })

  it('and it is capped, because it is untrusted free text in a prompt', () => {
    const out = typedFacts('x'.repeat(5000)).join('')
    expect(out.length).toBeLessThan(3000)
  })
})

// §8a.3 Q4 — WHOSE PRODUCT THE CTA POINTS AT.
//
// The blueprint brief has always told the model WHAT to point the CTA at
// (`- Product or offer the CTA should point at: ${offer}`) and never WHOSE it
// is. Those are different facts, and the second changes what may be said:
//
//   * A creator may promise what their OWN product does. They control it and
//     they are accountable for it.
//   * They may NOT promise what someone else's does — not its support, not its
//     refunds, not its roadmap. A script saying "my product" over an affiliate
//     link is wrong about the world, and the creator is the one who reads it
//     aloud to their audience.
//   * With NOTHING TO SELL, a model given an offer field and asked for a CTA
//     will write one anyway — inventing a business, which the plan calls the
//     most expensive failure this product can produce.
//
// It is also the input §2.3's container rule has been missing: the three routes
// that fill a `[SHOW: …]` slot branch on this answer, which is why it is a
// CHOOSER and not free text. "I do affiliate stuff mostly" is a fine thing for a
// human to say and useless to a rule that has to take a branch.
//
// NO MIGRATION. `promotes` was already in `BRIEF_STORED_KEYS` and already in
// 0109's CHECK key set, so `brand_voices.pre_script_brief` accepts it and the
// column GRANT already covers it. Verified before writing one.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  BRIEF_PROMOTES, BRIEF_STORED_KEYS, readStoredBrief, sanitizeBriefForWrite,
} from '../preScriptBrief'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')

describe('the vocabulary is closed, because a branch cannot be taken on a sentence', () => {
  it('has exactly the three routes §2.3 defines', () => {
    expect([...BRIEF_PROMOTES]).toEqual(['own_product', 'affiliate', 'nothing_to_sell'])
  })

  it('round-trips a real answer', () => {
    expect(readStoredBrief(sanitizeBriefForWrite({ promotes: 'affiliate' })).promotes)
      .toBe('affiliate')
  })

  it('DROPS an out-of-vocabulary value rather than passing it to a prompt', () => {
    // The failure this prevents is worse than the `goal` equivalent. An
    // unparseable goal degrades a prompt; an unparseable `promotes` sends the
    // container rule down a route the creator never chose.
    expect(readStoredBrief({ promotes: 'my own thing i guess' }).promotes).toBeUndefined()
    expect(readStoredBrief({ promotes: 'own_product' }).promotes).toBe('own_product')
  })

  it('unanswered stays unanswered — never defaulted to own_product', () => {
    // A default here would be the system deciding a liability-adjacent fact
    // nobody asked about, and deciding it in the direction that permits the
    // most claims.
    expect(readStoredBrief({}).promotes).toBeUndefined()
    expect(sanitizeBriefForWrite({ promotes: null })).toEqual({})
  })
})

describe('storage needed no migration, and that is checked rather than assumed', () => {
  const sql = readFileSync(
    resolve(REPO, 'supabase/migrations/0109_pre_script_brief.sql'), 'utf8')

  it('`promotes` is a stored key', () => {
    expect([...BRIEF_STORED_KEYS]).toContain('promotes')
  })

  it("0109's CHECK already permits it", () => {
    // If this ever fails, the write fails in production with a constraint
    // violation naming nothing useful — the exact shape of the two column-grant
    // incidents this tree has already had.
    expect(sql).toContain("'promotes'")
  })
})

describe('the blueprint brief tells the model whose product it is', () => {
  const fn = readFileSync(
    resolve(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

  it('appends the line to the CTA instruction', () => {
    expect(fn).toContain('- Product or offer the CTA should point at: ${offer}${promotesLine}')
  })

  it('branches on all three answers', () => {
    for (const mode of BRIEF_PROMOTES) {
      expect(fn).toContain(`brief.promotes === '${mode}'`)
    }
  })

  it('AFFILIATE forbids the ownership claim explicitly', () => {
    // The instruction has to name the words, because "be careful" is not
    // something a model can act on. This is the one branch where a wrong script
    // makes the creator say something untrue about a third party.
    const affiliate = fn.slice(fn.indexOf("brief.promotes === 'affiliate'"))
    expect(affiliate).toMatch(/my product/i)
    expect(affiliate).toMatch(/refunds|support|roadmap/i)
  })

  it('NOTHING TO SELL suppresses the purchase CTA rather than leaving it implied', () => {
    // Silence is not enough: given an offer field and no instruction, a model
    // asked for a CTA writes one.
    const nothing = fn.slice(fn.indexOf("brief.promotes === 'nothing_to_sell'"))
    expect(nothing).toMatch(/do not write a purchase or signup cta/i)
  })

  it('an UNANSWERED brief emits nothing into the prompt', () => {
    // The same three-state rule the claims block follows: no answer means no
    // sentence, not a sentence saying there is no restriction.
    expect(fn).toMatch(/:\s*''\s*\n/)
  })
})

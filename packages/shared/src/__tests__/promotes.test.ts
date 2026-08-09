// Q4 — WHAT APPEARS THAT THE CREATOR DOES NOT OWN.
//
// The blueprint brief has always told the model WHAT to point the CTA at
// (`- Product or offer the CTA should point at: ${offer}`) and never WHOSE it
// is. Those are different facts, and the second changes what may be said:
//
//   * A creator may promise what their OWN product does. They control it and
//     they are accountable for it. That is now established by `workKind`, which
//     MINTS the owned entity — this question no longer re-asks it.
//   * They may NOT promise what someone else's does — not its support, not its
//     refunds, not its roadmap. A script saying "my product" over an affiliate
//     link is wrong about the world, and the creator is the one who reads it
//     aloud to their audience.
//   * A REVIEWER may not repeat the vendor's marketing. Product facts and their
//     own experience are the whole of what a review is built from; anything more
//     is an advertisement wearing a review's clothes.
//   * With NOTHING of anyone else's, a model given an offer field and asked for
//     a CTA will still reach for a third-party product — inventing one, which
//     the plan calls the most expensive failure this product can produce.
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
  it('has exactly the four routes, and NONE of them asserts ownership', () => {
    // Ownership left this vocabulary deliberately: `workKind` implies it for
    // four of its seven answers, and a question that re-asks what another
    // answer already established is the defect the standing rule names.
    expect([...BRIEF_PROMOTES]).toEqual(['affiliate', 'sponsor', 'review_only', 'none'])
    expect([...BRIEF_PROMOTES]).not.toContain('own_product')
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
    expect(readStoredBrief({ promotes: 'sponsor' }).promotes).toBe('sponsor')
  })

  it('MAPS a brief written before the split rather than dropping it', () => {
    // Both legacy values spoke about ownership, which `workKind` now answers
    // better, and neither said anything about a third party — so both become
    // `none`. Dropping them instead would silently re-ask a question the
    // creator already answered.
    expect(readStoredBrief({ promotes: 'own_product' }).promotes).toBe('none')
    expect(readStoredBrief({ promotes: 'nothing_to_sell' }).promotes).toBe('none')
  })

  it('unanswered stays unanswered — never defaulted', () => {
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

  it('branches on all four answers', () => {
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

  it('REVIEW_ONLY forbids repeating the vendor’s marketing', () => {
    // The branch that makes `review_only` worth having as its own value. A
    // reviewer who repeats marketing copy has made an advertisement, and the
    // distinction is invisible to a model unless it is stated.
    const review = fn.slice(fn.indexOf("brief.promotes === 'review_only'"))
    expect(review).toMatch(/marketing claims/i)
    expect(review).toMatch(/purchase cta/i)
  })

  it('SPONSOR requires the disclosure rather than suggesting it', () => {
    const sponsor = fn.slice(fn.indexOf("brief.promotes === 'sponsor'"))
    expect(sponsor).toMatch(/disclos/i)
    expect(sponsor).toMatch(/not optional/i)
  })

  it('NONE stops the model reaching for a third-party product', () => {
    // Silence is not enough: given an offer field and no instruction, a model
    // asked for a CTA writes one.
    const nothing = fn.slice(fn.indexOf("brief.promotes === 'none'"))
    expect(nothing).toMatch(/do not introduce, recommend or name a third-party product/i)
  })

  it('an UNANSWERED brief emits nothing into the prompt', () => {
    // The same three-state rule the claims block follows: no answer means no
    // sentence, not a sentence saying there is no restriction.
    expect(fn).toMatch(/:\s*''\s*\n/)
  })
})

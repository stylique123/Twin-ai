// THE HOOKS NOBODY CHECKED.
//
// ⚠️ `hook_options[0]` is copied into the first script beat, so it faces
// `entitlementFailures` like every other line. Options 1-4 face only the
// placeholder and generic-promise filters — and the creator picks from all five.
// The hook is the most claim-dense line in a short-form video and the one most
// likely to reach for a personal history to earn attention.
//
// Measured across two 112-case runs: 1 alternate hook in 555 carries a
// first-person history, 0 recommended hooks do.
//
// ⚖️ DROPPED, NOT ESCALATED. The edge already argues the principle for its
// placeholder filter — "Hooks are REPAIRABLE because five are generated and one
// is chosen" — and this reuses it rather than inventing a second policy.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claimStrength } from '../claimEntitlement'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the hook filter reuses the claim rule instead of restating it', () => {
  it('runs entitlementFailures over the hooks, not a second copy of the rule', () => {
    // ⚠️ THREE COPIES OF THE CTA RULE AGREEING WITH EACH OTHER let 16 purchase
    // CTAs ship. A hook-specific reimplementation of claim strength would be a
    // fourth copy of the same mistake.
    expect(EDGE).toMatch(/entitlementFailures\(hooks\.map\(\(line\) => \(\{ line \}\)\), suppliedForCheck\)/)
    expect(EDGE).toMatch(/event: 'hooks_unentitled'/)
  })

  it('runs AFTER the knowledge it checks against exists', () => {
    // Ordering is the whole contract: a filter above `suppliedForCheck` would
    // silently compare against nothing and drop hooks at random.
    expect(EDGE.indexOf('const suppliedForCheck'))
      .toBeLessThan(EDGE.indexOf("event: 'hooks_unentitled'"))
  })

  it('never empties the hook list', () => {
    // An empty list is a worse outcome than an overreaching hook — the creator
    // is left with nothing to say. Same rule the placeholder filter uses.
    expect(EDGE).toMatch(/if \(bad\.size > 0 && kept\.length > 0\)/)
    expect(EDGE).toMatch(/if \(hooks\.length > 1\)/)
  })

  it('never fails a generation on the filter', () => {
    // The creator has already paid and waited. A hook-quality pass is not worth
    // a 500 to anyone.
    const block = EDGE.slice(EDGE.indexOf('THE HOOKS NOBODY CHECKED'))
    expect(block.slice(0, block.indexOf('substanceIssues(declared')))
      .toMatch(/catch \{ \/\* never fail a generation on a hook filter \*\/ \}/)
  })
})

describe('the hook this was found by, and the ones it must not touch', () => {
  it('reads the real corpus hook as a personal history', () => {
    // Verbatim from matrix-112, nathan, hook_options[1]. Only licensed by
    // experience-level evidence; without it the creator reads a fabricated life
    // event off a teleprompter.
    expect(claimStrength('I used to have so many failed 3D prints, until I started doing this.'))
      .toBe('history')
  })

  it('leaves ordinary hooks alone, which is what makes the drop affordable', () => {
    // ⚖️ THE COST OF BEING WRONG HERE IS A DISCARDED HOOK, but four false
    // positives empties the list and the guard above then keeps everything —
    // so an over-eager rule degrades to no rule rather than to no hooks.
    for (const h of [
      'This hidden iPhone feature will change how you use your phone.',
      "You're missing out if you don't know this iPhone trick.",
      'Stop scrolling! This iPhone secret is a game-changer.',
      'Google does NOT want you to buy these 3 phones, and I\'m going to tell you why.',
    ]) {
      expect(claimStrength(h), h).toBe('discussion')
    }
  })
})

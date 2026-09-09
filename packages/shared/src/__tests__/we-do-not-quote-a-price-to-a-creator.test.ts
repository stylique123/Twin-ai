import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

/**
 * ⚠️ THE CATEGORY IS "A PER-ACTION PRICE CLAIM IN CREATOR-FACING COPY", not
 * the one sentence that prompted this test.
 *
 * `brand.ts` states the rule the whole product is built on:
 *
 *     Users NEVER see credits or per-action costs. They see plans framed as a
 *     simple monthly recreation allowance.
 *
 * The refusal screen said a build from your own idea "costs nothing extra" —
 * twice. That is a per-action price, and it is worse than merely off-brand:
 *
 *   1. The client CANNOT KNOW it. `brand.ts` says so itself — "the real
 *      per-recreation cost is env-driven SERVER-SIDE (RECREATION_COST in
 *      generate-blueprint)". The web app was quoting a number it does not read.
 *   2. "Extra" implies the refused attempt cost something, in the same
 *      paragraph that says "No remix was used". The copy contradicted itself.
 *
 * A rule stated in a comment and enforced by nobody is the defect class this
 * repository keeps paying for, so it is checked rather than remembered.
 *
 * ⚖️ COMMENTS ARE STRIPPED FIRST, DELIBERATELY. `V2Create.tsx` carries the
 * same phrase in a code comment about reusing an idempotency key — accurate,
 * internal, and not something a creator reads. A guard that cannot tell those
 * apart would be answered by deleting a true comment, so it strips them and
 * judges only what can reach a screen.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const WEB = join(REPO, 'apps/web/src')

// Phrases that quote a per-action PRICE to a creator. Each is a claim the
// client cannot verify, because the cost lives in a server-side env var.
//
// ⚠️ BARE "costs nothing" IS DELIBERATELY NOT HERE, and the first version of
// this list had it. Onboarding says "a suggestion you ignore costs nothing and
// a missing one costs a video" — a cost measured in VIDEOS, about attention,
// naming no price at all. Matching it would have made this guard answerable by
// rewriting a true sentence, which is how a guard starts being worked around.
// What is matched is a comparative or absolute claim about MONEY: "extra",
// "charge", "free". If you widen this, check that sentence still passes.
const PRICE_CLAIMS = [
  /costs? (?:you )?(?:nothing|no more) extra/i,
  /no extra (?:cost|charge)/i,
  /(?:at|for) no (?:extra )?(?:cost|charge)/i,
  /free of charge/i,
  /won'?t cost you/i,
]

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) tsxFiles(full, out)
    else if (name.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('we do not quote a price to a creator', () => {
  it('no creator-facing string claims an action costs nothing', () => {
    const offenders: string[] = []
    for (const file of tsxFiles(WEB)) {
      const body = stripComments(readFileSync(file, 'utf8'))
      for (const claim of PRICE_CLAIMS) {
        const m = claim.exec(body)
        if (m) offenders.push(`${relative(REPO, file)}: "${m[0]}"`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('the guard reads copy and ignores comments — proven on both', () => {
    // A comment carrying the phrase is not a price claim to anyone.
    const commented = stripComments('// forward or a refresh reuses this one and costs nothing extra.\n')
    expect(PRICE_CLAIMS.some((r) => r.test(commented))).toBe(false)

    // Nor is a cost measured in videos. This is the shipped Onboarding line.
    const inVideos = 'a suggestion you ignore costs nothing and a missing one costs a video'
    expect(PRICE_CLAIMS.some((r) => r.test(inVideos))).toBe(false)

    // The exact sentence this test was written for is caught.
    const shipped = '<p>You can build from your own idea now, which costs nothing extra.</p>'
    expect(PRICE_CLAIMS.some((r) => r.test(stripComments(shipped)))).toBe(true)
  })

  it('brand.ts still states the rule this test enforces', () => {
    // If someone deletes the rule, this guard must not keep enforcing a policy
    // the product no longer holds — it should fail and be re-decided.
    const brand = readFileSync(join(REPO, 'packages/shared/src/brand.ts'), 'utf8')
    expect(brand).toContain('Users NEVER see credits or per-action costs')
  })
})

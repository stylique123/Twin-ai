// A PROSE CLAIM ABOUT WIRING CANNOT NOTICE WHEN IT STOPS BEING TRUE.
//
// ⚠️ THE CASE THAT FORCED THIS FILE, AND IT IS NOT A HYPOTHETICAL. On
// 2026-08-30 a comment was added to `productEntity.ts` stating, correctly and
// with measurements, that `affiliateUrl` had NO writer and NO reader. It was
// true when written. It was false NINE HOURS LATER -- falsified by the same
// author, in the next PR, adding the Product Library box that writes it, having
// read that very comment on the way past.
//
// Nothing failed. Nothing could: the claim was prose, and prose does not run.
// That is the identical shape as the other four defects found that night --
// a Section comment describing an accordion built once out of eleven times, a
// population figure measured six days earlier, a proxy rung declared to exist
// and never invoked. Each was true once and rotted in silence.
//
// ⚖️ SO THE CLAIM IS ASSERTED, NOT DESCRIBED. The counts below are the comment.
// Add a writer or a reader and this test fails, which is the point: it converts
// "somebody should update that comment" into "the build stops until somebody
// does". Same mechanism as `questionAudit`, whose verdicts break on purpose
// when a reader is wired -- the one unit no stale note ever corrupted.
//
// ⚖️ WHAT THIS DELIBERATELY IS NOT. It does not scan for comments and try to
// parse claims out of them; that would be a guess engine producing noise. It
// pins a SMALL, HAND-CHOSEN set of facts that are load-bearing, cheap to
// count, and have already rotted at least once. A guard covering everything
// would be ignored within a week.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..', '..')

/** Every source file under a directory, minus tests -- a claim about wiring is
 *  a claim about PRODUCTION code, and a test that mentions a field is not a
 *  reader of it. Conflating the two is how `promoteToAffiliate` looked wired
 *  while having zero real callers. */
function sourceFiles(rel: string): string[] {
  const root = join(REPO, rel)
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
    }
  }
  walk(root)
  return out
}

function occurrences(files: string[], needle: string): number {
  let n = 0
  for (const f of files) {
    const body = readFileSync(f, 'utf8')
    n += body.split(needle).length - 1
  }
  return n
}

describe('affiliateUrl: the claim in productEntity.ts, asserted', () => {
  it('is WRITTEN — the half that changed under us', () => {
    // ⚠️ THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT THE ROT. Before #621 this
    // was zero and the comment said so. #621 made it nonzero and the comment
    // did not notice. Now it must.
    const web = sourceFiles('apps/web/src')
    const shared = sourceFiles('packages/shared/src')
    const writes = occurrences(web, 'affiliateUrl:') + occurrences(shared, 'affiliate_url = edit')
    expect(writes, 'affiliateUrl has no writer — if that is intended, the comment in productEntity.ts must say so again').toBeGreaterThan(0)
  })

  it('is NOT read by the writer — the half that is still true', () => {
    // ⚖️ AND THIS ONE IS EXPECTED TO FAIL ONE DAY, ON PURPOSE. When somebody
    // finally wires the second query the comment describes, this breaks and
    // forces the note to be rewritten in the same PR. A guard whose failure is
    // planned is not a nuisance; it is a handover.
    // ⚠️ CODE LINES ONLY, AND THIS FILE ALREADY MADE THE OPPOSITE MISTAKE ONCE.
    // The `<Section` assertion below originally counted three where the truth
    // was one, because it matched the two mentions inside the comment it exists
    // to protect. This assertion had the identical defect and it fired: a
    // comment in generate-blueprint that merely NAMES affiliateUrl — while
    // explaining that a nine-hour-old claim about it went stale — was counted
    // as generate-blueprint reading it. A guard that cannot tell a mention from
    // a call will be silenced rather than believed the first time it cries
    // wolf, and this one is meant to survive until somebody really wires it.
    //
    // ⚖️ WHOLE-LINE COMMENTS ONLY, NOT TRAILING ONES. Stripping from `//` to end
    // of line would also eat a real read sitting after a string containing
    // "https://" — a false NEGATIVE in the exact guard that is supposed to
    // notice a wiring. Over-strip and it stops catching; this way it only stops
    // miscounting.
    const blueprint = [join(REPO, 'supabase/functions/generate-blueprint/index.ts')]
    const codeOnly = readFileSync(blueprint[0], 'utf8')
      .split('\n')
      .filter((l) => {
        const t = l.trim()
        return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
      })
      .join('\n')
    const reads =
      codeOnly.split('affiliate_url').length - 1 + (codeOnly.split('affiliateUrl').length - 1)
    expect(
      reads,
      'generate-blueprint now reads affiliateUrl — update the note in productEntity.ts, which still says it does not',
    ).toBe(0)
  })

  it('the query that would make a naive reader dead is still shaped that way', () => {
    // ⚠️ THE REASON A READER IS HARD, PINNED. `ownedEntity` is filtered to owned
    // relationships, so a line hung off its `affiliate_url` can never fire. I
    // wrote that line, checked this filter, and deleted it. If the filter ever
    // widens, the note's advice becomes wrong and this fails to say so.
    const src = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(src).toContain(".in('relationship', ['OWN_PRODUCT', 'OWN_SERVICE'])")
  })
})

describe('the Section component: the count its comment rests on', () => {
  it('is used exactly once, which is what the comment now says', () => {
    // #616 rewrote a comment claiming a whole-screen accordion after measuring
    // ONE usage against eleven fields. That count is the comment; pin it.
    //
    // ⚠️ JSX LINES ONLY, AND THE FIRST VERSION OF THIS GUARD GOT IT WRONG. A
    // plain `split('<Section')` counted THREE: the one real usage plus two
    // mentions inside the very comment this test exists to protect. A guard
    // that counts its own documentation is measuring the wrong thing, and it
    // would have gone green again the moment somebody edited the prose.
    const src = readFileSync(join(REPO, 'apps/web/src/pages/Onboarding.tsx'), 'utf8')
    const uses = src.split('\n').filter((l) => l.trim().startsWith('<Section')).length
    expect(uses, 'the number of <Section> usages moved — the comment above `function Section` describes the old shape').toBe(1)
  })
})

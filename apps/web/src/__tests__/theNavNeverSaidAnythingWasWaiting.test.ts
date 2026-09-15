// A DERIVED STATE THAT ONLY ONE SCREEN READ.
//
// Part 7 defect 7: "No badge on Products — nobody knows to go there.
// `productLifecycle` already derives the state."
//
// ⚠️ THE MUTANT THIS FILE EXISTS FOR IS "THE BADGE IS NEVER RENDERED", which
// was the shipped state and which every unit test of the counting rule passes
// happily. `productAttention.ts` can be perfect and the nav can still say
// nothing, because the count reaching a screen is a separate fact from the
// count being right.
//
// ⚖️ SO THIS READS THE SOURCE, the same way `products-route-is-in-app` does for
// the route list. Mounting `AppShell` would drag in the auth context, the router,
// framer-motion and a products fetch to assert one span; the wiring is a
// property of the file, and the file is what is checked.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const shell = readFileSync(join(here, '..', 'components', 'AppShell.tsx'), 'utf8')

// ⚠️ THIS EXISTS BECAUSE MY FIRST ANCHOR WAS WRONG, AND THE FIX BELONGS IN THE
// ANCHOR RATHER THAN IN THE ASSERTION. "No local re-implementation of the state
// list" is the right rule, but matching the raw file also matched the COMMENT in
// AppShell that explains why photographs count as a source — which is prose
// worth keeping. Comments are stripped so the rule is strict about code and
// blind to the explanation of it. Re-anchor, do not re-litigate.
const code = shell
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/\s*\/\/.*$/, ''))
  .join('\n')

describe('the Products nav entry', () => {
  it('reads the count from shared rather than re-deriving it', () => {
    expect(shell).toMatch(/productsNeedingAttention/)
    // ⚠️ NOT A LOCAL RE-IMPLEMENTATION. A second copy of "which states are
    // waiting" in the shell is how the badge and the Product Library would
    // come to disagree about the same product.
    expect(code).not.toMatch(/NEEDS_SOURCE|IMPORT_FAILED|NOTHING_FOUND/)
  })

  it('actually renders the number on the /products item', () => {
    expect(shell).toMatch(/n\.to === '\/products' && productsWaiting > 0/)
    expect(shell).toMatch(/\{productsWaiting\}/)
  })

  it('renders nothing at all when no product is waiting', () => {
    // The badge is guarded on `> 0`, so a tidy library gets no ornament. A
    // zero in a pill reads as a task.
    expect(shell).toMatch(/productsWaiting > 0/)
  })

  it('counts photographs the way productLifecycle does', () => {
    // A row with images and no link is READING, not NEEDS_SOURCE. Passing a
    // photo count is what stops the badge overstating the backlog the way the
    // SQL measurement did.
    expect(shell).toMatch(/photoCountOf/)
    expect(shell).toMatch(/productsNeedingAttention\(rows, photoCountOf\)/)
  })

  it('names the count for a screen reader instead of leaving a bare number', () => {
    expect(shell).toMatch(/aria-label=\{`\$\{productsWaiting\}/)
    // Singular and plural, because "1 products need your attention" is the kind
    // of detail that tells someone nobody read the screen aloud.
    expect(shell).toMatch(/productsWaiting === 1 \? 'product needs' : 'products need'/)
  })

  it('fetches once per mount, not once per route change', () => {
    // AppShell wraps every app page. Keying the fetch to `pathname` would buy a
    // products request per navigation for a number that changes when she edits
    // a product.
    const hook = shell.slice(shell.indexOf('function useProductsWaiting'))
    const body = hook.slice(0, hook.indexOf('\n}'))
    expect(body).toMatch(/\}, \[\]\)/)
    expect(body).not.toMatch(/pathname/)
  })

  it('fails to zero so a broken products request cannot take the shell down', () => {
    const hook = shell.slice(shell.indexOf('function useProductsWaiting'))
    const body = hook.slice(0, hook.indexOf('\n}'))
    expect(body).toMatch(/catch/)
    expect(body).toMatch(/useState\(0\)/)
  })
})

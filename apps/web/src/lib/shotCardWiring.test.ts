import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ MEASURED IN PRODUCTION BEFORE ANY OF THIS WAS WRITTEN: 98 of 223 shot-list
 * rows carry a bare ordinal in `shot`, and the card rendered that field as its
 * heading. So a creator scanning their shot list saw a card titled "2".
 *
 * ⚖️ THE GUARD IS ON THE RENDER, NOT ON THE HELPER. `shotLabel` has its own
 * tests; what those cannot catch is the card going back to rendering `s.shot`
 * raw — which is the whole defect.
 */
const SRC = readFileSync(join(import.meta.dirname, '..', 'pages', 'Result.tsx'), 'utf8')

describe('the shot card never renders the raw field', () => {
  it('imports the label helper', () => {
    // ⚖️ WIDENED, NOT WEAKENED. This used to pin the whole import line as a
    // literal, which broke the moment a SECOND shared symbol joined the same
    // import — a formatting fact, not the property. What is still required is
    // exactly what always was: `shotLabel` is imported FROM `@twinai/shared`,
    // not redefined locally.
    const imp = SRC.match(/import \{([^}]*)\} from '@twinai\/shared'/)
    expect(imp, 'nothing is imported from @twinai/shared').not.toBeNull()
    expect(imp![1].split(',').map((x) => x.trim())).toContain('shotLabel')
  })

  // ⚠️ BOTH SITES. The file renders the shot list twice, and a fix applied to
  // one of them leaves the other showing "2" — the exact half-fix this repo
  // keeps finding.
  it('routes every heading through it, at both render sites', () => {
    const routed = SRC.split('shotLabel(s.shot, s.shot_type, s.framing, i)').length - 1
    expect(routed, 'expected both shot-list headings to use shotLabel').toBe(2)
  })

  it('leaves no raw {s.shot} heading behind', () => {
    expect(SRC).not.toMatch(/font-semibold block">\{s\.shot\}</)
  })
})

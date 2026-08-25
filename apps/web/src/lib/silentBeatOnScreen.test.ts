/**
 * ⚠️ THE MEASURED CASE. Generation 9072552b has FOUR beats and THREE of them
 * are "[No spoken audio]" — indices 0, 2 and 3, the last being the Call to
 * Action. `isWhollyPlaceholder` is true for that marker and for the hook
 * placeholders alike, and the Plan screen filled every true with the hook
 * text. So that creator's script showed the SAME HOOK LINE THREE TIMES OUT OF
 * FOUR, once as their call to action.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Result.tsx'), 'utf8')

describe('the hook is never pasted over a deliberate silence', () => {
  // ⚠️ IT MUST GUARD BEFORE THE INDEX BRANCH. A silent beat at index 0 would
  // otherwise still be overwritten by the i === 0 hook substitution — which is
  // exactly where one of the three production cases sits.
  it('silence returns untouched before any substitution runs', () => {
    const at = SRC.indexOf('const updatedScript = b.script.map(')
    expect(at).toBeGreaterThan(-1)
    const body = SRC.slice(at, SRC.indexOf('  })', at))
    const guard = body.indexOf('if (isSilentBeat(s.line)) return s')
    const firstSub = body.indexOf('if (i === 0 && hookText)')
    expect(guard, 'the silence guard is missing').toBeGreaterThan(-1)
    expect(firstSub).toBeGreaterThan(-1)
    expect(guard, 'the silence guard must come first').toBeLessThan(firstSub)
  })

  it('uses the shared check rather than a local regex', () => {
    const imp = SRC.match(/import \{([^}]*)\} from '@twinai\/shared'/)
    expect(imp).not.toBeNull()
    expect(imp![1].split(',').map((x) => x.trim())).toContain('isSilentBeat')
  })
})

describe('silence is shown as silence', () => {
  it('renders plain English instead of the raw marker', () => {
    expect(SRC).toMatch(/No one speaks here\./)
  })

  // ⚖️ NO QUOTE MARKS. Quoting it says somebody says it.
  it('and not inside quote marks', () => {
    const at = SRC.indexOf('No one speaks here.')
    const around = SRC.slice(at - 120, at + 40)
    expect(around).not.toMatch(/“\{?\s*No one speaks/)
  })

  // ⚠️ THE MARKER ITSELF NEVER REACHES THE CREATOR.
  it('the bracketed note is never rendered as a spoken line', () => {
    expect(SRC).not.toMatch(/“\{s\.line\}”\s*<\/p>\s*$/m)
    expect(SRC).toMatch(/isSilentBeat\(s\.line\)\s*\?/)
  })
})

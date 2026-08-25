/**
 * ⚠️ A NUMBER NOBODY RENDERS TELLS NOBODY ANYTHING. The shared module is fully
 * tested; that proves the arithmetic, not that a creator ever sees it. The Plan
 * screen renders the script in TWO places (the wide layout and the narrow one),
 * and a fix applied to one of them is not a fix — that exact half-fix was
 * caught here on the shot-card change.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Result.tsx'), 'utf8')

describe('the length reaches the screen', () => {
  it('is computed from the repaired script, not the raw blueprint', () => {
    // ⚠️ `updatedScript` HAS THE CHOSEN HOOK SUBSTITUTED IN. Timing `b.script`
    // would time a placeholder the creator will never say.
    expect(SRC).toMatch(/const lengthLine = lengthSentence\(measureScriptLength\(updatedScript\)\)/)
  })

  it('is rendered at BOTH script surfaces, not one', () => {
    const rendered = SRC.match(/\{lengthLine\}/g) ?? []
    expect(rendered.length).toBe(2)
  })

  // ⚖️ EACH ONE SITS WITH ITS OWN SCENE COUNT. Two renders in the same layout
  // would satisfy the count above while leaving the other layout silent.
  it('and each sits beside a scene count', () => {
    const counts = SRC.match(/\{updatedScript\.length\} scenes<\/span>\s*<\/div>\s*<p[^>]*>\{lengthLine\}<\/p>/g) ?? []
    expect(counts.length).toBe(2)
  })
})

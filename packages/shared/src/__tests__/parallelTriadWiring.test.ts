// A DETECTOR NOBODY RENDERS MEASURES NOTHING THE CREATOR SEES.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'Result.tsx'), 'utf8')

describe('the parallel-triad note is computed AND rendered once per script (Voice Cause 2)', () => {
  it('imports the detector', () => {
    expect(SRC).toMatch(/parallelTriadsIn/)
    expect(SRC).toMatch(/parallelTriadNote/)
  })

  it('computes it across every non-silent line in the script', () => {
    expect(SRC).toMatch(/const triadNote = parallelTriadNote\(/)
  })

  // ⚠️ THE FAILURE THIS CATCHES: computed but never interpolated into JSX.
  it('the computed note is actually rendered', () => {
    expect(SRC).toMatch(/\{triadNote && \(/)
  })
})

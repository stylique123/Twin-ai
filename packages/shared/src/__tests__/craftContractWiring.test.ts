// A DETECTOR NOBODY RENDERS MEASURES NOTHING THE CREATOR SEES.
//
// ⚠️ THE SAME GUARD `parallelTriadWiring.test.ts` RUNS, for the same reason and
// against the same failure: five contracts computed into a variable that is
// never interpolated are five checks that exist only in the test suite.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'Result.tsx'), 'utf8')

describe('the Wave 3 craft contracts are computed AND rendered', () => {
  it('imports the collector', () => {
    expect(SRC).toMatch(/craftContractNotes/)
  })

  it('computes it over the whole script', () => {
    expect(SRC).toMatch(/const craftNotes = craftContractNotes\(script\)/)
  })

  it('every note that fires is actually rendered', () => {
    expect(SRC).toMatch(/\{craftNotes\.map\(/)
  })
})

/**
 * ⚠️ THE MODULE'S ARITHMETIC IS TESTED ELSEWHERE. What those tests cannot
 * catch is the note never reaching the card — the "written but unread" defect
 * this rebuild keeps finding.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Result.tsx'), 'utf8')

describe('the note reaches the script card', () => {
  it('uses the shared check, not a local list', () => {
    const imp = SRC.match(/import \{([^}]*)\} from '@twinai\/shared'/)
    expect(imp).not.toBeNull()
    const named = imp![1].split(',').map((x) => x.trim())
    expect(named).toContain('stockPhrasesIn')
    expect(named).toContain('stockPhraseNote')
  })

  it('renders beside the spoken line', () => {
    expect(SRC).toMatch(/stockPhraseNote\(stockPhrasesIn\(s\.line\)\)/)
  })

  // ⚖️ CONDITIONAL. A line with nothing stock in it must show no note at all —
  // an empty advisory strip on every card is noise, and reads as a verdict.
  it('is conditional, so a clean line shows nothing', () => {
    const at = SRC.indexOf('stockPhraseNote(stockPhrasesIn(s.line)) &&')
    expect(at, 'the note must be guarded').toBeGreaterThan(-1)
  })

  // ⚠️ NEVER ON A SILENT BEAT. "No one speaks here." has no spoken words to
  // swap, so a note beside it would be advice about nothing.
  it('is suppressed where nobody speaks', () => {
    expect(SRC).toMatch(/\{!isSilentBeat\(s\.line\) && stockPhraseNote\(stockPhrasesIn\(s\.line\)\)/)
  })

  // ⚖️ IT NEVER BLOCKS. The note is advisory; nothing about it may gate
  // recording, disable a control, or drop the line.
  it('does not gate anything', () => {
    const at = SRC.indexOf('stockPhraseNote(stockPhrasesIn(s.line)) &&')
    const block = SRC.slice(at, at + 400)
    expect(block).not.toMatch(/disabled|cannot|blocked|return null/)
  })
})

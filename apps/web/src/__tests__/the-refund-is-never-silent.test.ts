// A REFUND NOBODY MENTIONS READS AS A BROKEN COUNTER.
//
// ⚠️ MEASURED 2026-09-01 on a fresh signup. Five generations produced five
// `-10 blueprint` charges and five `+10 blueprint_refund_quality` refunds, so
// the remix counter fell to 2 and returned to 3 every time. Reported as "I ran
// 4 remixes and it still shows 3".
//
// The counter was right. 50%-71% of each script's beats were `needs_user`, so
// generate-blueprint declined to bill (`script_mostly_questions`) and wrote
// `credits_spent: 0` — a field with ZERO readers in this app until now.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RESULT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Result.tsx'), 'utf8')

const codeLines = (s: string) =>
  s.split('\n').filter((l) => {
    const t = l.trim()
    return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
  }).join('\n')

describe('Result tells the creator when a remix was not charged for', () => {
  it('imports the reader', () => {
    expect(codeLines(RESULT)).toMatch(/notBilledNotice/)
  })

  it('reads the field that records the reversal, not a guess', () => {
    expect(codeLines(RESULT)).toMatch(/credits_spent: gen\.credits_spent/)
  })

  it('actually renders the sentence', () => {
    // The failure this catches: computed into a variable, never interpolated.
    expect(codeLines(RESULT)).toMatch(/\{notBilledNotice\(\{ credits_spent/)
  })
})

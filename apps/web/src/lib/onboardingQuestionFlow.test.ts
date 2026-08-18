// THE SCAN MAY NOT TAKE THE SCREEN AWAY MID-ANSWER.
//
// ⚠️ REPORTED FROM A REAL RUN: five questions announced, three seen, the rest
// gone. The parking of the finished scan was built precisely to stop this, and
// it was defeated one line away — `questionsDone` was `qIndex >= asked.length`,
// and `asked` SHRINKS when an answer removes a later question. The comparison
// flipped true while somebody was reading question two, and the parked profile
// handed the screen over immediately.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { profileQuestionsFor } from '@twinai/shared'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Onboarding.tsx'), 'utf8')

describe('the list really does shrink under the creator', () => {
  it('an answer can remove a later question', () => {
    // ⚠️ THE PRECONDITION FOR THE BUG, ASSERTED SO IT CANNOT BE ARGUED AWAY.
    // If this ever stops being true the guard below is still correct, but the
    // reason for it changes and somebody should know.
    const before = profileQuestionsFor({ workKind: 'saas' } as never)
    const after = profileQuestionsFor({ workKind: 'creator', commercialTies: ['none'] } as never)
    expect(before.length).toBe(6)
    expect(after.length).toBe(5)
  })
})

describe('finishing is something the creator does', () => {
  it('is a state, not a comparison that can flip under them', () => {
    expect(SRC).toMatch(/const \[finished, setFinished\] = useState\(false\)/)
    expect(SRC).toMatch(/const questionsDone = finished \|\| asked\.length === 0/)
    // The old form must not come back.
    expect(SRC).not.toMatch(/questionsDone = qIndex >= asked\.length/)
  })

  it('and only Done or Skip all sets it', () => {
    const sets = SRC.match(/setFinished\(true\)/g) ?? []
    expect(sets.length).toBe(2)
  })

  it('a shrinking list clamps rather than throwing them out of the set', () => {
    // ⚖️ STANDING ON QUESTION FIVE WHEN THE LIST BECOMES FOUR means seeing
    // question four — not being skipped past the remaining ones.
    expect(SRC).toMatch(/const qAt = Math\.min\(qIndex, Math\.max\(asked\.length - 1, 0\)\)/)
    expect(SRC).toMatch(/While we read · \{qAt \+ 1\} of \{asked\.length\}/)
    expect(SRC).toMatch(/id=\{asked\[qAt\]\}/)
  })

  it('and the finished scan still waits rather than interrupting', () => {
    // ⚠️ THE PROPERTY THE WHOLE FIX EXISTS TO RESTORE. Handover happens when
    // BOTH halves are done, and the creator's half now cannot be completed by
    // anything except a tap.
    expect(SRC).toMatch(/if \(questionsDone && readyProfile\) onReady\(readyProfile\)/)
  })
})

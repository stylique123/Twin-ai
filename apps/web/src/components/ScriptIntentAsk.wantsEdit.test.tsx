// "I WANT TO CHANGE SOMETHING" LED NOWHERE.
//
// ⚠️⚠️ REPORTED BY THE OWNER AFTER THREE RUNS: the option's "actual function was
// not observable — unclear whether it opens an edit interface, regenerates the
// script, or does nothing." It recorded `would_edit_first` and the card
// vanished. It was not broken; it was DISHONEST. Of the four options it is the
// only one that names an action, and it performed none.
//
// ⚖️ THE SIGNAL WAS NEVER THE PROBLEM. 154 generations carry ZERO intents, but
// the chain is sound end to end — grants, CHECK, writer, and the owner console
// reads the count. What was missing is the action the label promises.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCRIPT_INTENT_LABELS } from '@twinai/shared'

const HERE = dirname(fileURLToPath(import.meta.url))
const CARD = readFileSync(join(HERE, 'ScriptIntentAsk.tsx'), 'utf8')
const RESULT = readFileSync(join(HERE, '..', 'pages', 'Result.tsx'), 'utf8')

describe('the label still names an action', () => {
  it('so the action has to exist', () => {
    // If this label ever stops promising a change, this whole test is moot —
    // which is why it is asserted rather than assumed.
    expect(SCRIPT_INTENT_LABELS.would_edit_first).toMatch(/change something/i)
  })
})

describe('and now it leads somewhere a change can be made', () => {
  it('fires only for the option that promises it', () => {
    expect(CARD).toMatch(/if \(i === 'would_edit_first'\) onWantsEdit\?\.\(\)/)
  })

  it('AFTER the write, never instead of it', () => {
    // ⚠️ Scrolling someone to the editor on a failed save would hide the
    // failure behind a scroll — the silent-failure shape this repo keeps closing.
    const send = CARD.slice(CARD.indexOf('const send = async'))
    const okAt = send.indexOf('if (ok) {')
    const fireAt = send.indexOf('onWantsEdit?.()')
    expect(okAt).toBeGreaterThan(-1)
    expect(fireAt).toBeGreaterThan(okAt)
    expect(send.slice(0, fireAt)).toMatch(/setDone\(true\)/)
  })

  it('the Result page sends them to the script, which has an anchor to send to', () => {
    expect(RESULT).toMatch(/onWantsEdit=\{\(\) => \{/)
    expect(RESULT).toMatch(/getElementById\('script-section'\)/)
    expect(RESULT).toMatch(/id="script-section"/)
  })
})

describe('the signal survives a caller that cannot offer an editor', () => {
  it('the hook is optional, so the answer still lands without it', () => {
    // A caller with no editor must record the intent exactly as before rather
    // than losing the one event this card exists to collect.
    expect(CARD).toMatch(/onWantsEdit\?: \(\) => void/)
    expect(CARD).toMatch(/onWantsEdit\?\.\(\)/)
  })

  it('and the other three options are unchanged', () => {
    // `would_not_record` still opens the reason question rather than saving
    // alone; `would_record` still sends immediately.
    expect(CARD).toMatch(/if \(i === 'would_not_record'\) setIntent\(i\)/)
    expect(CARD).toMatch(/else void send\(i\)/)
  })
})

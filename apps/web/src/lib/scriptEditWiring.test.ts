// THE REJECTED HALF MUST KEEP REACHING THE LOG.
//
// ⚠️ THE PAIR WAS DISCARDED AT THIS EXACT SEAM FOR THE PRODUCT'S WHOLE LIFE.
// `applyDialogueEdit` compares old against new and returns only the new script,
// so the sentence the creator REJECTED — the half carrying the signal — was
// thrown away. A test that only checks the table exists would not notice it
// being dropped again, because the drop happens in the caller.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const EDITOR = readFileSync(join(HERE, '..', 'components', 'ScriptEditor.tsx'), 'utf8')
const WRITER = readFileSync(join(HERE, 'scriptEdits.ts'), 'utf8')

describe('the editor describes the edit, not just the result', () => {
  it('passes the BEFORE text at both edit sites', () => {
    // The before text is `script.hook` and `s.dialogue` — the values that exist
    // only until the new script replaces them.
    expect(EDITOR).toMatch(/describeEdit\('hook', null, script\.hook, text\)/)
    expect(EDITOR).toMatch(/describeEdit\('dialogue', s\.scene_number, s\.dialogue, text\)/)
  })

  it('records only after the script has durably landed', () => {
    // ⚠️ ORDER IS THE CONTRACT. Recording first would let a telemetry success
    // outlive a failed save, and the log would claim edits the creator lost.
    const commit = EDITOR.slice(EDITOR.indexOf('const commit ='), EDITOR.indexOf('return (\n    <div'))
    expect(commit.indexOf('setScript(durable.script)'))
      .toBeLessThan(commit.indexOf('recordScriptEdit'))
  })

  it('does not await the record, so telemetry cannot slow an edit', () => {
    expect(EDITOR).toMatch(/void recordScriptEdit\(generationId, edit\)/)
  })
})

describe('the writer cannot make a saved edit look unsaved', () => {
  it('swallows every failure and returns a boolean', () => {
    expect(WRITER).toMatch(/catch \(err\)/)
    expect(WRITER).toMatch(/return false/)
    // No throw path: the editor's error message is reserved for real save failures.
    expect(WRITER).not.toMatch(/throw /)
  })

  it('writes BOTH halves', () => {
    // ⚖️ STORING ONLY `after` WOULD REPRODUCE THE EXACT LOSS THIS EXISTS TO END.
    expect(WRITER).toMatch(/before_text: edit\.before/)
    expect(WRITER).toMatch(/after_text: edit\.after/)
  })

  it('refuses to write without an owner rather than relying on RLS to reject it', () => {
    expect(WRITER).toMatch(/if \(!ownerId\) return false/)
  })
})

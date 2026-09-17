// THE FUNCTION CAN BE PERFECT AND THE CALLER CAN STILL IGNORE IT.
//
// ⚠️ THAT IS EXACTLY WHAT HAPPENED. `selectedHook` was passed into
// `ScriptEditor` correctly, `buildRecordingScript` used it correctly, and the
// one line joining them — `loaded ?? safeBuild(...)` — discarded it whenever a
// script had already been persisted. Every piece was right; the wiring was not.
// So `withSelectedHook` being correct is necessary and not sufficient, and this
// file asserts the CALL rather than the function.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, 'ScriptEditor.tsx'), 'utf8')

/** Code only: a rule that counts its own explanatory comment is the guard
 *  failure this repo has already paid for twice. Whole-line comments only —
 *  stripping everything after `//` would delete a real read that follows a
 *  string containing "https://". */
const CODE = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

describe('the chosen hook reaches the persisted script', () => {
  it('a loaded script is passed through withSelectedHook', () => {
    expect(CODE).toMatch(/withSelectedHook\s*\(\s*loaded\s*,\s*selectedHook\s*\)/)
  })

  it('the bare `loaded ?? safeBuild` short-circuit is gone', () => {
    // This is the defect itself, in one line of source.
    expect(CODE).not.toMatch(/loaded\s*\?\?\s*safeBuild/)
  })

  it('selectedHook is still a dependency, so a new choice re-runs the effect', () => {
    expect(CODE).toMatch(/\[\s*generationId\s*,\s*blueprint\s*,\s*selectedHook\s*\]/)
  })

  it('and safeBuild is still there for the first visit, when nothing is persisted', () => {
    // The fix must not remove synthesis: a creator with no script needs one.
    expect(CODE).toMatch(/safeBuild\(generationId, blueprint, selectedHook, ownCtas\)/)
  })

  it('withSelectedHook is imported from shared, not redefined here', () => {
    // A second copy of this rule is the defect class this repo keeps closing.
    expect(CODE).toMatch(/withSelectedHook/)
    expect(CODE).not.toMatch(/function withSelectedHook/)
  })
})

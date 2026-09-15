/**
 * THE PROMPTER CONTAINS ONLY WORDS TO SAY — INCLUDING ON A SCAFFOLD BEAT.
 *
 * ⚠️⚠️ RE-PINNED 2026-09-14, AND THE OLD CLAIM WAS NOT MERELY STALE — IT
 * ASSERTED A SURFACE THE OWNER'S LATER RULING HAD MADE UNREACHABLE. This file
 * used to require a full-screen ask surface on the camera screen ("Only you
 * know this one" / "Say it in your own words"), on the reasoning that a beat
 * with no words is still spoken.
 *
 * ⚖️ THAT WAS OVERRULED BY EVIDENCE, and the ruling is pinned in
 * packages/shared/src/__tests__/theQuestionReachesTheTeleprompter.test.ts:
 * audited on a real session, "What was the situation right before this
 * started?" appeared where the creator's next line should have been, so an
 * ask-ONLY beat now stays off the prompter (`show_in_teleprompter: false`) and
 * asks its question in the editor, where a keyboard is
 * (ScriptEditor.tsx:255,646). The rule is the owner's: the teleprompter
 * contains only words to say.
 *
 * ⚠️ AND THE FIX HAD BEEN APPLIED TO THE BRANCH THAT COULD NOT FIRE. Because
 * ask-only beats are filtered out by `teleprompterScenes`, the `scene?.ask`
 * branch could only ever match the OTHER kind — a SCAFFOLD beat, which has real
 * words AND a blank — and for those it rendered the question INSTEAD of the
 * line. The rule was still broken on the one branch that could reach a camera.
 *
 * MEASURED ON PRODUCTION 2026-09-14 over 111 generations / 667 scenes:
 *
 *     scenes carrying an ask ................. 63   across 30 generations
 *     ask-only, correctly filtered out ....... 62
 *     scaffold, reaching the prompter ......... 1
 *
 * So the full-screen surface rendered once, ever, and did the thing the rule
 * forbids. It is removed as unreachable, and the scaffold's question is now a
 * small static label above the scrolling line.
 *
 * ⚠️ PATHS FROM import.meta.url, NEVER cwd.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'v2', 'V2Capture.tsx'), 'utf8')

/** Whole-line comments dropped, so an assertion never reads the prose that
 *  explains the defect as if it were the defect. Never everything after `//`,
 *  or a real line containing a URL would vanish with it. */
const CODE = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')

describe('the camera screen never renders a question in place of the line', () => {
  it('has no arm that shows the ask INSTEAD of the script', () => {
    // The removed arm was `) : scene?.ask ? (` in the branch chain. Its return
    // would mean a question is once again all the creator sees.
    expect(CODE).not.toMatch(/\) : scene\?\.ask \? \(/)
  })

  it('no longer carries the full-screen ask wording at all', () => {
    // ⚖️ ASSERTED ON THE WHOLE FILE, COMMENTS INCLUDED FOR THE SECOND HALF.
    // "Only you know this one" named the entire beat, which is only true of the
    // ask-only case the prompter must not show. Its absence is the claim.
    expect(SRC).not.toMatch(/Only you know this one/)
    expect(SRC).not.toMatch(/Say it in your own words\./)
  })

  it('the only words dressed as words to read come from the script', () => {
    const arm = CODE.slice(CODE.indexOf('promptScrollRef'))
    expect(arm).toMatch(/words\.map\(\(w, idx\)/)
    // The scroller renders `words`, never `scene.ask`.
    const scroller = arm.slice(0, arm.indexOf('</p>'))
    expect(scroller).not.toMatch(/scene\.ask/)
  })
})

describe('a scaffold beat shows its words, with the blank labelled', () => {
  const arm = SRC.slice(SRC.indexOf('the script glides UP past a fixed read-line') - 3000)

  it('the question renders as a static label ABOVE the scroll', () => {
    const strip = arm.indexOf('Only you know this part')
    const scroll = arm.indexOf('promptScrollRef')
    expect(strip, 'the scaffold label is gone').toBeGreaterThan(-1)
    expect(scroll).toBeGreaterThan(-1)
    expect(strip, 'the label must sit above the line').toBeLessThan(scroll)
  })

  it('the label is GATED ON THE ASK, not merely present', () => {
    // ⚠️ A MUTANT SURVIVED AN EARLIER VERSION OF THIS FILE. Stubbing the
    // condition to `{false ? (` left the wording and its position intact, so
    // assertions about text alone still passed while nothing could render.
    // Presence is not reachability — the condition is the claim.
    const strip = arm.indexOf('Only you know this part')
    const gate = arm.lastIndexOf('{scene?.ask ? (', strip)
    expect(gate, 'the label is not gated on scene.ask').toBeGreaterThan(-1)
    expect(strip - gate).toBeLessThan(400)
    expect(arm.slice(gate, strip + 600)).toMatch(/\{scene\.ask\}/)
  })

  it('the label is not part of the scroll machinery', () => {
    const gate = arm.indexOf('{scene?.ask ? (')
    const strip = arm.slice(gate, arm.indexOf(') : null}', gate))
    expect(strip).not.toMatch(/readCount/)
    expect(strip).not.toMatch(/promptScrollRef/)
    expect(strip).not.toMatch(/words\.map/)
  })

  it('the two wordings are not confused: a part, never the whole beat', () => {
    // "this one" meant the entire beat and belonged to the removed surface;
    // "this part" is a blank inside a line the creator is otherwise reading.
    expect(SRC).toMatch(/Only you know this part/)
  })
})

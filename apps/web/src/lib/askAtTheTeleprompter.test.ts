/**
 * ⚠️ THE SHARED TESTS PROVE THE SCENE EXISTS. They cannot prove the creator
 * ever sees the question — and a scene with `dialogue: null` scrolls an empty
 * teleprompter, which is the same nothing the dropped beat gave them.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'v2', 'V2Capture.tsx'), 'utf8')

describe('the question is on the camera screen', () => {
  it('has its own branch, before the word-scroller', () => {
    const ask = SRC.indexOf('scene?.ask ?')
    const scroller = SRC.indexOf('words.map((w, idx)')
    expect(ask, 'no branch for a beat with a question').toBeGreaterThan(-1)
    expect(scroller).toBeGreaterThan(-1)
    expect(ask, 'the question must be handled before the scroller').toBeLessThan(scroller)
  })

  it('renders the question itself', () => {
    expect(SRC).toMatch(/\{scene\.ask\}/)
  })

  it('says whose job it is, in plain English', () => {
    expect(SRC).toMatch(/Only you know this one/)
    expect(SRC).toMatch(/Say it in your own words\./)
  })

  // ⚖️ NOT STYLED AS A LINE TO READ. Reading the question aloud is the exact
  // failure this whole thread of work exists to end — it is how "Only you can
  // supply this" reached a real teleprompter as dialogue.
  it('is not dressed as teleprompter words', () => {
    const at = SRC.indexOf('scene?.ask ?')
    const block = SRC.slice(at, at + 1400)
    expect(block).not.toMatch(/readCount/)
    expect(block).not.toMatch(/promptScrollRef/)
  })
})

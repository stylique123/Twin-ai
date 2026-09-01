// THE ABSENCE OF A BUTTON IS INDISTINGUISHABLE FROM THE ABSENCE OF A FEATURE.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-01, and this is why the guard exists. Of the
// five source assets ever created, FOUR sit in `uploading` with no storage
// object behind them and one was rejected — `validated_at` is null on all five.
// So `saveState === 'saved'` has never once been reached, the review screen's
// "Turn this into a video" button had never rendered for anyone, and Result's
// "Make my AI edit" was hidden by the same rule one screen later.
//
// A creator reported it as "TwinAI has no editor". Twin has one; it had never
// received a take. Both screens now always render the path and attach the state
// to it, so a failed upload reads as a failed upload rather than as a missing
// product.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const src = (...p: string[]) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', ...p), 'utf8')

const CAPTURE = src('pages', 'v2', 'V2Capture.tsx')
const RESULT = src('pages', 'Result.tsx')

/** Code lines only. A guard that greps source text must tell a mention from a
 *  call — this file's own header names both strings it asserts on. */
const codeLines = (s: string) =>
  s.split('\n').filter((l) => {
    const t = l.trim()
    return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
  }).join('\n')

describe('the review screen always offers the edit path', () => {
  it('renders the button outside any saved-state conditional', () => {
    const code = codeLines(CAPTURE)
    expect(code).toMatch(/Turn this into a video/)
    // The exact shape that hid it: a conditional wrapper keyed on success.
    expect(code).not.toMatch(/saveState === 'saved' && \(\s*<button/)
  })

  it('disables rather than hides it while the take is not saved', () => {
    // ⚠️ `\s` MATTERS: without it this also matches `aria-disabled=`, so the
    //  assertion passed with the real attribute deleted. Caught by mutating it.
    expect(codeLines(CAPTURE)).toMatch(/\sdisabled=\{saveState !== 'saved'\}/)
  })

  it('says why it is disabled, in each state a creator can be in', () => {
    const code = codeLines(CAPTURE)
    expect(code).toMatch(/saveState === 'saving' &&/)
    expect(code).toMatch(/saveState === 'failed' &&/)
    expect(code).toMatch(/saveState === 'idle' &&/)
  })
})

describe('Result offers the edit path before the asset is ready', () => {
  it('no longer gates the whole control on a ready source asset', () => {
    // The removed shape: `serverSourceAssetId && (!editProject || ...)`.
    expect(codeLines(RESULT)).not.toMatch(/\{serverSourceAssetId && \(!editProject/)
  })

  it('disables the button instead, so nothing unsendable is sent', () => {
    expect(codeLines(RESULT)).toMatch(/\sdisabled=\{editStarting \|\| !serverSourceAssetId\}/)
  })

  it('tells the creator the upload is still arriving and may be left alone', () => {
    expect(RESULT).toMatch(/still receiving this take/)
  })
})

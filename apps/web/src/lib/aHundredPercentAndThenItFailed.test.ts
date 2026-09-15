// 100%, AND THEN IT FAILED.
//
// ⚠️ The teleprompter's save panel read:
//
//     saveState === 'saving' && (savePct > 0
//       ? `Saving to your library… ${Math.round(savePct * 100)}%`
//       : 'Saving to your library…')
//
// `savePct` comes from `xhr.upload.onprogress`, which reaches 1.0 when the
// BROWSER FINISHES WRITING THE REQUEST BODY. The server has not answered yet,
// and a refusal — 413 for size, 403 for a dead token — arrives after that
// moment. So the screen asserted the save had all but happened at the exact
// instant it was least entitled to, and then flipped to a failure. A real
// creator watched precisely that.
//
// ⚠️⚠️ AND THE FIX WAS ALREADY WRITTEN, TWICE OVER, AND UNREAD.
// `packages/shared/src/editor/uploadCeiling.ts` states the rule in its own
// words — "BYTES SENT IS NOT BYTES KEPT" — and ships `SaveStage` plus
// `saveStageLabel` with a 'finishing' arm whose comment calls it "the honest
// state between 'bytes left the phone' and 'Twin has it'". MEASURED
// 2026-09-14: `saveStageLabel` had ZERO readers in apps, worker, supabase and
// packages. The upload-door panel on this same screen had independently
// reached the same conclusion in its own private wording ("finishing up…",
// "Upload complete — saving…"), which is the two-copies-of-one-rule shape the
// codebase's conventions exist to prevent.
//
// ⚖️ EXECUTED, NOT READ. The derivation is lifted out of the component and RUN
// across the boundary, because the whole defect is a boundary condition at
// exactly 1.0 and a grep cannot evaluate `>=`.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { saveStageLabel } from '@twinai/shared'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Capture.tsx'), 'utf8')

type Stage = 'uploading' | 'finishing' | null
type Fn = (saveState: string, savePct: number) => Stage

/** ⚠️ THE REAL DECLARATION, LIFTED AND RUN. Bounded on its own final arm. */
function loadFn(): Fn {
  const start = SRC.indexOf('const saveStage:')
  expect(start, 'saveStage not found').toBeGreaterThan(-1)
  const mark = "'finishing' : 'uploading'"
  const end = SRC.indexOf(mark, start) + mark.length
  expect(end).toBeGreaterThan(start)
  const block = SRC.slice(start, end)
  // The type annotation is stripped by the TS loader; the expression is the test.
  const js = transformSync(
    `function __stage(saveState, savePct) { ${block}; return saveStage }`,
    { loader: 'ts', format: 'cjs' },
  ).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return __stage`)() as Fn
}

const stage = loadFn()

describe('the stage is honest at the boundary the defect lived on', () => {
  it('is null before anything is being saved', () => {
    expect(stage('idle', 0)).toBeNull()
    expect(stage('saved', 1)).toBeNull()
    expect(stage('failed', 1)).toBeNull()
  })

  it('is uploading while bytes are still moving', () => {
    for (const p of [0, 0.01, 0.5, 0.9, 0.99, 0.999]) {
      expect(stage('saving', p), `pct ${p}`).toBe('uploading')
    }
  })

  // ⚠️ THE ONE ASSERTION THE WHOLE CHANGE EXISTS FOR.
  it('is finishing at exactly 1.0, never uploading', () => {
    expect(stage('saving', 1)).toBe('finishing')
  })

  it('is finishing above 1.0 too, because a stray overshoot is not progress', () => {
    expect(stage('saving', 1.0001)).toBe('finishing')
    expect(stage('saving', 2)).toBe('finishing')
  })
})

describe('the rendered sentence can never read 100%', () => {
  // ⚠️⚠️ THIS HELPER USED TO RE-COMPOSE THE SENTENCE BY HAND, AND TWO MUTANTS
  // SURVIVED BECAUSE OF IT — `floor` reverted to `round`, and the private
  // wording restored — since mutating the component could not touch a copy
  // living in the test. A test that rebuilds what it is checking is asserting
  // about itself. So the JSX expressions are LIFTED OUT OF THE FILE and run.
  /** The two rendered expressions, extracted and evaluated. JSX drops a false
   *  branch, so the sentence is whichever one is truthy. */
  const sentence = (() => {
    // ⚖️ ANCHORED ON THE CONDITIONS, NOT ON THE WHOLE SENTENCES. Pinning the
    // literal made a wording change abort collection instead of failing an
    // assertion — "no tests ran" is a worse diagnostic than "the label is
    // wrong", and a test should report the defect it found.
    const a = SRC.indexOf("{saveStage === 'uploading'")
    const b = SRC.indexOf("{saveStage === 'finishing'", a)
    expect(a, 'the uploading expression is gone').toBeGreaterThan(-1)
    expect(b, 'the finishing expression is gone').toBeGreaterThan(a)
    // Each `{...}` becomes an array element; the braces are the JSX wrapper.
    const upload = SRC.slice(a + 1, SRC.indexOf('}\n', a))
    const finish = SRC.slice(b + 1, SRC.indexOf('}\n', b))
    const js = transformSync(
      `function __sentence(saveStage, savePct) {
         const parts = [(${upload}), (${finish})]
         return parts.filter((x) => typeof x === 'string').join('')
       }`,
      { loader: 'ts', format: 'cjs' },
    ).code
    // eslint-disable-next-line no-new-func
    const fn = new Function('saveStageLabel', `${js}; return __sentence`)(saveStageLabel) as
      (saveStage: Stage, savePct: number) => string
    return (savePct: number) => fn(stage('saving', savePct), savePct)
  })()

  it('the extraction is not vacuous \u2014 it really renders something', () => {
    expect(sentence(0.5)).toBeTruthy()
    expect(sentence(1)).toBeTruthy()
  })

  it('never puts 100% beside a still-uploading claim', () => {
    // 0.995 rounds to 100 — the case a `> 0.99` threshold would have missed.
    for (const p of [0, 0.5, 0.99, 0.995, 0.999, 1, 1.5]) {
      const s = sentence(p)
      if (s.includes('100%')) {
        throw new Error(`pct ${p} rendered "${s}" — a browser-side 100% presented as progress`)
      }
    }
  })

  it('still shows a number while it is genuinely uploading', () => {
    // ⚖️ THE NUMBER IS NOT COSMETIC. It is the only thing distinguishing a slow
    // upload from a dead one, which this screen's own comment records as the
    // harm that produced the progress callback in the first place.
    // ⚠️⚠️ EQUALITY WITH THE SHARED LABEL, NOT "CONTAINS A NUMBER". Asserting
    // only the digits let a mutant restoring this screen's OWN private wording
    // ("Saving to your library… 50%") pass — which is the second copy of one
    // rule that this whole change exists to remove.
    expect(sentence(0.5)).toBe(`${saveStageLabel('uploading')} 50%`)
    expect(sentence(0.5)).toMatch(/50%/)
    expect(sentence(0.01)).toMatch(/1%/)
    // ⚠️ THE CASE THAT FAILED WHEN THIS FIX STILL ROUNDED. 0.995 rounds to 100
    // and floors to 99 — so the honest sentence is the floored one.
    expect(sentence(0.995)).toMatch(/99%/)
    expect(sentence(0.999)).toMatch(/99%/)
  })

  it('says the honest in-between thing once the bytes are gone', () => {
    expect(sentence(1)).toBe(saveStageLabel('finishing'))
    // And that label is a real sentence, not an empty string dressed as one.
    expect(sentence(1)).toBe('Almost there — making sure Twin has it…')
    expect(sentence(1)).not.toBe(saveStageLabel('uploading'))
  })
})

describe('the shared vocabulary is what the screen reads', () => {
  it('the panel calls saveStageLabel rather than restating the sentences', () => {
    expect(SRC).toMatch(/saveStageLabel\('uploading'\)/)
    expect(SRC).toMatch(/saveStageLabel\('finishing'\)/)
  })

  it('the old literal is gone', () => {
    // Stripped of whole-line comments first: the fix's own comment quotes the
    // defect it replaced, and a raw grep would find the string inside the prose
    // explaining why the string is wrong.
    const code = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/Saving to your library… \$\{Math\.round/)
  })

  it('the terminal arms keep their richer sentences, which no label carries', () => {
    // ⚖️ NOT AN OVERSIGHT — A DECISION. 'saved' as a label is the single word
    // "Saved"; this screen tells the creator the take survives closing the tab,
    // and the failure arm names WHICH of five causes it was.
    expect(SRC).toMatch(/safe even if you close this tab/)
    expect(saveStageLabel('saved')).toBe('Saved')
  })
})

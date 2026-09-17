// THE WRITER WAS TOLD TO INVENT HER ENEMY WHEN NOBODY HAD ASKED HER.
//
// ⚠️ TWO LINES OF THE CREATOR DNA CARD END IN AN INSTRUCTION TO MAKE ONE UP:
// "NONE STORED. Infer the conventional wisdom, bad habit or villain this creator
// would push against" and the same for their point of view. That licence was
// defensible while nothing better existed — `pov` and `enemy` are synthesised
// from scraped captions and a blank there was common — but it means a script can
// hand a creator a stance they have never taken, which is the failure this
// product treats as the most expensive one it can produce.
//
// ⚖️ THE TARGETED PASS NOW ASKS HER TRANSCRIPTS THE SAME TWO QUESTIONS, in words,
// and stores the answer WITH THE SENTENCE SHE SAID. So her real position goes
// first. The invention fallback stays LAST rather than being deleted: removing it
// would leave a thin-scan creator with no stance at all, which the write-time
// enrichment note in that file measured and rejected.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TRACK_A } from '../../../../worker/src/targetedQuestions'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const code = EDGE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('her own answer outranks the synthesis, and both outrank invention', () => {
  it('reads the answers by question id', () => {
    expect(code).toMatch(/const povAnswers = answersTo\('others_disagree'\)/)
    expect(code).toMatch(/const enemyAnswers = answersTo\('pushes_back_against'\)/)
  })

  // ⚠️ THE IDS MUST BE ONES THE EXTRACTOR ACTUALLY WRITES. A reader keyed on an
  // id the bank does not contain is the same defect as a column nobody writes,
  // and it would look exactly like a creator who never answered.
  it('both ids exist in Track A, which runs for every creator', () => {
    const ids = TRACK_A.map((q) => q.id)
    expect(ids).toContain('others_disagree')
    expect(ids).toContain('pushes_back_against')
  })

  it('the order is answer, then synthesis, then invention', () => {
    const pov = code.slice(code.indexOf('const povLine ='), code.indexOf('const enemyLine ='))
    expect(pov.indexOf('povAnswers.length')).toBeLessThan(pov.indexOf('povList.length'))
    expect(pov.indexOf('povList.length')).toBeLessThan(pov.indexOf('NONE STORED'))
    const enemy = code.slice(code.indexOf('const enemyLine ='))
      .slice(0, 600)
    expect(enemy.indexOf('enemyAnswers.length')).toBeLessThan(enemy.indexOf('vp?.enemy'))
    expect(enemy.indexOf('vp?.enemy')).toBeLessThan(enemy.indexOf('NONE STORED'))
  })

  // ⚖️ NOT DELETED. A thin-scan creator with no stance at all is the state the
  // write-time enrichment note measured and rejected, so the fallback stays —
  // just no longer first in line.
  it('the invention fallback still exists, as the last resort', () => {
    expect(code).toMatch(/NONE STORED\. Infer the conventional wisdom/)
    expect(code).toMatch(/NONE STORED\. Infer 1-2 stances/)
  })

  // ⚠️ AN `inferred` ROW IS OUR GUESS ABOUT A PERSON AND MAY NEVER BE SPOKEN —
  // the rule the knowledge block already states. Reading one here would route a
  // guess into the DNA card, which is the one place it would be treated as
  // established fact about her.
  it('an inferred answer is not treated as her position', () => {
    const fn = code.slice(code.indexOf('const answersTo ='))
      .slice(0, 600)
    expect(fn).toMatch(/k\.basis !== 'inferred'/)
  })

  it('an empty answer is no answer, so a blank row cannot silence the fallback', () => {
    const fn = code.slice(code.indexOf('const answersTo ='))
      .slice(0, 800)
    expect(fn).toMatch(/\.filter\(\(a\) => a\.text !== ''\)/)
  })

  it('her words travel with the conclusion', () => {
    expect(code).toMatch(/her words: "\$\{a\.evidence\}"/)
  })

  it('both lines still reach the prompt', () => {
    expect(code).toMatch(/Point of view \(beliefs they repeat[^)]*\): \$\{povLine\}/)
    expect(code).toMatch(/Enemy \(the bad advice \/ villain they push against\): \$\{enemyLine\}/)
  })
})

// A THINKING BUDGET OF ZERO IS NOT A SPEED SETTING, IT IS A MODEL ASSERTION.
//
// ⚠️ THE DEFECT, FOUND ON THE FIRST REAL EXTRACTION AFTER THE PAGE BECAME
// READABLE. The job reached Gemini and came back:
//
//     Gemini 400: Budget 0 is invalid. This model only works in thinking mode.
//
// `thinkingBudget: 0` was copied from an edge-function habit where a different
// model runs. It is legal there and illegal here, and nothing in the type system
// distinguishes the two — the argument is a number either way.
//
// ⚖️ EVERY OTHER `geminiJson` CALLER IN THE WORKER either omits the budget or
// passes a computed one. This was the only site pinning it to a literal zero, so
// the rule the codebase already followed is now written down.
//
// ⚖️ AND THE TASK CLASS IS NAMED RATHER THAN INHERITED. Passing no model landed
// on `modelForTask('profile')` by fallthrough — the choice-by-omission that
// `model_routing_v1.json` exists to make visible. Reading a page into a fixed
// schema is an EXTRACT, the same class `structure.ts` uses.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const JOB = readFileSync(join(HERE, '..', 'jobs', 'extractProduct.ts'), 'utf8')

describe('the extraction call is routed and budgeted deliberately', () => {
  it('does NOT pin the thinking budget to zero', () => {
    // The 5th positional argument to geminiJson. A literal 0 there is the exact
    // shape that returned a 400 from the model this task routes to.
    const call = JOB.slice(JOB.indexOf('await geminiJson('))
    const args = call.slice(0, call.indexOf(') as'))
    expect(args).not.toMatch(/,\s*0\s*,/)
    expect(args).toMatch(/undefined/)
  })

  it('names the task class instead of inheriting one by fallthrough', () => {
    expect(JOB).toMatch(/modelForTask\('extract'\)/)
    expect(JOB).toMatch(/from '\.\.\/modelRouting\.js'/)
  })

  it('routes to a class that exists in the routing file', () => {
    const routing = JSON.parse(
      readFileSync(join(HERE, '..', '..', 'model_routing_v1.json'), 'utf8'))
    expect(Object.keys(routing.taskClasses)).toContain('extract')
  })
})

describe('no worker job pins a zero thinking budget', () => {
  it('holds across every geminiJson caller, not just this one', () => {
    // ⚖️ THE GUARD IS ON THE RULE, NOT ON THE FILE THAT BROKE IT. A second job
    // copying the same edge habit would fail here rather than in production, and
    // the failure mode is a hard 400 that only shows up once a page is readable
    // enough to reach the model at all — which is to say, late.
    const files = ['transcribe.ts', 'voice.ts', 'scrapeDna.ts', 'extractProduct.ts']
      .map((f) => {
        try { return readFileSync(join(HERE, '..', 'jobs', f), 'utf8') } catch { return '' }
      })
      .concat([
        readFileSync(join(HERE, '..', 'voice.ts'), 'utf8'),
        readFileSync(join(HERE, '..', 'structure.ts'), 'utf8'),
      ])
    for (const src of files) {
      for (const m of src.matchAll(/geminiJson\(([\s\S]{0,400}?)\)\s*(?:as|\))/g)) {
        expect(m[1], `a geminiJson call pins thinkingBudget to 0:\n${m[1]}`)
          .not.toMatch(/,\s*0\s*,\s*(?:undefined|modelForTask|'|")/)
      }
    }
  })
})

// PER-TASK MODEL ROUTING (§2.4) — the loader, and the properties that make it
// safe to put an authority over live model choices.
//
// The load-bearing claim is that LANDING THIS CHANGES NO MODEL FOR ANY TASK.
// The catalog encodes what each task already used, so the default path resolves
// to exactly the id it resolved to before — the same property that made wiring
// `pacing` safe. These tests pin that, and they pin the freeze on `decide`,
// which is what keeps a recorded Director decision reproducible.
import { describe, expect, it } from 'vitest'
import { loadModelRouting, modelForTask, taskClassIds } from '../modelRouting.js'
import { DIRECTOR_MODEL } from '../jobs/directorContract.js'

const ROUTING = loadModelRouting()

describe('the catalog', () => {
  it('declares the three classes the code actually has', () => {
    expect(taskClassIds().sort()).toEqual(['decide', 'extract', 'profile'])
  })

  it('every class states a model and an explicit envOverride', () => {
    for (const id of taskClassIds()) {
      const e = ROUTING.taskClasses[id]
      expect(typeof e.model).toBe('string')
      expect(e.model.length).toBeGreaterThan(0)
      // Absent is NOT the same as null. Only an explicit null means frozen, so
      // a class that forgot to say would otherwise read as env-settable.
      expect('envOverride' in e).toBe(true)
    }
  })
})

describe('decide is FROZEN — the provenance property', () => {
  it('carries envOverride null', () => {
    expect(ROUTING.taskClasses.decide.envOverride).toBeNull()
  })

  it('ignores the environment entirely, even when the var is set', () => {
    // A Director decision records its model, and the recorded decision must be
    // replayable from that record. An env-settable model breaks exactly that.
    const env = { GEMINI_MODEL: 'gemini-something-else', GEMINI_FAST_MODEL: 'gemini-other' }
    expect(modelForTask('decide', ROUTING, env)).toBe(ROUTING.taskClasses.decide.model)
  })

  it('agrees with DIRECTOR_MODEL in the runtime contract', () => {
    // The catalog RECORDS this value rather than owning it: directorContract.ts
    // is a byte-for-byte duplicate of the shared authority pinned by a parity
    // test, and the shared module cannot read the worker's catalog. The CI
    // guard checks both copies; this checks the one the worker actually runs.
    expect(ROUTING.taskClasses.decide.model).toBe(DIRECTOR_MODEL)
  })
})

describe('overridable classes honour their own env var, and only their own', () => {
  it('extract takes GEMINI_FAST_MODEL', () => {
    expect(modelForTask('extract', ROUTING, { GEMINI_FAST_MODEL: 'gemini-fast-x' })).toBe('gemini-fast-x')
  })

  it('profile takes GEMINI_MODEL', () => {
    expect(modelForTask('profile', ROUTING, { GEMINI_MODEL: 'gemini-main-x' })).toBe('gemini-main-x')
  })

  it('a class is not moved by ANOTHER class\'s variable', () => {
    expect(modelForTask('extract', ROUTING, { GEMINI_MODEL: 'gemini-main-x' }))
      .toBe(ROUTING.taskClasses.extract.model)
  })

  it('an empty or whitespace override is not an override', () => {
    // An unset-but-present env var is the ordinary state of a shell, and it
    // must not resolve the model to the empty string.
    for (const v of ['', '   ']) {
      expect(modelForTask('extract', ROUTING, { GEMINI_FAST_MODEL: v }))
        .toBe(ROUTING.taskClasses.extract.model)
    }
  })

  it('with NO environment at all, every class resolves to its catalogued model', () => {
    // This is the "landing it changes nothing" property, stated directly.
    for (const id of taskClassIds()) {
      expect(modelForTask(id, ROUTING, {})).toBe(ROUTING.taskClasses[id].model)
    }
  })
})

describe('an unknown task class THROWS rather than defaulting', () => {
  it('names the class and says where to add it', () => {
    // A silent fallback is how a task lands on a model nobody chose, and the
    // recorded provenance would then name a model no catalog entry explains.
    expect(() => modelForTask('invented', ROUTING, {})).toThrow(/unknown task class 'invented'/)
    expect(() => modelForTask('invented', ROUTING, {})).toThrow(/model_routing_v1\.json/)
  })

  it('there is no default entry that could absorb a typo', () => {
    for (const near of ['decide ', 'Decide', 'extraction', '']) {
      expect(() => modelForTask(near, ROUTING, {})).toThrow()
    }
  })
})

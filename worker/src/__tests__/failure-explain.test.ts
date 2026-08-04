// FAILURE AT 11PM — the explain half of Phase 10 item 5.
//
// The test that matters most here is the COVERAGE one: every
// `PermanentJobError` code in the tree must have a class, discovered by reading
// the source rather than by anyone remembering to update a list. A creator-
// facing explanation catalogue that silently misses the code they actually hit
// is the same defect as a gate that goes green without examining anything.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const { explainFailure, explainedCodes } = await import('../jobs/failureExplain.js')

/** Every `new PermanentJobError(..., 'code')` in the worker, read from source. */
function permanentCodesInSource(): string[] {
  const dir = new URL('../jobs/', import.meta.url).pathname
  const found = new Set<string>()
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.ts')) continue
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/new PermanentJobError\([^)]*?'([a-z0-9_]+)'\s*\)/g)) found.add(m[1])
    }
  }
  walk(dir)
  return [...found].sort()
}

describe('COVERAGE — no creator hits a failure nobody classified', () => {
  it('the extractor finds a non-trivial set (it cannot pass by finding nothing)', () => {
    // Guards the guard. A regex that stopped matching would make the coverage
    // assertion below vacuously true, which is the exact shape this repo keeps
    // finding and removing.
    expect(permanentCodesInSource().length).toBeGreaterThan(25)
  })

  it('every PermanentJobError code in the tree has a class', () => {
    const explained = new Set(explainedCodes())
    const missing = permanentCodesInSource().filter((c) => !explained.has(c))
    expect(missing).toEqual([])
  })

  it('retries_exhausted is explained — it is the most common code of all', () => {
    // It is the ONLY code the worker synthesises rather than throwing, so a
    // source-derived list would never contain it.
    expect(explainFailure('retries_exhausted').mapped).toBe(true)
  })

  it('no entry is dead — every explained code is either thrown or synthesised', () => {
    // The other direction. An entry for a code nothing can emit implies the
    // creator can see something they cannot, and rots silently.
    // Scans the WHOLE jobs tree, not a hand-picked few files: an EditPlanError
    // code is just as creator-visible as a PermanentJobError one, and picking
    // three files to grep would make this pass by looking in the wrong place.
    const emitted = new Set([...permanentCodesInSource(), 'retries_exhausted'])
    let src = ''
    const collect = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const q = join(d, e.name)
        if (e.isDirectory()) { collect(q); continue }
        if (e.name.endsWith('.ts')) src += readFileSync(q, 'utf8')
      }
    }
    collect(new URL('../jobs/', import.meta.url).pathname)
    const dead = explainedCodes().filter((c) => !emitted.has(c) && !src.includes(`'${c}'`))
    expect(dead).toEqual([])
  })
})

describe('the four questions a creator is actually asking', () => {
  it('a transient failure says retry, and means it', () => {
    const e = explainFailure('retries_exhausted')
    expect(e.failureClass).toBe('retry_helps')
    expect(e.retryCanHelp).toBe(true)
    expect(e.footageRetained).toBe(true)
  })

  it('a DETERMINISTIC failure does not send them round in circles', () => {
    // The specific way this defect hurts: telling someone to retry a failure
    // that can never clear.
    const e = explainFailure('edit_plan_invalid')
    expect(e.failureClass).toBe('retry_wont_help')
    expect(e.retryCanHelp).toBe(false)
    expect(e.footageRetained).toBe(true)
  })

  it('only the refilm class asks anyone to film again', () => {
    for (const code of explainedCodes()) {
      const e = explainFailure(code)
      const asksToRefilm = /film it again|film or upload it again|shorter take|split it/i.test(e.message)
      if (asksToRefilm) expect(['refilm', 'retry_wont_help']).toContain(e.failureClass)
      if (e.failureClass === 'retry_helps' || e.failureClass === 'our_config') {
        expect(e.message).not.toMatch(/film it again/i)
      }
    }
  })

  it('a missing source asks for a re-upload, not a re-shoot', () => {
    // A real distinction: the video still exists on their phone.
    const e = explainFailure('source_deleted')
    expect(e.failureClass).toBe('reupload')
    expect(e.message).toMatch(/upload it again/i)
    expect(e.message).not.toMatch(/film/i)
  })

  it('a configuration failure blames us and asks for nothing', () => {
    const e = explainFailure('director_no_credentials')
    expect(e.failureClass).toBe('our_config')
    expect(e.footageRetained).toBe(true)
    expect(e.message).toMatch(/on us/i)
  })

  it('a too-large payload tells them the ONE thing they can do about it', () => {
    // "Too big" is the only deterministic failure a creator can fix themselves.
    expect(explainFailure('speech_component_too_large').message).toMatch(/shorter take/i)
  })
})

describe('FAIL SAFE on an unknown code', () => {
  it('an unrecognised code is `unknown`, not a guess', () => {
    const e = explainFailure('something_nobody_classified')
    expect(e.failureClass).toBe('unknown')
    expect(e.mapped).toBe(false)
  })

  it('and never claims a retry will help', () => {
    // Guessing "just retry" for an unclassified code is the circle again.
    expect(explainFailure('something_nobody_classified').retryCanHelp).toBe(false)
  })

  it('but DOES promise the footage is kept, because that is true by construction', () => {
    // A failed project deletes nothing: 0099's purge fires on a media_assets
    // DELETE or status->deleted, and a failed project does neither.
    expect(explainFailure('something_nobody_classified').footageRetained).toBe(true)
  })

  it('null, undefined and empty are handled like any other unknown', () => {
    for (const bad of [null, undefined, '', '   ']) {
      const e = explainFailure(bad as never)
      expect(e.failureClass).toBe('unknown')
      expect(e.mapped).toBe(false)
    }
  })

  it('never throws, whatever it is given', () => {
    for (const bad of [null, undefined, 7, {}, [], true]) {
      expect(() => explainFailure(bad as never)).not.toThrow()
    }
  })
})

describe('every explanation is fit to show a person', () => {
  it('no message leaks a code, a stack, or a table name', () => {
    for (const code of explainedCodes()) {
      const m = explainFailure(code).message
      expect(m).not.toMatch(/_/)               // no snake_case identifiers
      expect(m).not.toMatch(/Error|null|undefined|SELECT|edit_projects/i)
      expect(m.length).toBeGreaterThan(20)
      expect(m.endsWith('.')).toBe(true)
    }
  })

  it('footageRetained is derived from the class, not stored twice', () => {
    for (const code of explainedCodes()) {
      const e = explainFailure(code)
      expect(e.footageRetained).toBe(e.failureClass !== 'refilm' && e.failureClass !== 'reupload')
    }
  })
})

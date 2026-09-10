// THE FIELD BUILT TO NAME THE FAILURE HELD NO INFORMATION, ON EVERY OCCURRENCE.
//
// ⚠️⚠️ MEASURED IN PRODUCTION, 2026-09-10. Thirteen generations were created and
// ALL THIRTEEN took `generate-blueprint`'s rescue path — `ops_events` holds
// exactly 13 `generation_rescued` rows, first 16:14:54Z, last 20:14:13Z, against
// exactly 13 `generations`. `generation_choices` received nothing (its last row
// is 2026-09-08 15:46) and `generation_outcomes` has never held a row, because
// the rescue branch writes neither. None of that was visible, because all 13
// rows record the error as the literal string `[object Object]`.
//
// ⚠️ THE CAUSE IS `String(err)` ON A NON-`Error`, and the rescue's own comment
// calls itself "loud and durable" so that this failure "cannot hide in every
// count". It hid for four hours in the one column written to expose it. The
// throw is STILL unidentified: the record cannot say, and this is the change
// that makes the next occurrence nameable.
//
// ⚖️ EXECUTED, NOT READ. The helper is transpiled out of the edge file and run,
// because a regex over source cannot tell whether a formatter formats.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadDescribeThrown(): (err: unknown) => string {
  const start = EDGE.indexOf('function describeThrown')
  expect(start, 'describeThrown must exist in the edge function').toBeGreaterThan(-1)
  const end = EDGE.indexOf('\n}', start) + 2
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return describeThrown`)() as (err: unknown) => string
}

const describeThrown = loadDescribeThrown()

// ⚠️ THE EXACT STRING THIRTEEN PRODUCTION ROWS CONTAIN. Nothing this helper
// returns may ever be it again, so it is asserted against every input.
const THE_USELESS_ANSWER = '[object Object]'

describe('nothing describes as [object Object], whatever threw', () => {
  const THROWN: Array<{ what: string; value: unknown }> = [
    { what: 'a bare object literal', value: {} },
    { what: 'an object with data', value: { a: 1 } },
    { what: 'a PostgrestError shape', value: { code: '23503', message: 'insert violates fk', details: 'Key (x)', hint: null } },
    { what: 'an Error', value: new Error('boom') },
    { what: 'a TypeError', value: new TypeError('x is not a function') },
    { what: 'a string', value: 'plain failure' },
    { what: 'null', value: null },
    { what: 'undefined', value: undefined },
    { what: 'a number', value: 42 },
    { what: 'an array', value: [1, 2] },
    { what: 'a circular object', value: (() => { const o: Record<string, unknown> = { k: 1 }; o.self = o; return o })() },
    { what: 'an object whose getter throws', value: { get boom() { throw new Error('nope') } } },
    { what: 'an object with only non-enumerable own properties', value: Object.defineProperty({}, 'm', { value: 1, enumerable: false }) },
  ]

  for (const { what, value } of THROWN) {
    it(`${what} yields something an operator can act on`, () => {
      const out = describeThrown(value)
      expect(out).not.toBe(THE_USELESS_ANSWER)
      expect(out).not.toBe('')
      expect(out).not.toBe('{}')
    })
  }
})

describe('what it keeps, where there is something to keep', () => {
  it('an Error keeps its name and message', () => {
    const out = describeThrown(new TypeError('x is not a function'))
    expect(out).toContain('TypeError')
    expect(out).toContain('x is not a function')
  })

  it('and its first stack frames, because the region matters more than the text', () => {
    // ⚖️ THE WHOLE POINT OF THIS CHANGE. Thirteen rows said a throw happened
    // somewhere in the analysis region; a frame says WHERE.
    const out = describeThrown(new Error('boom'))
    expect(out).toMatch(/@ .+/)
  })

  it('a Supabase client error keeps the message that IS the diagnosis', () => {
    // ⚠️ THE LIKELIEST THROWER AND THE WORST LOSS. A PostgrestError is a plain
    // object, so the old idiom turned a precise database complaint into nothing.
    const out = describeThrown({ code: '23503', message: 'violates foreign key constraint', details: 'Key (id)=(x)', hint: null })
    expect(out).toContain('23503')
    expect(out).toContain('violates foreign key constraint')
    expect(out).toContain('Key (id)=(x)')
  })

  it('and keeps it when the properties are NON-ENUMERABLE, which is the real shape', () => {
    // ⚠️⚠️ MY FIRST FIXTURE FOR THIS WAS NOT THE BROKEN CASE AND A MUTANT PROVED
    // IT. With enumerable keys, deleting the named-property branch changes
    // nothing: `JSON.stringify` picks them up anyway, so the mutant survived. An
    // Error-LIKE object — thrown by wrappers that copy `message` off an Error
    // with `Object.defineProperty`, and by `structuredClone`d client errors — has
    // its `message` non-enumerable, serialises to `{}`, and is exactly what the
    // branch is for. This is the fixture that kills the mutant.
    const errLike = {}
    Object.defineProperty(errLike, 'message', { value: 'connection terminated unexpectedly', enumerable: false })
    Object.defineProperty(errLike, 'code', { value: '57P01', enumerable: false })
    const out = describeThrown(errLike)
    expect(out).toContain('connection terminated unexpectedly')
    expect(out).toContain('57P01')
  })

  it('a plain object is serialised rather than described', () => {
    expect(describeThrown({ stage: 'beat_audit', n: 3 })).toContain('beat_audit')
  })

  it('a string is passed through unchanged', () => {
    expect(describeThrown('Empty response from model')).toBe('Empty response from model')
  })

  it('null and undefined say which, because they are different bugs', () => {
    expect(describeThrown(null)).toBe('threw null')
    expect(describeThrown(undefined)).toBe('threw undefined')
  })

  it('a value that refuses serialisation still names its type', () => {
    const circular: Record<string, unknown> = { k: 1 }
    circular.self = circular
    expect(describeThrown(circular)).toContain('k')
  })
})

describe('every site that recorded the throw now uses it', () => {
  it('the lossy idiom is gone from the edge function entirely', () => {
    // ⚠️ ASSERTED ABSENT, because it is the one-token mutant of the fix and it
    // is what produced thirteen information-free rows.
    expect(EDGE).not.toContain('instanceof Error ? err.message : String(err)')
  })

  it('the rescue row, the rescue log line and the instrumentation row all call it', () => {
    // ⚖️ THE RESCUE ROW IS THE ONE THAT FAILED IN PRODUCTION; the other two are
    // the same idiom in the same file and would have failed the same way.
    expect(EDGE).toContain('error: describeThrown(err).slice(0, 600),')
    expect(EDGE).toContain('error: describeThrown(err),')
    expect(EDGE).toContain('const detail = describeThrown(err)')
  })
})

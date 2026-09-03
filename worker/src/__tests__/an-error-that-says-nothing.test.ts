// A FAILURE ROW THAT EXPLAINS NOTHING IS WORSE THAN NO ROW.
//
// ⚠️ `String(err)` ON A PLAIN OBJECT IS THE STRING "[object Object]". That
// string was reachable from six call sites, one of them `sanitizeError`, whose
// output is written to `jobs.error` and `ops_events.detail` — both
// owner-readable. A Supabase or fetch rejection carrying `{ code, status }`
// would have been recorded as a phrase containing none of it.
//
// ⚖️ MEASURED BEFORE FIXING, AND THE MEASUREMENT SAYS IT NEVER FIRED: across
// 301 jobs carrying an error and 290 dead letters, "[object Object]" appears
// ZERO times. This is a LATENT defect. It is fixed because it costs ten lines
// and destroys the diagnosis of whatever finally throws a non-Error — not
// because it is currently hurting anyone. Saying so is the point.
import { describe, it, expect } from 'vitest'
import { errorText } from '../sanitizeError.js'

describe('an error that says nothing', () => {
  it('NEVER returns the useless phrase, for any input', () => {
    // ⚠️ THE WHOLE CONTRACT IN ONE ASSERTION. Every branch is checked against
    // the single string the function exists to make unreachable.
    const inputs: unknown[] = [
      { code: 'PGRST301', status: 503 },
      { nested: { deep: { thing: 1 } } },
      [1, 2, 3],
      new Map([['a', 1]]),
      Object.create(null),
      new (class Weird { private x = 1 })(),
      Symbol('s'),
      () => {},
      null, undefined, '', '   ', 0, false, NaN, 12n,
      new Error(''), new Error('real message'), new TypeError('bad type'),
    ]
    for (const i of inputs) {
      expect(errorText(i), `input ${String(typeof i)} produced the useless phrase`)
        .not.toContain('[object Object]')
    }
  })

  it('never returns an empty string, which reads as "no error"', () => {
    // ⚖️ THE LIE IN THE OPPOSITE DIRECTION. A blank `jobs.error` beside a failed
    // job says the job succeeded.
    for (const i of [null, undefined, '', '   ', new Error('')]) {
      expect(errorText(i).trim()).not.toBe('')
    }
  })

  it('keeps what a real Error said', () => {
    expect(errorText(new Error('yt-dlp exited 1'))).toBe('yt-dlp exited 1')
    expect(errorText('plain string failure')).toBe('plain string failure')
  })

  it('a bare Error still names itself rather than going blank', () => {
    expect(errorText(new Error(''))).toMatch(/Error/)
    expect(errorText(new TypeError(''))).toMatch(/TypeError/)
  })

  it('SERIALISES the shape that actually matters', () => {
    // ⚠️ THE CASE THIS EXISTS FOR. Supabase rejects with a plain object; the
    // code and status are the only things that identify the failure.
    const out = errorText({ code: 'PGRST301', status: 503, details: 'timeout' })
    expect(out).toContain('PGRST301')
    expect(out).toContain('503')
  })

  it('survives a circular object and still names it', () => {
    const circular: Record<string, unknown> = { code: 'X' }
    circular['self'] = circular
    const out = errorText(circular)
    expect(out).not.toContain('[object Object]')
    expect(out).toMatch(/unserialisable|code/)
  })
})

describe('every call site uses it', () => {
  it('no raw String(err) fallback survives in the job loop', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(import.meta.dirname, '..', 'index.ts'), 'utf8')
    // ⚠️ CODE LINES ONLY. A comment on line 136 quotes `${String(e)}` while
    // describing another file — counting it would make this guard permanently
    // red and it would be loosened rather than read.
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    const raw = code.filter((l) => /String\((?:e|err)\)/.test(l))
    expect(raw, `raw String(err) still present: ${raw.join(' | ')}`).toHaveLength(0)
  })

  it('sanitizeError itself unwraps, since its output is durable', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(import.meta.dirname, '..', 'sanitizeError.ts'), 'utf8')
    expect(src).toMatch(/const raw = errorText\(err\)/)
  })
})

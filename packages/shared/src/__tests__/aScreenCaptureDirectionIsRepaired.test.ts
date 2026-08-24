import { describe, it, expect } from 'vitest'
import {
  asksForScreenCapture, subjectOfCapture, convertScreenCaptureDirection, countConvertedDirections,
} from '../screenCaptureConversion'
import * as shared from '../index'

// ⚠️ THE REAL ONE, FROM A REAL SCRIPT. This exact direction shipped to a creator:
// a beat they could not film, discovered after everything else was already shot.
const OBSERVED = 'EXTRA CLIP: Screen recording showing the deletion of a draft'

describe('a direction that asks for a screen capture is caught', () => {
  it.each([
    OBSERVED,
    'Screen recording of the dashboard loading',
    'A screen capture of the checkout flow',
    'Record your screen to show the settings page',
    'screen-record the app opening',
    'Slide transition to screen recording, crop and zoom',
  ])('catches %s', (d) => {
    expect(asksForScreenCapture(d)).toBe(true)
  })

  // ⚖️ AND DOES NOT FIRE ON DIRECTION THAT IS ALREADY RIGHT. A false positive
  // rewrites a good beat into a worse one, which is a real cost, not a near-miss.
  it.each([
    'Hold your phone up beside your face with the dashboard open',
    'The laptop turned around so the graph faces camera',
    'Straight to camera',
    'Point at the number on the screen',
    'Show the printed chart',
    '',
  ])('leaves %s alone', (d) => {
    expect(asksForScreenCapture(d)).toBe(false)
    expect(convertScreenCaptureDirection(d).converted).toBe(false)
    expect(convertScreenCaptureDirection(d).text).toBe(d)
  })
})

// ⚠️ THE SUBJECT IS WHAT SURVIVES. A repair that drops it hands the creator a
// generic instruction with nothing to point at — the vague direction this whole
// rebuild exists to remove.
describe('the subject survives the repair', () => {
  it('keeps what the shot was of', () => {
    expect(subjectOfCapture(OBSERVED)).toBe('the deletion of a draft')
    expect(subjectOfCapture('Screen recording of the dashboard loading')).toBe('the dashboard loading')
    expect(subjectOfCapture('A screen capture of the checkout flow')).toBe('the checkout flow')
  })

  it('the rewritten direction names that subject', () => {
    const r = convertScreenCaptureDirection(OBSERVED)
    expect(r.converted).toBe(true)
    expect(r.text).toContain('the deletion of a draft')
    expect(r.text).toMatch(/hold your phone up/i)
    // ⚖️ AND THE REPAIRED TEXT MUST NOT STILL ASK FOR A CAPTURE, or the check
    // would happily convert its own output forever.
    expect(asksForScreenCapture(r.text)).toBe(false)
  })

  it('is idempotent — converting twice changes nothing the second time', () => {
    const once = convertScreenCaptureDirection(OBSERVED)
    const twice = convertScreenCaptureDirection(once.text)
    expect(twice.converted).toBe(false)
    expect(twice.text).toBe(once.text)
  })

  // ⚠️ NO SUBJECT IS A REAL CASE, not a crash. "Screen recording." on its own
  // still has to produce something filmable.
  it('a capture with no subject still yields a usable instruction', () => {
    const r = convertScreenCaptureDirection('Screen recording')
    expect(r.converted).toBe(true)
    expect(r.subject).toBeNull()
    expect(r.text).toMatch(/hold your phone up/i)
  })
})

describe('the count is what makes the next decision evidential', () => {
  it('counts only the directions that ask for a capture', () => {
    expect(countConvertedDirections([
      OBSERVED, 'Straight to camera', 'Screen recording of the graph', 'Hold the book up',
    ])).toBe(2)
  })

  // ⚠️ ABSENT IS NOT ZERO — a non-array must not silently read as "none found".
  it('a missing list is not a clean count', () => {
    expect(countConvertedDirections([])).toBe(0)
    expect(countConvertedDirections(null as unknown as string[])).toBe(0)
    expect(countConvertedDirections([null, undefined, 42] as unknown as string[])).toBe(0)
  })
})

it('is exported from the package index', () => {
  expect(typeof shared.convertScreenCaptureDirection).toBe('function')
  expect(typeof shared.countConvertedDirections).toBe('function')
})

// ⚠️ THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL. Edge functions run on Deno
// and cannot import @twinai/shared, so generate-blueprint carries an inline copy.
// Two copies drift silently: the shared one gets a phrasing the edge never
// learns, the counter reads zero, and zero looks exactly like "none found".
describe('the edge copy of the rule matches the tested one', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const edge = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
  const src = readFileSync(join(repo, 'packages', 'shared', 'src', 'screenCaptureConversion.ts'), 'utf8')

  // ⚠️ SLICED BY LINE, NOT BY THE FIRST `]`. My first version cut the block at
  // indexOf(']'), which lands INSIDE the character class `[\s-]` in the very
  // first pattern — so it extracted nothing and the guard failed against correct
  // code. The test was wrong, not the rule.
  const patterns = (text: string, marker: string): string[] => {
    const at = text.indexOf(marker)
    expect(at, marker).toBeGreaterThan(-1)
    const lines = text.slice(at).split('\n')
    const out: string[] = []
    for (const line of lines.slice(1)) {
      const t = line.trim()
      if (t.startsWith(']')) break
      const m = t.match(/^\/(.*)\/i,$/)
      if (m) out.push(m[1])
    }
    return out
  }

  it('carries the same phrasings, in the same order', () => {
    const shared_ = patterns(src, 'const CAPTURE_PHRASES')
    const inline = patterns(edge, 'const CAPTURE_PHRASES_INLINE')
    expect(inline.length).toBeGreaterThan(0)
    expect(inline).toEqual(shared_)
  })

  it('the counter is actually written into beat_audit', () => {
    expect(edge).toMatch(/screen_capture_directions: screenCaptureDirectionsInline\(/)
  })

  // ⚖️ AND IT READS BOTH FIELDS. The writer puts the shot in `proof` on some
  // beats and `direction` on others; reading one would undercount silently.
  it('reads both proof and direction', () => {
    const at = edge.indexOf('function screenCaptureDirectionsInline')
    const body = edge.slice(at, at + 700)
    expect(body).toMatch(/rec\.proof/)
    expect(body).toMatch(/rec\.direction/)
  })
})

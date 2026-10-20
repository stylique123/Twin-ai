// DISCONNECT TEST, ledger row 22: spoken de-dup (#1291). Kill switch SPOKEN_DEDUP=false.
// Fictional fixture only (a made-up potter). No model call.
import { describe, it, expect } from 'vitest'
import { dedupeSpokenLines } from '../../inventionGate'
import { EDGE, evalEdge, edgeAfter } from './edge'

const HOOK = 'I burned three batches of teal glaze before the kiln behaved.'
const SCRIPT = [
  { line: HOOK, section: 'hook' },
  { line: 'Three batches of teal glaze burned before my kiln behaved.', section: 'build' },
  { line: 'The fix was a slower cool-down after the last firing.', section: 'turn' },
]

/** The edge block's condition (index.ts ~17245), evaluated from its source. */
function dedupOn(env: Record<string, string>, trialOn = true): boolean {
  const line = edgeAfter("if (trialOn && Deno.env.get('SPOKEN_DEDUP') !== 'false' && blueprint", 200).split('\n')[0]!
  return evalEdge(/^if \((.*)\) \{$/.exec(line.trim())![1]!, { trialOn, blueprint: {} }, env) as boolean
}
const scriptFor = (env: Record<string, string>) => (dedupOn(env) ? dedupeSpokenLines(SCRIPT).script : SCRIPT).map((b) => b.line)

describe('SPOKEN_DEDUP disconnect', () => {
  it('the edge condition: on for the trial, off with SPOKEN_DEDUP=false', () => {
    expect(dedupOn({})).toBe(true)
    expect(dedupOn({ SPOKEN_DEDUP: 'false' })).toBe(false)
    expect(dedupOn({}, false)).toBe(false)
  })
  it('on: the line restating the hook is removed; off: it ships', () => {
    const on = scriptFor({})
    const off = scriptFor({ SPOKEN_DEDUP: 'false' })
    expect(on).not.toEqual(off)
    expect(on).toEqual([HOOK, SCRIPT[2]!.line])
    expect(off).toHaveLength(3)
  })
  it('the edge still calls it, and asks the worker gate for spoken_dedup under the same switch', () => {
    expect(edgeAfter("if (trialOn && Deno.env.get('SPOKEN_DEDUP') !== 'false' && blueprint", 600)).toContain('dedupeSpokenLines(')
    expect(EDGE).toContain("...(trialOn && Deno.env.get('SPOKEN_DEDUP') !== 'false' ? { spoken_dedup: true } : {}),")
  })
})

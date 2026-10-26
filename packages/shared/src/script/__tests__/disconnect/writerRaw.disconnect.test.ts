// DISCONNECT TEST: writer raw draft record (record only). Kill switch WRITER_RAW_RECORD=off.
// Proves recording changes NO output: the shipped script is byte-identical with
// recording on or off, and the edge reads `writerRaw` only to save it.
// Fictional fixture only (a made-up potter). No model call.
import { describe, it, expect } from 'vitest'
import { blockSpokenPlaceholders, dedupeSpokenLines } from '../../inventionGate'
import { captureWriterRaw, writerRawRecordOn } from '../../writerRaw'
import { EDGE, edgeExpr, evalEdge } from './edge'

const RAW = JSON.stringify({
  hook_options: ['I burned three batches of teal glaze.', 'My kiln hated me for a month.'],
  script: [
    { section: 'hook', line: 'I burned three batches of teal glaze before the kiln behaved.' },
    { section: 'build', line: 'Three batches of teal glaze burned before my kiln behaved.' },
    { section: 'turn', line: 'The fix was a slower cool-down after [Your answer: firing].' },
    { section: 'cta', line: 'Come to the Saturday market and see the new teal mugs.' },
  ],
})

const recordOn = (env: Record<string, string>, isHeartbeat = true): boolean => {
  const expr = edgeExpr('writerRaw', "WRITER_RAW_RECORD").split(' ? ')[0]!
  return evalEdge(expr, { isHeartbeat, writerRawRecordOn }, env) as boolean
}

/** The shipped output path as the edge runs it: everything reads `raw`, never `writerRaw`. */
function ship(env: Record<string, string>): { shipped: string; saved: Record<string, unknown> } {
  const raw = RAW
  const writerRaw = recordOn(env) ? captureWriterRaw(raw, '2026-10-24T00:00:00.000Z') : null
  const p = blockSpokenPlaceholders(JSON.parse(raw) as { script: Array<{ line?: unknown }>; hook_options: string[] })
  const blueprint = { ...p.bp, script: dedupeSpokenLines(p.bp.script as Array<{ line?: unknown }>).script }
  const saved = { ...blueprint, ...(writerRaw ? { writer_raw: writerRaw } : {}) }
  return { shipped: JSON.stringify(blueprint), saved }
}

describe('WRITER_RAW_RECORD disconnect', () => {
  it('the edge condition: on for test accounts, off with the kill switch or for real creators', () => {
    expect(recordOn({})).toBe(true)
    expect(recordOn({ WRITER_RAW_RECORD: 'off' })).toBe(false)
    expect(recordOn({ WRITER_RAW_RECORD: 'false' })).toBe(false)
    expect(evalEdge(edgeExpr('writerRaw', 'WRITER_RAW_RECORD').split(' ? ')[0]!, { isHeartbeat: false, writerRawRecordOn }, {})).toBe(false)
  })
  it('the shipped script is BYTE-IDENTICAL with recording on and off', () => {
    const on = ship({}), off = ship({ WRITER_RAW_RECORD: 'off' })
    expect(on.shipped).toBe(off.shipped)
    expect(on.saved.writer_raw).toBeTruthy()
    expect(off.saved.writer_raw).toBeUndefined()
    const { writer_raw: _w, ...rest } = on.saved
    expect(JSON.stringify(rest)).toBe(off.shipped)
  })
  it('the record is the pre-stage draft (placeholder and repeat still in it)', () => {
    const w = ship({}).saved.writer_raw as { lines: Array<{ line: string }> }
    expect(w.lines).toHaveLength(4)
    expect(w.lines[2]!.line).toContain('[Your answer')
  })
  it('the edge only declares writerRaw and spreads it into the saved blueprint', () => {
    const uses = EDGE.split('\n').filter((l) => /\bwriterRaw\b/.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('import'))
    expect(uses).toHaveLength(2)
    expect(uses[0]).toContain("const writerRaw = writerRawRecordOn(isHeartbeat, Deno.env.get('WRITER_RAW_RECORD')) ? captureWriterRaw(raw,")
    expect(uses[1]!.trim()).toBe('...(writerRaw ? { writer_raw: writerRaw } : {}),')
  })
})

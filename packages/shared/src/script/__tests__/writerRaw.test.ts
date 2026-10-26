// writer_raw record: caps, kill switch, never throws. Fictional fixtures only.
import { describe, it, expect } from 'vitest'
import { captureWriterRaw, writerRawRecordOn, WRITER_RAW_MAX_LINES, WRITER_RAW_MAX_LINE_CHARS } from '../writerRaw'
import { replayCase, type ReplayCase } from '../replayGuard'

describe('writerRaw', () => {
  it('kill switch and test-account gate', () => {
    expect(writerRawRecordOn(true, undefined)).toBe(true)
    expect(writerRawRecordOn(true, 'OFF')).toBe(false)
    expect(writerRawRecordOn(true, '0')).toBe(false)
    expect(writerRawRecordOn(false, undefined)).toBe(false)
  })
  it('null on unreadable input, never throws', () => {
    expect(captureWriterRaw('not json', 'x')).toBeNull()
    expect(captureWriterRaw(42, 'x')).toBeNull()
    expect(captureWriterRaw('{"script":3}', 'x')).toBeNull()
  })
  it('caps lines, line length and hooks, and marks truncation', () => {
    const script = Array.from({ length: 60 }, (_, i) => ({ section: 'build', line: `Line ${i} ` + 'x'.repeat(i === 0 ? 900 : 5) }))
    const w = captureWriterRaw(JSON.stringify({ script, hook_options: Array(20).fill('h') }), 'now')!
    expect(w.lines).toHaveLength(WRITER_RAW_MAX_LINES)
    expect(w.lines[0]!.line).toHaveLength(WRITER_RAW_MAX_LINE_CHARS)
    expect(w.hook_options).toHaveLength(10)
    expect(w.truncated).toBe(true)
    expect(w.at).toBe('now')
  })
  it('replay starts from writer_raw when present', () => {
    const shipped: ReplayCase = { batch: 'p', n: 0, target_seconds: 30, script: [{ line: 'Short shipped line here.' }], hook_options: ['A hook.'] }
    const draft = 'I fired the teal glaze slowly and the cracks finally stopped showing up for good.'
    const withRaw: ReplayCase = { ...shipped, writer_raw: { lines: [{ section: 'hook', line: draft }, { section: 'build', line: draft }], hook_options: ['A hook.'] } }
    expect(replayCase(withRaw).words).not.toBe(replayCase(shipped).words)
    expect(replayCase(withRaw).repeats).toBe(0)
    expect(replayCase({ ...shipped, writer_raw: { lines: [], hook_options: [] } })).toEqual(replayCase(shipped))
  })
})

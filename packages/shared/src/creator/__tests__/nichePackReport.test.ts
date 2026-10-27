import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nichePackReport, pickNichePack } from '../writerGuidance'

// Fictional pack and fictional lines only.
const pack = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures/nichePacks/fictional-hand-poured-candles.json'), 'utf8'))
const repo = join(__dirname, '..', '..', '..', '..', '..')
const script = [
  { section: 'hook', line: 'This candle cures a bad week.' },
  { section: 'body', line: 'I pour every one by hand in a small studio.' },
  { section: 'body', line: 'It is totally non-toxic, the best in the world.' },
  { section: 'close', line: 'Link is below.' },
]

describe('nichePackReport — report only, behind NICHE_PACKS', () => {
  it('flag off (unset or anything but "on") reports nothing', () => {
    expect(nichePackReport(pack, undefined, script)).toBeNull()
    expect(nichePackReport(pack, 'off', script)).toBeNull()
    expect(nichePackReport(pack, '1', script)).toBeNull()
  })
  it('no pack, or no script, reports nothing', () => {
    expect(nichePackReport(null, 'on', script)).toBeNull()
    expect(nichePackReport(pack, 'on', null)).toBeNull()
  })
  it('flags each tripping beat with its reason', () => {
    const r = nichePackReport(pack, 'on', script)!
    expect(r.flagged).toEqual(expect.arrayContaining([
      { beat: 0, reason: 'health claim' },
      { beat: 2, reason: 'unverifiable safety claim' },
      { beat: 2, reason: 'unprovable superlative' },
    ]))
    expect(r.flagged.some((f) => f.beat === 1 || f.beat === 3)).toBe(false)
  })
  it('never edits the script', () => {
    const before = JSON.stringify(script)
    nichePackReport(pack, 'on', script)
    expect(JSON.stringify(script)).toBe(before)
  })
  it('the record carries indexes and reasons, never line text', () => {
    const r = nichePackReport(pack, 'on', script)!
    const s = JSON.stringify(r)
    for (const b of script) expect(s).not.toContain(b.line)
  })
  it('a clean script reports an empty list', () => {
    expect(nichePackReport(pack, 'on', [{ line: 'I pour every one by hand.' }])!.flagged).toEqual([])
  })
  it('the fictional pack is never picked for a real creator', () => {
    expect(pickNichePack([pack], 'hand-poured candles', 'maker')).toBeNull()
  })
  it('generate-blueprint calls it on the shipped script, after the last edit, behind NICHE_PACKS, report only', () => {
    const src = readFileSync(join(repo, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    const at = src.indexOf('nichePackReport(')
    expect(at).toBeGreaterThan(src.indexOf("traceBeats('shipped'"))
    const call = src.slice(at, at + 400)
    expect(call).toContain("Deno.env.get('NICHE_PACKS')")
    expect(call).not.toMatch(/\.script\s*=/)
  })
})

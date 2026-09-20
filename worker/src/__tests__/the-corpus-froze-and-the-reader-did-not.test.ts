// THE WRITER WAS A HUMAN AND THE READER WAS A HOT PATH.
//
// ⚠️⚠️ MEASURED 2026-09-20. `gallery_items.caption_shape` had exactly one
// writer — a manual script — so classification froze on 2026-09-10 at 596 rows
// while the table grew to 6,423. Meanwhile `generate-blueprint` read that
// column on EVERY generation, and 17 of 17 recorded generations emitted a shape
// block built from it. A ten-day-old snapshot was being served as live evidence.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyBatch, tally, CAPTION_SWEEP_BATCH, CAPTION_SWEEP_INTERVAL_MS } from '../captionSweep'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const INDEX = readFileSync(join(ROOT, 'worker', 'src', 'index.ts'), 'utf8')
const GEN = readFileSync(join(ROOT, 'scripts', 'ci', 'generate_shared_pilot_core.mjs'), 'utf8')
const AT = '2026-09-20T00:00:00.000Z'

describe('the sweep reads what the script never got to', () => {
  it('classifies a caption the patterns can read', () => {
    const [u] = classifyBatch([{ id: 'a', title: 'How to rebind a Bible in full-grain leather' }], AT)
    expect(u.caption_shape).toBe('how_to')
    expect(u.caption_shape_basis).toBe('inferred')
    expect(u.caption_shape_reason).toBeNull()
  })

  it('WRITES the row even when nothing matched, which is the whole diagnosis', () => {
    // ⚠️ THIS IS WHY THE FREEZE WAS DIAGNOSABLE AT ALL. Recording
    // `no_pattern_match` is what separates "we read this and the patterns did
    // not fire" (4,084 cards) from "nobody has ever looked" (397). A sweep that
    // skipped its misses would collapse the two and lose the distinction.
    const [u] = classifyBatch([{ id: 'b', title: 'a quiet afternoon at the bench today' }], AT)
    expect(u.caption_shape).toBeNull()
    expect(u.caption_shape_reason).toBe('no_pattern_match')
    expect(u.caption_shape_at).toBe(AT)
  })

  it('a shape and a reason are never both present', () => {
    // 0196 enforces this with a CHECK; a batch that violated it would be
    // rejected wholesale and the sweep would silently stop writing.
    const rows = [
      { id: '1', title: 'How to sharpen a chisel properly' },
      { id: '2', title: null },
      { id: '3', title: '#fyp #viral' },
      { id: '4', title: 'घरसे शुरू करे ये नया business idea' },
      { id: '5', title: 'How to win' },
    ]
    for (const u of classifyBatch(rows, AT)) {
      expect(u.caption_shape === null || u.caption_shape_reason === null).toBe(true)
    }
  })

  it('records every gate separately instead of folding them', () => {
    const rows = [
      { id: '1', title: null }, { id: '2', title: '   ' },
      { id: '3', title: '#fyp #viral https://x.test' },
      { id: '4', title: 'How to win' },
      { id: '5', title: 'घरसे शुरू करे ये नया business' },
    ]
    const reasons = classifyBatch(rows, AT).map((u) => u.caption_shape_reason)
    expect(reasons).toEqual(['no_title', 'no_title', 'empty_after_strip', 'too_short', 'not_english'])
  })

  it('stamps the version, because the version IS the re-run', () => {
    // A widened pattern set that never revisits the rows it was widened for is
    // a fix nobody can see. The sweep re-reads rows below the current version.
    const [u] = classifyBatch([{ id: 'v', title: 'How to do a thing properly' }], AT)
    expect(u.caption_shape_version).toBeGreaterThanOrEqual(2)
    expect(INDEX).toMatch(/caption_shape_version\.lt\.\$\{CAPTION_SHAPE_VERSION_N\}/)
    expect(INDEX).toMatch(/caption_shape_version\.is\.null/)
  })

  it('skips a row with no usable id rather than writing a broken update', () => {
    expect(classifyBatch([{ id: '', title: 'How to do a thing' }], AT)).toEqual([])
  })
})

describe('the tally carries its denominator', () => {
  it('counts what it understood AND what it did not', () => {
    const t = tally(classifyBatch([
      { id: '1', title: 'How to sharpen a chisel properly' },
      { id: '2', title: 'a quiet afternoon at the bench' },
      { id: '3', title: null },
    ], AT))
    expect(t.read).toBe(3)
    expect(t.classified).toBe(1)
    expect(t.unclassified).toBe(2)
    expect(t.byReason).toEqual({ no_pattern_match: 1, no_title: 1 })
  })
})

describe('it runs on its own, which is the entire point', () => {
  it('is called from the worker loop beside the upload sweep', () => {
    expect(INDEX).toMatch(/await sweepCaptionShapes\(\)/)
    expect(INDEX).toMatch(/async function sweepCaptionShapes/)
  })

  it('is interval gated and bounded, so it never competes with a creator scan', () => {
    expect(CAPTION_SWEEP_INTERVAL_MS).toBeGreaterThanOrEqual(60_000)
    expect(CAPTION_SWEEP_BATCH).toBeGreaterThan(0)
    expect(CAPTION_SWEEP_BATCH).toBeLessThanOrEqual(500)
    expect(INDEX).toMatch(/now - lastCaptionSweep < CAPTION_SWEEP_INTERVAL_MS/)
  })

  it('stamps the clock BEFORE the work, or one bad read becomes a hot loop', () => {
    const body = INDEX.slice(INDEX.indexOf('async function sweepCaptionShapes'))
    const stamp = body.indexOf('lastCaptionSweep = now')
    const read = body.indexOf(".from('gallery_items')")
    expect(stamp).toBeGreaterThan(-1)
    expect(read).toBeGreaterThan(stamp)
  })
})

describe('the patterns are generated, never hand-copied', () => {
  it('the worker copy comes from the shared module through CI', () => {
    // ⚖️ THE SCRIPT THIS REPLACES ARGUED, CORRECTLY, that a HAND copy of eight
    // regexes would let the corpus quietly mix two vocabularies — which 0196
    // calls unrecoverable. A generated copy is the one thing that argument does
    // not apply to: CI fails on a diff and there is still exactly one author.
    expect(GEN).toMatch(/'packages\/shared\/src\/corpus\/captionShape\.ts', 'worker\/src\/generated\/captionShape\.ts'/)
    const COPY = readFileSync(join(ROOT, 'worker', 'src', 'generated', 'captionShape.ts'), 'utf8')
    expect(COPY).toMatch(/^\/\/ GENERATED FROM packages\/shared\/src\/corpus\/captionShape\.ts — DO NOT EDIT\./)
  })

  it('the worker copy resolves as Node, not as Deno', () => {
    // ⚠️ THE TWO RUNTIMES WANT EXACT OPPOSITES: a relative `.ts` specifier is
    // required by Deno and fatal to Node. Generating one rule for both is how
    // an edge deploy once died on "Module not found".
    const COPY = readFileSync(join(ROOT, 'worker', 'src', 'generated', 'captionShape.ts'), 'utf8')
    expect(COPY).not.toMatch(/from '\.[^']*\.ts'/)
    expect(COPY).toMatch(/from '\.\/assessed\.js'/)
  })
})

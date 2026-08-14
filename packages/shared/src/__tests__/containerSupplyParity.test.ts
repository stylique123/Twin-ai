// THE SUPPLY CHECK MUST AGREE BETWEEN SHARED AND THE EDGE.
//
// ⚠️ A DRIFT HERE IS A DRIFT IN WHAT COUNTS AS AN ITEM. If shared thinks an
// `opinion` can fill an enumerated slot and the edge does not, the two report
// different shortfalls for the same creator — and the number in the logs is the
// one that will decide whether §18a's stop ever gets enforced.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ENUMERABLE_KINDS, checkSupply } from '../containerSupply'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

function edgeKinds(): Set<string> {
  const m = EDGE.match(/const ENUMERABLE_KINDS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/)
  expect(m, 'the edge copy of ENUMERABLE_KINDS is missing').toBeTruthy()
  return new Set(m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean))
}

describe('the two copies count the same things', () => {
  it('agree on what can be an item', () => {
    expect([...edgeKinds()].sort()).toEqual([...ENUMERABLE_KINDS].sort())
  })

  it('agree on the behaviour that matters', () => {
    // Reconstructed from the edge's own constant, so this compares BEHAVIOUR
    // rather than source text.
    const kinds = edgeKinds()
    const items = [{ kind: 'product', text: 'Cursor' }, { kind: 'opinion', text: 'x' }]
    const edgeSupply = new Set(items.filter((i) => kinds.has(i.kind)).map((i) => i.kind + i.text)).size
    expect(checkSupply({ isEnumerated: true, count: 3, unit: 't' }, items).supply)
      .toBe(edgeSupply)
  })
})

describe('it is READ, not merely defined', () => {
  it('reports the supply beside the other beat counters', () => {
    // ⚠️ NINE WRITE-ONLY FIELDS THIS SESSION. A check that computes a shortfall
    // and tells nobody is the tenth.
    expect(EDGE).toMatch(/container_supply: checkSupply\(/)
    expect(EDGE.indexOf('container_supply')).toBeGreaterThan(EDGE.indexOf("event: 'substance_route_shadow'"))
  })

  it('measures before it enforces, and says so', () => {
    // ⚖️ §18a CALLS UNRESOLVED A STOP AND IS RIGHT. But nobody has counted how
    // often a creator falls short, so a stop shipped now could refuse most
    // generations on its first day. The comment records that this is deliberate
    // sequencing rather than a half-finished feature.
    expect(EDGE).toMatch(/MEASURED BEFORE IT IS ENFORCED/)
  })
})

describe('the edge reports the supply MIX, not only the total', () => {
  it('counts bare product mentions separately', () => {
    // ⚠️ 302 OF 302 ON CAPTION-DERIVED STORES. Without this field a supply built
    // entirely out of "they mentioned the Z Fold 8" is indistinguishable in the
    // logs from a supply of real cases — and only one of those can fill a list.
    expect(EDGE).toMatch(/const bareProduct = new Set\(/)
    expect(EDGE).toMatch(/eligible\.filter\(\(i\) => i\.kind === 'product'\)/)
  })
})

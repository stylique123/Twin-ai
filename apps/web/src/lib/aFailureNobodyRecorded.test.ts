// THE BANNER KNEW AND THE ROW DIDN'T.
//
// ⚠️ THE OBSERVED SCREENSHOT: "Added, but we could not start reading that page"
// rendered directly above "Twin is reading the page. This keeps going if you
// leave." Two messages, one screen, one event.
//
// ⚖️ AND NEITHER COMPONENT WAS BUGGY. `requestProductExtraction` threw in the
// browser, the Library set a banner string and wrote NOTHING; `productLifecycle`
// then saw a source, no knowledge and no `knowledgeFailedAt` and returned
// READING — correct by its own rules. The client held a fact it never recorded,
// so every other reader disagreed with it.
//
// ⚠️ THE OBVIOUS FIX WAS THE WRONG ONE. Making the banner read `productLifecycle`
// too would have silenced the only component that KNEW, and left the card, the
// Retry button and the writer's entity lookup all believing a read was in
// flight. The row is where facts live.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { productLifecycle } from '@twinai/shared'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const LIB = readFileSync(join(REPO, 'apps/web/src/pages/ProductLibrary.tsx'), 'utf8')
const codeOnly = LIB.split('\n')
  .filter((l) => { const t = l.trim(); return t !== '' && !t.startsWith('//') && !t.startsWith('*') })
  .join('\n')

describe('a failed enqueue is recorded, not just announced', () => {
  it('every requestProductExtraction call can record its own failure', () => {
    const calls = (codeOnly.match(/await requestProductExtraction\(/g) ?? []).length
    const records = (codeOnly.match(/recordExtractionNeverStarted\(/g) ?? []).length
    // Guards the guard: zero calls would pass both assertions vacuously.
    expect(calls, 'no enqueue sites found — the call was renamed').toBeGreaterThanOrEqual(2)
    expect(
      records,
      'an enqueue site can fail without recording it; the card will say READING',
    ).toBeGreaterThanOrEqual(calls)
  })

  // ⚠️ THE PHOTO PATH'S OUTER CATCH ALSO COVERS THE UPLOAD. Recording an import
  // failure for a failed photo upload would invent a state rather than report
  // one — the same class of defect, pointed the other way.
  it('does not record a failure the upload caused', () => {
    const at = codeOnly.indexOf('await uploadProductImage(')
    const enqueue = codeOnly.indexOf('await requestProductExtraction(ownerId, entity.id')
    expect(at).toBeGreaterThan(-1)
    expect(enqueue).toBeGreaterThan(at)
    // The recorder sits after the enqueue, inside its own try — not around the upload.
    const between = codeOnly.slice(at, enqueue)
    expect(between).not.toMatch(/recordExtractionNeverStarted/)
  })
})

describe('and the state actually flips', () => {
  // ⚖️ THE WRITE IS ONLY WORTH MAKING IF IT CHANGES WHAT THE CARD DERIVES.
  // Without this, the fix could write a column nothing reads — which is the
  // defect class this repo is named for.
  const withSource = { productUrl: 'https://example.com/p', knowledge: null } as never

  it('READING before the failure is recorded, IMPORT_FAILED after', () => {
    expect(productLifecycle({ ...(withSource as object) } as never, 0)).toBe('READING')
    expect(productLifecycle(
      { ...(withSource as object), knowledgeFailedAt: '2026-09-05T13:00:00Z' } as never, 0,
    )).toBe('IMPORT_FAILED')
  })

  // ⚠️ AND A PRODUCT THAT ALREADY LEARNED SOMETHING KEEPS IT. `productLifecycle`
  // reads IMPORT_FAILED only where the store is still empty, so a later failure
  // never erases facts the creator already has.
  it('does not turn a product with facts into a failure', () => {
    const known = {
      productUrl: 'https://example.com/p',
      knowledge: [{ label: 'what it does', value: 'x' }],
      knowledgeFailedAt: '2026-09-05T13:00:00Z',
    } as never
    expect(productLifecycle(known, 0)).not.toBe('IMPORT_FAILED')
  })
})

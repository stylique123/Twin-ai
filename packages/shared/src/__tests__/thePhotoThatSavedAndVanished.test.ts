// "SHOWS SAVED BUT THE IMAGE ISN'T THERE AFTER."
//
// ⚠️⚠️ MEASURED ON PRODUCTION 2026-09-22, and the measurement is the whole
// diagnosis: 0 of 28 `product_entities` rows carry `evidence` AT ALL. The
// Product Library's only photo reader is `photoPathsOf`, which walks
// `evidence.sections[].imagePath`. So no row has ever shown a photo.
//
// ── THE UPLOAD WAS NEVER THE BROKEN PART ──────────────────────────────────
//
// The file reaches storage, the path reaches `enqueue-extraction`, and the
// analysis genuinely runs. Both of the reporting creator's products carry
// `knowledge` extracted from `creator_image`, with NO url at all, within 40
// seconds of being added:
//
//   "White circular leatherette or faux leather keychains with stitched edges,
//    silver key rings, and printed branding including a logo with a maple leaf
//    and the text 'HBD-PRINT' and 'www.hbd-print.ca'."
//
// ⚖️ SO THE REPORT "no automatic image analysis — you have to do it manually"
// IS THE OPPOSITE OF WHAT THE DATA SAYS. It is automatic and it is good. What
// was missing is the entity recording that it HAS a photo, so every reload
// showed an empty row and the work looked lost.
//
// ⚠️ AND "no delete/replace, only add" HAS THE SAME CAUSE. You cannot remove an
// item from a list nobody wrote down. Persisting the set is what makes removal
// expressible at all.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = readFileSync(
  join(HERE, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')
const API = readFileSync(join(HERE, '..', 'api.ts'), 'utf8')
const CODE = LIB.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')

describe('the photo is written down, not just uploaded', () => {
  it('⚠️ the upload path persists the set on the entity', () => {
    // THE STEP THAT WAS MISSING. Without this every other assertion here is
    // about a list that is thrown away.
    const block = CODE.slice(CODE.indexOf('async function addPhotosTo'))
    expect(block.slice(0, 3000)).toMatch(/updateEntityPresentation\(entity\.id, \{\s*evidence:/)
  })

  it('in the shape the library actually reads', () => {
    // `photoPathsOf` walks `evidence.sections[].imagePath`. A different shape
    // would store the photo and still show nothing.
    expect(CODE).toMatch(/form: 'images'/)
    expect(CODE).toMatch(/sections: nextPaths\.map\(\(imagePath, order\) => \(\{ order, label: '', imagePath \}\)\)/)
  })

  it('⚖️ and only after the read is queued, never before', () => {
    // A row claiming a photo whose read was never queued is the mirror defect.
    const block = CODE.slice(CODE.indexOf('async function addPhotosTo'))
    const enqueue = block.indexOf('requestProductExtraction')
    const persist = block.indexOf('evidence:')
    expect(enqueue).toBeGreaterThan(-1)
    expect(persist).toBeGreaterThan(enqueue)
  })

  it('the column is accepted by the writer it is sent to', () => {
    expect(API).toMatch(/if \('evidence' in edit\)/)
    expect(API).toMatch(/row\.evidence = \(ev === null \|\| ev === undefined\) \? null : \{/)
  })
})

describe('and a wrong photo can be taken back', () => {
  it('there is a remover, and the button reaches it', () => {
    expect(CODE).toMatch(/async function removePhotoFrom\(/)
    expect(CODE).toMatch(/onClick=\{\(\) => void removePhotoFrom\(e, path\)\}/)
  })

  it('⚖️ removing the last photo stores null, not an empty evidence object', () => {
    // "She removed the last photo" and "a capture produced no sections" are
    // different facts. Only null says nobody supplied any.
    expect(CODE).toMatch(/evidence: remaining\.length === 0 \? null :/)
  })

  it('⚠️ and it removes by path, so the other photos survive', () => {
    expect(CODE).toMatch(/photoPathsOf\(entity\)\.filter\(\(p\) => p !== path\)/)
  })
})

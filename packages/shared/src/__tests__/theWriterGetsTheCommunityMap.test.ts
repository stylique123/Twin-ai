import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SURFACES_WITH_OTHER_PEOPLE } from '../communityMap'

/**
 * ⚠️ THE RULE NOW LIVES TWICE, AND THAT IS NOT OPTIONAL. Edge functions run on
 * Deno and cannot import `@twinai/shared`, so `generate-blueprint` carries an
 * inline copy under the `…Inline` convention.
 *
 * Two copies drift silently: the shared one learns a rule the edge never does,
 * the prompt quietly stops carrying it, and nothing fails. So the SHIPPED
 * SOURCES are compared rather than the intent.
 */
const repo = join(import.meta.dirname, '..', '..', '..', '..')
const bp = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the map reaches the writer at all', () => {
  // ⚠️ A COLUMN THAT IS READ MUST BE SELECTED. This exact class of bug already
  // shipped here: `id` was read from `ownedEntity?.id` and omitted from the
  // select, so every generation recorded "no product was chosen". The optional
  // chain made the absence look like a legitimate null.
  it('selects community_map, or the block could only ever be empty', () => {
    const sel = bp.slice(bp.indexOf(".select('id, name, type"), bp.indexOf(".select('id, name, type") + 300)
    expect(sel).toMatch(/community_map/)
  })

  // ⚠️ ANCHORED ON THE PROMPT STRING, NOT ON THE TOKEN. `communityBlock` also
  // appears at its declaration and in comments, so a bare search would stay
  // green with the interpolation deleted — the trap that made four guards
  // decoration earlier in this rebuild.
  it('interpolates the block into the prompt the model actually reads', () => {
    const line = bp.split('\n').find((l) => l.includes('${knowledgeBlock}'))
    expect(line, 'the prompt line carrying knowledgeBlock was not found').toBeTruthy()
    expect(line).toMatch(/\$\{communityBlock\}/)
  })
})

describe('the inline copy still matches the shared rule', () => {
  // ⚠️ SLICED BY LINE, NOT BY BRACKET. An earlier parity guard in this rebuild
  // cut at `indexOf(']')` and landed inside a character class, extracting
  // nothing and asserting on an empty list — it passed against correct code.
  const inlineLine = bp.split('\n').find((l) => l.includes('SURFACES_WITH_OTHER_PEOPLE_INLINE = ['))

  it('the inline surface list exists to be compared', () => {
    expect(inlineLine, 'inline crowd-surface list not found').toBeTruthy()
  })

  it('carries exactly the surfaces the shared rule calls crowded', () => {
    for (const id of SURFACES_WITH_OTHER_PEOPLE) {
      expect(inlineLine, `shared lists ${id}; the edge copy does not`).toContain(`'${id}'`)
    }
    // And nothing extra: a surface the edge thinks is crowded but shared does
    // not would demand a covering line the rest of the system never asks for.
    const found = [...(inlineLine ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...found].sort()).toEqual([...SURFACES_WITH_OTHER_PEOPLE].sort())
  })

  // ⚠️ ABSENT IS NOT PERMISSION, IN BOTH COPIES. This is the single rule that
  // must never soften: anything that is not an explicit `mine` or `permitted`
  // resolves to `blur`.
  it('the inline privacy read defaults to blur, never to the creator’s own', () => {
    const fn = bp.slice(bp.indexOf('function proofPrivacyInline'), bp.indexOf('function communityBlockInline'))
    expect(fn).toMatch(/'mine'/)
    expect(fn).toMatch(/'permitted'/)
    expect(fn).toMatch(/'blur'/)
    // The shape that matters: blur is the FALLBACK, not one branch among three.
    expect(fn).toMatch(/\?\s*p\s*:\s*'blur'/)
  })

  // ⚠️ A MAP WITH NO SURFACES BUYS SILENCE, NOT A GUESS.
  it('the inline usability test requires url, name and at least one page', () => {
    const fn = bp.slice(bp.indexOf('function communityMapIsUsableInline'), bp.indexOf('function proofPrivacyInline'))
    expect(fn).toMatch(/map\.url/)
    expect(fn).toMatch(/map\.name/)
    expect(fn).toMatch(/surfaceIds/)
    expect(fn).toMatch(/length > 0/)
  })
})

describe('what the block tells the writer', () => {
  const fn = bp.slice(bp.indexOf('function communityBlockInline'), bp.indexOf('\n}\n', bp.indexOf('function communityBlockInline')))

  it('returns nothing when there is no usable map', () => {
    expect(fn).toMatch(/if \(!communityMapIsUsableInline\(raw\)\) return ''/)
  })

  // ⚠️ AN EMPTY FIGURE LIST IS AN INSTRUCTION, NOT AN OMISSION. Saying nothing
  // about numbers would let the model supply its own; "say NO number" is the
  // only version that holds.
  it('says NONE explicitly when the creator gave no figures', () => {
    expect(fn).toMatch(/NONE/)
    expect(fn).toMatch(/no number/i)
  })

  it('forbids inventing a page and forbids the vague instruction', () => {
    expect(fn).toMatch(/never invent a page/i)
    expect(fn).toMatch(/show your community/i)
  })

  // ⚖️ THE COVERING LINE IS OWED BY THE PAGE, and only for pages whose items are
  // not already permitted — otherwise it is noise, and noise teaches creators to
  // skip the instruction that matters.
  it('demands covering only for crowd pages nobody permitted', () => {
    expect(fn).toMatch(/proofPrivacyInline\(i\) !== 'blur'/)
    expect(fn).toMatch(/cover the names/i)
  })

  // ⚠️ AND IT NEVER ASKS FOR A CAPTURE. Twin does not direct screen recordings.
  it('never asks the creator to record a screen', () => {
    const stripped = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(stripped).not.toMatch(/screen[\s-]?record/i)
  })
})

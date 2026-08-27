// ⚠️ INLINED BECAUSE EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`. This keeps
// the copy in generate-blueprint/index.ts honest against the shared, tested
// original by running both over the same fixtures and diffing byte for byte —
// same discipline as style-compiler-parity.test.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractSignaturePhrases, renderSignaturePhrases } from '../signaturePhrases'

const FN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'supabase', 'functions')
const SRC = readFileSync(join(FN, 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  const start = SRC.indexOf('// ── SIGNATURE PHRASES (inlined')
  const end = SRC.indexOf('/**\n * THE COMMUNITY MAP, READ INLINE', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const body = SRC.slice(start, end)
    // Strip the TS-only annotations the Function constructor cannot parse.
    .replace(/: ReadonlySet<string>/g, '')
    .replace(/interface SignaturePhraseInline \{[\s\S]*?\}/, '')
    .replace(/: SignaturePhraseInline\[\]/g, '').replace(/: SignaturePhraseInline\b/g, '')
    .replace(/: readonly \{ id: string; text: string \}\[\]/g, '')
    .replace(/: readonly SignaturePhraseInline\[\]/g, '')
    .replace(/: string\[\]/g, '').replace(/: string\b/g, '').replace(/: boolean\b/g, '')
    .replace(/as const/g, '')
    .replace(/new Map<string, Set<string>>/g, 'new Map')
    .replace(/new Map<[^>]*>/g, 'new Map')
    .replace(/new Set<[^>]*>/g, 'new Set')
    .replace(/byVideoId\.get\(id\)!/g, 'byVideoId.get(id)')
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${body}
    return { extractSignaturePhrasesInline, renderSignaturePhrasesInline }`)
  return factory() as {
    extractSignaturePhrasesInline: typeof extractSignaturePhrases
    renderSignaturePhrasesInline: typeof renderSignaturePhrases
  }
}

const FIXTURES: { id: string; text: string }[][] = [
  [],
  [{ id: 'a', text: 'listen closely friends because growth compounds slowly' }],
  [
    { id: 'a', text: 'listen closely friends because growth compounds slowly' },
    { id: 'b', text: 'listen closely friends this changes everything for real' },
    { id: 'c', text: 'listen closely friends nobody talks about this enough' },
  ],
  [
    { id: 'a', text: 'start of the day matters most to me honestly' },
    { id: 'b', text: 'start of the day sets everything up for success' },
    { id: 'c', text: 'start of the day changed for me last year' },
    { id: 'd', text: 'a completely unrelated sentence about nothing at all' },
  ],
]

describe('the inlined copy matches the shared original byte for byte', () => {
  const { extractSignaturePhrasesInline, renderSignaturePhrasesInline } = loadInline()

  it.each(FIXTURES.map((f, i) => [i, f] as const))('fixture %i', (_i, fixture) => {
    const shared = extractSignaturePhrases(fixture)
    const inline = extractSignaturePhrasesInline(fixture)
    expect(inline).toEqual(shared)
    expect(renderSignaturePhrasesInline(inline)).toBe(renderSignaturePhrases(shared))
  })
})

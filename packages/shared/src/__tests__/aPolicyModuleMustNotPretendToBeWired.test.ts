import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// ⚠️ THIS TEST GUARDS A SENTENCE, NOT A BEHAVIOUR. `cta.ts` opens by declaring
// how CTAs are decided, and every word of it reads as live policy. It is not:
// `resolveCta` has no reader, and the shipped rule lives in generate-blueprint's
// prompt. The header now says so — and this is what stops that paragraph from
// going stale the way the one above it did.
//
// ⚖️ SO A FAILURE HERE IS NOT "SOMEONE BROKE THE CTA". It means someone wired
// `resolveCta` up, which is good and was always allowed — and the header must
// now be rewritten, because the file would otherwise describe itself wrongly in
// the opposite direction.

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

const SEARCH_ROOTS = [
  'packages/shared/src',
  'apps/web/src',
  'supabase/functions',
  'worker/src',
]

/** The three exports that exist only to be called by a caller that never came. */
const UNWIRED = ['resolveCta', 'MECHANISM_FROM_GOAL'] as const

function sourceFiles(dir: string): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return [] }
  const out: string[] = []
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.turbo') continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue }
    if (!/\.tsx?$/.test(e)) continue
    // A test calling it is exactly what we expect and must not count.
    if (/\.test\.tsx?$/.test(e) || full.includes('__tests__')) continue
    out.push(full)
  }
  return out
}

// ⚠️ A GUARD THAT GREPS SOURCE TEXT MUST TELL A MENTION FROM A CALL. This repo
// has been bitten twice by exactly that: a `<Section` count matched the comment
// protecting it, and an affiliateUrl assertion counted a comment that merely
// NAMED the field. So drop WHOLE-LINE comments only — never everything after a
// `//`, or a real call sitting after a string containing "https://" would
// vanish and this guard would stop catching the thing it exists for.
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

describe('cta.ts must not describe itself as wired when it is not', () => {
  const files = SEARCH_ROOTS.flatMap((r) => sourceFiles(join(ROOT, r)))

  it('finds the source tree at all', () => {
    // ⚠️ AN EMPTY FILE LIST WOULD MAKE EVERY ASSERTION BELOW PASS VACUOUSLY —
    // the "absence of an error is not evidence a check ran" trap, in the one
    // place it would be silent.
    expect(files.length).toBeGreaterThan(300)
    expect(files.some((f) => f.endsWith('generate-blueprint/index.ts'))).toBe(true)
  })

  for (const name of UNWIRED) {
    it(`${name} still has no caller outside cta.ts and its tests`, () => {
      const callers = files.filter((f) => {
        if (f.endsWith(join('packages', 'shared', 'src', 'cta.ts'))) return false
        return new RegExp(`\\b${name}\\b`).test(codeOnly(readFileSync(f, 'utf8')))
      })
      expect(
        callers.map((f) => f.slice(ROOT.length)),
        `${name} now has a reader — REWRITE the header of packages/shared/src/cta.ts, which currently states it has none`,
      ).toEqual([])
    })
  }

  // ⚖️ THE WORDING IS THE OTHER HALF, AND IT ALREADY EARNED ITS KEEP. The first
  // version of this test asserted that NO sentence in `GENERATED_TEXT` reaches
  // shipping code. It failed on its first run and it was right to:
  // `recordingScriptAdapter` carries its own `ctaLine || 'Follow for more'`.
  // That copy is deliberate, documented, and the line a creator actually sees —
  // so the property worth holding is not "nowhere", it is "nowhere NEW".
  //
  // ⚠️ WHICH MAKES THIS THE POINT OF THE WHOLE FILE. Someone editing
  // `GENERATED_TEXT` below would change nothing a creator reads, because the
  // sentence they see is defined somewhere else. Pinning the known duplicate is
  // what turns that from a fact I happened to find into one the next person is
  // told.
  const KNOWN_DUPLICATES: Readonly<Record<string, readonly string[]>> = Object.freeze({
    'Follow for more': Object.freeze(['packages/shared/src/recordingScriptAdapter.ts']),
  })

  it('no CTA sentence gains a new definition outside cta.ts', () => {
    const ctaPath = join('packages', 'shared', 'src', 'cta.ts')
    const cta = readFileSync(join(ROOT, 'packages/shared/src/cta.ts'), 'utf8')
    const block = cta.match(/const GENERATED_TEXT[\s\S]*?\n\}/)?.[0]
    expect(block, 'GENERATED_TEXT not found — has cta.ts been restructured?').toBeTruthy()
    const sentences = [...(block as string).matchAll(/'([^']{8,})'/g)].map((m) => m[1])
    expect(sentences.length).toBeGreaterThanOrEqual(5)

    for (const s of sentences) {
      const shipped = files
        .filter((f) => !f.endsWith(ctaPath))
        .filter((f) => codeOnly(readFileSync(f, 'utf8')).includes(s))
        .map((f) => f.slice(ROOT.length).replace(/^[/\\]/, ''))
      expect(
        shipped,
        `"${s}" is defined by cta.ts and now also appears here — either it is a NEW second definition (edit the one a creator actually reads, not cta.ts) or the header and KNOWN_DUPLICATES must be updated`,
      ).toEqual([...(KNOWN_DUPLICATES[s] ?? [])])
    }
  })

  // ⚖️ AND THE LIVE HALF MUST STAY LIVE. Deleting the module wholesale would
  // take these with it, so the header's claim about them is asserted too.
  it('the parts the header calls live really are', () => {
    const readsMechanisms = files.filter((f) => /\bCTA_MECHANISMS\b/.test(codeOnly(readFileSync(f, 'utf8'))))
    const readsConfirmed = files.filter((f) => /\bhasConfirmedCta\b/.test(codeOnly(readFileSync(f, 'utf8'))))
    expect(readsMechanisms.length).toBeGreaterThan(0)
    expect(readsConfirmed.length).toBeGreaterThan(0)
  })
})

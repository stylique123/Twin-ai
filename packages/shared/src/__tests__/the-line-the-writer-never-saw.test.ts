import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ⚠️ WRITTEN AND NEVER READ. `creator_summary` is asked for on the add form
// ("in one line, what is it and who is it for?"), stored on `product_entities`,
// and — until this branch — never selected by the writer. The creator typed the
// only sentence anyone had written about their product and the script was
// generated without it. This guard holds the WHOLE chain: the form captures it,
// the api sends and parses it, the edge function SELECTS it, and the prompt
// emits it only as the fallback it is.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(repo, ...p), 'utf8')

const edge = read('supabase', 'functions', 'generate-blueprint', 'index.ts')
const api = read('packages', 'shared', 'src', 'api.ts')
const form = read('apps', 'web', 'src', 'pages', 'ProductLibrary.tsx')

// Whole-line comments only — a `//` mid-line is code, and stripping from `//`
// onward would delete the code that precedes it.
const codeOf = (src: string) =>
  src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const edgeCode = codeOf(edge)

describe('the creator still gets asked, and the answer still travels', () => {
  it('the add form sends the line it collected', () => {
    expect(codeOf(form)).toMatch(/creatorSummary:\s*summary/)
  })

  it('the api writes it and reads it back', () => {
    const apiCode = codeOf(api)
    expect(apiCode).toMatch(/creator_summary:\s*entity\.creatorSummary/)
    expect(apiCode).toMatch(/row\.creator_summary/)
  })
})

describe('the writer selects the column it reads', () => {
  // ⚖️ THE SAME DEFECT AS `selected_product_id`: an optional chain over a column
  // that was never selected makes the absence look like a legitimate null.
  it('the owned-entity select asks for creator_summary', () => {
    const select = edgeCode.match(/\.select\('id, name,[^']*'\)/)
    expect(select).not.toBeNull()
    expect(select![0]).toContain('creator_summary')
  })

  it('the prompt actually reads it', () => {
    expect(edgeCode).toMatch(/ownedEntity as \{ creator_summary\?: unknown \}/)
    expect(edgeCode).toMatch(/HOW THE CREATOR DESCRIBES THIS PRODUCT/)
  })
})

describe('it is a fallback, not a peer of the graded facts', () => {
  // ⚠️ TWO AUTHORITIES FOR ONE FACT. `usableProductFacts` were graded by the
  // extraction classifier and reviewed by the creator; this line was neither.
  // Emitting both would let the unreviewed sentence inherit the trust of the
  // reviewed ones — so it is gated on the graded set being EMPTY.
  it('emits only when no graded product fact reached the writer', () => {
    expect(edgeCode).toMatch(/usableProductFacts\.length === 0 && creatorSummaryLine !== ''/)
  })

  it('labels it as unverified rather than as a checked fact', () => {
    const block = edgeCode.slice(edgeCode.indexOf('HOW THE CREATOR DESCRIBES THIS PRODUCT'))
    expect(block.slice(0, 600)).toMatch(/not a checked fact/)
    expect(block.slice(0, 600)).toMatch(/Do not turn it into a capability claim/)
  })

  it('bounds the length so one field cannot swallow the prompt', () => {
    expect(edgeCode).toMatch(/creatorSummaryLine\.slice\(0, 300\)/)
  })
})

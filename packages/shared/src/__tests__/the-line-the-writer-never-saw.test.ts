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
  // reviewed ones — so it stays BELOW them and keeps its own label.
  //
  // ⚠️⚠️ THIS ASSERTION USED TO REQUIRE THE GRADED SET TO BE *EMPTY*, AND
  // MEASUREMENT OVERTURNED THAT. Production, 2026-09-14, on the account that
  // produced the ask-beat session:
  //
  //   Custom Bible Rebind ... 0 usable facts -> description emitted -> good scripts
  //   The Nook Pattern ...... 1 usable fact  -> description WITHHELD -> ask-beats
  //   Pueblo Bifold ......... 1 usable fact  -> description WITHHELD
  //
  // At exactly zero the rule worked. At ONE it starved the writer: the graded
  // block emitted a single attribute and the creator's own sentence was
  // suppressed, leaving a name and one field to fill six beats. The Nook
  // produced 1 ask-beat at 30s and 2 at 90s for that reason.
  //
  // ⚖️ SO THE GATE IS A FLOOR NOW, AND THE ORIGINAL WORRY IS STILL HONOURED —
  // by ORDER AND LABEL rather than by suppression, which the two assertions
  // below pin. "Fallback, not a peer" was always the right sentence; "only when
  // empty" was the wrong mechanism for it.
  it('emits whenever the graded set is too thin to carry a script alone', () => {
    expect(edgeCode).toMatch(
      /usableProductFacts\.length < MIN_GRADED_FACTS_TO_STAND_ALONE && creatorSummaryLine !== ''/)
    const floor = edgeCode.match(/const MIN_GRADED_FACTS_TO_STAND_ALONE = (\d+)/)
    expect(floor).not.toBeNull()
    expect(Number(floor![1])).toBeGreaterThan(1)
  })

  it('stays BELOW the graded block, so it cannot inherit its trust', () => {
    const graded = edgeCode.indexOf('WHAT IS TRUE ABOUT THIS PRODUCT')
    const own = edgeCode.indexOf('HOW THE CREATOR DESCRIBES THIS PRODUCT')
    expect(graded).toBeGreaterThan(-1)
    expect(own).toBeGreaterThan(graded)
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

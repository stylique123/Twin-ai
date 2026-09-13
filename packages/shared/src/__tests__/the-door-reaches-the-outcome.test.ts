// THE DOOR TRAVELLED FOUR SCREENS AND STOPPED ONE SHORT OF THE RECORD.
//
// ⚠️ IT WAS ALREADY BEING RECORDED — SOMEWHERE ELSE, ANSWERING SOMETHING ELSE.
// `entry_impressions` (0183) has one row per door taken. It knows a creator went
// through a door; it does not know what the build that door opened turned into,
// and nothing joins the two. This is the third variant of the project's dominant
// defect in as many days: not "built and unread", but "read for a different
// question than the one being asked".
//
// ⚖️ AND THE DOOR IS STATED, WHICH IS THE WHOLE REASON IT IS WORTH A COLUMN. The
// handler can see `reference_url` and could infer something door-shaped. What it
// cannot do is tell "she chose the idea door" from "she pasted text that did not
// look like a URL" — both arrive with no link. That distinction is what
// `entryDoor.ts` exists for, so a derived column would answer a different
// question than its name.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { readEntryDoor } from '../entryDoor'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(
  resolve(ROOT, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline(): (raw: unknown) => string | null {
  const start = EDGE.indexOf('function entryDoorInline')
  const end = EDGE.indexOf('function followerBandInline')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(
    EDGE.slice(start, end) + '\nreturn entryDoorInline',
    { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(js)() as (raw: unknown) => string | null
}
const inline = loadInline()

// ⚠️ THE EXPECTATION IS DERIVED FROM THE SHARED MODULE, NOT RETYPED. A test that
// lists the four doors itself is a third copy of the list, and the day a fifth
// door is added it is the copy that stays silent. `readEntryDoor` reports
// `source: 'chosen'` exactly when it recognised the value — that IS the
// membership question, asked of the module that owns the answer.
function sharedAccepts(raw: unknown): string | null {
  const read = readEntryDoor({ chosen: raw as string | null | undefined, text: '' })
  return read.source === 'chosen' ? read.door : null
}

describe('the two door readers agree', () => {
  const CASES: unknown[] = [
    'reference', 'idea', 'product', 'browse',
    // Whitespace, because navigation state and query strings carry it.
    ' product ', '\tidea\n',
    // Near-misses, casing, and a fifth door someone might invent.
    'Reference', 'REFERENCE', 'references', 'gallery', 'none', '',
    // And the shapes a request body can genuinely hold.
    null, undefined, 0, 1, NaN, {}, [], true, false,
  ]
  for (const c of CASES) {
    it(`agrees on ${JSON.stringify(c) ?? String(c)}`, () => {
      expect(inline(c)).toBe(sharedAccepts(c))
    })
  }

  it('the table covers all four doors, or a mirror returning null always passes', () => {
    const got = new Set(CASES.map(sharedAccepts).filter((d) => d !== null))
    expect(got).toEqual(new Set(['reference', 'idea', 'product', 'browse']))
  })

  it('and it covers refusal — an unknown door is null, never itself', () => {
    expect(inline('gallery')).toBeNull()
    expect(inline('Reference')).toBeNull()
  })
})

describe('the value reaches the row', () => {
  const code = EDGE.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')
      && !l.trim().startsWith('/*')).join('\n')

  it('every call site passes it — the rescue path included', () => {
    // Checked inside each argument object rather than by counting: the
    // interface declares the field too, so a count passes against
    // declaration-plus-one-pass. (That mistake was made in #847 and caught.)
    const calls = [...code.matchAll(/recordWhatWasChosen\(admin, \{/g)]
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) {
      const args = code.slice(c.index!, c.index! + 1400)
      const close = args.indexOf('})')
      expect(close).toBeGreaterThan(-1)
      expect(args.slice(0, close)).toMatch(/entryDoor:\s*entryDoorInline\(body\.door\)/)
    }
  })

  it('it is validated on the way in, never stored as sent', () => {
    // A raw `body.door` reaching the insert would let any string become a fifth
    // door — and the CHECK would then reject the whole row, not just the field.
    expect(code).not.toMatch(/entry_door:\s*body\.door/)
    expect(code).toMatch(/entry_door:\s*input\.entryDoor/)
  })

  it('and the request type admits it', () => {
    expect(code).toMatch(/door\?: string/)
  })
})

describe('the client says which door, and only when she said', () => {
  const WEB = readFileSync(
    resolve(ROOT, 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')
  const API = readFileSync(resolve(ROOT, 'packages', 'shared', 'src', 'api.ts'), 'utf8')

  it('the build request carries the door from nav state', () => {
    // ⚠️ ASSERTED INSIDE THE generateBlueprint ARGUMENT OBJECT. `state.door` is
    // read elsewhere on this screen (`isProductSubject`), so a bare grep for it
    // passed before this change shipped and would pass again if the field were
    // removed from the request.
    const call = WEB.indexOf('const gen = await generateBlueprint({')
    expect(call).toBeGreaterThan(-1)
    const args = WEB.slice(call, WEB.indexOf('\n        })', call))
    expect(args).toMatch(/\.\.\.\(state\.door \? \{ door: state\.door \} : \{\}\)/)
  })

  it('and an absent door is omitted, not defaulted', () => {
    const call = WEB.indexOf('const gen = await generateBlueprint({')
    const args = WEB.slice(call, WEB.indexOf('\n        })', call))
    // Any of these would put an invented answer into the record.
    expect(args).not.toMatch(/door: state\.door \?\? ['"]/)
    expect(args).not.toMatch(/door: ['"](reference|idea|product|browse)['"]/)
  })

  it('the wire type names the door as the shared enum, not a string', () => {
    expect(API).toMatch(/door\?: EntryDoor/)
  })
})

describe('the migration admits exactly the four doors', () => {
  const sql = readFileSync(
    resolve(ROOT, 'supabase', 'migrations',
      '0204_the_door_she_took_never_reached_the_outcome.sql'), 'utf8')

  it('the CHECK admits EXACTLY four, and no fifth', () => {
    const clause = sql.slice(sql.indexOf('entry_door is null'))
    const admitted = new Set(
      [...clause.slice(0, clause.indexOf(')')).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]))
    expect(admitted).toEqual(new Set(['reference', 'idea', 'product', 'browse']))
  })

  it('null stays legal — she did not say is not a door', () => {
    expect(sql).toMatch(/entry_door is null/)
  })

  it('it drops its own constraint before adding it, so it re-runs', () => {
    const drop = sql.indexOf('drop constraint if exists generation_outcomes_entry_door_known')
    const add = sql.indexOf('add constraint generation_outcomes_entry_door_known')
    expect(drop).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(drop)
  })

  it('and it still does not add the two dimensions that have no writer', () => {
    expect(sql).not.toMatch(/add column if not exists (hook_shape|angle_type)\b/)
  })
})

describe('the migration is in the APPLIED list, never EXCLUDED', () => {
  const wf = readFileSync(
    resolve(ROOT, '.github', 'workflows', 'staging-integration.yml'), 'utf8')
  it('staging applies it', () => {
    expect(wf).toContain('0204_the_door_she_took_never_reached_the_outcome')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PERSONAL_USE_STATES, attestedEntity, inferShowability } from '../productEntity'

// ⚠️ THREE DEFECTS THAT ALL SHIPPED, AND ALL THREE WERE INVISIBLE FROM INSIDE
// THE FILE THAT CAUSED THEM. Each needs a guard that reads ACROSS files, because
// each was a promise one file made and another file broke.
//
// ⚖️ NOT `npm run build` GUARDS. The web build was clean for every one of these:
// an `as` cast satisfied the compiler, a missing argument was an optional
// parameter, and an unselected column was an optional chain. A type checker
// cannot see a value that was cast past it.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(repo, ...p), 'utf8')

/** ⚠️ COMMENTS ARE NOT CODE, AND THE FIRST VERSION OF THIS GUARD COULD NOT TELL.
 *  It scanned the raw file and failed on the comment EXPLAINING the bug — the
 *  words `'DENIED'` and `as PersonalUse` appear there precisely so the next
 *  reader knows what went wrong. A guard that forbids naming a defect makes the
 *  defect harder to document than to repeat, so it strips prose first and asserts
 *  against what actually executes. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('a creator can answer honestly and still add the product', () => {
  const library = codeOnly(read('apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'))

  // ⚠️ THE BUG: the add-from-a-link form offered `'DENIED' as PersonalUse` for
  // "No, I have not". The database CHECK allows only CONFIRMED and
  // NOT_CONFIRMED, and `attestedEntity` passes the value straight through — so
  // the honest answer was the one that could not be saved.
  it('never offers a personal-use value the database would refuse', () => {
    // Every quoted ALL-CAPS token sitting in a `value:` or tuple position next to
    // a personal-use label has to be a real state.
    const suspects = [...library.matchAll(/'([A-Z_]{4,})'/g)].map((m) => m[1])
    const personalUseShaped = suspects.filter((s) => /CONFIRMED|DENIED|USED|UNUSED/.test(s))
    expect(personalUseShaped.length).toBeGreaterThan(0)
    for (const s of personalUseShaped) {
      expect(PERSONAL_USE_STATES as readonly string[]).toContain(s)
    }
  })

  // ⚖️ THE CAST IS THE MECHANISM, SO THE CAST IS WHAT THE GUARD BANS. Without
  // this, the next person writes `'DENIED' as PersonalUse` again and the
  // compiler stays silent again.
  it('does not cast strings into PersonalUse', () => {
    expect(library).not.toMatch(/as\s+PersonalUse/)
  })
})

describe('a product added from the Library is not born unshowable', () => {
  // ⚠️ THE BUG: the Library minted with no flags, so showability was UNKNOWN,
  // and generate-blueprint renders UNKNOWN as "the creator CANNOT put it on
  // screen. Write NO shot that requires showing, holding or demonstrating it."
  // Every Library product silently became a talking-only script.
  it('an answered account capability reaches showability', () => {
    const withAnswer = attestedEntity({
      relationship: 'AFFILIATE', personalUse: 'CONFIRMED', type: 'PHYSICAL_PRODUCT',
      name: 'A book', flags: { canFilmObjects: true, canRecordScreen: null },
    })
    expect(withAnswer.showability).toBe('ALWAYS')
  })

  // ⚖️ AND SILENCE IS STILL SILENCE. The fix reads an answer the creator gave;
  // it must never manufacture one. This is the half that keeps the fix from
  // becoming the opposite bug.
  it('an unanswered capability still yields UNKNOWN, never a permission', () => {
    const noAnswer = attestedEntity({
      relationship: 'AFFILIATE', personalUse: 'CONFIRMED', type: 'PHYSICAL_PRODUCT',
      name: 'A book', flags: { canFilmObjects: null, canRecordScreen: null },
    })
    expect(noAnswer.showability).toBe('UNKNOWN')
    expect(inferShowability('PHYSICAL_PRODUCT', {})).toBe('UNKNOWN')
  })

  it('an explicit no is still a no', () => {
    expect(inferShowability('PHYSICAL_PRODUCT', { canFilmObjects: false })).toBe('NEVER')
  })

  // The claim path must actually perform the lookup — a fix that lives only in
  // a comment is the state this repo keeps rediscovering.
  it('claimProductEntity reads the account default when no flags were supplied', () => {
    const api = read('packages', 'shared', 'src', 'api.ts')
    const fn = api.slice(api.indexOf('export async function claimProductEntity'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toMatch(/default_capability_flags/)
    expect(body).toMatch(/attestedEntity\(\s*\{\s*\.\.\.attestation/)
  })
})

describe('the product a script was written about is recorded', () => {
  // ⚠️ THE BUG: `selected_product_id` read `ownedEntity?.id` from a select that
  // did not include `id`, so it was always null and every generation looked like
  // it had no product. The optional chain made the absence legitimate-looking.
  it('every column the owned-entity read consumes is actually selected', () => {
    const bp = read('supabase', 'functions', 'generate-blueprint', 'index.ts')
    const at = bp.indexOf("from('product_entities')")
    expect(at).toBeGreaterThan(-1)
    const select = bp.slice(at, bp.indexOf('.maybeSingle()', at))
    const columns = select.match(/\.select\('([^']+)'\)/)?.[1] ?? ''
    expect(columns.split(',').map((c) => c.trim())).toContain('id')
  })

  it('and selected_product_id is still read from it', () => {
    const bp = read('supabase', 'functions', 'generate-blueprint', 'index.ts')
    expect(bp).toMatch(/selected_product_id[^\n]*ownedEntity\?\.id/)
  })
})

// THE GALLERY BACKFILL WROTE A COLUMN THAT DOES NOT EXIST.
//
// ⚠️ FILED AS "BUILT, NOT WIRED" AND THAT IS NOT WHAT IT WAS. 0106 added
// `requires_filming_objects` and `requires_screen_recording`; 16,044 cards
// carry NULL in both, 100%, measured 2026-09-09. The backfill that would fill
// them has existed for weeks and its `--decide` mode emits writes carrying an
// `evidence` field. `gallery_items` has no `evidence` column, so every write
// would have failed with "column does not exist".
//
// It was never wired because it was never runnable. Nobody who tried got past
// the first row.
//
// ⚠️⚠️ AND THE FIX IS THE COLUMN, NOT DROPPING THE FIELD, BECAUSE THIS WRITE IS
// PERMANENT. The candidate filter is `where requirements_source is null`, so a
// card this pass answers is never offered to assessment again — a false
// positive closes the file rather than being corrected later.
//
// Measured against the shipped vocabulary today: 485 cards match an object
// marker and 182 of them are the virtual-try-on cluster — videos that genuinely
// contain "haul" and contain no physical product. Without #772's
// OBJECT_DISQUALIFIERS this backfill would have written 182 permanent wrong
// answers out of 485. That is 37.5%, and it is why the evidence has to survive.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assessFromText, isConclusive } from '../referenceAssessment'

const dir = dirname(fileURLToPath(import.meta.url))
const MIG = readFileSync(join(dir, '..', '..', '..', '..', 'supabase', 'migrations',
  '0194_the_backfill_wrote_a_column_that_did_not_exist.sql'), 'utf8')
const SCRIPT = readFileSync(join(dir, '..', '..', '..', '..', 'scripts', 'qa',
  'gallery-requirements-backfill.mjs'), 'utf8')

describe('the field the script emits now has somewhere to land', () => {
  it('the script still emits evidence', () => {
    // ⚠️ IF THIS EVER STOPS BEING TRUE the migration is dead weight — and worse,
    // the permanence argument below would be protecting nothing.
    expect(SCRIPT).toMatch(/evidence: a\.evidence/)
  })

  it('and the column exists for it', () => {
    expect(MIG).toMatch(/add column if not exists evidence jsonb/)
  })

  it('nullable, because null is "not recorded" and not "found nothing"', () => {
    // ⚖️ THE ROWS A VISION PASS WILL EVENTUALLY FILL carry evidence of a
    // different kind. An empty array here would claim this text pass looked.
    expect(MIG).not.toMatch(/evidence jsonb not null/)
    expect(MIG).toMatch(/never "looked and found nothing"/)
  })

  it('records why permanence makes the evidence load-bearing', () => {
    expect(MIG).toMatch(/requirements_source is null/)
    expect(MIG).toMatch(/37\.5%|182/)
  })
})

describe('the disqualifier is what makes the write safe', () => {
  it('a virtual try-on haul is refused despite the marker', () => {
    // ⚠️ THE 182-CARD CLUSTER, AS ONE CASE. The word is really there; the
    // product is not.
    const a = assessFromText({ title: 'AI try-on haul', why: 'virtual try-on of the new drop' })
    expect(a.requiresFilmingObjects).toBeNull()
    expect(isConclusive(a)).toBe(false)
  })

  it('a real haul is still conclusive, and says what it matched', () => {
    const a = assessFromText({ title: 'unboxing my new camera', why: 'hands-on with the kit' })
    expect(a.requiresFilmingObjects).toBe(true)
    expect(a.evidence.length).toBeGreaterThan(0)
    // ⚖️ THE EVIDENCE IS THE ARGUABLE PART. A permanent answer with no record of
    // what produced it cannot be disputed by anybody.
    expect(a.evidence.join(' ')).toMatch(/unboxing|hands-on/)
  })

  it('a card with no marker concludes nothing rather than false', () => {
    // ⚠️ ABSENT IS NOT FALSE. `requiresFilmingObjects` is `true` or `null`,
    // never `false` — a card nobody could read is not a card that needs no
    // objects, and marking it examined would hide it from the vision pass.
    const a = assessFromText({ title: 'my morning routine', why: 'a tutorial' })
    expect(a.requiresFilmingObjects).toBeNull()
    expect(a.requiresScreenRecording).toBeNull()
    expect(isConclusive(a)).toBe(false)
  })
})

// Hard-limit regression tests (#1163, wiring ledger 8.1-2, Phase R).
// #1163 put the trial on HARD_LIMIT instead of SENSITIVE. privacyGuard.test.ts
// covers guardScript; these cover what it did not: every HARD_LIMIT pattern,
// the story gate in hard-limits mode, and the edge/worker copies.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HARD_LIMIT, SENSITIVE, gateStories } from '../storyRotation'
import { guardScript, isHardLimit } from '../privacyGuard'

describe('HARD_LIMIT: every pattern still matches', () => {
  it.each([
    'Our home address is on the invoice.',
    'My address is on every label.',
    'The street address is printed on the bag.',
    'This is where I live exactly.',
    'We roast at 18 Elm Street most days.',
    'Drop by 7 Old Mill Avenue on Friday.',
    'Here are the coordinates for the cart.',
    'Turn on GPS and find us.',
    'We sit at the corner of Fifth and Main.',
    "My son's name is Theo.",
    'Our daughter is named Ava.',
    'My kid called Sam helps out.',
    "Our kids' teacher wrote to us.",
    'Our kids go to Lincoln Elementary.',
    'My child attends to a class nearby.',
    'Our daughter goes to the academy downtown.',
  ])('%s', (line) => {
    expect(isHardLimit(line)).toBe(true)
  })

  it.each([
    'I roast in a small town in New Mexico.',
    'The health inspector came by and said we passed.',
    'Money was tight that first winter.',
    'My daughter loves the dark roast.',
    'Kids love the hot chocolate.',
  ])('topic or town alone is not a hard limit: %s', (line) => {
    expect(isHardLimit(line)).toBe(false)
  })

  it('every hard limit stays private for everyone else too (no loosening of the default)', () => {
    for (const line of ['Our home address is on the invoice.', "Our daughter's school sent a note."]) {
      expect(SENSITIVE.test(line)).toBe(true)
    }
  })
})

describe('gateStories in hard-limits mode (trial)', () => {
  const stories = [
    { id: 'a', kind: 'story', text: 'The day the inspector came and we passed.' },
    { id: 'b', kind: 'story', text: 'Customers found us at 412 Cedar Lane Road.' },
    { id: 'c', kind: 'story', text: "Our son's school asked us to cater the fair." },
  ]
  it('a hard-limit story is withheld; a topic-only story is kept', () => {
    const r = gateStories(stories, { hardLimitsOnly: true })
    expect(r.sensitive.map((s) => s.id)).toEqual(['b', 'c'])
    expect(r.kept.map((s) => s.id)).toEqual(['a'])
  })
  it('the default gate is unchanged: the topic story is withheld too', () => {
    const r = gateStories(stories, {})
    expect(r.sensitive.map((s) => s.id)).toEqual(expect.arrayContaining(['a', 'c']))
  })
  it('a hard limit hidden in the evidence still withholds the story', () => {
    const r = gateStories([{ id: 'd', kind: 'story', text: 'Our first market day.', evidence: 'GPS coordinates of the stall' }], { hardLimitsOnly: true })
    expect(r.sensitive.map((s) => s.id)).toEqual(['d'])
  })
})

describe('guardScript hard-limits mode cuts a hard limit in any beat', () => {
  it('cuts only the hard-limit beats of a mixed script', () => {
    const beats = [
      { line: 'The inspector came by.' },
      { line: 'We moved to 9 Birch Road last spring.' },
      { line: 'Sales doubled.' },
      { line: 'My son goes to the school next door.' },
    ]
    const g = guardScript(beats, { allowedText: '', excludedTexts: [], hardLimitsOnly: true })
    expect(g.removed.filter((r) => r.reason === 'private').map((r) => r.beat)).toEqual([1, 3])
  })
})

describe('known gap found while writing these tests', () => {
  // "My children attend the school on the hill." does not match: the pattern
  // needs "attend to". Recorded for the owner to decide; not changed here.
  it.todo('"attend <school>" without "to" is a hard limit')
})

describe('edge and worker copies carry the same HARD_LIMIT', () => {
  const root = resolve(__dirname, '../../../../..')
  const src = (p: string) => readFileSync(resolve(root, p), 'utf8')
  const line = (text: string) => text.split('\n').find((l) => l.startsWith('export const HARD_LIMIT'))
  const shared = line(src('packages/shared/src/script/storyRotation.ts'))
  it.each([
    'supabase/functions/_shared/storyRotation.ts',
    'worker/src/generated/storyRotation.ts',
  ])('%s', (p) => {
    expect(shared).toBeTruthy()
    expect(line(src(p))).toBe(shared)
  })
  it('the regex in use is the one in the source line', () => {
    expect(shared).toContain(HARD_LIMIT.source)
  })
})

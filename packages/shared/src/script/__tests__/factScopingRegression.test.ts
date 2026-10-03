// Part 5 regression: the three known leaks (cup score, two-pound, police) can
// never reach a finished script unless she allowed them, and every door in the
// writer reads through the same rule.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guardScript, privateSqlPattern } from '../privacyGuard.js'

const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
const MIG = readFileSync(new URL('../../../../../supabase/migrations/0255_private_by_model_or_word.sql', import.meta.url), 'utf8')

const STORED = [
  'Her cups score above 80 at the roaster.',
  'She ran out of stock and was down to zero inventory with a two-pound bag left.',
  'The police came to the market stall.',
]
const beats = [
  { line: 'I roast every batch by hand. These cups score above eighty.' },
  { line: 'We were down to one two-pound bag. So I kept going.' },
  { line: 'Then the police showed up. I still opened the next day.' },
]

describe('known-bad facts never ship unless allowed', () => {
  it('removes all three when she did not supply them', () => {
    const r = guardScript(beats, { allowedText: 'I roast coffee by hand.', excludedTexts: STORED })
    const text = r.beats.map((b) => b.line).join(' ')
    expect(text).not.toMatch(/eighty|two-pound|police/i)
    expect(text).toMatch(/roast every batch/)
    expect(r.removed.length).toBe(3)
  })
  it('keeps them when she typed them for this video', () => {
    const r = guardScript(beats, { allowedText: `${STORED.join(' ')} police`, excludedTexts: [] })
    expect(r.removed).toEqual([])
  })
})

describe('every door reads through the rule', () => {
  it('the writer reads the view, not the table, for ranked and asked rows', () => {
    expect(EDGE).toMatch(/rankedRead = await readKnowledge\(\(cols\) => scopeToVoice\(admin\s+\.from\('creator_knowledge_writable'\)/)
    expect(EDGE).toMatch(/askedRead = await readKnowledge\(\(cols\) => scopeToVoice\(admin\s+\.from\('creator_knowledge_writable'\)/)
  })
  it('the final guard runs before the generation is stored', () => {
    expect(EDGE.indexOf('guardScript(bp.script')).toBeGreaterThan(0)
    expect(EDGE.indexOf('guardScript(bp.script')).toBeLessThan(EDGE.indexOf(".from('generations')\n      .insert({"))
  })
  it('profile, lessons, phrases and history are scrubbed', () => {
    expect(EDGE).toMatch(/scrubRejected\(scrubPrivate\(voice/)
    expect(EDGE).toMatch(/lessonRows\.filter\(\(l\) => !isPrivate\(l\.text\)\)/)
    expect(EDGE).toMatch(/cleanCatalogueText/)
  })
  it('the database flag uses the same list as the code', () => {
    expect(MIG).toContain(privateSqlPattern())
  })
})

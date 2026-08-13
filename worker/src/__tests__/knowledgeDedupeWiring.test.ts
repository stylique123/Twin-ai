// THE DEDUPE RULE, AT THE ONLY PLACE IT CAN ACTUALLY RUN.
//
// ⚠️ NINE FIELDS SHIPPED WRITE-ONLY IN ONE SESSION — computed, logged, read by
// nobody. This file exists so that `canonicaliseRepeats` is not the tenth. It
// asserts the rule reaches the database call, and that every way of failing to
// read the store leaves the scan intact.
import { describe, expect, it, vi } from 'vitest'
import { insertKnowledge } from '../knowledgeInsert.js'

const STORED = 'Faster charging is not better for phone battery longevity.'
const REWORDED = 'faster charging is not better for phone battery health'

/** A db whose select returns `stored`, capturing what the merge RPC receives. */
function db(stored: unknown[] | null, opts: { selectable?: boolean; throws?: boolean } = {}) {
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const insert = vi.fn().mockResolvedValue({ error: null })
  const select = vi.fn(() => ({
    eq: () => ({
      eq: () => (opts.throws
        ? Promise.reject(new Error('client blew up'))
        : Promise.resolve({ data: stored, error: null })),
    }),
  }))
  const table = opts.selectable === false ? { insert } : { insert, select }
  return { rpc, insert, db: { rpc, from: () => table } }
}

const row = (text: string) => ({
  owner_id: 'o1', voice_id: 'v1', kind: 'opinion', text, basis: 'stated',
})

describe('the re-wording reaches the merge as a repeat', () => {
  it('rewrites the incoming text to the stored phrasing', async () => {
    const h = db([{ kind: 'opinion', text: STORED }])
    await insertKnowledge(h.db as never, [row(REWORDED)])
    expect(h.rpc).toHaveBeenCalledTimes(1)
    const sent = h.rpc.mock.calls[0][1].p_rows as Array<Record<string, unknown>>
    expect(sent[0].text).toBe(STORED)
    // The rest of the row is untouched — this is a merge, not a replacement.
    expect(sent[0].basis).toBe('stated')
  })

  it('leaves genuinely new material alone', async () => {
    const h = db([{ kind: 'opinion', text: STORED }])
    await insertKnowledge(h.db as never, [row('the hinge fails first on foldables')])
    expect((h.rpc.mock.calls[0][1].p_rows as Array<Record<string, unknown>>)[0].text)
      .toBe('the hinge fails first on foldables')
  })
})

describe('EVERY WAY OF NOT READING THE STORE STILL STORES THE SCAN', () => {
  it.each([
    ['a db that cannot select', () => db(null, { selectable: false })],
    ['a select that throws', () => db(null, { throws: true })],
    ['an empty store', () => db([])],
    ['a null result', () => db(null)],
  ])('%s: the rows are still written, unchanged', async (_label, make) => {
    const h = make()
    const r = await insertKnowledge(h.db as never, [row(REWORDED)])
    expect(r.error).toBeNull()
    expect((h.rpc.mock.calls[0][1].p_rows as Array<Record<string, unknown>>)[0].text)
      .toBe(REWORDED)
  })

  it('skips the lookup when there is no voice to scope it to', async () => {
    // ⚠️ WITHOUT voice_id THE QUERY WOULD SPAN EVERY VOICE THIS OWNER HAS, and
    // merge one creator's wording into another's row.
    const h = db([{ kind: 'opinion', text: STORED }])
    await insertKnowledge(h.db as never, [{ ...row(REWORDED), voice_id: null }])
    expect((h.rpc.mock.calls[0][1].p_rows as Array<Record<string, unknown>>)[0].text)
      .toBe(REWORDED)
  })
})

describe('the fallback path', () => {
  it('inserts the ORIGINAL wording when the merge function is missing', async () => {
    // ⚠️ A CANONICALISED ROW IS AN EXACT REPEAT BY CONSTRUCTION. Sent to a plain
    // insert with no merge behind it, it collides with 0121's unique index and
    // fails the whole batch — the exact defect 0123 was written to fix.
    const rpc = vi.fn().mockResolvedValue({ error: { code: 'PGRST202' } })
    const insert = vi.fn().mockResolvedValue({ error: null })
    const select = vi.fn(() => ({
      eq: () => ({ eq: () => Promise.resolve({ data: [{ kind: 'opinion', text: STORED }], error: null }) }),
    }))
    await insertKnowledge({ rpc, from: () => ({ insert, select }) } as never, [row(REWORDED)])
    expect(insert).toHaveBeenCalledTimes(1)
    expect((insert.mock.calls[0][0] as Array<Record<string, unknown>>)[0].text).toBe(REWORDED)
  })
})

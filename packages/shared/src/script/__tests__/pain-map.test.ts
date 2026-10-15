import { describe, it, expect } from 'vitest'
import { validatePainRow, rowsFromCsv, type PainRow } from '../painMap.ts'

// Fictional rows only. No real thread text, people or communities.
const base: PainRow = {
  niche: 'fictional-gardening', pain_sentence: 'Seedlings keep wilting after repotting',
  pillar_bucket: 'how-to', communities: 'example-forum-a|example-forum-b',
  thread_count: '6', community_count: '2',
  example_links: 'https://example.com/t/1 https://example.org/t/2',
  first_seen: '2026-01-01', last_checked: '2026-02-01', verification: 'V1',
  expiry: '', status: 'active',
}
const v = (o: Partial<PainRow>) => validatePainRow({ ...base, ...o })

describe('pain map validator', () => {
  it('marks a pattern at 5 threads and 2 communities', () => {
    const r = v({ thread_count: '5' })
    expect(r.ok && r.record.kind).toBe('pattern')
    expect(r.ok && r.record.origin).toBe('audience_pain')
  })
  it('marks an idea below either threshold', () => {
    for (const o of [{ thread_count: '4' }, { community_count: '1' }]) {
      const r = v(o)
      expect(r.ok && r.record.kind).toBe('idea')
    }
  })
  it('defaults expiry to last_checked + 90 days', () => {
    const r = v({})
    expect(r.ok && r.record.expiry).toBe('2026-05-02')
    const k = v({ expiry: '2026-03-01' })
    expect(k.ok && k.record.expiry).toBe('2026-03-01')
  })
  it.each([
    ['quote marks', 'They said "it never works"', 'pain_sentence_quote_marks'],
    ['curly quotes', 'Soil feels “off” always', 'pain_sentence_quote_marks'],
    ['@handle', 'Asked @someone about soil', 'pain_sentence_handle'],
    ['u/ handle', 'Per u/fictional_user soil dries', 'pain_sentence_handle'],
    ['most', 'Most growers lose seedlings', 'pain_sentence_absolute'],
    ['everyone', 'Everyone overwaters', 'pain_sentence_absolute'],
    ['nobody', 'Nobody explains drainage', 'pain_sentence_absolute'],
    ['percent sign', 'Lost 40% of seedlings', 'pain_sentence_percentage'],
    ['percent word', 'Ten percent survive', 'pain_sentence_percentage'],
  ])('rejects %s', (_n, s, reason) => {
    const r = v({ pain_sentence: s })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reasons).toContain(reason)
  })
  it('does not trip on words containing the banned ones', () => {
    expect(v({ pain_sentence: 'Almost no guide covers moisture' }).ok).toBe(true)
  })
  it('stores links as URLs only', () => {
    expect(v({ example_links: 'see thread one' }).ok).toBe(false)
    expect(v({ example_links: 'ftp://example.com/x' }).ok).toBe(false)
    const r = v({})
    expect(r.ok && r.record.example_links).toEqual(['https://example.com/t/1', 'https://example.org/t/2'])
  })
  it('rejects bad verification, status and dates', () => {
    expect(v({ verification: 'V3' }).ok).toBe(false)
    expect(v({ status: 'pending' }).ok).toBe(false)
    expect(v({ last_checked: '02/01/2026' }).ok).toBe(false)
  })
  it('parses CSV with quoted fields and requires all columns', () => {
    const head = Object.keys(base).join(',')
    const line = Object.values({ ...base, communities: 'a,b' }).map((x) => `"${x}"`).join(',')
    const rows = rowsFromCsv(`${head}\n${line}\n`)
    expect(rows).toHaveLength(1)
    expect(rows[0].communities).toBe('a,b')
    expect(() => rowsFromCsv('niche,pain_sentence\nx,y')).toThrow(/missing columns/)
  })
})

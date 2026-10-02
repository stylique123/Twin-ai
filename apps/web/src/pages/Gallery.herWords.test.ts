import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..', '..')
const SQL = readFileSync(join(ROOT, 'supabase/migrations/0269_gallery_matches_on_her_words.sql'), 'utf8')
const PAGE = readFileSync(join(__dirname, 'Gallery.tsx'), 'utf8')

describe('the gallery matches on her words, not letters (owner 2026-10-02)', () => {
  it('her head noun marks her niche; generic words never match; bucket-only is not returned', () => {
    expect(SQL).toMatch(/head as \(select w from core where src = 'sub' order by ord desc limit 1\)/)
    expect(SQL).toMatch(/'home','handmade'/)
    expect(SQL).toMatch(/where has_head or n_others > 0/)
    expect(SQL).not.toMatch(/same_bucket/)
  })
  it('"For you" is only what matched once the corpus answered — no padding with other niches', () => {
    expect(PAGE).toMatch(/if \(isForYou && brainMatch\.size > 0\) \{[\s\S]{0,400}out = out\.filter\(\(c\) => rank\(c\) < 2\)/)
    expect(PAGE).not.toMatch(/the rest below are from your wider category/)
  })
})

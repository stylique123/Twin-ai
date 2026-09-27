import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMentions, mentionKnowledge } from '../nicheBrain/mentionsParse'

const text = JSON.stringify({ items: [
  { kind: 'podcast', title: 'Pricing handmade pottery', outlet: 'Maker Talk', url: 'https://makertalk.fm/ep/12', published: '2026-05-01' },
  { kind: 'press', title: 'Toronto potters to watch', outlet: 'Blog', url: 'https://invented.example/x', published: null },
  { kind: 'interview', title: 'Her studio', outlet: 'Instagram', url: 'https://www.instagram.com/p/abc', published: null },
] })

describe('found you elsewhere (24-ideas #15, #16)', () => {
  it('keeps only links on sites the search actually returned, never her own channels', () => {
    const out = parseMentions(`here: ${text}`, [{ uri: 'https://vertexaisearch.cloud.google.com/r/1', title: 'makertalk.fm' }, { uri: 'https://x', title: 'instagram.com' }])
    expect(out.map((m) => m.url)).toEqual(['https://makertalk.fm/ep/12'])
    expect(parseMentions('no json', [])).toEqual([])
  })
  it('a confirmed mention becomes a plain fact about her', () => {
    expect(mentionKnowledge({ kind: 'podcast', title: 'Pricing handmade pottery', outlet: 'Maker Talk' }))
      .toEqual({ kind: 'experience', text: 'Was a guest on Maker Talk (podcast): "Pricing handmade pottery"' })
    expect(mentionKnowledge({ kind: 'press', title: 'T', outlet: 'Star' }).kind).toBe('fact')
  })
  it('only confirmed mentions are filed, and she is the one who confirms', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    expect(readFileSync(join(repo, 'worker/src/nicheBrain/mentions.ts'), 'utf8')).toMatch(/\.eq\('status', 'confirmed'\)/)
    const sql = readFileSync(join(repo, 'supabase/migrations/0243_found_you_elsewhere.sql'), 'utf8')
    expect(sql).toMatch(/owner_id = auth\.uid\(\) and status = 'found'/)
  })
})

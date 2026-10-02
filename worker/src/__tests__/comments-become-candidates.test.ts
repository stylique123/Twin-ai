import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { candidateIn, commentKnowledge, normalizeComments, pickCandidates } from '../nicheBrain/commentMiningParse.js'

const ROOT = join(__dirname, '..', '..', '..')

describe('comments under her posts become candidates, never facts she did not confirm', () => {
  it('keeps real questions and concrete requests, drops praise and private matter', () => {
    expect(candidateIn('does this come in blue?? 😍')).toEqual({ kind: 'question', text: 'does this come in blue??' })
    expect(candidateIn('@sam please restock the large size, it sold out so fast')?.kind).toBe('request')
    expect(candidateIn('love this so much!!! 🔥🔥')).toBeNull()
    expect(candidateIn('did your divorce affect the business?')).toBeNull()
  })

  it('reads both vendors, skips her own comments, and counts repeats as one asked N times', () => {
    const raw = normalizeComments([
      { cid: '1', text: 'Where do you ship?', uniqueId: 'amy', diggCount: 3, videoWebUrl: 'https://t/1' },
      { id: '2', text: 'where do you ship', ownerUsername: 'bo', likesCount: 9, postUrl: 'https://i/2' },
      { cid: '3', text: 'Where do you ship? to everywhere!', uniqueId: 'me', diggCount: 50 },
      { cid: '4', text: 'What grind do you use for this?', uniqueId: 'cy', diggCount: 1 },
    ])
    const out = pickCandidates(raw, '@me')
    expect(out[0]).toMatchObject({ externalId: '2', timesAsked: 2, likes: 9, postUrl: 'https://i/2' })
    expect(out.map((c) => c.externalId)).not.toContain('3')
    expect(out).toHaveLength(2)
  })

  it('files her answer as her own words, and a bare question only as what viewers ask', () => {
    expect(commentKnowledge({ kind: 'question', text: 'Do you ship to Canada?', answer: 'Yes, flat $8', times_asked: 3 }))
      .toMatchObject({ kind: 'fact', basis: 'stated', text: 'Viewers ask: "Do you ship to Canada?" — her answer: Yes, flat $8' })
    expect(commentKnowledge({ kind: 'question', text: 'Do you ship to Canada?', answer: null, times_asked: 1 }))
      .toMatchObject({ kind: 'topic', basis: 'demonstrated' })
  })

  it('is wired: candidates first, she decides, only confirmed rows are filed, writer and screen read them alike', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/0263_comments_become_candidates.sql'), 'utf8')
    expect(sql).toMatch(/status text not null default 'found'/)
    expect(sql).toMatch(/function public\.decide_comment/)
    expect(sql).toMatch(/e\.owner_id = auth\.uid\(\)/)
    const job = readFileSync(join(ROOT, 'worker/src/nicheBrain/commentMining.ts'), 'utf8')
    expect(job).toMatch(/\.eq\('status', 'confirmed'\)/)
    expect(job).toMatch(/product_entity_id: c\.product_entity_id/)
    const edge = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    const web = readFileSync(join(ROOT, 'apps/web/src/lib/creatorAnswers.ts'), 'utf8')
    expect(edge).toMatch(/\.in\('source', \['asked', 'comment'\]\)/)
    expect(web).toMatch(/\.in\('source', \['asked', 'comment'\]\)/)
  })
})

describe('audit 2026-10-02: junk is not a candidate', () => {
  it('drops exclamations, first-person asides, other people\'s stories and other languages', async () => {
    const { candidateIn } = await import('../nicheBrain/commentMiningParse.js')
    for (const junk of ['What a great man?', 'Did I try, this is my first?',
      'have her new mechanic go to you and have him pick it up with no wheels on?',
      'dónde compraste la impresora de etiquetas ????', 'Onde posso achar estes frascos de vidro ?']) {
      expect(candidateIn(junk), junk).toBeNull()
    }
    expect(candidateIn('Where can I get the tripod you use?')?.kind).toBe('question')
    expect(candidateIn('What glaze did you use for the light blue mug?')?.kind).toBe('question')
  })
})
describe('audit 2026-10-02: a lead-in does not hide a real question', () => {
  it('keeps the question after "Love", "But", "side note,"', async () => {
    const { candidateIn } = await import('../nicheBrain/commentMiningParse.js')
    expect(candidateIn('Love 💕 What steps did you take behind the scenes to start?')?.text).toBe('What steps did you take behind the scenes to start?')
    expect(candidateIn('side note, what tripod do you use?')?.kind).toBe('question')
    expect(candidateIn('But how do u cut the clips u were changing angles?')?.kind).toBe('question')
  })
})

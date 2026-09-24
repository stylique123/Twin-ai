import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRAIN_BUCKETS, normalizeRead, viewsFromReach, readerPrompt } from '../nicheBrain/reader.js'
import { notesFromRead, place, noteKey, relationFor, MERGE_AT, RELATED_AT } from '../nicheBrain/librarian.js'

const good = {
  readable: true, bucket: 'making', sub_niche: 'Handmade Soy Candles', topic: 'Why soy wax tunnels',
  mode: 'teach', goal: 'sales', language: 'English', hook_type: 'Myth Bust',
  hook_pattern: 'Stop doing [mistake] if you want [result]',
  structure: { before_ask: 'shows the tunnel', ask: 'try a wider wick', after_ask: 'link in bio' },
  persuasion: { proof: 'before/after burn', objection: null, cta: 'shop the fix' },
  why_it_works: 'Opens on a visible failure viewers recognise.',
}

describe('niche brain reader', () => {
  it('keeps the bucket list in step with shared NICHE_BUCKETS', () => {
    const src = readFileSync(join(__dirname, '../../../packages/shared/src/nicheQuestions.ts'), 'utf8')
    const block = src.slice(src.indexOf('NICHE_BUCKETS = ['), src.indexOf('] as const', src.indexOf('NICHE_BUCKETS = [')))
    const shared = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...BRAIN_BUCKETS].sort()).toEqual(shared.sort())
  })
  it('clamps and lower-cases what the model returns', () => {
    const r = normalizeRead(good)
    expect(r.readable).toBe(true)
    expect(r.sub_niche).toBe('handmade soy candles')
    expect(r.hook_type).toBe('myth bust')
  })
  it('drops invented enum values', () => {
    const r = normalizeRead({ ...good, bucket: 'astrology', mode: 'rant' })
    expect(r.bucket).toBeNull()
    expect(r.mode).toBeNull()
  })
  it('treats unreadable or topic-less reads as unreadable, never guessed', () => {
    expect(normalizeRead({ readable: false, topic: 'x' }).readable).toBe(false)
    expect(normalizeRead({ readable: true, topic: '' }).readable).toBe(false)
    expect(normalizeRead(null).readable).toBe(false)
  })
  it('reads views out of the stored reach strings', () => {
    expect(viewsFromReach('9.7M views.')).toBe(9_700_000)
    expect(viewsFromReach('998 views with a 31% like rate.')).toBe(998)
    expect(viewsFromReach('964.2K views.')).toBe(964_200)
    expect(viewsFromReach('Rides trending hashtags')).toBeNull()
  })
  it('hands the reader existing sub-niches so it reuses them', () => {
    expect(readerPrompt({ id: 'a', title: 't' }, ['soy candles'])).toContain('soy candles')
  })
})

describe('niche brain librarian', () => {
  it('turns one read into linked notes, topic first', () => {
    const notes = notesFromRead(normalizeRead(good))
    expect(notes[0].kind).toBe('topic')
    expect(notes.map((n) => n.kind)).toEqual(['topic', 'hook', 'angle', 'proof', 'cta'])
    expect(notes.every((n) => n.sub_niche === 'handmade soy candles')).toBe(true)
  })
  it('an unreadable read files nothing', () => {
    expect(notesFromRead(normalizeRead({ readable: false }))).toEqual([])
  })
  it('merges the same idea, links a close one, files a new one', () => {
    expect(place([{ id: 'a', similarity: MERGE_AT }])).toEqual({ action: 'merge', into: 'a' })
    expect(place([{ id: 'a', similarity: RELATED_AT + 0.01 }])).toEqual({ action: 'new', relatedTo: 'a' })
    expect(place([{ id: 'a', similarity: 0.2 }])).toEqual({ action: 'new', relatedTo: null })
    expect(place([])).toEqual({ action: 'new', relatedTo: null })
  })
  it('keys ignore case and punctuation but keep [slots]', () => {
    expect(noteKey('Stop doing [X]!!')).toBe(noteKey('stop   doing [x]'))
  })
  it('links every non-topic note from its topic', () => {
    expect(relationFor('topic')).toBeNull()
    expect(relationFor('hook')).toBe('opened_with')
    expect(relationFor('objection')).toBe('answers')
  })
})

describe('niche brain learner wiring', () => {
  it('the sweep reads her own posts and runs the learner after the corpus batch', () => {
    const src = readFileSync(join(__dirname, '../nicheBrain/sweep.ts'), 'utf8')
    expect(src).toContain("rpc('brain_unread_own'")
    expect(src).toContain("rpc('brain_learn')")
    expect(src).toContain("rpc('brain_nearest_scoped'")
  })
})

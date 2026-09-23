// ⚠️ OWNER REPORT: pasting non-handle text into the handle box said "handle too long".
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { handleShapeError, NOT_A_HANDLE, HANDLE_TOO_LONG } from '../handleShape'

const repo = join(import.meta.dirname, '..', '..', '..', '..')

describe('handleShapeError', () => {
  it.each(['@maria.bakes', 'maria_bakes', 'https://www.instagram.com/maria.bakes/', 'tiktok.com/@maria', 'https://youtube.com/@maria/shorts'])(
    'accepts %s', (h) => expect(handleShapeError(h)).toBeNull())

  it.each([
    'I make candles and sell them on etsy every week and I love it',
    'my handle is maria',
    'check out my page!!',
    'https://example.com/some path with spaces',
  ])('calls "%s" not a handle, never "too long"', (h) => {
    expect(handleShapeError(h)).toBe(NOT_A_HANDLE)
  })

  it('still says too long for a genuinely long single token', () => {
    expect(handleShapeError('a'.repeat(61))).toBe(HANDLE_TOO_LONG)
  })

  it('the edge mirror is byte-identical and start-dna checks shape before length', () => {
    const src = readFileSync(join(repo, 'packages', 'shared', 'src', 'handleShape.ts'), 'utf8')
    const body = src.slice(src.indexOf('export const NOT_A_HANDLE'))
    const dna = readFileSync(join(repo, 'supabase', 'functions', '_shared', 'dna.ts'), 'utf8')
    expect(dna).toContain(body)
    const fn = readFileSync(join(repo, 'supabase', 'functions', 'start-dna', 'index.ts'), 'utf8')
    expect(fn.indexOf('handleShapeError(')).toBeGreaterThan(-1)
    expect(fn.indexOf('handleShapeError(')).toBeLessThan(fn.indexOf('HANDLE_TOO_LONG }'))
  })
})

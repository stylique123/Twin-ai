// Security audit #18: every yt-dlp call that takes a link checks it against the
// allowed sites first and passes it after `--`, so it can never be read as an option.
import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MEDIA = readFileSync(join(__dirname, '..', 'media.ts'), 'utf8')

it('every yt-dlp call with a link puts -- right before it', () => {
  const starts = [...MEDIA.matchAll(/run\(\s*'yt-dlp',/g)].map((m) => m.index!)
  expect(starts.length).toBe(3)
  for (const s of starts) {
    const seg = MEDIA.slice(s, s + 2000)
    const at = seg.search(/\b(url|rawUrl)\]/)
    expect(at).toBeGreaterThan(-1)
    expect(seg.slice(at - 6, at)).toBe("'--', ")
  }
})

it('downloadReference checks the link before running yt-dlp', () => {
  const fn = MEDIA.slice(MEDIA.indexOf('export async function downloadReference('))
  expect(fn.indexOf('assertAllowedUrl(rawUrl)')).toBeGreaterThan(-1)
  expect(fn.indexOf('assertAllowedUrl(rawUrl)')).toBeLessThan(fn.indexOf("'yt-dlp'"))
})

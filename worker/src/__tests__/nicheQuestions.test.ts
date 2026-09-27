import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { youtubeVideoId } from '../nicheBrain/nicheQuestionsParse'

describe('questions from across her niche (24-ideas #11)', () => {
  it('reads the video id from any YouTube link', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=TnoGsbl2ANo')).toBe('TnoGsbl2ANo')
    expect(youtubeVideoId('https://youtube.com/shorts/abcDEF12')).toBe('abcDEF12')
    expect(youtubeVideoId('https://tiktok.com/x')).toBeNull()
  })
  it('never runs without a key, files questions only, and shares them with the niche', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'nicheBrain', 'nicheQuestions.ts'), 'utf8')
    expect(src).toMatch(/if \(!env\.youtubeApiKey \|\|/)
    expect(src).toMatch(/kind: 'objection'/)
    expect(src).toMatch(/v\.gallery_item_id, Number\(v\.views \?\? 0\), null,/)
  })
})

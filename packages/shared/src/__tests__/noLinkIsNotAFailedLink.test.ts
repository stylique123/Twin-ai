import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linkStatus, linkStatusMessage, LIFECYCLE_MESSAGE, READ_STALLS_AFTER_MS } from '../productLifecycle'
import { readStories, storiesForStorage, PRODUCT_STORY_QUESTIONS } from '../productStories'
import { isShopButton } from '../factPlacement'
import type { ProductEntityRecord } from '../productEntity'

const NOW = Date.parse('2026-09-23T12:00:00Z')
const base = { productUrl: null, knowledge: null, knowledgeFailedAt: null, knowledgeError: null,
  updated: new Date(NOW - 60_000).toISOString() } as unknown as ProductEntityRecord
const e = (over: Partial<ProductEntityRecord>) => ({ ...base, ...over }) as ProductEntityRecord

describe('#17 no link and a failed link say different things', () => {
  it('no link', () => expect(linkStatusMessage(e({}), NOW)).toBe('No link added yet.'))
  it('failed, with the reason', () => {
    const m = linkStatusMessage(e({ productUrl: 'https://x.com', knowledgeFailedAt: 'y', knowledgeError: 'That page could not be found.' }), NOW)
    expect(m).toMatch(/could not be read \(That page could not be found\)\. Press Retry/)
  })
  it('read but empty is neither', () => {
    expect(linkStatus(e({ productUrl: 'https://x.com', knowledge: [] }), NOW)).toBe('READ_NOTHING')
  })
})

describe('#18 reading has a definite end', () => {
  it('times out at the stall bound', () => {
    const old = e({ productUrl: 'https://x.com', updated: new Date(NOW - READ_STALLS_AFTER_MS - 1).toISOString() })
    expect(linkStatus(old, NOW)).toBe('TIMED_OUT')
    expect(linkStatus(e({ productUrl: 'https://x.com' }), NOW)).toBe('READING')
  })
  it('the reading sentence names the end instead of "keeps going if you leave"', () => {
    expect(LIFECYCLE_MESSAGE.READING).not.toMatch(/keeps going/)
    expect(LIFECYCLE_MESSAGE.READING).toMatch(/30 minutes/)
  })
})

describe('#21 story answers', () => {
  it('three questions, blank stored as null', () => {
    expect(PRODUCT_STORY_QUESTIONS.map((q) => q.label)).toEqual([
      'What almost went wrong with this one?', 'What do customers say back to you about it?', 'How is it actually made or delivered?'])
    expect(storiesForStorage({ almostWentWrong: '  ' })).toBeNull()
    expect(readStories({ customersSay: ' love it ' }).customersSay).toBe('love it')
    expect(readStories('junk').howItsMade).toBeNull()
  })
  it('generate-blueprint reads them as user_confirmed, in a separate query', () => {
    const edge = readFileSync(join(__dirname, '../../../../supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(edge).toMatch(/\.select\('creator_stories'\)/)
    expect(edge).toMatch(/trust: user_confirmed/)
    expect(edge).toMatch(/claimLines\.push\([^)]*CREATOR TOLD US ABOUT THIS PRODUCT HERSELF/)
  })
  it('the migration exists and is excluded from the staging matrix', () => {
    const gate = readFileSync(join(__dirname, '../../../../scripts/ci/check_staging_migration_coverage.mjs'), 'utf8')
    expect(gate).toMatch(/'0225_what_only_she_knows_about_it':/)
  })
})

describe('#15 site buttons in the shapes they were reported', () => {
  it.each(['View cart', 'View cart (2)', 'Check out now', 'Continue shopping', 'SHOP HERE', 'SHOP HERE →'])('%s', (v) =>
    expect(isShopButton(v)).toBe(true))
})

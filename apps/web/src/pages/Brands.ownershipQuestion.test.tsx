// §R — the question reaches the 20 voices that ALREADY exist, not just future
// scans. That is the whole reason the conflict is read from a `security definer`
// function rather than computed client-side: RLS lets a creator see their own
// `brand_voices` rows and nobody else's, so the fact the question depends on is
// invisible to the browser.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRANDS = readFileSync(join(HERE, 'Brands.tsx'), 'utf8')
const API = readFileSync(join(HERE, '..', '..', '..', '..', 'packages', 'shared', 'src', 'api.ts'), 'utf8')

describe('the ownership question is asked where the voices are', () => {
  it('asks by name, so the creator knows which account is meant', () => {
    expect(BRANDS).toMatch(/Is @\{voice\.handle\} your account\?/)
  })

  it('offers a "no" that keeps the voice rather than deleting it', () => {
    // ⚠️ A DELETE WOULD BE THE WRONG ANSWER TO A QUESTION ABOUT ATTRIBUTION.
    // Studying a competitor is legitimate; claiming their speech is not.
    expect(BRANDS).toMatch(/keep it as a reference/i)
    expect(BRANDS).not.toMatch(/deleteBrandVoice\(/)
  })

  it('never names the other owners — it has a COUNT and nothing else', () => {
    // Who else claims the handle is not this creator's business, and printing it
    // would turn a safety question into a directory of other people's accounts.
    // The guard is at the source: the SQL function returns `other_owners` as an
    // int, so no identity ever reaches the browser to be rendered by accident.
    const SQL = readFileSync(join(
      HERE, '..', '..', '..', '..', 'supabase', 'migrations',
      '0221_two_people_cannot_both_own_one_account.sql'), 'utf8')
    expect(SQL).toMatch(/returns table \(voice_id uuid, other_owners int\)/)
    expect(SQL).not.toMatch(/returns table \([^)]*o\.handle/)
    expect(SQL).not.toMatch(/select o\.owner_id,|select o\.handle/)
  })

  it('only renders when something objective says it should', () => {
    expect(BRANDS).toMatch(/\{otherOwners > 0 && \(/)
  })

  it('reloads after an answer, so the card stops asking', () => {
    expect(BRANDS).toMatch(/onAnswered=\{load\}/)
    expect(BRANDS).toMatch(/await answerVoiceOwnership\(voice\.id, mine\)/)
  })

  it('the conflict read never costs the creator their voice list', () => {
    // A guard that is not deployed yet must show what this page showed before,
    // not an error where the brands go.
    // ⚠️ AND IT MUST NOT SHARE THE VOICE LIST'S PROMISE. A `Promise.all` over
    // both meant any failure in the guard rejected the pair and left an error
    // where the creator's brands should be — a safety question that can hide
    // the thing it asks about.
    expect(BRANDS).not.toMatch(/Promise\.all\(\[listBrandVoices\(\), listVoiceOwnershipConflicts\(\)\]\)/)
    expect(BRANDS).toMatch(/setConflicts\(await listVoiceOwnershipConflicts\(\)\)/)
    expect(BRANDS).toMatch(/catch \{ \/\* no question is better than no brands \*\/ \}/)
    const fn = API.slice(API.indexOf('export async function listVoiceOwnershipConflicts'))
    expect(fn.slice(0, 700)).toMatch(/if \(error\) return \{\}/)
    expect(fn.slice(0, 700)).toMatch(/catch \{\s*return \{\}/)
  })

  it('an answer is written as an answer, with the time it was given', () => {
    expect(API).toMatch(/ownership: mine \? 'own' : 'reference'/)
    expect(API).toMatch(/ownership_asked_at: new Date\(\)\.toISOString\(\)/)
  })
})

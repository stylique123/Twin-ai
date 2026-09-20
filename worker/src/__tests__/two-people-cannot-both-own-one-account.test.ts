// §R — the guard that is a QUESTION, not a block.
//
// Six handle+platform pairs in production are claimed by more than one owner,
// across 20 `ready` voices. Two people cannot both own one TikTok account, so
// one claim in each pair is false — and the false one stores a stranger's
// sentences under `subject='own'` and hands them to the writer as things this
// creator said.
//
// But `styliquetechnologies` under five owners is one team on one company
// account, so an auto-refusal breaks the legitimate case to stop the other. The
// guard therefore ASKS, records the ANSWER, and a "no" DEMOTES rather than
// deletes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIG = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0221_two_people_cannot_both_own_one_account.sql'), 'utf8')
const START_DNA = readFileSync(
  join(ROOT, 'supabase', 'functions', 'start-dna', 'index.ts'), 'utf8')
const VOICE = readFileSync(join(ROOT, 'worker', 'src', 'jobs', 'voice.ts'), 'utf8')

describe('0221 — the answer is stored, and only a "no" has teeth', () => {
  it('has exactly three states and defaults to the one that changes nothing', () => {
    expect(MIG).toMatch(/add column if not exists ownership text not null default 'unverified'/)
    expect(MIG).toMatch(/check \(ownership in \('unverified', 'own', 'reference'\)\)/)
  })

  it('backfills NOTHING to `own` — an unasked question is not an answer', () => {
    // ⚠️ THE SIX SINGLE-OWNER PUBLIC FIGURES (hubermanlab, zachking, aliabdaal,
    // davidheikka, matthew_berman, starterstory) show no objective signal and
    // must not be blessed by a backfill. Marking them `own` would assert an
    // ownership fact nobody supplied — the same fabrication in a smaller font.
    expect(MIG).not.toMatch(/set ownership = 'own'/)
    expect(MIG).not.toMatch(/update public\.brand_voices[\s\S]{0,200}ownership = 'own'/)
  })

  it('separates "never asked" from "asked, not answered"', () => {
    // Without this the UI re-prompts on every page load.
    expect(MIG).toMatch(/ownership_asked_at timestamptz/)
  })

  it('demotes rather than deletes, by restamping the speech itself', () => {
    // ⚖️ THE RESTAMP IS THE DESIGN. Every reader that matters already filters on
    // `subject = 'own'`, so flipping `subject` switches all of them off at once
    // and adds no second gate for a reader to forget.
    expect(MIG).toMatch(/set subject = 'reference'/)
    expect(MIG).toMatch(/and subject = 'own'/)
    expect(MIG).not.toMatch(/delete from public\.brand_voices/)
    expect(MIG).not.toMatch(/delete from public\.transcripts/)
  })

  it('scopes the restamp by voice, not by owner', () => {
    // ⚠️ `owner_id` ALONE WOULD DEMOTE ALL TEN of a multi-voice owner's voices
    // on one answer about one of them. This is why 0220 had to land first.
    expect(MIG).toMatch(/where brand_voice_id = new\.id/)
    expect(MIG).not.toMatch(/where owner_id = new\.owner_id/)
  })

  it('leaves unattributed rows alone — NULL is not a disclaimer', () => {
    expect(MIG).not.toMatch(/brand_voice_id is null/)
  })

  it('fires only on the transition INTO reference, not on every update', () => {
    // Re-running the update must not re-walk the table, and an unrelated column
    // change must not trigger it at all.
    expect(MIG).toMatch(/coalesce\(old\.ownership, ''\) <> 'reference'/)
    expect(MIG).toMatch(/after update of ownership on public\.brand_voices/)
  })

  it('grants the owner the right to answer their own question', () => {
    expect(MIG).toMatch(/grant update \(ownership, ownership_asked_at\) on public\.brand_voices to authenticated/)
  })
})

describe('start-dna asks only when something objective says it should', () => {
  it('flags the conflict on the handle, case-insensitively', () => {
    // `garyvee` and `GaryVee` are one account.
    expect(START_DNA).toMatch(/\.ilike\('handle', handle\)/)
    expect(START_DNA).toMatch(/c\.owner_id !== user\.id/)
  })

  it('never blocks the scan on a conflict', () => {
    // ⚠️ FIVE OWNERS SHARING ONE COMPANY ACCOUNT ARE LEGITIMATE. A refusal would
    // break them to stop the other four.
    const guard = START_DNA.slice(START_DNA.indexOf('let ownershipConflict'))
    expect(guard.slice(0, 1600)).not.toMatch(/return json\(\s*\{\s*error/)
  })

  it('degrades to the pre-0221 behaviour instead of costing the scan', () => {
    expect(START_DNA).toMatch(/let ownershipConflict = false/)
    expect(START_DNA).toMatch(/start-dna: ownership conflict check failed/)
  })

  it('tells the client, so the question can actually be asked', () => {
    expect(START_DNA).toMatch(/ownership_conflict: ownershipConflict/)
  })

  it('stamps `ownership_asked_at` only over an unanswered row', () => {
    // An answered voice must not have its answer re-opened by a re-scan.
    expect(START_DNA).toMatch(/\.eq\('ownership', 'unverified'\)/)
  })
})

describe('a re-scan cannot walk back behind the trigger', () => {
  it('decides the stamp from the answer at write time', () => {
    // ⚠️ 0221's trigger restamps the rows that EXIST when the answer lands. A
    // re-scan afterwards would insert fresh `own` rows behind it, and the
    // trigger will not fire again.
    expect(VOICE).toMatch(/subject: ownSubject/)
    expect(VOICE).toMatch(/\.select\('ownership'\)/)
  })

  it('an unknown answer is not a "no"', () => {
    expect(VOICE).toMatch(/let ownSubject: 'own' \| 'reference' = 'own'/)
    expect(VOICE).toMatch(/could not read voice ownership/)
  })

  it('counts the demoted store rather than hiding it', () => {
    expect(VOICE).toMatch(/stored_disclaimed_as_reference/)
  })
})

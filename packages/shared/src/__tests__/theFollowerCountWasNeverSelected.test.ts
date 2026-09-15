// THE COLUMN EXISTED, THE WRITER RAN, AND ONE WORD WAS MISSING FROM ONE SELECT.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14, and the proof is that a single insert
// wrote one field and not its neighbour. Of 36 `generation_outcomes` rows, 32
// were written on 2026-09-13 with:
//
//   entry_door            32 of 32
//   creator_stage_band     0 of 32
//
// Those two are set TWO LINES APART in the same object literal. Meanwhile 43 of
// 55 `brand_voices` carry `stats.followers` as a number. So this was not a
// missing column (0203 added it), not a missing writer (it is called), not a
// broken band function (it is correct), and not rows predating the code (the
// 09-12 rows have no door either, and the 09-13 rows have every door).
//
// `stats` was simply not in the `brand_voices` select list, so
// `followerBandInline(undefined)` correctly returned null — every time.
//
// ⚠️ THIS IS THE DOMINANT DEFECT CLASS AT ITS PUREST: not a field nothing
// reads, but a field whose INPUT was never fetched. A guard on the reader would
// have passed; a guard on the writer would have passed; only the row count
// showed it, which is why gate 5 exists.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(
  join(REPO, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('every column the handler reads is one it asked for', () => {
  it('the brand_voices select includes stats', () => {
    // ⚠️ THE READER-REMOVAL ASSERTION FOR AN INPUT. Drop `stats` and
    // creator_stage_band silently returns to null in every row, with the
    // column, the writer, the CHECK and the band function all still correct
    // and every other test still green.
    // ⚠️ THE ONE SELECT, FOUND BY ITS OWN SHAPE. There are two
    // `from('brand_voices')` occurrences and the other is an `.update()`, so
    // anchoring on the table name alone could land on the wrong statement.
    const at = EDGE.indexOf(".select('id, handle, platform")
    expect(at, 'the brand_voices select moved — re-anchor, do not re-litigate').toBeGreaterThan(-1)
    const select = EDGE.slice(at, EDGE.indexOf(')', at) + 1)
    expect(select).toContain('stats')
  })

  it('the stage band is still written from that stats field', () => {
    // If the write moved or was renamed, selecting `stats` would be pointless.
    // ⚠️ BOTH CALL SITES, COUNTED. `recordWhatWasChosen` is invoked twice, so
    // a `toContain` is satisfied by one survivor while the other silently
    // returns to null — the same "wired in one variant only" gap that a mutant
    // exposed on the paste-bridge PR. Two mutants lived here until this counted.
    const writes = EDGE.match(/creatorStageBand: followerBandInline\(/g) ?? []
    expect(writes.length).toBe(2)
    const reads = EDGE.match(/\(voice\?\.stats as \{ followers\?: unknown \} \| null\)\?\.followers/g) ?? []
    expect(reads.length).toBe(2)
  })

  it('an absent follower count still produces NULL, never a guessed band', () => {
    // `under_1k` asserted for a creator nobody counted would put a fabricated
    // cohort into the outcome table that Loop B reads as a fact.
    // ⚠️ BOUNDED ON THE CLOSING BRACE, AND MY FIRST BOUND WAS WRONG. Searching
    // for the next "\nfunction " skipped `async function recordWhatWasChosen`
    // — it begins with `async` — so the slice sailed straight past it. The
    // assertion three lines down caught that on the first run, which is
    // exactly why it is here: a slice must end where its subject ends.
    const fn = (() => {
      const at = EDGE.indexOf('function followerBandInline')
      const end = EDGE.indexOf('\n}', at)
      expect(end).toBeGreaterThan(at)
      return EDGE.slice(at, end + 2)
    })()
    expect(fn).toContain("if (followers === null || followers === undefined || followers === '') return null")
    expect(fn).toContain('if (!Number.isFinite(n) || n < 0) return null')
    // ⚠️ BOUNDED TO THIS FUNCTION. A fixed-length slice would spill into the
    // next one and could be satisfied by its code — that mistake let a mutant
    // live earlier today.
    expect(fn).not.toContain('function recordWhatWasChosen')
  })

  it('the bands are the four the CHECK allows, and nothing else', () => {
    const at = EDGE.indexOf('function followerBandInline')
    const fn = EDGE.slice(at, EDGE.indexOf('\n}', at) + 2)
    for (const band of ['under_1k', '1k_10k', '10k_100k', 'over_100k']) {
      expect(fn).toContain(`'${band}'`)
    }
  })

  it('entry_door — the neighbour that proved the diagnosis — is still written', () => {
    // 32 of 32 doors against 0 of 32 bands is what localised this to the input
    // rather than the writer. If the door write vanished, that evidence would
    // be gone and so would the comparison.
    const doors = EDGE.match(/entryDoor: entryDoorInline\(body\.door\)/g) ?? []
    expect(doors.length).toBe(2)
  })
})

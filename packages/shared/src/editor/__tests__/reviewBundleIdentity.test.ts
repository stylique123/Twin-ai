// WHICH IDENTITY THE REVIEW SCREEN LEAVES WITH.
//
// The bug this pins had shipped, and its shape is worth stating because it is
// the one a test suite is worst at catching: NOTHING FAILED. The creator
// finished reviewing, the submit succeeded, and then they were navigated to
// `/result/<edit-project-uuid>` — a route that loads a GENERATION. Result found
// no generation with that id and showed a missing plan. Every unit test passed
// throughout, because the defect was that two correct components disagreed
// about which id they were passing.
//
// So the test is not "does the bundle have a field". It is: given a PROJECT id
// as input, does the bundle carry the GENERATION id the screen must navigate
// with, and does it come from the project's own immutable column rather than
// from a second lookup that could resolve differently later.
import { beforeEach, describe, expect, it } from 'vitest'
import { getReviewBundle } from '../review'
import { initApi } from '../../api'

const PROJECT = '11111111-1111-1111-1111-111111111111'
const GENERATION = '22222222-2222-2222-2222-222222222222'
const SOURCE = '33333333-3333-3333-3333-333333333333'

/** What each table hands back, and what columns were asked for. */
let projectRow: Record<string, unknown> | null
const selected: Record<string, string> = {}

function tableStub(table: string) {
  const chain: Record<string, unknown> = {
    select: (cols: string) => { selected[table] = cols; return chain },
    eq: () => chain,
    is: () => chain,
    maybeSingle: () => {
      if (table === 'edit_projects') return Promise.resolve({ data: projectRow, error: null })
      if (table === 'media_analyses') {
        return Promise.resolve({ data: { result: { words: [], candidates: [] } }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }
  return chain
}

beforeEach(() => {
  for (const k of Object.keys(selected)) delete selected[k]
  projectRow = {
    id: PROJECT, status: 'awaiting_review', source_asset_id: SOURCE, generation_id: GENERATION,
  }
  initApi({
    client: { from: (t: string) => tableStub(t) } as never,
    // ⚠️ `uploadTake` USED TO SIT HERE AND `initApi` HAS NO SUCH OPTION — the
    //  injector is `uploadSigned`. With tsc never reading test files the key was
    //  silently discarded, so this line read as "this test wires an uploader"
    //  while wiring nothing. Removed rather than renamed: nothing in this file's
    //  path uploads, and adding a real `uploadSigned` would be inventing wiring
    //  the test does not need in order to make a dead key look alive.
  })
})

describe('a project id goes in; the generation id comes out', () => {
  it('carries the generation the screen has to navigate to', () => {
    // The whole fix, in one assertion. `/result/:id` loads a generation, so the
    // bundle must hand the screen a generation id — not the project id it was
    // called with.
    return getReviewBundle(PROJECT).then((bundle) => {
      expect(bundle).not.toBeNull()
      expect(bundle!.projectId).toBe(PROJECT)
      expect(bundle!.generationId).toBe(GENERATION)
      // And they are genuinely different values, so a test that passed by
      // accident because both were the same fixture cannot exist.
      expect(bundle!.generationId).not.toBe(bundle!.projectId)
    })
  })

  it('reads it from the PROJECT ROW, not a second lookup', async () => {
    // `edit_projects.generation_id` is NOT NULL and immutable (0078), so it is
    // the project's own answer. Resolving it any other way — newest project for
    // the generation, latest by created_at — could return a different one after
    // a re-edit, and the creator would land on a video they were not reviewing.
    await getReviewBundle(PROJECT)
    expect(selected.edit_projects).toContain('generation_id')
  })

  it('REFUSES a project with no generation rather than navigating nowhere', async () => {
    // 0078 forbids this row existing. If one somehow does, failing here names
    // the problem at the boundary that can see it — the alternative is a screen
    // that works perfectly until the moment the creator finishes, which is the
    // worst possible place to discover it.
    projectRow = { id: PROJECT, status: 'awaiting_review', source_asset_id: SOURCE, generation_id: null }
    await expect(getReviewBundle(PROJECT)).rejects.toThrow(/generation id/i)
  })

  it('still returns null for a project that does not exist', async () => {
    // The refusal above must not swallow the ordinary "no such project" case,
    // which the screen renders as not-found rather than as an error.
    projectRow = null
    await expect(getReviewBundle(PROJECT)).resolves.toBeNull()
  })
})

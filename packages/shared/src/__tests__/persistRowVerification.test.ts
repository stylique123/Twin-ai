// A WRITE THAT MATCHED NO ROW IS NOT A SUCCESSFUL WRITE.
//
// These are mutation controls, not coverage. Each reverts to green if the
// `.select('id')` is removed from its call site, which is the point: the guard
// is otherwise unfalsifiable. Every other test in this package passed both
// before and after the fix, so nothing already here would notice it being
// taken back out.
//
// THE TWO FAILURE MODES ARE NOT THE SAME, and only one was ever caught:
//
//   missing column GRANT -> PostgREST returns 42501 -> `error` set -> caught
//   RLS row filter       -> row silently excluded   -> error null -> NOT caught
//
// The production teleprompter incident was the first kind — the column-level
// UPDATE grant on generations.scene_timeline was missing, which is a real error
// and surfaced as one. `saveRecordingScriptStrict` already closes BOTH kinds:
// it reads the timeline back, checks it belongs to the generation, and compares
// canonical hashes. Nothing here duplicates that.
//
// These two call sites were left behind by that work and still return success
// on a write that changed nothing. `setGenerationApproved` is the agency
// approval flag, which makes it the more serious of the pair.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// A mock client whose terminal `.select()` returns whatever the test stages.
// The chain mirrors the real call exactly: from -> update -> eq -> select.
let result: { data: unknown; error: { message: string } | null }
const select = vi.fn(async () => result)
const eq = vi.fn(() => ({ select }))
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))

// `supabase` in ../api is a getter over a client installed by initApi(), so it
// is initialised rather than mocked — the same path the app takes.
const api = await import('../api')
const { updateGenerationChoice, setGenerationApproved } = api
api.initApi({ client: { from } as never })

beforeEach(() => { vi.clearAllMocks() })

describe('updateGenerationChoice: a hook the user could not write is not saved', () => {
  it('MUTATION: zero rows (RLS filtered the row, no error) -> false', async () => {
    result = { data: [], error: null }
    expect(await updateGenerationChoice('g1', { selected_hook: 'x' })).toBe(false)
  })

  it('MUTATION: null data with no error -> false', async () => {
    result = { data: null, error: null }
    expect(await updateGenerationChoice('g1', { selected_hook: 'x' })).toBe(false)
  })

  it('CONTROL: a returned row -> true (the refusals are not passing vacuously)', async () => {
    result = { data: [{ id: 'g1' }], error: null }
    expect(await updateGenerationChoice('g1', { selected_hook: 'x' })).toBe(true)
  })

  it('CONTROL: an explicit error is still a failure (the GRANT case)', async () => {
    result = { data: null, error: { message: 'permission denied for column selected_hook' } }
    expect(await updateGenerationChoice('g1', { selected_hook: 'x' })).toBe(false)
  })

  it('asks the database to RETURN the row — the check cannot work without it', async () => {
    result = { data: [{ id: 'g1' }], error: null }
    await updateGenerationChoice('g1', { selected_hook: 'x' })
    expect(select).toHaveBeenCalled()
  })
})

describe('setGenerationApproved: an approval that did not persist is not an approval', () => {
  it('MUTATION: zero rows -> false', async () => {
    result = { data: [], error: null }
    expect(await setGenerationApproved('g1', true)).toBe(false)
  })

  it('MUTATION: and the same for un-approving — the direction does not change the rule', async () => {
    result = { data: [], error: null }
    expect(await setGenerationApproved('g1', false)).toBe(false)
  })

  it('CONTROL: a returned row -> true', async () => {
    result = { data: [{ id: 'g1' }], error: null }
    expect(await setGenerationApproved('g1', true)).toBe(true)
  })
})

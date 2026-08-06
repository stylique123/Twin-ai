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

// `setGenerationApproved` no longer writes the column directly — see its own
// describe block below for why — so the client also needs `rpc`.
let rpcResult: { data: unknown; error: { message: string } | null }
const rpc = vi.fn(async () => rpcResult)

// `supabase` in ../api is a getter over a client installed by initApi(), so it
// is initialised rather than mocked — the same path the app takes.
const api = await import('../api')
const { updateGenerationChoice, setGenerationApproved } = api
api.initApi({ client: { from, rpc } as never })

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

// This block used to pin a `.update({ approved }).select('id')` row-count check,
// for the reason the header gives: a write that matched no row is not a write.
// The call site MOVED, and the rule moved with it rather than being dropped.
//
// It moved because after 0111 a bare column write is wrong in both directions.
// Approving leaves `approved_output_asset_id` NULL, which `approvalState` reads
// as `unbound` and `publishAllowed` refuses at publish time — so on a brand
// requiring approval, the owner's own approval produced a video that could never
// be posted and a block that re-approving could never clear. Un-approving a row
// already bound by the review link violates the coherence CHECK outright, so the
// write failed and the UI silently reverted.
//
// `set_generation_approval` writes the flag and the binding in ONE statement, so
// neither state is reachable. 0115 grants it to `authenticated` and adds the
// ownership check that grant requires.
//
// The row-count check is GONE ON PURPOSE and not replaced by a weaker one: the
// RPC raises `no_data_found` for a generation that does not exist or is not
// yours, so "matched no row" arrives as an error rather than as a silent zero.
describe('setGenerationApproved: an approval that did not persist is not an approval', () => {
  it('MUTATION: an RPC error -> false', async () => {
    rpcResult = { data: null, error: { message: 'no such generation' } }
    expect(await setGenerationApproved('g1', true)).toBe(false)
  })

  it('MUTATION: and the same for un-approving — the direction does not change the rule', async () => {
    rpcResult = { data: null, error: { message: 'no such generation' } }
    expect(await setGenerationApproved('g1', false)).toBe(false)
  })

  it('CONTROL: a clean call -> true (the refusals are not passing vacuously)', async () => {
    rpcResult = { data: [{ approved: true }], error: null }
    expect(await setGenerationApproved('g1', true)).toBe(true)
  })

  it('goes through the RPC, NOT a bare column write', async () => {
    // The load-bearing assertion. If someone re-introduces
    // `update({ approved })` here, every other test in this block still passes —
    // they only check the boolean — and the binding silently stops being written
    // again. This is the one that would fail.
    rpcResult = { data: [{ approved: true }], error: null }
    await setGenerationApproved('g1', true)
    expect(rpc).toHaveBeenCalledWith('set_generation_approval', {
      p_generation: 'g1', p_approved: true, p_review_status: null,
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('does NOT overwrite review_status — that is the review\u2019s word, not the owner\u2019s', async () => {
    rpcResult = { data: [{ approved: false }], error: null }
    await setGenerationApproved('g1', false)
    expect(rpc).toHaveBeenCalledWith('set_generation_approval',
      expect.objectContaining({ p_review_status: null }))
  })
})

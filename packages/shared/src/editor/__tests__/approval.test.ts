// APPROVAL-1 — "did they approve THIS video?"
//
// `generations.approved` is a boolean that answers a different question:
// whether an approval ever happened. It stayed true across a re-render, so
// these two were indistinguishable to the UI, to the publisher, and to anyone
// later asking what was agreed:
//
//   * a client approved the video that would go out;
//   * a client approved a video, the creator re-edited, and the file that would
//     go out has been seen by nobody.
//
// The second is the whole reason APPROVAL-1 is on the list. These tests are
// about the states, because the states are the fix — a boolean cannot express
// the distinction no matter how carefully it is read.
import { describe, expect, it } from 'vitest'
import { approvalBlockReason, approvalState, publishAllowed } from '../approval'
import type { FinishedOutput } from '../finishedOutput'

const ASSET_A = 'aaaaaaaa-0000-0000-0000-000000000000'
const ASSET_B = 'bbbbbbbb-0000-0000-0000-000000000000'

const v2 = (outputAssetId: string): FinishedOutput => ({
  generationId: 'g1', authority: 'editor_v2',
  editProjectId: 'p1', outputAssetId, legacyPath: null,
})
const legacy: FinishedOutput = {
  generationId: 'g1', authority: 'legacy',
  editProjectId: null, outputAssetId: null, legacyPath: 'old.mp4',
}

describe('the distinction a boolean cannot make', () => {
  it('approved, and it IS the current output', () => {
    expect(approvalState(
      { approved: true, approved_output_asset_id: ASSET_A }, v2(ASSET_A),
    )).toBe('current')
  })

  it('approved, and the output has since CHANGED — the whole bug', () => {
    // Before 0111 this row and the row above were identical: `approved: true`.
    // A re-edit inherited an approval nobody gave it.
    expect(approvalState(
      { approved: true, approved_output_asset_id: ASSET_A }, v2(ASSET_B),
    )).toBe('superseded')
  })

  it('not approved is not approved', () => {
    expect(approvalState({ approved: false }, v2(ASSET_A))).toBe('none')
    expect(approvalState({}, v2(ASSET_A))).toBe('none')
    expect(approvalState(null, v2(ASSET_A))).toBe('none')
  })
})

describe('an approval taken before 0111 is REAL, and unverifiable', () => {
  it('reads as unbound, never as "not approved"', () => {
    // Those creators did approve something. Reading NULL as unapproved would
    // revoke a real client's real decision to make a new check pass.
    expect(approvalState(
      { approved: true, approved_output_asset_id: null }, v2(ASSET_A),
    )).toBe('unbound')
  })

  it('but unbound is NOT enough to publish under an approval requirement', () => {
    // "Approved, we do not know of what" is precisely the state an approval
    // requirement exists to refuse.
    expect(publishAllowed(true, 'unbound')).toBe(false)
    expect(approvalBlockReason(true, 'unbound')).toMatch(/re-approve/i)
  })
})

describe('an approval that names an asset nothing matches is superseded', () => {
  it('when the current output is legacy rather than v2', () => {
    // Something was approved and it is not what would go out. Saying "current"
    // here would be the original bug with extra steps.
    expect(approvalState(
      { approved: true, approved_output_asset_id: ASSET_A }, legacy,
    )).toBe('superseded')
  })

  it('when there is no current output at all', () => {
    expect(approvalState(
      { approved: true, approved_output_asset_id: ASSET_A }, null,
    )).toBe('superseded')
  })
})

describe('the gate blocks on an EXPLICIT requirement only', () => {
  it('an unanswered needs_approval never blocks', () => {
    // Three-state, and the direction matters. A creator who was never asked
    // whether anyone approves their videos has not said that someone does.
    // Blocking their publish on a question we failed to ask would invent a
    // workflow they never described.
    for (const state of ['none', 'superseded', 'unbound'] as const) {
      expect(publishAllowed(null, state)).toBe(true)
      expect(publishAllowed(undefined, state)).toBe(true)
      expect(publishAllowed(false, state)).toBe(true)
    }
  })

  it('an explicit true blocks everything except a current approval', () => {
    expect(publishAllowed(true, 'current')).toBe(true)
    for (const state of ['none', 'superseded', 'unbound'] as const) {
      expect(publishAllowed(true, state)).toBe(false)
    }
  })
})

describe('the reason is what the reader can act on', () => {
  it('says nothing when nothing is blocked', () => {
    // A banner reading "this is fine" on every screen trains people to stop
    // reading banners.
    expect(approvalBlockReason(true, 'current')).toBeNull()
    expect(approvalBlockReason(null, 'superseded')).toBeNull()
  })

  it('names the CHANGE, not the state machine', () => {
    const why = approvalBlockReason(true, 'superseded')
    expect(why).toMatch(/changed after it was approved/i)
    expect(why).not.toMatch(/superseded|null|asset/i)
  })
})

describe('the migration and the reader agree', () => {
  it('the CHECK forbids the contradiction this reader would have to guess at', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const HERE = dirname(fileURLToPath(import.meta.url))
    const sql = readFileSync(
      resolve(HERE, '../../../../..', 'supabase/migrations/0111_approval_binds_output.sql'), 'utf8')
    // A row with a binding but `approved = false` would make `approvalState`
    // return 'none' while the database holds evidence of an approval. The
    // constraint stops the row existing rather than the reader guessing.
    expect(sql).toContain('generations_approval_binding_coherent')
    // And no client may write the binding — an approval you can set yourself is
    // not an approval.
    expect(sql).not.toMatch(/grant update \(approved_output_asset_id\)/)
    expect(sql).toMatch(/grant execute on function public\.set_generation_approval[\s\S]*?to service_role/)
  })
})

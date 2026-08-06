// WHAT "FINISHED" MEANS, AND WHY IT IS NOT `status === 'completed'`.
//
// The scaffold path reaches `completed` with `output_asset_id` NULL on purpose
// — 0096's completion trigger permits it, and `contracts.ts` has said in prose
// since Phase 8 that "`completed` with output_asset_id NULL is never a product
// success". Every readiness question in the product is really the second
// question: is there a video. Spelled out by hand at each call site, the
// conjunction reads correctly, passes review, and is one careless refactor from
// losing its second half — silently, and only on the runs that finished empty,
// which is the population nobody has fixtures for.
//
// So these tests are not about a boolean helper. They are about the ONE state
// that distinguishes the two questions, asserted directly so that a change
// which collapses them fails here rather than in front of a creator.
import { describe, expect, it } from 'vitest'
import {
  EDIT_PROJECT_ACTIVE_STATUSES, editFinishedWithoutVideo, editProducedVideo,
  type EditProjectStatus,
} from '../contracts'

const ASSET = '44444444-4444-4444-4444-444444444444'
const row = (status: EditProjectStatus, output_asset_id: string | null) =>
  ({ status, output_asset_id })

describe('the state the two questions disagree about', () => {
  it('completed WITH an output is a video', () => {
    expect(editProducedVideo(row('completed', ASSET))).toBe(true)
    expect(editFinishedWithoutVideo(row('completed', ASSET))).toBe(false)
  })

  it('completed WITHOUT an output is finished, and is NOT a video', () => {
    // The whole point. A status check answers `true` here and is wrong.
    expect(editProducedVideo(row('completed', null))).toBe(false)
    expect(editFinishedWithoutVideo(row('completed', null))).toBe(true)
  })
})

describe('nothing else counts as either', () => {
  it('no status other than completed produces a video', () => {
    // Including `validating`, which is the last step before completion and the
    // one most tempting to treat as nearly done. It is not done.
    for (const status of EDIT_PROJECT_ACTIVE_STATUSES) {
      expect(editProducedVideo(row(status, ASSET))).toBe(false)
      expect(editFinishedWithoutVideo(row(status, ASSET))).toBe(false)
    }
    for (const status of ['failed', 'cancelled'] as const) {
      expect(editProducedVideo(row(status, ASSET))).toBe(false)
      expect(editFinishedWithoutVideo(row(status, ASSET))).toBe(false)
    }
  })

  it('an absent project is neither, rather than throwing at a render', () => {
    // The caller polls; before the first response there is no row. Both answers
    // must be `false` — a project that does not exist has not finished either
    // way, and "finished without a video" would render a sentence claiming a
    // run happened.
    for (const nothing of [null, undefined]) {
      expect(editProducedVideo(nothing)).toBe(false)
      expect(editFinishedWithoutVideo(nothing)).toBe(false)
    }
  })

  it('an empty-string asset id is not an asset', () => {
    // The column is a uuid and cannot hold this, but the predicate is fed by a
    // JSON payload that crossed a network, and `''` is what a stringifier
    // produces from a missing value more often than `null` is.
    expect(editProducedVideo(row('completed', ''))).toBe(false)
    expect(editFinishedWithoutVideo(row('completed', ''))).toBe(true)
  })
})

describe('the two answers partition `completed`', () => {
  it('exactly one of them is true for any completed project', () => {
    // If both could be false, a completed run would render neither the player
    // nor the explanation — a card that is permanently blank. If both could be
    // true, the screen would show a player AND "this produced no video".
    for (const asset of [ASSET, null, '']) {
      const r = row('completed', asset)
      expect(editProducedVideo(r) !== editFinishedWithoutVideo(r)).toBe(true)
    }
  })
})

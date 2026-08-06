// OUTPUT-1 — one answer to "does this generation have a finished video".
//
// The root defect every connectivity audit re-found under a different name.
// Editor v2 finishes into `edit_projects`/`edit_outputs`; History, Dashboard,
// Calendar, Social and reports all asked `generations.edit_path`. So a render
// that succeeded — bytes in storage, validated, reviewed — counted as a DRAFT on
// the creator's own dashboard and showed the still-to-film icon on their
// calendar.
//
// The audits score that handoff ~0.34 while the editor engine scores ~0.82, and
// the arithmetic is the point: a creator does not receive 82% of a publishable
// video when the renderer succeeds and the Calendar disagrees. These tests pin
// the two things that make the handoff trustworthy — WHICH authority wins, and
// what happens when the lookup fails.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  generationLifecycle, hasFinishedVideo, resolveFinishedOutputs,
} from '../finishedOutput'
import { initApi } from '../../api'

const G1 = 'g1', G2 = 'g2', G3 = 'g3'
const ASSET = '44444444-4444-4444-4444-444444444444'

let projectRows: Array<Record<string, unknown>>
let projectError: { message: string } | null

function chain() {
  const c: Record<string, unknown> = {
    select: () => c, in: () => c, eq: () => c,
    not: () => Promise.resolve({ data: projectRows, error: projectError }),
  }
  return c
}

beforeEach(() => {
  projectRows = []
  projectError = null
  initApi({
    client: { from: () => chain() } as never,
    uploadTake: (() => Promise.resolve('')) as never,
  })
})

describe('which authority wins', () => {
  it('an editor-v2 render counts as finished — the whole bug', () => {
    // No `edit_path` at all. Before this resolver every list surface called
    // this generation a draft.
    projectRows = [{ id: 'p1', generation_id: G1, status: 'completed', output_asset_id: ASSET }]
    return resolveFinishedOutputs([{ id: G1 }]).then((m) => {
      expect(hasFinishedVideo(G1, m)).toBe(true)
      expect(m.get(G1)!.authority).toBe('editor_v2')
      expect(m.get(G1)!.editProjectId).toBe('p1')
      expect(m.get(G1)!.outputAssetId).toBe(ASSET)
    })
  })

  it('V2 OUTRANKS legacy when a generation carries both', async () => {
    // They are not equivalent. The v2 output is the one the creator reviewed
    // and the one an approval can be bound to; preferring `edit_path` because
    // it is easier to read would publish a file nobody approved.
    projectRows = [{ id: 'p1', generation_id: G1, status: 'completed', output_asset_id: ASSET }]
    const m = await resolveFinishedOutputs([{ id: G1, edit_path: 'legacy/old.mp4' }])
    expect(m.get(G1)!.authority).toBe('editor_v2')
    expect(m.get(G1)!.legacyPath).toBeNull()
  })

  it('legacy still counts when there is no v2 project', async () => {
    // The adapter half. Every video made before editor v2 must keep working;
    // this is a compatibility boundary, not a cutover.
    const m = await resolveFinishedOutputs([{ id: G2, edit_path: 'legacy/old.mp4' }])
    expect(m.get(G2)!.authority).toBe('legacy')
    expect(m.get(G2)!.legacyPath).toBe('legacy/old.mp4')
  })

  it('a generation with neither is absent from the map', async () => {
    const m = await resolveFinishedOutputs([{ id: G3 }])
    expect(hasFinishedVideo(G3, m)).toBe(false)
  })
})

describe('a v2 project that produced nothing is not a finished video', () => {
  it('completed with a NULL output asset does not count', async () => {
    // The scaffold state. The query filters it, and the consumer re-checks —
    // this is the same predicate the rest of the product uses, and the one
    // place it must not be relaxed is the one that feeds "ready".
    projectRows = [{ id: 'p1', generation_id: G1, status: 'completed', output_asset_id: null }]
    const m = await resolveFinishedOutputs([{ id: G1 }])
    expect(hasFinishedVideo(G1, m)).toBe(false)
  })

  it('a non-completed project does not count even with an asset', async () => {
    projectRows = [{ id: 'p1', generation_id: G1, status: 'rendering', output_asset_id: ASSET }]
    const m = await resolveFinishedOutputs([{ id: G1 }])
    expect(hasFinishedVideo(G1, m)).toBe(false)
  })

  it('but it does NOT erase a legacy video that exists', async () => {
    // A generation whose v2 attempt produced nothing may still have an older
    // finished file. Letting the empty v2 row delete the legacy answer would
    // turn a watchable video into a draft.
    projectRows = [{ id: 'p1', generation_id: G1, status: 'completed', output_asset_id: null }]
    const m = await resolveFinishedOutputs([{ id: G1, edit_path: 'legacy/old.mp4' }])
    expect(m.get(G1)!.authority).toBe('legacy')
  })
})

describe('a failed lookup fails in the SAFE direction', () => {
  it('keeps the legacy answers rather than calling a finished video a draft', async () => {
    // Which way to be wrong is a real decision. Showing a v2 video under the
    // legacy label is a wrong badge on a real video; treating the error as "no
    // output" tells a creator their finished video is a draft. The second is
    // worse, so the error path degrades to legacy rather than to empty.
    projectError = { message: 'network' }
    const m = await resolveFinishedOutputs([{ id: G1, edit_path: 'legacy/old.mp4' }, { id: G2 }])
    expect(m.get(G1)!.authority).toBe('legacy')
    expect(hasFinishedVideo(G2, m)).toBe(false)
  })

  it('an empty input list does not query at all', async () => {
    const m = await resolveFinishedOutputs([])
    expect(m.size).toBe(0)
  })
})

describe('one lifecycle, so three surfaces cannot disagree', () => {
  const finished = new Map([[G1, {
    generationId: G1, authority: 'editor_v2' as const,
    editProjectId: 'p1', outputAssetId: ASSET, legacyPath: null,
  }]])

  it('published outranks ready', () => {
    // A posted video is finished AND out. Showing it as merely ready invites a
    // creator to post it twice.
    expect(generationLifecycle(G1, finished, new Set([G1]))).toBe('published')
  })

  it('a finished, unposted video is ready', () => {
    expect(generationLifecycle(G1, finished, new Set())).toBe('ready')
  })

  it('everything else is a draft', () => {
    expect(generationLifecycle(G3, finished, new Set())).toBe('draft')
  })
})

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
  resolveFinishedOutputsResult,
} from '../finishedOutput'
import { initApi } from '../../api'

const G1 = 'g1', G2 = 'g2', G3 = 'g3'
const ASSET = '44444444-4444-4444-4444-444444444444'

let projectRows: Array<Record<string, unknown>>
let projectError: { message: string } | null
const ordered: string[] = []

function chain() {
  const c: Record<string, unknown> = {
    select: () => c, in: () => c, eq: () => c,
    not: () => c,
    order: (col: string) => { ordered.push(col); return c },
    then: (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: projectRows, error: projectError }).then(res),
  }
  return c
}

beforeEach(() => {
  projectRows = []
  projectError = null
  ordered.length = 0
  initApi({
    client: { from: () => chain() } as never,
    // ⚠️ `uploadTake` USED TO SIT HERE AND `initApi` HAS NO SUCH OPTION — the
    //  injector is `uploadSigned`. With tsc never reading test files the key was
    //  silently discarded, so this line read as "this test wires an uploader"
    //  while wiring nothing. Removed rather than renamed: nothing in this file's
    //  path uploads, and adding a real `uploadSigned` would be inventing wiring
    //  the test does not need in order to make a dead key look alive.
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

// ── "we could not check" is not "you have not finished it" ─────────────────
//
// The last place the three-state rule was still collapsed. An absent key meant
// `draft` unconditionally, so a failed lookup did not degrade the page — it
// rewrote it, telling a creator with a library of finished videos that none of
// them were done. That is worse than an error banner: it is a confident,
// specific, wrong answer, and the action it invites is re-recording work that
// already exists.
describe('a failed resolve says so, instead of saying "draft"', () => {
  const finished = new Map([[G1, {
    generationId: G1, authority: 'editor_v2' as const,
    editProjectId: 'p1', outputAssetId: ASSET, legacyPath: null,
  }]])

  it('a MISS under an incomplete resolve is unknown, not draft', () => {
    expect(generationLifecycle(G3, finished, new Set(), false)).toBe('unknown')
  })

  it('a HIT is still a hit — only misses are in doubt', () => {
    // The resolver returns whatever it gathered before failing, so the rows it
    // did answer are answered. Downgrading them too would throw away facts we
    // hold in order to express doubt about ones we do not.
    expect(generationLifecycle(G1, finished, new Set(), false)).toBe('ready')
  })

  it('published survives a failed resolve', () => {
    // Established by a `posts` row we already have, not by the lookup that
    // failed. A video that went out is finished by definition.
    expect(generationLifecycle(G1, finished, new Set([G1]), false)).toBe('published')
    expect(generationLifecycle(G3, finished, new Set([G3]), false)).toBe('published')
  })

  it('the default is unchanged, so every existing call keeps its behaviour', () => {
    expect(generationLifecycle(G3, finished, new Set())).toBe('draft')
  })

  it('the resolver reports an errored lookup as incomplete, and still returns the legacy answers', async () => {
    projectError = { message: 'network' }
    const r = await resolveFinishedOutputsResult([{ id: G1, edit_path: 'legacy/a.mp4' }, { id: G3 }])
    expect(r.complete).toBe(false)
    // The legacy answer gathered before the failure is correct and is kept.
    expect(r.outputs.get(G1)?.authority).toBe('legacy')
    // And G3 is a miss under an incomplete resolve — which is exactly `unknown`.
    expect(generationLifecycle(G3, r.outputs, new Set(), r.complete)).toBe('unknown')
  })

  it('a successful lookup is complete, so a genuine miss is still a draft', async () => {
    projectRows = []
    projectError = null
    const r = await resolveFinishedOutputsResult([{ id: G3 }])
    expect(r.complete).toBe(true)
    expect(generationLifecycle(G3, r.outputs, new Set(), r.complete)).toBe('draft')
  })

  it('an empty list is a complete answer, not an unknown one', async () => {
    const r = await resolveFinishedOutputsResult([])
    expect(r.complete).toBe(true)
  })
})


describe('more than one completed project is a REAL state, and the winner is not an accident', () => {
  // 0078's uniqueness index is PARTIAL — `where status not in
  // ('completed','failed','cancelled')` — so it constrains only projects still
  // in flight. A creator who re-edits produces a second completed project on
  // purpose, and both rows carry a real output asset.
  const older = {
    id: 'p-old', generation_id: G1, status: 'completed',
    output_asset_id: 'asset-old', completed_at: '2026-08-01T00:00:00Z',
  }
  const newer = {
    id: 'p-new', generation_id: G1, status: 'completed',
    output_asset_id: 'asset-new', completed_at: '2026-08-05T00:00:00Z',
  }

  it('asks the DATABASE to order, rather than trusting row order', async () => {
    // The defect was not "picked the wrong one" — it was "picked whichever came
    // back last". Without an ORDER BY the same generation can resolve to a
    // different video between two page loads, and that id is what an approval
    // would eventually bind to.
    projectRows = [older, newer]
    await resolveFinishedOutputs([{ id: G1 }])
    expect(ordered).toContain('completed_at')
    expect(ordered).toContain('id')
  })

  it('the NEWEST completion wins — a re-edit supersedes what it re-edited', async () => {
    projectRows = [older, newer]
    const m = await resolveFinishedOutputs([{ id: G1 }])
    expect(m.get(G1)!.editProjectId).toBe('p-new')
    expect(m.get(G1)!.outputAssetId).toBe('asset-new')
  })

  it('and the answer does not depend on the order rows arrive in', async () => {
    // Same two rows, reversed. A stable authority must give the same answer.
    projectRows = [newer, older]
    const m = await resolveFinishedOutputs([{ id: G1 }])
    expect(m.get(G1)!.editProjectId).toBe('p-new')
  })
})

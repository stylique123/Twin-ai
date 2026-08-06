// ONE ANSWER TO "WHAT IS THIS PROJECT, TO SOMEONE WHO WANTS TO WATCH IT".
//
// The bug this closes is not a defect in one file — it is a SHAPE. Three
// surfaces each re-derived whether there is a video, in three spellings, and one
// of them was wrong: `CraftChecks` rendered §7c assessments on
// `status === 'completed'` alone, judging the craft of a render that never
// happened. Naming the predicate stopped that mistake. It does not stop the
// shape, because the next surface still has to remember to call it.
//
// So these tests are about the STATES, not the plumbing. If the union is right,
// a consumer cannot express the wrong thing: only `ready` carries `output`, so
// reaching a video URL for a project that produced none is not a bug you can
// write.
import { beforeEach, describe, expect, it } from 'vitest'
import { bundleStateFor, getOutputBundle } from '../outputBundle'
import { EDIT_PROJECT_ACTIVE_STATUSES, type EditProject, type EditProjectStatus } from '../contracts'
import { initApi } from '../../api'

const PROJECT = '11111111-1111-1111-1111-111111111111'
const ASSET = '44444444-4444-4444-4444-444444444444'

const proj = (status: EditProjectStatus, output_asset_id: string | null = null): EditProject => ({
  id: PROJECT, owner_id: 'o', generation_id: 'g', source_asset_id: 's',
  status, output_asset_id, failure_code: null,
  created_at: '', started_at: null, completed_at: null,
})

describe('the state mapping — the one line that must not become a status check', () => {
  it('completed WITH an output is ready; WITHOUT one is empty', () => {
    expect(bundleStateFor(proj('completed', ASSET))).toBe('ready')
    // The scaffold path produces this ON PURPOSE. A two-state model calls it
    // ready and renders a player with no source.
    expect(bundleStateFor(proj('completed', null))).toBe('empty')
  })

  it('separates waiting-on-a-person from running', () => {
    // `awaiting_review` is active but idle: nothing is running and nothing will
    // until the creator acts. Collapsing it into `running` shows a spinner for
    // a step only they can take.
    expect(bundleStateFor(proj('awaiting_review'))).toBe('waiting')
    expect(bundleStateFor(proj('rendering'))).toBe('running')
  })

  it('maps every other active status to running', () => {
    for (const s of EDIT_PROJECT_ACTIVE_STATUSES) {
      if (s === 'awaiting_review') continue
      expect(bundleStateFor(proj(s))).toBe('running')
    }
  })

  it('failed and cancelled are their own states, not "not ready"', () => {
    expect(bundleStateFor(proj('failed'))).toBe('failed')
    expect(bundleStateFor(proj('cancelled'))).toBe('cancelled')
  })

  it('no project is absent, for null and undefined alike', () => {
    expect(bundleStateFor(null)).toBe('absent')
    expect(bundleStateFor(undefined)).toBe('absent')
  })

  it('an output asset on a NON-completed project never reads as ready', () => {
    // Defensive: the column is only set at completion, but a state machine that
    // trusts one field to imply another is how the original bug worked.
    for (const s of ['rendering', 'validating', 'failed', 'cancelled'] as const) {
      expect(bundleStateFor(proj(s, ASSET))).not.toBe('ready')
    }
  })
})

// ---- The assembled bundle, against a stubbed data layer ---------------------

let projectRow: EditProject | null
let outputResponse: Record<string, unknown> | null
let planRow: Record<string, unknown> | null
const fetched: string[] = []

function chain(table: string) {
  const c: Record<string, unknown> = {
    select: () => c, eq: () => c, is: () => c, order: () => c, limit: () => c, gt: () => c,
    maybeSingle: () => {
      fetched.push(table)
      if (table === 'edit_projects') return Promise.resolve({ data: projectRow, error: null })
      if (table === 'edit_plans') return Promise.resolve({ data: planRow, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    then: (res: (v: unknown) => unknown) => {
      fetched.push(table)
      return Promise.resolve({ data: [], error: null }).then(res)
    },
  }
  return c
}

beforeEach(() => {
  fetched.length = 0
  projectRow = proj('completed', ASSET)
  planRow = { plan: { captions: { cues: [{ outputStartMs: 0, outputEndMs: 900 }] } } }
  outputResponse = {
    projectId: PROJECT, outputAssetId: ASSET, videoUrl: 'https://signed/v.mp4',
    coverUrl: null, expiresInSeconds: 3600, durationMs: 12_000,
    width: 1080, height: 1920, mimeType: 'video/mp4', bytes: 1, sha256: 'a',
  }
  initApi({
    client: {
      from: (t: string) => chain(t),
      functions: { invoke: () => Promise.resolve({ data: outputResponse, error: null }) },
    } as never,
    uploadTake: (() => Promise.resolve('')) as never,
  })
})

describe('only the ready bundle carries a video', () => {
  it('ready carries output AND craft checks', async () => {
    const b = await getOutputBundle(PROJECT)
    expect(b.state).toBe('ready')
    if (b.state !== 'ready') throw new Error('unreachable')
    expect(b.output.videoUrl).toBe('https://signed/v.mp4')
    expect(b.craft.length).toBeGreaterThan(0)
  })

  it('a completed project with no asset is empty, and has no output field', async () => {
    projectRow = proj('completed', null)
    const b = await getOutputBundle(PROJECT)
    expect(b.state).toBe('empty')
    expect((b as Record<string, unknown>).output).toBeUndefined()
    expect((b as Record<string, unknown>).craft).toBeUndefined()
  })

  it('a row that says ready but cannot be SIGNED reports empty, not ready', async () => {
    // `getEditorOutput` collapses every server refusal to null. Rendering a
    // player against a URL the server would not issue is worse than saying
    // there is no video, and the creator's experience of the two is identical.
    outputResponse = null
    const b = await getOutputBundle(PROJECT)
    expect(b.state).toBe('empty')
    expect((b as Record<string, unknown>).output).toBeUndefined()
  })

  it('craft checks are NOT_CHECKED when the plan is unreadable — never passes', async () => {
    // The three-state rule. An absent fact must not render as a green tick.
    planRow = null
    const b = await getOutputBundle(PROJECT)
    if (b.state !== 'ready') throw new Error('expected ready')
    expect(b.craft.length).toBeGreaterThan(0)
    expect(b.craft.every((c) => c.status === 'not_checked')).toBe(true)
  })
})

describe('a polling screen does not pay for what it cannot use', () => {
  it('a running project costs ONE row read — no URL signing, no plan, no events', async () => {
    // This is what `Result.tsx` calls on a timer for the whole length of a
    // render. Signing a URL for a video that does not exist yet, on every tick,
    // is how a convenience wrapper becomes the reason a screen is slow.
    projectRow = proj('rendering')
    const b = await getOutputBundle(PROJECT)
    expect(b.state).toBe('running')
    expect(fetched).toEqual(['edit_projects'])
  })

  it('an absent project costs one read and returns a null project', async () => {
    projectRow = null
    const b = await getOutputBundle(PROJECT)
    expect(b.state).toBe('absent')
    expect(b.project).toBeNull()
    expect(fetched).toEqual(['edit_projects'])
  })
})

describe('a failed project carries the explanation, not the raw code', () => {
  it('attaches the classified failure', async () => {
    // §9's "failure at 11pm": the creator's four questions are answered by the
    // catalogue, not by a code. Putting the explanation IN the bundle means a
    // surface cannot show the bare code by forgetting to look it up.
    projectRow = { ...proj('failed'), failure_code: 'source_too_short' }
    const b = await getOutputBundle(PROJECT)
    expect(b.state).toBe('failed')
    if (b.state !== 'failed') throw new Error('unreachable')
    expect(typeof b.failure.message).toBe('string')
    expect(b.failure.message.length).toBeGreaterThan(0)
    expect(b.failure.code).toBe('source_too_short')
  })

  it('an unknown code still yields a usable explanation', async () => {
    projectRow = { ...proj('failed'), failure_code: 'something_new_from_a_later_deploy' }
    const b = await getOutputBundle(PROJECT)
    if (b.state !== 'failed') throw new Error('unreachable')
    expect(b.failure.failureClass).toBe('unknown')
    expect(b.failure.message.length).toBeGreaterThan(0)
  })
})

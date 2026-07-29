// Batch 8.5 — what the compiling STAGE tells the compiler about the source.
//
// Two modules had to agree on one convention and did not. `resolveAllowedDomain`
// (editorCompile.ts) says: teleprompter means exactly the pinned accepted
// windows, upload means the whole file AND AN EMPTY LIST. The stage synthesised
// `[{ startMs: 0, endMs: durationMs }]` for uploads instead — the same domain,
// spelled the way the compiler forbids.
//
// Nothing local caught it. The compiler's own tests asserted the rule; the
// stage's choice was one line no test could reach because it sat inside a
// database round-trip. Staging found it on the first run that got past the
// decision digest:
//
//   upload source carries accepted capture windows
//
// So the choice is now a pure function, and these tests hold both halves of the
// convention against EACH OTHER rather than against a restatement of one side.
import { describe, it, expect } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const { sourceAcceptedWindows } = await import('../jobs/editorCompileStage.js')
const { resolveAllowedDomain } = await import('../jobs/editorCompile.js')
const { EditPlanError } = await import('../jobs/editPlanContract.js')

const DURATION_MS = 60_000

function captureRow(origin: 'teleprompter' | 'upload', acceptedSegments: unknown) {
  return { origin, manifest: { acceptedSegments }, manifest_sha256: 'x'.repeat(64) }
}

describe('an upload contributes NO accepted windows', () => {
  it('is an empty list — not a window spanning the file', () => {
    expect(sourceAcceptedWindows('upload', null)).toEqual([])
  })

  it('stays empty even when an upload row somehow carries segments', () => {
    // A capture row claiming upload origin with segments in it is a
    // contradiction. The stage does not launder it into the compiler; origin
    // decides, and the compiler derives the domain from the duration alone.
    const row = captureRow('upload', [{ sourceStartMs: 0, sourceEndMs: 1000 }])
    expect(sourceAcceptedWindows('upload', row)).toEqual([])
  })

  it('THE REGRESSION: the compiler accepts what the stage produces', () => {
    const windows = sourceAcceptedWindows('upload', null)
    const domain = resolveAllowedDomain({ origin: 'upload', durationMs: DURATION_MS, acceptedWindows: windows })
    expect(domain).toEqual([{ startMs: 0, endMs: DURATION_MS }])
  })

  it('CONTROL: the shape the stage used to produce is rejected', () => {
    // Without this the test above would pass for a stage that emitted either
    // shape, and the bug it is guarding against would be invisible again.
    expect(() => resolveAllowedDomain({
      origin: 'upload', durationMs: DURATION_MS,
      acceptedWindows: [{ startMs: 0, endMs: DURATION_MS }],
    })).toThrow(EditPlanError)
    try {
      resolveAllowedDomain({
        origin: 'upload', durationMs: DURATION_MS,
        acceptedWindows: [{ startMs: 0, endMs: DURATION_MS }],
      })
    } catch (err) {
      expect((err as { code: string }).code).toBe('edit_plan_divergent')
    }
  })
})

describe('a teleprompter source contributes exactly its pinned windows', () => {
  const segments = [
    { sourceStartMs: 1_000, sourceEndMs: 9_000 },
    { sourceStartMs: 20_000, sourceEndMs: 31_000 },
  ]

  it('reads sourceStartMs/sourceEndMs and hands them over in ms', () => {
    expect(sourceAcceptedWindows('teleprompter', captureRow('teleprompter', segments)))
      .toEqual([{ startMs: 1_000, endMs: 9_000 }, { startMs: 20_000, endMs: 31_000 }])
  })

  it('the compiler accepts them unchanged — the domain is the windows, not the file', () => {
    const windows = sourceAcceptedWindows('teleprompter', captureRow('teleprompter', segments))
    expect(resolveAllowedDomain({ origin: 'teleprompter', durationMs: DURATION_MS, acceptedWindows: windows }))
      .toEqual([{ startMs: 1_000, endMs: 9_000 }, { startMs: 20_000, endMs: 31_000 }])
  })

  it('refuses rather than falling back to the whole file when there are none', () => {
    // The fallback would hand the editor exactly the takes the creator rejected.
    expect(() => sourceAcceptedWindows('teleprompter', captureRow('teleprompter', [])))
      .toThrow(/no accepted windows/)
    expect(() => sourceAcceptedWindows('teleprompter', null)).toThrow(/no accepted windows/)
  })

  it('refuses the WRONG field names instead of yielding undefined bounds', () => {
    expect(() => sourceAcceptedWindows('teleprompter', captureRow('teleprompter', [{ startMs: 0, endMs: 1000 }])))
      .toThrow(/not a valid ms span/)
  })
})

// ---------------------------------------------------------------------------
// The other half of what this stage hands the compiler: the digests the plan
// identity cites. Staging refused a plan four stages after this value was set,
// because `?? ''` had turned an absence into an empty string.
const { requireSha } = await import('../jobs/editorCompileStage.js')

describe('a digest the plan identity cites is present or the stage refuses', () => {
  const SHA = 'a'.repeat(64)

  it('passes a real sha256 through unchanged', () => {
    expect(requireSha(SHA, 'the pinned script snapshot')).toBe(SHA)
  })

  it('THE REGRESSION: the empty string `?? \'\'` used to produce is refused HERE', () => {
    // Not four stages later in the plan contract, where the message named the
    // contract field and said nothing about which stage invented the value.
    expect(() => requireSha('', 'the pinned script snapshot')).toThrow(/no sha256 to pin/)
  })

  it('refuses undefined and null — the shapes an optional field actually yields', () => {
    expect(() => requireSha(undefined, 'x')).toThrow(/no sha256 to pin/)
    expect(() => requireSha(null, 'x')).toThrow(/no sha256 to pin/)
  })

  it('refuses near-misses rather than trusting a string that merely looks digest-ish', () => {
    for (const v of ['a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `${'a'.repeat(63)}g`, ` ${'a'.repeat(64)}`]) {
      expect(() => requireSha(v, 'x')).toThrow(/no sha256 to pin/)
    }
  })

  it('names WHAT is missing, so the refusal points at the pin rather than the contract', () => {
    expect(() => requireSha('', 'the pinned script snapshot')).toThrow(/the pinned script snapshot/)
  })
})

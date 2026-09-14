// 128 OF 134 SCRIPTS NEVER HAD A CAMERA OPENED, AND NOTHING SHOWED THE OWNER.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14: 134 scripts generated · 6 camera opens
// · 6 recordings · 0 script edits · 0 edit projects · 0 exports · 2
// accepted_final. `recordingFunnel.ts` recorded 41 -> 3 -> 0 -> 0 when it was
// written; the ratio has held at roughly one in twenty-two.
//
// So resolver fill rates, substance grading, borrowing reduction, the shape
// block and the niche vocabulary are all tuned on evidence from almost nobody
// who finished a video. This card is what puts that on the owner's page instead
// of in a query somebody has to remember to run.
//
// ⚠️⚠️ AND THE CARD MUST REFUSE TO SAY WHY. `recordingFunnel.ts`: a funnel says
// where people died, never what killed them. 128 non-openers is equally
// consistent with a bad script, an irrelevant premise, an intimidating record
// button, no time, or idle clicking — and those need OPPOSITE fixes. Every
// assertion below that forbids a cause is load-bearing.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SHARED_RAW = readFileSync(
  join(REPO, 'supabase', 'functions', '_shared', 'ownerConsole.ts'), 'utf8')
const ENDPOINT = readFileSync(
  join(REPO, 'supabase', 'functions', 'owner-console', 'index.ts'), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

interface Card { card: string; state: string; ownerAction: string | null; detail: string }

/** ⚖️ EXECUTED, NOT READ. The claim is about what the card SAYS. */
function loadCard() {
  const start = SHARED_RAW.indexOf('export const FUNNEL_MIN_SCRIPTS')
  expect(start, 'funnelCard block missing').toBeGreaterThan(-1)
  // ⚠️ THE `export` KEYWORDS COME OFF FIRST. Left on, esbuild emits CJS export
  // machinery that references `module`, which does not exist inside
  // `new Function` — the other parity tests in this repo extract plain
  // `function` declarations and get that for free. The test was wrong, not the
  // module.
  const block = SHARED_RAW.slice(start).replace(/^export\s+/gm, '')
  const js = transformSync(block, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { funnelCard, FUNNEL_MIN_SCRIPTS }`)() as {
    funnelCard: (c: unknown) => Card
    FUNNEL_MIN_SCRIPTS: number
  }
}

const { funnelCard, FUNNEL_MIN_SCRIPTS } = loadCard()

/** Production as measured on 2026-09-14. */
const TODAY = { scripts: 134, recordings: 6, exports: 0, scriptIntents: 0 }

describe('the funnel reports the drop', () => {
  it('states the real numbers and the rate', () => {
    const c = funnelCard(TODAY)
    expect(c.detail).toContain('134 scripts')
    expect(c.detail).toContain('6 recorded')
    expect(c.detail).toContain('4.5%')
    expect(c.detail).toContain('128 never opened the camera')
  })

  it('names the missing discriminator as the action, not the drop', () => {
    // ⚠️ The owner cannot fix a 4% record rate by being told about it. They can
    // collect the one field that makes it attributable.
    const c = funnelCard(TODAY)
    expect(c.state).toBe('action_needed')
    expect(c.ownerAction).toContain('script_intent')
  })

  it('REFUSES to name a cause', () => {
    // ⚠️ THE LOAD-BEARING ASSERTION. A card that said "recording friction" or
    // "script quality" would be asserting one of five possibilities that need
    // opposite fixes.
    const c = funnelCard(TODAY)
    const text = `${c.detail} ${c.ownerAction ?? ''}`.toLowerCase()
    for (const cause of [
      'friction', 'quality', 'too hard', 'confusing', 'intimidat',
      'because', 'due to', 'caused by', 'the problem is',
    ]) {
      expect(text, `must not assert a cause: ${cause}`).not.toContain(cause)
    }
    expect(c.detail).toContain('never why')
  })

  it('a count that could not be read is NOT a funnel of zero', () => {
    // Reporting a probe failure as zero recordings would put a false crisis on
    // the owner's page.
    for (const bad of [
      { scripts: null, recordings: 6, exports: 0, scriptIntents: 0 },
      { scripts: 134, recordings: null, exports: 0, scriptIntents: 0 },
      null, undefined, {}, { scripts: 'many', recordings: 6 },
    ]) {
      const c = funnelCard(bad)
      expect(c.state).toBe('blocked')
      expect(c.detail).toContain('not the same as a funnel of zero')
      expect(c.ownerAction).toBeNull()
    }
  })

  it('refuses a percentage below the floor rather than quoting a moving one', () => {
    expect(FUNNEL_MIN_SCRIPTS).toBe(20)
    const c = funnelCard({ scripts: 19, recordings: 1, exports: 0, scriptIntents: 0 })
    expect(c.state).toBe('ok')
    expect(c.detail).toContain('too few to read a funnel from')
    expect(c.detail).not.toContain('%')
  })

  it('at exactly the floor it does report', () => {
    const c = funnelCard({ scripts: 20, recordings: 1, exports: 0, scriptIntents: 0 })
    expect(c.detail).toContain('5%')
  })

  it('stops asking once the discriminator is collected', () => {
    const c = funnelCard({ scripts: 134, recordings: 6, exports: 0, scriptIntents: 40 })
    expect(c.state).toBe('ok')
    expect(c.ownerAction).toBeNull()
    expect(c.detail).toContain('40 said whether they would record it')
  })

  it('a null intent count reads as absent, not as collected', () => {
    // absent is not zero, and neither is it "done".
    const c = funnelCard({ scripts: 134, recordings: 6, exports: 0, scriptIntents: null })
    expect(c.state).toBe('action_needed')
    expect(c.ownerAction).toContain('script_intent')
  })
})

describe('the endpoint actually asks for it', () => {
  it('imports and calls funnelCard — the reader-removal assertion', () => {
    // ⚠️ Delete either line and the card is written, tested, and shown to
    // nobody: the exact defect it reports on.
    expect(ENDPOINT).toContain('funnelCard')
    expect(ENDPOINT).toContain('funnelCard(funnelCounts)')
  })

  it('counts with head-only reads, so the owner page moves no rows', () => {
    expect(ENDPOINT).toContain("{ count: 'exact', head: true }")
  })

  it('passes null through instead of coercing a failed count to zero', () => {
    const at = ENDPOINT.indexOf('const countOf')
    expect(at).toBeGreaterThan(-1)
    const body = ENDPOINT.slice(at, ENDPOINT.indexOf('const funnelCounts'))
    expect(body).toContain('? null : count')
  })

  it('reads the existing tables rather than minting a second truth', () => {
    // recordingFunnel.ts: a second record of "did they record" would create two
    // answers to one question and guarantee they disagree.
    expect(ENDPOINT).toContain("countOf('generations')")
    expect(ENDPOINT).toContain("countOf('media_assets')")
    expect(ENDPOINT).toContain("countOf('edit_outputs')")
  })

  it('stays read-only — the card may not start anything', () => {
    const at = ENDPOINT.indexOf('const countOf')
    const body = ENDPOINT.slice(at, ENDPOINT.indexOf('const funnelCounts'))
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(body, `owner-console is read-only: ${write}`).not.toContain(write)
    }
  })
})

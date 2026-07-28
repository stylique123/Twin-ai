// Batch 8.3 — the render process machinery, exercised with REAL processes.
//
// WHY NOT A MOCKED `spawn`. The three things this code exists to get right are
// process-group termination, the SIGTERM-then-SIGKILL ladder, and cancellation
// beating a timeout to the verdict. A mock proves that the code called
// `process.kill` with a negative pid; it cannot prove that the grandchild
// actually died, which is the only fact Gate-0 §9's "stale processes after
// cancel/timeout: 0" is about. So these spawn real `node` children — available
// wherever this suite runs, unlike ffmpeg — and some of them deliberately
// spawn children of their own so there is a grandchild to leak.
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import {
  runMediaProcess, RenderCancelledError, RenderTimeoutError,
  loadRenderCatalog, resetRenderCatalogCacheForTests, renderCatalogSha256,
  assertOutputProfile, assertAssetIntegrity, verifyCaptionFont, renderBudgetMs,
  fileSha256, cleanupRenderWorkDir,
} from '../jobs/editorRender.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { EditPlanError, type EditPlanV1 } from '../jobs/editPlanContract.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'render-test-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  resetRenderCatalogCacheForTests()
})

function codeOfSync(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try { await fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a rejection, got none')
}
function plan(): EditPlanV1 {
  return compileEditPlan({ ...baseInput(), policy: policy() }).plan
}
const NODE = process.execPath
// A watch shaped like the real one, driven by the test rather than by polling
// a database this module is forbidden to touch.
function manualWatch() {
  const ctrl = new AbortController()
  let flagged = false
  return {
    watch: { signal: ctrl.signal, cancelled: () => flagged, stop: () => {} },
    cancel: () => { flagged = true; ctrl.abort() },
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('the frozen catalog governs, and a broken one fails closed', () => {
  it('loads, and its digest is stable across reads', () => {
    const c = loadRenderCatalog()
    expect(c.catalogVersion).toBe('render-catalog-v1')
    const a = renderCatalogSha256()
    resetRenderCatalogCacheForTests()
    loadRenderCatalog()
    expect(renderCatalogSha256()).toBe(a)
  })

  it('MUTATION: an unreadable catalog is a failure, NOT a fallback to defaults', () => {
    expect(codeOfSync(() => loadRenderCatalog(join(tmp(), 'nope.json')))).toBe('render_output_profile_invalid')
  })

  it('MUTATION: a catalog with the wrong version is refused', () => {
    const d = tmp()
    const p = join(d, 'cat.json')
    writeFileSync(p, JSON.stringify({ ...loadRenderCatalog(), catalogVersion: 'render-catalog-v2' }))
    resetRenderCatalogCacheForTests()
    expect(codeOfSync(() => loadRenderCatalog(p))).toBe('render_output_profile_invalid')
  })

  it('MUTATION: a catalog whose crossfade bounds are nonsense is refused', () => {
    const d = tmp()
    const p = join(d, 'cat.json')
    const doc = JSON.parse(JSON.stringify(loadRenderCatalog())) as Record<string, unknown>
    ;(doc.transitions as { crossfade: { minOverlapMs: number; maxOverlapMs: number } }).crossfade.maxOverlapMs = 1
    writeFileSync(p, JSON.stringify(doc))
    resetRenderCatalogCacheForTests()
    expect(codeOfSync(() => loadRenderCatalog(p))).toBe('render_output_profile_invalid')
  })

  it('CONTROL: writing the catalog back out UNCHANGED still loads', () => {
    // Proves the three refusals above are about the mutation and not about the
    // round-trip through a temp file.
    const d = tmp()
    const p = join(d, 'cat.json')
    writeFileSync(p, JSON.stringify(loadRenderCatalog()))
    resetRenderCatalogCacheForTests()
    expect(() => loadRenderCatalog(p)).not.toThrow()
  })

  it('the frozen duration tolerance is still Gate-0 §4\'s ±250 ms', () => {
    const prof = loadRenderCatalog().outputProfiles['vertical-social-1080x1920-h264-aac-v1']
    expect(prof.durationToleranceMs).toBe(250)
    expect(prof.width).toBe(1080)
    expect(prof.height).toBe(1920)
    expect(prof.fpsNum).toBe(30)
    expect(prof.audioSampleRateHz).toBe(48000)
  })

  it('carries no secret-shaped VALUE', () => {
    // The catalog is hashed into evidence and quoted in failure detail, so a
    // credential in it would be persisted and logged.
    //
    // The scan is over the DATA, with the `_`-prefixed commentary stripped
    // first. On its first run this failed on the word "secrets" inside the
    // catalog's own comment explaining that it must contain none — a keyword
    // match on prose about credentials, which is not a credential. Scanning
    // the commentary makes the check fire on documentation quality rather than
    // on content, and the thing being protected is the values.
    const strip = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(strip)
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, strip(x)]))
      }
      return v
    }
    const raw = JSON.stringify(strip(loadRenderCatalog()))
    // ASS colour literals (&H00FFFFFF) are the one hex-looking value that
    // legitimately belongs here, so they are removed before the entropy scan
    // rather than the scan being loosened to tolerate them.
    expect(/[A-Za-z0-9+/]{40,}={0,2}/.test(raw.replace(/&H[0-9A-F]{8}/g, ''))).toBe(false)
    expect(/secret|token|password|api[_-]?key|bearer|BEGIN [A-Z ]*PRIVATE KEY/i.test(raw)).toBe(false)
    // CONTROL: the stripper does not simply empty the document.
    expect(raw.length).toBeGreaterThan(500)
    expect(raw).toContain('vertical-social-1080x1920-h264-aac-v1')
  })
})

describe('the plan and the profile must be the same video', () => {
  it('CONTROL: the compiler\'s own plan matches the frozen profile', () => {
    expect(() => assertOutputProfile(plan(), loadRenderCatalog())).not.toThrow()
  })

  it('MUTATION: a plan naming an unknown profile is refused', () => {
    const p = plan()
    p.output.profileId = 'square-1080-v1'
    expect(codeOfSync(() => assertOutputProfile(p, loadRenderCatalog()))).toBe('render_output_profile_invalid')
  })

  it('MUTATION: a plan whose raster drifted from the profile is refused', () => {
    const p = plan()
    p.output.width = 1082
    expect(codeOfSync(() => assertOutputProfile(p, loadRenderCatalog()))).toBe('render_output_profile_invalid')
  })

  it('MUTATION: and one whose frame rate drifted', () => {
    const p = plan()
    p.output.fpsNum = 60
    expect(codeOfSync(() => assertOutputProfile(p, loadRenderCatalog()))).toBe('render_output_profile_invalid')
  })

  it('a plan longer than the frozen editor maximum is refused', () => {
    const p = plan()
    p.output.durationMs = 900_001
    expect(codeOfSync(() => assertOutputProfile(p, loadRenderCatalog()))).toBe('render_output_profile_invalid')
  })
})

describe('input integrity is checked before anything is encoded', () => {
  it('CONTROL: a file matching its digest passes', async () => {
    const d = tmp()
    const f = join(d, 'source.mp4')
    writeFileSync(f, 'pretend media')
    const sha = await fileSha256(f)
    await expect(assertAssetIntegrity([{ path: f, expectedSha256: sha, what: 'source' }])).resolves.toBeUndefined()
  })

  it('MUTATION: one byte different is a failure', async () => {
    const d = tmp()
    const f = join(d, 'source.mp4')
    writeFileSync(f, 'pretend media')
    const sha = await fileSha256(f)
    writeFileSync(f, 'pretend mediaX')
    expect(await codeOf(() => assertAssetIntegrity([{ path: f, expectedSha256: sha, what: 'source' }])))
      .toBe('render_asset_integrity_failed')
  })

  it('a missing file is a failure, not an empty digest', async () => {
    expect(await codeOf(() => assertAssetIntegrity([{ path: join(tmp(), 'gone.mp4'), expectedSha256: 'x', what: 'source' }])))
      .toBe('render_asset_integrity_failed')
  })
})

describe('font integrity distinguishes UNPINNED from verified', () => {
  const preset = { fontFamily: 'DejaVu Sans', fontFileBasename: 'DejaVuSans-Bold.ttf', bold: true,
    primaryColourAss: '&H00FFFFFF', outlineColourAss: '&H00000000', outlineWidthPx: 3, shadowDepthPx: 0, alignment: 2 }

  it('an unpinned font reports UNPINNED — never "verified"', async () => {
    const d = tmp()
    writeFileSync(join(d, 'DejaVuSans-Bold.ttf'), 'font bytes')
    const r = await verifyCaptionFont(d, preset, loadRenderCatalog(), { strict: false })
    expect(r.status).toBe('unpinned')
  })

  it('MUTATION: under strict integrity an unpinned font is a FAILURE', async () => {
    const d = tmp()
    writeFileSync(join(d, 'DejaVuSans-Bold.ttf'), 'font bytes')
    expect(await codeOf(() => verifyCaptionFont(d, preset, loadRenderCatalog(), { strict: true })))
      .toBe('render_font_integrity_failed')
  })

  it('a pinned font that matches verifies, and one byte off fails', async () => {
    const d = tmp()
    const f = join(d, 'DejaVuSans-Bold.ttf')
    writeFileSync(f, 'font bytes')
    const cat = JSON.parse(JSON.stringify(loadRenderCatalog())) as ReturnType<typeof loadRenderCatalog>
    cat.fonts['DejaVuSans-Bold.ttf'] = { sha256: await fileSha256(f) }
    expect((await verifyCaptionFont(d, preset, cat, { strict: true })).status).toBe('verified')
    writeFileSync(f, 'font bytesX')
    expect(await codeOf(() => verifyCaptionFont(d, preset, cat, { strict: true })))
      .toBe('render_font_integrity_failed')
  })

  it('a preset naming a font outside the fonts directory is refused', async () => {
    const evil = { ...preset, fontFileBasename: '../../etc/passwd' }
    expect(await codeOf(() => verifyCaptionFont(tmp(), evil, loadRenderCatalog(), { strict: false })))
      .toBe('render_font_integrity_failed')
  })

  it('a missing font file is a failure', async () => {
    expect(await codeOf(() => verifyCaptionFont(tmp(), preset, loadRenderCatalog(), { strict: false })))
      .toBe('render_font_integrity_failed')
  })
})

describe('the render budget is derived from the plan, not configured', () => {
  const limits = loadRenderCatalog().limits

  it('a short plan does not inherit a long plan\'s budget', () => {
    const short = plan(); short.output.durationMs = 15_000
    const long = plan(); long.output.durationMs = 900_000
    expect(renderBudgetMs(short, limits)).toBeLessThan(renderBudgetMs(long, limits))
  })

  it('is the frozen 6x realtime between the floor and the ceiling', () => {
    const p = plan(); p.output.durationMs = 300_000
    expect(renderBudgetMs(p, limits)).toBe(300_000 * 6)
  })

  it('never drops below the floor for a very short plan', () => {
    const p = plan(); p.output.durationMs = 1000
    expect(renderBudgetMs(p, limits)).toBe(limits.renderTimeoutFloorMs)
  })
})

describe('process execution: real children, real signals', () => {
  it('reports a clean exit', async () => {
    const r = await runMediaProcess(NODE, ['-e', 'process.exit(0)'],
      { budgetMs: 10_000, graceMs: 1000, point: 'p' })
    expect(r.code).toBe(0)
  })

  it('reports a non-zero exit rather than throwing', async () => {
    const r = await runMediaProcess(NODE, ['-e', 'process.exit(3)'],
      { budgetMs: 10_000, graceMs: 1000, point: 'p' })
    expect(r.code).toBe(3)
  })

  it('captures a stderr TAIL and bounds it', async () => {
    const r = await runMediaProcess(
      NODE, ['-e', 'process.stderr.write("E".repeat(40000)); process.exit(0)'],
      { budgetMs: 20_000, graceMs: 1000, point: 'p' })
    expect(r.stderrTail.length).toBeLessThanOrEqual(8192)
    expect(r.stderrTail.length).toBeGreaterThan(0)
  })

  it('a process that outlives its budget is TIMED OUT, not reported as a bad exit', async () => {
    await expect(runMediaProcess(NODE, ['-e', 'setTimeout(()=>{}, 60000)'],
      { budgetMs: 300, graceMs: 200, point: 'p' })).rejects.toBeInstanceOf(RenderTimeoutError)
  })

  it('CANCELLATION beats the exit code — a killed process is not a failed render', async () => {
    const { watch, cancel } = manualWatch()
    const p = runMediaProcess(NODE, ['-e', 'setTimeout(()=>{}, 60000)'],
      { budgetMs: 30_000, graceMs: 200, watch, point: 'during_render' })
    await wait(150)
    cancel()
    await expect(p).rejects.toBeInstanceOf(RenderCancelledError)
  })

  it('a watch ALREADY cancelled before the spawn still cancels', async () => {
    const { watch, cancel } = manualWatch()
    cancel()
    await expect(runMediaProcess(NODE, ['-e', 'setTimeout(()=>{}, 60000)'],
      { budgetMs: 30_000, graceMs: 200, watch, point: 'during_render' })).rejects.toBeInstanceOf(RenderCancelledError)
  })

  it('cancel-to-exit is well inside Gate-0 §9\'s 12 s', async () => {
    const { watch, cancel } = manualWatch()
    const started = Date.now()
    const p = runMediaProcess(NODE, ['-e', 'setTimeout(()=>{}, 60000)'],
      { budgetMs: 30_000, graceMs: 1000, watch, point: 'during_render' })
    await wait(100)
    cancel()
    await p.catch(() => {})
    expect(Date.now() - started).toBeLessThan(12_000)
  })

  it('THE GRANDCHILD DIES TOO — the kill targets the process GROUP', async () => {
    // The parent spawns a detached-from-it child that writes a marker file after
    // a delay. Killing only the parent leaves the marker to appear; killing the
    // GROUP prevents it. That difference is the entire point of `detached`, and
    // it is not observable through a mocked spawn.
    const d = tmp()
    const marker = join(d, 'grandchild-survived.txt')
    const script = `
      const { spawn } = require('node:child_process')
      spawn(process.execPath, ['-e', 'setTimeout(()=>{require("node:fs").writeFileSync(${JSON.stringify(marker)},"x")}, 1500)'],
        { stdio: 'ignore' })
      setTimeout(()=>{}, 60000)
    `
    const { watch, cancel } = manualWatch()
    const p = runMediaProcess(NODE, ['-e', script],
      { budgetMs: 30_000, graceMs: 100, watch, point: 'during_render' })
    await wait(250)
    cancel()
    await p.catch(() => {})
    await wait(2000)
    expect(existsSync(marker)).toBe(false)
  })

  it('CONTROL: that same grandchild DOES write its marker when nothing kills it', async () => {
    // Without this the test above passes for a process that never started.
    const d = tmp()
    const marker = join(d, 'grandchild-survived.txt')
    const script = `
      const { spawn } = require('node:child_process')
      spawn(process.execPath, ['-e', 'setTimeout(()=>{require("node:fs").writeFileSync(${JSON.stringify(marker)},"x")}, 300)'],
        { stdio: 'ignore' })
      setTimeout(()=>{}, 700)
    `
    await runMediaProcess(NODE, ['-e', script], { budgetMs: 30_000, graceMs: 100, point: 'p' })
    await wait(900)
    expect(existsSync(marker)).toBe(true)
  })

  it('SIGTERM comes first, so a well-behaved process can close its file', async () => {
    const d = tmp()
    const closed = join(d, 'closed-cleanly.txt')
    const script = `
      process.on('SIGTERM', () => { require('node:fs').writeFileSync(${JSON.stringify(closed)}, 'x'); process.exit(0) })
      setTimeout(()=>{}, 60000)
    `
    const { watch, cancel } = manualWatch()
    const p = runMediaProcess(NODE, ['-e', script],
      { budgetMs: 30_000, graceMs: 5000, watch, point: 'during_render' })
    await wait(250)
    cancel()
    await p.catch(() => {})
    await wait(300)
    expect(existsSync(closed)).toBe(true)
  })

  it('SIGKILL follows for a process that IGNORES SIGTERM', async () => {
    // The other half of the ladder: SIGTERM alone would hang here forever.
    const script = `process.on('SIGTERM', () => {}); setTimeout(()=>{}, 60000)`
    const { watch, cancel } = manualWatch()
    const started = Date.now()
    const p = runMediaProcess(NODE, ['-e', script],
      { budgetMs: 30_000, graceMs: 300, watch, point: 'during_render' })
    await wait(200)
    cancel()
    await expect(p).rejects.toBeInstanceOf(RenderCancelledError)
    expect(Date.now() - started).toBeLessThan(12_000)
  })
})

describe('cleanup', () => {
  it('removes everything the render wrote, and is safe to call twice', () => {
    const d = tmp()
    mkdirSync(join(d, 'work'), { recursive: true })
    writeFileSync(join(d, 'work', 'output.mp4'), 'partial')
    cleanupRenderWorkDir(join(d, 'work'))
    expect(existsSync(join(d, 'work'))).toBe(false)
    expect(() => cleanupRenderWorkDir(join(d, 'work'))).not.toThrow()
  })

  it('is safe on a directory that never existed', () => {
    expect(() => cleanupRenderWorkDir(join(tmp(), 'never-made'))).not.toThrow()
  })
})

describe('the offline lane boundary holds (Gate-0 §10.1)', () => {
  it('editorRender and editorValidateOutput import no database, storage or network module', () => {
    const root = join(import.meta.dirname, '..', 'jobs')
    for (const f of ['editorRender.ts', 'editorValidateOutput.ts']) {
      const src = execSync(`cat ${join(root, f)}`, { encoding: 'utf8' })
      const imports = [...src.matchAll(/^import[^\n]*from\s+'([^']+)'/gm)].map((m) => m[1])
      for (const i of imports) {
        expect(i).not.toMatch(/\/db\.js$|\/storage\.js$|\/gemini\.js$|supabase|node:http|node:https|undici|node-fetch/)
      }
      expect(src).not.toMatch(/\bfetch\s*\(/)
    }
  })
})

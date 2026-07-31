// Editor v2 — Phase 8 Batch 8.3: render lifecycle orchestration (OFFLINE half).
//
// SOLE RESPONSIBILITY (Gate-0 §7): turn a validated EditPlan plus already-local
// input files into a finished local output file, or fail with a stable code.
//
// WHAT THIS FILE IS NOT ALLOWED TO DO (Gate-0 §10.1). It performs no database
// call, no RPC, no storage upload or download, no edge-function call, no
// provider call and no network I/O of any kind. Everything it touches is a
// local path the caller already produced. `editorComplete` owns persistence;
// keeping the two apart is what makes it possible to test a render exhaustively
// without a database, and it is why the render can be re-run and compared
// without any risk of it publishing something.
//
// THE THREE THINGS THAT ACTUALLY GO WRONG IN A RENDERER
//
//  1. It substitutes. An unsupported instruction gets approximated, and the
//     video no longer matches the plan the user approved. Every refusal in here
//     is loud for that reason; nothing degrades quietly.
//
//  2. It leaks processes. ffmpeg spawns children; killing the parent leaves
//     them holding the CPU and the temp disk. Gate-0 §9 requires ZERO stale
//     processes after a cancel or a timeout, so every spawn is `detached` (its
//     own process group) and every teardown kills the GROUP, negative pid.
//     That is the whole reason for `detached` here — it is not about the parent
//     surviving, it is about the children not doing so.
//
//  3. It reports success for a file nobody looked at. A zero-exit ffmpeg that
//     wrote a 0-byte file is a failure; so is one that wrote a file the plan
//     did not describe. This module hands off to `editorValidateOutput` and
//     treats "the encoder said OK" as an input to the decision, never as the
//     decision.
import { spawn } from 'node:child_process'
import { readFileSync, statSync, mkdirSync, rmSync, existsSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EditPlanError, editPlanSha256, type EditPlanV1 } from './editPlanContract.js'
import { buildFfmpegGraph, buildFfmpegArgs, ffmpegGraphSha256, type CrossfadeBounds } from './ffmpegGraph.js'
import { sha256Hex, canonicalJson } from './editorManifest.js'
import type { CancelWatch } from './editorCancel.js'

const WORKER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const RENDER_CATALOG_VERSION = 'render-catalog-v1'

// ---- the frozen catalog -----------------------------------------------------

export interface OutputProfile {
  width: number; height: number; fpsNum: number; fpsDen: number
  videoCodec: string; audioCodec: string; pixelFormat: string
  audioSampleRateHz: number; audioChannels: number; faststart: boolean
  x264Preset: string; x264Crf: number; x264Profile: string; x264Level: string
  gopSizeFrames: number; audioBitrateKbps: number
  durationToleranceMs: number
  containerFormatNames: string[]
  probeVideoCodecNames: string[]
  probeAudioCodecNames: string[]
  minVideoBitrateBps: number
  maxOutputBytesPerOutputMs: number
}
export interface CaptionPreset {
  fontFamily: string; fontFileBasename: string; bold: boolean
  primaryColourAss: string; outlineColourAss: string; emphasisColourAss: string
  outlineWidthPx: number; shadowDepthPx: number; alignment: number
}
export interface RenderLimits {
  maxRealtimeRatio: number
  renderTimeoutFloorMs: number
  renderTimeoutCeilingMs: number
  cancelGraceMs: number
  probeTimeoutMs: number
  coverExtractTimeoutMs: number
  maxOutputDurationMs: number
}
export interface CoverSpec {
  width: number; height: number; format: string; qualityQscale: number
  minBytes: number; maxBytes: number
}
export interface RenderCatalogV1 {
  schemaVersion: number
  catalogVersion: string
  outputProfiles: Record<string, OutputProfile>
  captionPresets: Record<string, CaptionPreset>
  fonts: Record<string, { sha256: string | null }>
  transitions: { crossfade: CrossfadeBounds }
  cover: CoverSpec
  limits: RenderLimits
}

function bad(message: string, code: string): never {
  throw new EditPlanError(`render: ${message}`, code)
}

let cachedCatalog: RenderCatalogV1 | null = null
let cachedCatalogSha: string | null = null

/**
 * Load and STRUCTURALLY VALIDATE the frozen catalog. A malformed catalog fails
 * closed: a renderer that falls back to built-in defaults when its policy
 * document is unreadable is a renderer whose policy document does not govern
 * it, and every guard downstream would then be measuring against numbers no
 * one froze.
 */
export function loadRenderCatalog(path = join(WORKER_ROOT, 'render_catalog_v1.json')): RenderCatalogV1 {
  if (cachedCatalog) return cachedCatalog
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    bad('the frozen render catalog could not be read', 'render_output_profile_invalid')
  }
  let doc: RenderCatalogV1
  try {
    doc = JSON.parse(raw) as RenderCatalogV1
  } catch {
    bad('the frozen render catalog is not valid JSON', 'render_output_profile_invalid')
  }
  if (doc.schemaVersion !== 1 || doc.catalogVersion !== RENDER_CATALOG_VERSION) {
    bad('the render catalog is not the frozen version this build expects', 'render_output_profile_invalid')
  }
  for (const key of ['outputProfiles', 'captionPresets', 'fonts', 'transitions', 'cover', 'limits'] as const) {
    if (!doc[key] || typeof doc[key] !== 'object') {
      bad(`the render catalog is missing its ${key} section`, 'render_output_profile_invalid')
    }
  }
  const b = doc.transitions.crossfade
  if (!b || !Number.isInteger(b.minOverlapMs) || !Number.isInteger(b.maxOverlapMs)
    || !Number.isInteger(b.maxOverlapFractionOfShorterSegmentMilli)
    || b.minOverlapMs <= 0 || b.maxOverlapMs < b.minOverlapMs) {
    bad('the render catalog has no usable crossfade bounds', 'render_output_profile_invalid')
  }
  const l = doc.limits
  if (!Number.isInteger(l.maxRealtimeRatio) || l.maxRealtimeRatio <= 0
    || !Number.isInteger(l.cancelGraceMs) || l.cancelGraceMs <= 0
    || !Number.isInteger(l.renderTimeoutFloorMs) || !Number.isInteger(l.renderTimeoutCeilingMs)
    || l.renderTimeoutCeilingMs < l.renderTimeoutFloorMs) {
    bad('the render catalog has no usable limits', 'render_output_profile_invalid')
  }
  cachedCatalog = doc
  cachedCatalogSha = sha256Hex(canonicalJson(doc as unknown as Record<string, unknown>))
  return doc
}
export function renderCatalogSha256(): string {
  if (!cachedCatalogSha) loadRenderCatalog()
  return cachedCatalogSha!
}
export function resetRenderCatalogCacheForTests(): void { cachedCatalog = null; cachedCatalogSha = null }

/**
 * The plan's declared output must BE the profile, field for field.
 *
 * The compiler already wrote these fields from the same policy, so in a healthy
 * system this never fires. That is precisely why it is here: the failure it
 * catches is the compiler and the renderer having been updated at different
 * times, which produces a plan that is internally consistent and describes a
 * video this build cannot make.
 */
export function assertOutputProfile(plan: EditPlanV1, catalog: RenderCatalogV1): OutputProfile {
  const profile = catalog.outputProfiles[plan.output.profileId]
  if (!profile) bad(`output profile ${JSON.stringify(plan.output.profileId)} is not in the frozen catalog`, 'render_output_profile_invalid')
  const mismatches: string[] = []
  const check = (name: string, planned: unknown, frozen: unknown) => {
    if (planned !== frozen) mismatches.push(`${name} (plan ${String(planned)}, catalog ${String(frozen)})`)
  }
  check('width', plan.output.width, profile.width)
  check('height', plan.output.height, profile.height)
  check('fpsNum', plan.output.fpsNum, profile.fpsNum)
  check('fpsDen', plan.output.fpsDen, profile.fpsDen)
  check('videoCodec', plan.output.videoCodec, profile.videoCodec)
  check('audioCodec', plan.output.audioCodec, profile.audioCodec)
  check('pixelFormat', plan.output.pixelFormat, profile.pixelFormat)
  check('audioSampleRateHz', plan.output.audioSampleRateHz, profile.audioSampleRateHz)
  check('audioChannels', plan.output.audioChannels, profile.audioChannels)
  check('faststart', plan.output.faststart, profile.faststart)
  if (mismatches.length > 0) {
    bad(`the plan's output does not match the frozen profile: ${mismatches.join('; ')}`, 'render_output_profile_invalid')
  }
  if (plan.output.durationMs > catalog.limits.maxOutputDurationMs) {
    bad('the plan declares an output longer than the frozen editor maximum', 'render_output_profile_invalid')
  }
  return profile
}

// ---- integrity --------------------------------------------------------------

export function fileSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (d) => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export interface AssetIntegrityClaim {
  path: string
  expectedSha256: string
  what: string
}

/**
 * Every input the render consumes must hash to what the caller pinned.
 *
 * `render_asset_integrity_failed` exists because the source file the compiler
 * measured and the source file the renderer reads are two different reads of
 * one storage system, separated by a download. If they differ, every timing
 * decision in the plan refers to material that is not on disk, and the render
 * would succeed while producing cuts in the wrong places — a defect with no
 * error and no symptom short of watching the video.
 */
export async function assertAssetIntegrity(claims: readonly AssetIntegrityClaim[]): Promise<void> {
  for (const claim of claims) {
    if (!existsSync(claim.path)) bad(`${claim.what} is missing`, 'render_asset_integrity_failed')
    const actual = await fileSha256(claim.path)
    if (actual !== claim.expectedSha256) {
      bad(`${claim.what} does not match its pinned digest`, 'render_asset_integrity_failed')
    }
  }
}

export interface FontIntegrityResult {
  basename: string
  status: 'verified' | 'unpinned'
}

/**
 * Verify the caption font.
 *
 * A `null` digest in the catalog means this deployment has not pinned that font
 * yet. It is reported as `unpinned` — never as verified. Under `strict` it is a
 * failure, because "we did not check" and "we checked and it was fine" are the
 * two statements this whole mechanism exists to keep apart, and an absent
 * digest silently satisfying an integrity check is how a font substitution
 * reaches production wearing a green tick.
 */
export async function verifyCaptionFont(
  fontsDir: string, preset: CaptionPreset, catalog: RenderCatalogV1, opts: { strict: boolean },
): Promise<FontIntegrityResult> {
  const basename = preset.fontFileBasename
  if (basename.includes('/') || basename.includes('..')) {
    bad('the caption preset names a font outside the fonts directory', 'render_font_integrity_failed')
  }
  const path = join(fontsDir, basename)
  if (!existsSync(path)) bad(`the caption font ${basename} is missing`, 'render_font_integrity_failed')
  const pinned = catalog.fonts[basename]
  if (!pinned) bad(`the caption font ${basename} is not listed in the frozen catalog`, 'render_font_integrity_failed')
  if (pinned.sha256 === null) {
    if (opts.strict) bad(`the caption font ${basename} has no pinned digest`, 'render_font_integrity_failed')
    return { basename, status: 'unpinned' }
  }
  const actual = await fileSha256(path)
  if (actual !== pinned.sha256) bad(`the caption font ${basename} does not match its pinned digest`, 'render_font_integrity_failed')
  return { basename, status: 'verified' }
}

// ---- process execution ------------------------------------------------------

export class RenderCancelledError extends Error {
  constructor(public readonly point: string) {
    super(`render cancelled at ${point}`)
    this.name = 'RenderCancelledError'
  }
}
export class RenderTimeoutError extends Error {
  constructor(public readonly elapsedMs: number, public readonly budgetMs: number) {
    super(`render exceeded its ${budgetMs}ms budget`)
    this.name = 'RenderTimeoutError'
  }
}

export interface ProcRunResult {
  code: number | null
  signal: NodeJS.Signals | null
  /** Tail of stderr, for DIAGNOSIS ONLY. Gate-0 §5 forbids persisting raw
   *  stderr; it is returned so the caller can hash or discard it, and the
   *  caller is where the sanitizer lives. */
  stderrTail: string
  durationMs: number
}

const STDERR_TAIL_BYTES = 8192

export interface SpawnDeps {
  spawn: typeof spawn
  now: () => number
}
const realDeps: SpawnDeps = { spawn, now: () => Date.now() }

/**
 * Run one media process to completion under a deadline and a cancellation
 * watch, in its OWN PROCESS GROUP.
 *
 * TEARDOWN IS TWO-PHASE AND THE ORDER MATTERS. SIGTERM to the group first, so
 * ffmpeg can close its output file rather than leaving a truncated one; then
 * SIGKILL to the group after `cancelGraceMs` if it has not exited. Sending only
 * SIGKILL guarantees a corrupt partial file; sending only SIGTERM guarantees
 * that a wedged process is never cleaned up. Gate-0 §9 allows twelve seconds
 * for cancel-to-exit and zero stale processes, and only the pair satisfies both.
 *
 * The kill targets `-pid` — the GROUP. ffmpeg's children are the processes that
 * actually hold the temp disk, and killing only the parent orphans them.
 */
export function runMediaProcess(
  bin: string, args: readonly string[],
  opts: { budgetMs: number; graceMs: number; watch?: CancelWatch; point: string },
  deps: SpawnDeps = realDeps,
): Promise<ProcRunResult> {
  return new Promise((resolve, reject) => {
    const started = deps.now()
    const child = deps.spawn(bin, [...args], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    let settled = false
    let killTimer: NodeJS.Timeout | null = null

    const signalGroup = (sig: NodeJS.Signals) => {
      // A process that already exited has no group; that is success, not an
      // error, so the throw is swallowed deliberately rather than by accident.
      try { if (child.pid) process.kill(-child.pid, sig) } catch { /* already gone */ }
    }
    const teardown = () => {
      signalGroup('SIGTERM')
      if (killTimer) clearTimeout(killTimer)
      killTimer = setTimeout(() => signalGroup('SIGKILL'), opts.graceMs)
      // Do not keep the event loop alive purely to deliver a kill to something
      // that may already be gone.
      killTimer.unref?.()
    }

    const budget = setTimeout(() => { timedOut = true; teardown() }, opts.budgetMs)
    let timedOut = false
    let cancelled = false

    const onAbort = () => { cancelled = true; teardown() }
    if (opts.watch) {
      if (opts.watch.cancelled()) { cancelled = true; teardown() }
      else opts.watch.signal.addEventListener('abort', onAbort, { once: true })
    }

    const finish = (err: Error | null, value?: ProcRunResult) => {
      if (settled) return
      settled = true
      clearTimeout(budget)
      if (killTimer) clearTimeout(killTimer)
      opts.watch?.signal.removeEventListener('abort', onAbort)
      if (err) reject(err); else resolve(value!)
    }

    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
      if (stderr.length > STDERR_TAIL_BYTES) stderr = stderr.slice(-STDERR_TAIL_BYTES)
    })
    child.on('error', (e) => finish(e))
    child.on('close', (code, signal) => {
      const durationMs = deps.now() - started
      // Cancellation is checked BEFORE the timeout, and both before the exit
      // code, because a killed process exits non-zero and reporting that as an
      // encoder failure would misclassify every cancellation as a defect.
      if (cancelled) return finish(new RenderCancelledError(opts.point))
      if (timedOut) return finish(new RenderTimeoutError(durationMs, opts.budgetMs))
      finish(null, { code, signal, stderrTail: stderr, durationMs })
    })
  })
}

// ---- the render ------------------------------------------------------------

export interface RenderRequest {
  plan: EditPlanV1
  /** Local, already-downloaded source. */
  sourcePath: string
  /** Local ASS document produced from plan.captions, or null when there are no cues. */
  assPath: string | null
  /** Directory holding the catalog's fonts, or null when there are no cues. */
  fontsDir: string | null
  /** Directory this render owns. Created if absent, and the ONLY place it writes. */
  workDir: string
  watch?: CancelWatch
  /** Refuse a font with no pinned digest. Production sets this. */
  strictFontIntegrity?: boolean
  ffmpegBin?: string
}

export interface RenderEvidence {
  catalogVersion: string
  catalogSha256: string
  graphSha256: string
  planSha256: string
  argvLength: number
  outputBytes: number
  outputSha256: string
  renderMs: number
  realtimeRatioMilli: number
  fontIntegrity: FontIntegrityResult | null
  budgetMs: number
}
export interface RenderResult {
  outputPath: string
  evidence: RenderEvidence
}

/**
 * The render timeout is DERIVED from the plan, not configured.
 *
 * Gate-0 §9 caps the maximum render at 6x realtime. A fixed timeout satisfying
 * a 15-minute plan would give a 15-second plan a budget ninety times its own
 * length, inside which a wedged encoder looks exactly like a slow one. Deriving
 * it means the guard has the same tightness at every duration.
 */
export function renderBudgetMs(plan: EditPlanV1, limits: RenderLimits): number {
  const derived = plan.output.durationMs * limits.maxRealtimeRatio
  return Math.min(limits.renderTimeoutCeilingMs, Math.max(limits.renderTimeoutFloorMs, derived))
}

export async function renderEditPlan(req: RenderRequest, deps: SpawnDeps = realDeps): Promise<RenderResult> {
  const catalog = loadRenderCatalog()
  assertOutputProfile(req.plan, catalog)

  if (req.plan.captions.cues.length > 0 && (!req.assPath || !req.fontsDir)) {
    bad('the plan carries caption cues but no ASS document or fonts directory was provided', 'render_graph_invalid')
  }

  // Integrity BEFORE the encoder starts. Discovering that the source was the
  // wrong file after spending six minutes encoding it is a strictly worse way
  // to learn the same fact.
  // The expected digest is read from the PLAN, not from the caller. The plan
  // records the source it was compiled against; letting a caller supply the
  // expectation separately would allow the two to differ, and the check would
  // then verify that the caller and the file agree about a file the plan never
  // saw.
  await assertAssetIntegrity([
    { path: req.sourcePath, expectedSha256: req.plan.identity.sourceChecksum, what: 'the source recording' },
  ])
  let fontIntegrity: FontIntegrityResult | null = null
  if (req.plan.captions.cues.length > 0) {
    const preset = catalog.captionPresets[req.plan.captions.presetId]
    if (!preset) bad(`caption preset ${JSON.stringify(req.plan.captions.presetId)} is not in the frozen catalog`, 'render_output_profile_invalid')
    fontIntegrity = await verifyCaptionFont(req.fontsDir!, preset, catalog, { strict: req.strictFontIntegrity === true })
  }

  mkdirSync(req.workDir, { recursive: true })
  const outputPath = join(req.workDir, 'output.mp4')
  // A previous attempt's file must never be mistaken for this attempt's. ffmpeg
  // is invoked with -y and would overwrite it, but only if it gets that far —
  // an early failure would otherwise leave a stale, plausible-looking output.
  rmSync(outputPath, { force: true })

  const graph = buildFfmpegGraph(
    req.plan,
    { sourcePath: req.sourcePath, assPath: req.assPath, fontsDir: req.fontsDir, outputPath },
    catalog.transitions.crossfade,
  )
  const args = buildFfmpegArgs(graph)
  const budgetMs = renderBudgetMs(req.plan, catalog.limits)

  const run = await runMediaProcess(
    req.ffmpegBin ?? 'ffmpeg', args,
    { budgetMs, graceMs: catalog.limits.cancelGraceMs, watch: req.watch, point: 'during_render' },
    deps,
  )
  if (run.code !== 0) {
    // THE TAIL GOES TO THE CONTAINER LOG, NOT INTO THE THROWN MESSAGE.
    //
    // Gate-0 §5 forbids persisting raw stderr, and the thrown message obeys
    // that: exit code and graph digest, nothing that could carry a local path or
    // a signed URL into a durable row. But the tail was being DISCARDED, not
    // redirected — `ProcRunResult.stderrTail` says "for DIAGNOSIS ONLY" and no
    // diagnosis existed. The first time this fired for real, all it said was
    // "ffmpeg exited 234", and the actual cause (an xfade timebase mismatch)
    // took a separate out-of-band reproduction to see.
    //
    // sanitizeError.ts already states the posture this restores: the raw error
    // stays in the worker's stdout — access-controlled container logs, rotated
    // by Docker — while durable state gets the sanitized form. Same rule, now
    // applied to the encoder that produces the most opaque failures of any
    // stage.
    console.error(
      `[render] ffmpeg exited ${String(run.code)} (signal ${String(run.signal)}) ` +
      `graph=${ffmpegGraphSha256(graph)}\n${run.stderrTail}`,
    )
    bad(`ffmpeg exited ${String(run.code)} (signal ${String(run.signal)})`, 'render_graph_invalid')
  }

  if (!existsSync(outputPath)) bad('ffmpeg reported success but wrote no output file', 'output_decode_failed')
  const outputBytes = statSync(outputPath).size
  if (outputBytes === 0) bad('ffmpeg reported success but wrote an empty output file', 'output_decode_failed')

  return {
    outputPath,
    evidence: {
      catalogVersion: catalog.catalogVersion,
      catalogSha256: renderCatalogSha256(),
      graphSha256: ffmpegGraphSha256(graph),
      planSha256: editPlanSha256(req.plan),
      argvLength: args.length,
      outputBytes,
      outputSha256: await fileSha256(outputPath),
      renderMs: run.durationMs,
      realtimeRatioMilli: req.plan.output.durationMs > 0
        ? Math.round((run.durationMs * 1000) / req.plan.output.durationMs)
        : 0,
      fontIntegrity,
      budgetMs,
    },
  }
}

/**
 * Extract the cover frame FROM THE RENDERED OUTPUT at the plan's output time.
 *
 * Taking it from the source at `sourceTimeMs` would be easier and would remove
 * the cover's ability to disagree with a broken time map. It is the one artifact
 * positioned to catch that class of defect, so it is taken where it can.
 */
export async function extractCover(
  outputPath: string, plan: EditPlanV1, workDir: string,
  opts: { watch?: CancelWatch; ffmpegBin?: string } = {}, deps: SpawnDeps = realDeps,
): Promise<{ coverPath: string; bytes: number }> {
  const catalog = loadRenderCatalog()
  const spec = catalog.cover
  if (plan.cover.outputTimeMs > plan.output.durationMs) {
    bad('the plan places its cover frame past the end of the output', 'output_cover_invalid')
  }
  const coverPath = join(workDir, 'cover.jpg')
  rmSync(coverPath, { force: true })
  const seconds = `${Math.floor(plan.cover.outputTimeMs / 1000)}.${String(plan.cover.outputTimeMs % 1000).padStart(3, '0')}`
  const args = [
    '-hide_banner', '-nostdin', '-y',
    '-ss', seconds, '-i', outputPath,
    '-frames:v', '1',
    '-vf', `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height}`,
    '-q:v', String(spec.qualityQscale),
    coverPath,
  ]
  const run = await runMediaProcess(
    opts.ffmpegBin ?? 'ffmpeg', args,
    { budgetMs: catalog.limits.coverExtractTimeoutMs, graceMs: catalog.limits.cancelGraceMs, watch: opts.watch, point: 'during_cover' },
    deps,
  )
  if (run.code !== 0) {
    // Same rule as the render above: tail to the container log, code to the row.
    console.error(`[render] cover extraction exited ${String(run.code)}\n${run.stderrTail}`)
    bad(`cover extraction exited ${String(run.code)}`, 'output_cover_invalid')
  }
  if (!existsSync(coverPath)) bad('cover extraction produced no file', 'output_cover_invalid')
  const bytes = statSync(coverPath).size
  if (bytes < spec.minBytes) bad('the extracted cover is implausibly small', 'output_cover_invalid')
  if (bytes > spec.maxBytes) bad('the extracted cover is larger than the frozen maximum', 'output_cover_invalid')
  return { coverPath, bytes }
}

/**
 * Remove everything this render wrote.
 *
 * Cancellation is not failure (Gate-0 §5): the partial local files go, the
 * immutable plan and analysis stay, and no pointer is ever published. This is
 * the "partial local files go" half, and it must be safe to call twice and safe
 * to call after a crash — a cleanup that throws on an already-clean directory
 * turns one failure into two.
 */
export function cleanupRenderWorkDir(workDir: string): void {
  rmSync(workDir, { recursive: true, force: true })
}

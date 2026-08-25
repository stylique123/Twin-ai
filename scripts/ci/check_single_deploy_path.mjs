// CI guard (B3): the TwinAI worker has ONE supported production deployment —
// VPS + Docker via worker/deploy-vps.sh, driven by
// .github/workflows/deploy-worker.yml. This guard fails the build if:
//
//      1. A SECOND deployment manifest for the WORKER reappears
//      (Fly/Railway/Render/Heroku) at ANY worker-deploy path — the repo root
//      or ANY path containing a `worker` segment (worker/, infra/worker/,
//      deploy/worker/, apps/worker/, packages/worker/, …). There is NO
//      whole-directory exemption: only a manifest with NO `worker` segment and
//      not at the repo root (e.g. postiz/fly.toml, discovery/render.yaml,
//      apps/web/Procfile) is another service's concern and is left alone.
//      Note: apps/ is NOT wholesale-exempt — apps/worker/… IS caught.
//   2. ANY committed WORKER_JOB_TYPES runtime override exists outside the
//      allowlisted docs/tests/example files. The shared worker MUST run with
//      WORKER_JOB_TYPES unset (worker/src/env.ts is the canonical registry);
//      a committed override — even an incomplete non-retired one like
//      `WORKER_JOB_TYPES=ingest` — silently narrows/drifts the running set.
//   3. The canonical registry in worker/src/env.ts is not EXACTLY the allowed
//      job types (order-insensitive, no extras, no duplicates):
//      ingest, build_voice, scrape_dna, validate_source, validate_clip,
//      editor_v2, purge_media. Strict set-equality catches bypass names like
//      `render_v2` / `edit_plan`. Future EditPlan/renderer stages live INSIDE
//      editor_v2, not as competing top-level job types.
//
//      WHY purge_media IS ON THIS LIST. The list is not "the five" as an
//      end in itself — it exists so a second RENDERING path cannot appear
//      beside editor_v2. purge_media renders nothing: it deletes the storage
//      bytes behind a removed media_asset (migration 0099), and it is
//      enqueued by a DATABASE TRIGGER rather than by application code. That
//      makes its presence here load-bearing in BOTH directions. As an extra
//      it would fail the build (it did, on c5abfaa). As a MISSING entry the
//      worker stops draining the type, every deletion job piles up unclaimed,
//      and every deleted recording's bytes survive with nothing anywhere
//      looking wrong — so `missing` is pinned by a selftest case too.
//
//      WHY validate_clip IS ON THIS LIST, on the same terms. It RENDERS
//      NOTHING: it downloads a screen capture, checksums it and ffprobes it,
//      writing measured facts onto a `clip` media_asset (0107) — the same
//      shape as validate_source, whose presence here has never been in
//      question. It composes nothing and encodes nothing; the cutaway it
//      makes possible is built inside editor_v2's render stage from
//      EditPlanV1.composition, which is where a second rendering path would
//      actually try to appear. Both directions are load-bearing again. As an
//      EXTRA it would fail the build, which is what caught this addition and
//      sent someone to read this comment. As a MISSING entry,
//      editor_finalize_clip keeps enqueueing the type, no worker claims it,
//      and every screen capture sits in `validating` forever — the creator
//      watches "checking it" spin while the migration, the edge function and
//      the UI all look correct. So `missing` is pinned by a selftest case too.
//
//   node scripts/ci/check_single_deploy_path.mjs            # PR guard
//   node scripts/ci/check_single_deploy_path.mjs --selftest # unit-test the logic
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SELF = 'scripts/ci/check_single_deploy_path.mjs'
const ENV = 'worker/src/env.ts'
const ALLOWED_REGISTRY = [
  'ingest', 'build_voice', 'scrape_dna', 'validate_source', 'validate_clip', 'editor_v2', 'purge_media',
  // extract_product reads a creator-supplied product page and stores what it
  // says, each fact graded. It belongs on THIS host for the same reason
  // scrape_dna does: fetching an arbitrary URL is slow, sometimes blocked, and
  // must survive a browser tab closing. Adding it here is the deliberate act
  // this guard exists to force — a job type that appeared without touching this
  // line would be a second deploy path arriving by accident.
  'extract_product',
  // assess_reference reads ONE gallery video's transcript and stores what its
  // structure REQUIRES — container, beats, and the content slots that decide
  // whether Twin could finish a script from it. It belongs on this host for the
  // same reasons extract_product and scrape_dna do: it shells out to yt-dlp and
  // whisper, it is slow, and it must survive a browser tab closing.
  //
  // IT RENDERS NOTHING, which is the test this list actually applies. It writes
  // rows to reference_content_profiles and encodes no media; the gallery reads
  // those rows. A second rendering path would appear as a top-level type doing
  // composition work, and this is not one.
  //
  // As an EXTRA it failed the build, which is what sent someone to read this
  // comment — working exactly as designed. As a MISSING entry,
  // scripts/assess-references.mjs would enqueue thousands of jobs no worker
  // claims, they would age out unclaimed, and the batch would report zero
  // progress with the script, the migration and the handler all looking correct
  // — the same quiet failure purge_media and validate_clip are listed to prevent.
  'assess_reference',
  // extraction_parity asks TWO models the same extraction question about ONE
  // transcript and stores both answers side by side. It belongs on this host for
  // the same reasons assess_reference does: it shells out to yt-dlp and whisper,
  // it is slow, and it must survive a browser tab closing.
  //
  // IT RENDERS NOTHING and it CHANGES NO ROUTING. Both models are named per
  // call; modelForTask is untouched and `decide` stays frozen. It writes rows to
  // extraction_parity_trials and encodes no media.
  //
  // WHY IT EXISTS AT ALL: model_routing_v1.json records that the routing looks
  // inverted — the Director on flash, the schema-constrained extractor on pro —
  // and says the next move is an eval rather than an edit. This is that eval.
  //
  // As an EXTRA it failed the build, which is what sent someone to read this
  // comment — working exactly as designed. As a MISSING entry it would be worse
  // than useless: the handler was registered without this line once already, and
  // its first job sat `queued` forever because the worker never asked for the
  // type. A dead-letter is loud; a job nobody claims is silent.
  'extraction_parity',
  // extraction_replication re-asks ONE model the question a single parity trial
  // already asked, on that trial's own cached transcript, and appends to its own
  // insert-only table. It exists because #66 recorded three arm-A timeouts and
  // could not say whether they were transient latency or reproducible behaviour.
  // It belongs on this host for the same reason extraction_parity does: it is a
  // Gemini call over a cached transcript, renders nothing, and encodes no media.
  // It changes no routing — the model is named per call and must equal the
  // source trial's arm A. It NEVER writes to extraction_parity_trials, so the
  // investigation cannot destroy the evidence it investigates.
  'extraction_replication',
  // sample_own_account looks at a SAMPLE of the creator's OWN videos and records
  // how many are them talking to camera, so the account half of the talking-head
  // gate has something to read. It belongs on this host for the reason the two
  // above do: it downloads at 360p, samples two stills, calls a model, renders
  // nothing and encodes no media.
  //
  // It is listed here for the reason the extraction_parity note gives — a
  // MISSING entry is the silent failure. Its handler is registered, its schema
  // is declared and the scan enqueues it; without this line the worker would
  // never ask for the type and every scan would leave a job sitting `queued`
  // forever, while the scan itself reported success.
  'sample_own_account',
]

// Second-deploy manifests. Vercel (web app) is intentionally NOT here.
const FORBIDDEN_MANIFEST = [
  /(^|\/)fly\.toml$/,
  /(^|\/)railway\.(toml|json)$/,
  /(^|\/)render\.ya?ml$/,
  /(^|\/)Procfile$/,
  /(^|\/)heroku\.yml$/,
]

// A worker-deploy path = the repo ROOT, OR ANY path that has a `worker`
// segment — worker/, infra/worker/, deploy/worker/, apps/worker/,
// packages/worker/, … There is deliberately NO broad top-level exemption: a
// prior version exempted whole dirs like `apps`/`packages` up front, which let
// apps/worker/fly.toml and packages/worker/render.yaml slip through. A manifest
// with NO worker segment and not at the root (postiz/fly.toml, apps/web/…) is
// that service's concern and is left alone.
export function isWorkerDeployPath(p) {
  const seg = p.split('/')
  return seg.length === 1 || seg.includes('worker')
}
export function scopedManifests(tracked) {
  return tracked.filter((p) => isWorkerDeployPath(p) && FORBIDDEN_MANIFEST.some((re) => re.test(p)))
}

// Files where a WORKER_JOB_TYPES=<value> line is documentation/example/test, not
// a real runtime override of the shared worker.
export function isAllowlistedOverrideFile(p) {
  return p.endsWith('.md')
    || p === 'worker/.env.example'
    || /(^|\/)__tests__\//.test(p)
    || /\.(test|spec)\.[A-Za-z0-9]+$/.test(p)
    // The staging-integration matrix spawns EPHEMERAL workers with a specific
    // job type per phase — a test override, never the shared production worker.
    || /(^|\/)staging-integration\//.test(p)
    || p === SELF
}
// True when a line is an actual runtime assignment of WORKER_JOB_TYPES to a
// value (env file, Dockerfile ENV, export, compose `KEY: val` or `- KEY=val`) —
// NOT a comment, NOT a `sed '/^WORKER_JOB_TYPES=/d'` scrub, NOT the env.ts
// default (which reads `process.env.WORKER_JOB_TYPES ??`).
export function isRuntimeOverrideAssignment(content) {
  const t = content.replace(/^\s+/, '')
  if (t.startsWith('#')) return false
  const body = t.replace(/^(ENV\s+|export\s+|-\s+)/, '')
  return /^WORKER_JOB_TYPES\s*[:=]\s*\S/.test(body)
}

export function registryDiff(reg) {
  const extras = reg.filter((t) => !ALLOWED_REGISTRY.includes(t))
  const missing = ALLOWED_REGISTRY.filter((t) => !reg.includes(t))
  const dupes = [...new Set(reg.filter((t, i) => reg.indexOf(t) !== i))]
  return { extras, missing, dupes, equal: extras.length === 0 && missing.length === 0 && dupes.length === 0 }
}

// PURE decision. `state`: { tracked:[paths], overrides:[forbidden override lines], registry:[types] }.
export function evaluate(s) {
  const reasons = []
  const manifests = scopedManifests(s.tracked)
  if (manifests.length) {
    reasons.push(`second WORKER deployment manifest present (VPS+Docker is the only supported worker path): ${manifests.join(', ')}`)
  }
  if (s.overrides.length) {
    reasons.push(`committed WORKER_JOB_TYPES runtime override(s) — the shared worker must be unset (allowed only in docs/tests/.env.example): ${s.overrides.join(' ; ')}`)
  }
  const d = registryDiff(s.registry)
  if (!d.equal) {
    const bits = []
    if (d.extras.length) bits.push(`unexpected: ${d.extras.join(',')}`)
    if (d.missing.length) bits.push(`missing: ${d.missing.join(',')}`)
    if (d.dupes.length) bits.push(`duplicated: ${d.dupes.join(',')}`)
    reasons.push(`canonical registry (worker/src/env.ts) must equal exactly {${ALLOWED_REGISTRY.join(',')}} — ${bits.join('; ')}`)
  }
  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const R = [...ALLOWED_REGISTRY]
  const base = { tracked: ['worker/Dockerfile', 'package.json'], overrides: [], registry: R }
  const cases = [
    ['clean: exactly the allowed set, no manifest/override', base, true],
    ['worker/fly.toml', { ...base, tracked: ['worker/fly.toml'] }, false],
    ['root fly.toml', { ...base, tracked: ['fly.toml'] }, false],
    ['infra/worker/fly.toml (worker-named anywhere)', { ...base, tracked: ['infra/worker/fly.toml'] }, false],
    ['deploy/worker/render.yaml (worker-named anywhere)', { ...base, tracked: ['deploy/worker/render.yaml'] }, false],
    ['apps/worker/fly.toml (no top-level exemption bypass)', { ...base, tracked: ['apps/worker/fly.toml'] }, false],
    ['packages/worker/render.yaml (no top-level exemption bypass)', { ...base, tracked: ['packages/worker/render.yaml'] }, false],
    ['postiz/fly.toml unrelated (allowed)', { ...base, tracked: ['postiz/fly.toml'] }, true],
    ['discovery/render.yaml unrelated (allowed)', { ...base, tracked: ['discovery/render.yaml'] }, true],
    ['apps/web/Procfile unrelated (allowed)', { ...base, tracked: ['apps/web/Procfile'] }, true],
    ['apps/web/vercel.json-adjacent Procfile allowed', { ...base, tracked: ['apps/web/config/Procfile'] }, true],
    ['any committed override (even incomplete)', { ...base, overrides: ['deploy/worker.env:3 WORKER_JOB_TYPES=ingest'] }, false],
    ['retired-type override', { ...base, overrides: ['x.env:1 WORKER_JOB_TYPES=ingest,transcribe'] }, false],
    ['registry extra render_v2', { ...base, registry: [...R, 'render_v2'] }, false],
    ['registry extra edit_plan', { ...base, registry: [...R, 'edit_plan'] }, false],
    ['registry missing editor_v2', { ...base, registry: R.filter((t) => t !== 'editor_v2') }, false],
    ['registry duplicate editor_v2', { ...base, registry: [...R, 'editor_v2'] }, false],
    // Dropping purge_media is the quiet failure: a trigger keeps enqueueing
    // the type, no worker claims it, and deleted recordings' bytes survive.
    ['registry missing purge_media', { ...base, registry: R.filter((t) => t !== 'purge_media') }, false],
    // Same quiet failure, one job over: editor_finalize_clip keeps enqueueing
    // validate_clip, nothing claims it, and every screen capture sits in
    // `validating` forever while nothing anywhere looks wrong.
    ['registry missing validate_clip', { ...base, registry: R.filter((t) => t !== 'validate_clip') }, false],
    // The teeth that matter — widening the list for a storage job, and again
    // for a measurement job, must not have made room for a second RENDERING
    // path beside editor_v2.
    ['registry extra render_v3 (list widened, teeth intact)', { ...base, registry: [...R, 'render_v3'] }, false],
    ['registry extra compose_clip (a measurement job is not a licence to compose)',
      { ...base, registry: [...R, 'compose_clip'] }, false],
  ]
  let failed = 0
  for (const [name, state, exp] of cases) {
    const got = evaluate(state).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  // classifier unit checks
  const assert = (cond, msg) => { if (!cond) { console.error(`SELFTEST FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }
  assert(isWorkerDeployPath('infra/worker/fly.toml'), 'isWorkerDeployPath infra/worker')
  assert(isWorkerDeployPath('apps/worker/fly.toml'), 'isWorkerDeployPath apps/worker (was bypass)')
  assert(isWorkerDeployPath('packages/worker/render.yaml'), 'isWorkerDeployPath packages/worker (was bypass)')
  assert(!isWorkerDeployPath('postiz/fly.toml'), 'isWorkerDeployPath postiz not worker')
  assert(!isWorkerDeployPath('apps/web/Procfile'), 'isWorkerDeployPath apps/web allowed')
  // Drift guard (R5-6): this file's own comments must NOT re-claim a wholesale
  // apps/ (or packages/) exemption — implementation catches apps/worker.
  try {
    const selfText = readFileSync(new URL(import.meta.url), 'utf8')
    assert(!/\(postiz\/,\s*discovery\/,\s*apps\/,/.test(selfText), 'header does not wholesale-exempt apps/ (comment matches implementation)')
    assert(/apps\/worker\/… IS caught|apps\/worker\/ IS caught|apps\/worker\/\.\.\. IS caught/i.test(selfText) || /apps\/worker\/… IS caught/.test(selfText) || /apps\/ is NOT wholesale-exempt/i.test(selfText), 'header states apps/ is not wholesale-exempt')
  } catch (e) { assert(false, 'drift-guard could not read self: ' + e.message) }
  assert(isRuntimeOverrideAssignment('WORKER_JOB_TYPES=ingest'), 'assignment env form')
  assert(isRuntimeOverrideAssignment('  ENV WORKER_JOB_TYPES=a,b'), 'assignment Dockerfile ENV')
  assert(isRuntimeOverrideAssignment('  WORKER_JOB_TYPES: ingest'), 'assignment yaml form')
  assert(!isRuntimeOverrideAssignment("      sed -i '/^WORKER_JOB_TYPES=/d' f"), 'sed scrub is not an assignment')
  assert(!isRuntimeOverrideAssignment('# WORKER_JOB_TYPES=ingest'), 'comment is not an assignment')
  assert(!isRuntimeOverrideAssignment("  jobTypes: (process.env.WORKER_JOB_TYPES ?? 'a')"), 'env.ts default is not an assignment')
  assert(isAllowlistedOverrideFile('worker/.env.example'), 'allowlist .env.example')
  assert(isAllowlistedOverrideFile('DEPLOY.md'), 'allowlist docs')
  assert(isAllowlistedOverrideFile('scripts/staging-integration/phase5.mjs'), 'allowlist staging matrix')
  assert(!isAllowlistedOverrideFile('deploy/worker.env'), 'non-allowlisted real config')

  if (failed) { console.error(`single-deploy-path selftest: ${failed} failed`); process.exit(1) }
  console.log('single-deploy-path selftest: all cases passed'); process.exit(0)
}

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
}
function registryDefault() {
  const m = readFileSync(ENV, 'utf8').match(/jobTypes:\s*\(process\.env\.WORKER_JOB_TYPES\s*\?\?\s*'([^']*)'/)
  if (!m) return null
  return m[1].split(',').map((t) => t.trim()).filter(Boolean)
}

function main() {
  const tracked = trackedFiles()

  // Any committed WORKER_JOB_TYPES assignment outside allowlisted docs/tests.
  const overrides = []
  let grep = ''
  try { grep = execSync("git grep -nI 'WORKER_JOB_TYPES' -- . ':!" + SELF + "'", { encoding: 'utf8' }) } catch { grep = '' }
  for (const line of grep.split('\n').filter(Boolean)) {
    const m = line.match(/^(.+?):(\d+):(.*)$/)
    if (!m) continue
    const [, path, ln, content] = m
    if (isRuntimeOverrideAssignment(content) && !isAllowlistedOverrideFile(path)) {
      overrides.push(`${path}:${ln} ${content.trim()}`)
    }
  }

  const registry = registryDefault()
  if (!registry) {
    console.error(`::error::could not parse the canonical job registry from ${ENV}`)
    process.exit(1)
  }

  const state = { tracked, overrides, registry }
  console.log('single-deploy-path state: ' + JSON.stringify({
    workerManifests: scopedManifests(tracked), overrides, registry,
  }))

  const { ok, reasons } = evaluate(state)
  console.log(`single-deploy-path guard: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}

if (process.argv.includes('--selftest')) selftest()
else main()

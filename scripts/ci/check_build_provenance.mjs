// CI guard (Phase-6 build provenance): the boot manifest that editor_pin_manifest
// (migration 0087) refuses to pin without is only trustworthy if the RUNTIME
// image it describes is actually built reproducibly. Nothing else in CI can run
// `docker build` on a VPS-only image, so this guard proves — DECIDABLY, from the
// committed files — that the four provenance properties hold:
//
//   1. LOCKFILE + npm ci (not npm install): every worker `npm` install in the
//      Dockerfile is `npm ci` against a COPY'd package-lock.json. `npm install`
//      would resolve a fresh (possibly drifted) tree, so the dependency-lock
//      digest in the manifest would not describe what actually shipped.
//   2. NO dev deps in the runtime image: the runtime stage installs with
//      `npm ci --omit=dev` (typescript/tsx/vitest live only in the builder), so
//      `npm audit --omit=dev` on the shipped closure stays meaningful.
//   3. COMMIT injection: the Dockerfile takes `ARG WORKER_GIT_SHA` + re-exports
//      it as `ENV WORKER_GIT_SHA=$WORKER_GIT_SHA`, and deploy-worker.yml passes
//      `--build-arg WORKER_GIT_SHA=...`. Without it the boot manifest has no
//      exact commit and pin fails closed — so a deploy path that forgets to pass
//      it must fail HERE, not silently at first pin.
//   4. OpenCV wheel HASH enforced at install: the Dockerfile installs the OpenCV
//      wheel with `pip install --require-hashes -r requirements-opencv.txt`
//      (enforcement, not an after-the-fact record), and that file's pinned
//      sha256 EQUALS worker/models/vision.manifest.json runtime.wheelSha256.
//
//   node scripts/ci/check_build_provenance.mjs            # PR guard
//   node scripts/ci/check_build_provenance.mjs --selftest # unit-test the logic
import { readFileSync } from 'node:fs'

const DOCKERFILE = 'worker/Dockerfile'
const DEPLOY_WF = '.github/workflows/deploy-worker.yml'
const OPENCV_REQ = 'worker/requirements-opencv.txt'
const VISION_MANIFEST = 'worker/models/vision.manifest.json'

// ---- pure extractors --------------------------------------------------------

// The single pinned OpenCV wheel hash declared in requirements-opencv.txt
// (--hash=sha256:<64hex>). Returns null if absent/malformed.
export function opencvHashFromReq(text) {
  const m = text.match(/--hash=sha256:([0-9a-f]{64})\b/)
  return m ? m[1] : null
}

// Does the runtime install the OpenCV wheel with hash ENFORCEMENT?
// `pip install ... --require-hashes ... requirements-opencv.txt` (order-free).
export function enforcesOpencvHashes(dockerfile) {
  return dockerfile
    .split('\n')
    .some((l) => l.includes('--require-hashes') && /requirements-opencv\.txt/.test(l))
}

// Every worker node-dep install line in the Dockerfile. Returns the offending
// `npm install` lines (empty = clean). `npm ci` is required.
export function npmInstallOffenders(dockerfile) {
  return dockerfile
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /(^|&&|\s)npm\s+install\b/.test(l) && !l.startsWith('#'))
}

// ---- pure decision ----------------------------------------------------------
// state: { dockerfile, deploy, opencvReq, wheelSha }
export function evaluate(s) {
  const reasons = []
  const df = s.dockerfile

  // (1) lockfile present + npm ci, never npm install.
  if (!/COPY[^\n]*package-lock\.json/.test(df)) {
    reasons.push(`${DOCKERFILE}: does not COPY package-lock.json (npm ci needs the lockfile for a reproducible closure)`)
  }
  if (!/\bnpm\s+ci\b/.test(df)) {
    reasons.push(`${DOCKERFILE}: no \`npm ci\` — the build must install the exact locked closure, not resolve fresh`)
  }
  const offenders = npmInstallOffenders(df)
  if (offenders.length) {
    reasons.push(`${DOCKERFILE}: uses \`npm install\` (must be \`npm ci\`): ${offenders.join(' | ')}`)
  }

  // (2) runtime image carries no dev deps.
  if (!/\bnpm\s+ci\s+--omit=dev\b/.test(df)) {
    reasons.push(`${DOCKERFILE}: runtime stage must install with \`npm ci --omit=dev\` (no dev deps in the shipped image)`)
  }

  // (3) commit injection: Dockerfile side + deploy workflow side.
  if (!/ARG\s+WORKER_GIT_SHA\b/.test(df) || !/ENV\s+WORKER_GIT_SHA=\$WORKER_GIT_SHA\b/.test(df)) {
    reasons.push(`${DOCKERFILE}: must declare \`ARG WORKER_GIT_SHA\` and re-export \`ENV WORKER_GIT_SHA=$WORKER_GIT_SHA\` (boot manifest requires an exact commit)`)
  }
  if (!/--build-arg\s+WORKER_GIT_SHA=/.test(s.deploy)) {
    reasons.push(`${DEPLOY_WF}: docker build must pass \`--build-arg WORKER_GIT_SHA=...\` (else the deployed image has no commit provenance and pin fails closed)`)
  }

  // (4) OpenCV wheel hash enforced at install + equal to the vision manifest.
  if (!enforcesOpencvHashes(df)) {
    reasons.push(`${DOCKERFILE}: OpenCV must be installed with \`pip install --require-hashes -r requirements-opencv.txt\` (enforce the wheel SHA-256, don't just record it)`)
  }
  const reqHash = opencvHashFromReq(s.opencvReq)
  if (!reqHash) {
    reasons.push(`${OPENCV_REQ}: no pinned --hash=sha256:<64hex> OpenCV wheel hash`)
  } else if (reqHash !== s.wheelSha) {
    reasons.push(`OpenCV wheel hash drift: ${OPENCV_REQ} pins ${reqHash} but ${VISION_MANIFEST} runtime.wheelSha256 is ${s.wheelSha}`)
  }

  return { ok: reasons.length === 0, reasons }
}

// ---- selftest ---------------------------------------------------------------
function selftest() {
  const SHA = 'a'.repeat(64)
  const goodDockerfile = [
    'FROM node:22-bookworm-slim AS builder',
    'COPY package.json package-lock.json ./',
    'RUN npm ci',
    'RUN npm run build',
    'FROM node:22-bookworm-slim',
    'COPY requirements.txt requirements-opencv.txt ./',
    'RUN pip3 install -r requirements.txt && pip3 install --require-hashes -r requirements-opencv.txt',
    'COPY package.json package-lock.json ./',
    'RUN npm ci --omit=dev',
    'ARG WORKER_GIT_SHA=""',
    'ENV WORKER_GIT_SHA=$WORKER_GIT_SHA',
  ].join('\n')
  const goodDeploy = 'docker build --build-arg WORKER_GIT_SHA="$DEPLOY_SHA" -t twinai-worker worker/'
  const goodReq = `opencv-python-headless==4.10.0.84 \\\n    --hash=sha256:${SHA}`
  const base = { dockerfile: goodDockerfile, deploy: goodDeploy, opencvReq: goodReq, wheelSha: SHA }

  const cases = [
    ['clean baseline', base, true],
    ['no lockfile COPY', { ...base, dockerfile: goodDockerfile.replace(/COPY package.json package-lock.json .\/\n/g, '') }, false],
    ['npm install instead of ci (builder)', { ...base, dockerfile: goodDockerfile.replace('RUN npm ci\n', 'RUN npm install\n') }, false],
    ['runtime keeps dev deps (no --omit=dev)', { ...base, dockerfile: goodDockerfile.replace('RUN npm ci --omit=dev', 'RUN npm ci') }, false],
    ['missing ARG WORKER_GIT_SHA', { ...base, dockerfile: goodDockerfile.replace('ARG WORKER_GIT_SHA=""\n', '') }, false],
    ['missing ENV re-export', { ...base, dockerfile: goodDockerfile.replace('ENV WORKER_GIT_SHA=$WORKER_GIT_SHA', 'ENV NODE_ENV=production') }, false],
    ['deploy omits --build-arg', { ...base, deploy: 'docker build -t twinai-worker worker/' }, false],
    ['opencv not --require-hashes', { ...base, dockerfile: goodDockerfile.replace('--require-hashes -r requirements-opencv.txt', '-r requirements-opencv.txt') }, false],
    ['opencv req has no hash', { ...base, opencvReq: 'opencv-python-headless==4.10.0.84' }, false],
    ['opencv hash drift vs vision manifest', { ...base, wheelSha: 'b'.repeat(64) }, false],
  ]
  let failed = 0
  for (const [name, state, exp] of cases) {
    const got = evaluate(state).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  const assert = (cond, msg) => { if (!cond) { console.error(`SELFTEST FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }
  assert(opencvHashFromReq(goodReq) === SHA, 'opencvHashFromReq extracts the pinned hash')
  assert(opencvHashFromReq('opencv==1') === null, 'opencvHashFromReq null when absent')
  assert(enforcesOpencvHashes(goodDockerfile), 'enforcesOpencvHashes true for --require-hashes line')
  assert(!enforcesOpencvHashes('RUN pip3 install -r requirements-opencv.txt'), 'enforcesOpencvHashes false without the flag')
  assert(npmInstallOffenders(goodDockerfile).length === 0, 'npmInstallOffenders clean on good file')
  assert(npmInstallOffenders('RUN npm install\n').length === 1, 'npmInstallOffenders catches npm install')
  assert(npmInstallOffenders('# RUN npm install (historical)\n').length === 0, 'npmInstallOffenders ignores comments')

  if (failed) { console.error(`build-provenance selftest: ${failed} failed`); process.exit(1) }
  console.log('build-provenance selftest: all cases passed'); process.exit(0)
}

// ---- live PR guard ----------------------------------------------------------
function main() {
  let dockerfile, deploy, opencvReq, wheelSha
  try {
    dockerfile = readFileSync(DOCKERFILE, 'utf8')
    deploy = readFileSync(DEPLOY_WF, 'utf8')
    opencvReq = readFileSync(OPENCV_REQ, 'utf8')
    const vm = JSON.parse(readFileSync(VISION_MANIFEST, 'utf8'))
    wheelSha = vm?.runtime?.wheelSha256 ?? null
  } catch (e) {
    console.error(`::error::build-provenance guard could not read a required file: ${e.message}`)
    process.exit(1)
  }
  if (!wheelSha) {
    console.error(`::error::${VISION_MANIFEST} has no runtime.wheelSha256`)
    process.exit(1)
  }

  const state = { dockerfile, deploy, opencvReq, wheelSha }
  const { ok, reasons } = evaluate(state)
  console.log('build-provenance state: ' + JSON.stringify({
    lockfileCopied: /COPY[^\n]*package-lock\.json/.test(dockerfile),
    npmCi: /\bnpm\s+ci\b/.test(dockerfile),
    omitDev: /\bnpm\s+ci\s+--omit=dev\b/.test(dockerfile),
    argSha: /ARG\s+WORKER_GIT_SHA\b/.test(dockerfile),
    buildArg: /--build-arg\s+WORKER_GIT_SHA=/.test(deploy),
    opencvEnforced: enforcesOpencvHashes(dockerfile),
    opencvHash: opencvHashFromReq(opencvReq),
    wheelSha,
  }))
  console.log(`build-provenance guard: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}

if (process.argv.includes('--selftest')) selftest()
else main()

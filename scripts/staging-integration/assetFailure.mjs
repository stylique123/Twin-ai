#!/usr/bin/env node
// A 504 IS NOT A BAD FIXTURE.
//
// ⚠️⚠️ FIVE MATRIX PHASES REPORTED EVERY NON-READY ASSET AS `fixture asset
// rejected`. phase4:198, phase5:281, phase6:250, phase7:216 and phase8:222 all
// carried the same line, and it names the FIXTURE as the problem whatever
// actually happened.
//
// ⚠️ MEASURED, 2026-09-10, run 34424908327. Phase 6 died with:
//
//   fixture asset rejected: {"finalized_etag":"\"75cb9ad6...\"",
//     "rejection_code":"download_failed","finalized_bytes":685868,
//     "rejection_detail":"Error: storage download 504: 504 Gateway Time-out"}
//
// The object EXISTED and was FINALIZED at 685,868 bytes with an etag. Nothing
// was wrong with the fixture. Supabase Storage returned a gateway timeout on
// the download, fifty minutes into a run in which Phases 4 and 5 had already
// read Storage successfully. The next reader of that message goes and inspects
// a fixture that is fine.
//
// ⚖️ THE SCRIPT STILL FAILS — that is not in question and must not change. What
// changes is that the message says WHICH KIND of failure it was, so the person
// reading it at 2am looks at the network instead of the ffmpeg filter graph.
//
// ⚠️ AND IT DOES NOT GUESS. A 5xx in the detail is infrastructure. A genuine
// rejection code like `no_video_stream` is the fixture. Anything else is
// reported as unclassified rather than assigned to whichever side is
// convenient — an unclassified failure that says so is more useful than a
// confident wrong label, which is the whole defect being fixed here.

/** Rejection codes that mean the PIPELINE judged the asset unfit. */
const FIXTURE_CODES = new Set([
  'no_video_stream', 'no_audio_stream', 'too_short', 'too_long',
  'bytes_changed_after_finalize', 'unsupported_container', 'no_speech',
])

/** ⚠️ A 5xx OR AN EXPLICIT TIMEOUT IS TRANSPORT. Matched on the detail text
 *  because that is where the HTTP status lands; `download_failed` alone is
 *  ambiguous — a 404 would also be a download failure and WOULD be our fault. */
const TRANSPORT_DETAIL = /\b(5\d\d)\b|gateway time-?out|timed? ?out|ETIMEDOUT|ECONNRESET|socket hang up|EAI_AGAIN/i

export function classifyAssetFailure(asset) {
  const md = (asset && typeof asset === 'object' && asset.metadata && typeof asset.metadata === 'object')
    ? asset.metadata : {}
  const code = typeof md.rejection_code === 'string' ? md.rejection_code : ''
  const detail = typeof md.rejection_detail === 'string' ? md.rejection_detail : ''

  if (FIXTURE_CODES.has(code)) return 'fixture'
  if (code === 'download_failed' && TRANSPORT_DETAIL.test(detail)) return 'transport'
  if (TRANSPORT_DETAIL.test(detail)) return 'transport'
  // ⚖️ UNCLASSIFIED IS AN ANSWER. Better than picking a side.
  return 'unclassified'
}

export function describeAssetFailure(asset) {
  const md = (asset && typeof asset === 'object' && asset.metadata && typeof asset.metadata === 'object')
    ? asset.metadata : {}
  const status = asset && typeof asset === 'object' ? String(asset.status ?? 'unknown') : 'unknown'
  const kind = classifyAssetFailure(asset)
  const json = JSON.stringify(md)

  // ⚖️ THE FINALIZED SIZE IS THE EVIDENCE THAT THE FIXTURE WAS FINE, so it is
  // named in the sentence rather than left for someone to spot in the JSON.
  const bytes = typeof md.finalized_bytes === 'number' && md.finalized_bytes > 0
    ? ` The object WAS finalized at ${md.finalized_bytes} bytes, so the fixture itself uploaded correctly.`
    : ''

  if (kind === 'transport') {
    return `STAGING INFRASTRUCTURE FAILURE, not a bad fixture — the asset could not be `
      + `DOWNLOADED (status=${status}).${bytes} This is a transport error against staging `
      + `Storage; re-run once before treating it as real, and do not weaken the phase. `
      + `metadata: ${json}`
  }
  if (kind === 'fixture') {
    return `fixture asset rejected by the pipeline (status=${status}, `
      + `code=${md.rejection_code}) — the fixture is genuinely unfit. metadata: ${json}`
  }
  return `asset not ready and the cause is UNCLASSIFIED (status=${status}) — `
    + `neither a known fixture rejection nor a recognised transport error. `
    + `Read the metadata before assuming either. metadata: ${json}`
}

// ⚠️ SELFTEST RATHER THAN A VITEST FILE: this is a CI script under scripts/,
// outside the typechecked test projects, and check_test_typecheck_ratchet's
// ceiling is 0 — a .test.ts importing an untyped .mjs cannot compile. Same
// idiom as check_symbol_readers.mjs and check_brief_consumers.mjs.
function selftest() {
  let bad = 0
  const check = (name, got, want) => {
    if (got !== want) { console.error(`  selftest FAIL: ${name} — got ${got}, want ${want}`); bad++ }
  }

  // ⚠️ THE REAL METADATA FROM RUN 34424908327, verbatim.
  const real504 = { status: 'rejected', metadata: {
    finalized_etag: '"75cb9ad6a99ac9dee83b150e01353159"',
    rejection_code: 'download_failed',
    finalized_bytes: 685868,
    rejection_detail: 'Error: storage download 504: <html>504 Gateway Time-out</html>',
  } }
  check('the real 504 is transport', classifyAssetFailure(real504), 'transport')
  check('the real 504 names infrastructure',
    /STAGING INFRASTRUCTURE FAILURE/.test(describeAssetFailure(real504)), true)
  check('the real 504 states the finalized size',
    /finalized at 685868 bytes/.test(describeAssetFailure(real504)), true)
  check('the real 504 does NOT say the fixture was rejected',
    /fixture asset rejected/.test(describeAssetFailure(real504)), false)

  // ⚠️⚠️ A 404 IS OUR FAULT, NOT THE NETWORK'S — `download_failed` alone must
  // not be enough to blame infrastructure, or a genuinely missing object gets
  // excused as a blip and re-run forever.
  const missing = { status: 'rejected', metadata: {
    rejection_code: 'download_failed', rejection_detail: 'Error: storage download 404: not found' } }
  check('a 404 download is NOT transport', classifyAssetFailure(missing), 'unclassified')

  // a genuine pipeline rejection still reads as the fixture's fault
  const noVideo = { status: 'rejected', metadata: { rejection_code: 'no_video_stream' } }
  check('no_video_stream is a fixture failure', classifyAssetFailure(noVideo), 'fixture')
  check('no_video_stream still says rejected',
    /fixture asset rejected by the pipeline/.test(describeAssetFailure(noVideo)), true)

  // unknown shapes say so rather than picking a side
  check('an empty metadata is unclassified', classifyAssetFailure({ status: 'failed' }), 'unclassified')
  check('a null asset is unclassified', classifyAssetFailure(null), 'unclassified')
  check('unclassified says UNCLASSIFIED',
    /UNCLASSIFIED/.test(describeAssetFailure({ status: 'failed' })), true)

  // other transport shapes
  for (const d of ['ETIMEDOUT', 'socket hang up', 'storage download 502: bad gateway', 'ECONNRESET']) {
    check(`transport detail: ${d}`,
      classifyAssetFailure({ status: 'rejected', metadata: { rejection_detail: d } }), 'transport')
  }

  if (bad > 0) { console.error(`asset-failure selftest: ${bad} FAILED`); process.exit(1) }
  console.log('asset-failure selftest: OK (a 504 is transport, a 404 is not, a rejection is the fixture)')
}
if (process.argv.includes('--selftest')) selftest()

// A HARNESS FAILURE MUST SAY WHERE IT HAPPENED AND WHETHER IT IS YOURS.
//
// ⚠️ MEASURED, AND IT COST A RE-RUN. A staging run died with exactly this:
//
//     PROBE ERROR: Error: Gateway Timeout
//         at phase2-disabled.mjs:34
//
// Line 34 is `if (uErr) throw new Error(uErr.message)` — the createUser call in
// the SETUP, before a single assertion had run. The message named no operation,
// no status and no endpoint, so the only way to learn that a platform 504 had
// hit user creation was to open the file and count lines. And the diff under
// test touched one package that could not possibly have caused it.
//
// ⚖️ THE EXPENSIVE PART IS NOT THE STACK TRACE, IT IS THE DECISION. A gate
// failure asks one question: re-run, or investigate? A 504 from the platform
// during setup is a re-run. A 400 from the function under test is not. Reporting
// both as "Error: <message>" makes that a judgement call every time, and this
// session got it wrong once in the cautious direction and once in the hasty one.
//
// ⚠️ IT CLASSIFIES, IT DOES NOT RETRY. Retrying here would paper over a real
// outage and turn a five-minute red into a fifty-minute red. The harness says
// what it saw; a human or the workflow decides.
//
//   node scripts/staging-integration/failure.mjs --selftest

/** Statuses the PLATFORM returns when it, not the code under test, is unwell. */
const INFRASTRUCTURE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

/** ⚠️ 503 IS DELIBERATELY IN BOTH LISTS AND THE TEXT DECIDES. `start-editor-v2`
 *  answers 503 `editor_not_available` BY DESIGN when the gate is off — that is a
 *  product behaviour the disabled-gate probe asserts. A blanket "503 means
 *  infrastructure" would classify the thing the probe exists to check as an
 *  outage and tell somebody to re-run until it passed. */
const PRODUCT_503_MARKERS = ['editor_not_available', 'not_available', 'disabled']

const INFRASTRUCTURE_TEXT = [
  'gateway timeout', 'bad gateway', 'service unavailable', 'too many requests',
  'econnreset', 'etimedout', 'econnrefused', 'socket hang up', 'fetch failed',
  'network error', 'upstream connect error',
]

const statusOf = (err) => {
  for (const k of ['status', 'statusCode', 'code']) {
    const v = err?.[k]
    if (typeof v === 'number' && v >= 100 && v < 600) return v
  }
  const m = /\b(4\d\d|5\d\d)\b/.exec(String(err?.message ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * Is this the platform's problem or ours?
 *
 * ⚖️ `unknown` IS A REAL ANSWER AND IT IS NOT "infrastructure". Guessing
 * infrastructure when we cannot tell would make every genuine product failure
 * look re-runnable, and a flaky-looking gate is a gate nobody believes.
 */
export function classifyHarnessFailure(err) {
  const message = String(err?.message ?? err ?? '').trim()
  const lower = message.toLowerCase()
  const status = statusOf(err)

  if (status === 503 && PRODUCT_503_MARKERS.some((m) => lower.includes(m))) {
    return { kind: 'product', status, message,
      hint: 'the function answered 503 on purpose — this is the behaviour under test, not an outage' }
  }
  if (status !== null && INFRASTRUCTURE_STATUS.has(status)) {
    return { kind: 'infrastructure', status, message,
      hint: 're-run the matrix; this did not come from the diff under test' }
  }
  if (status !== null) {
    return { kind: 'product', status, message,
      hint: 'the service answered — read the body before re-running' }
  }
  if (INFRASTRUCTURE_TEXT.some((t) => lower.includes(t))) {
    return { kind: 'infrastructure', status: null, message,
      hint: 're-run the matrix; this reads as a transport failure' }
  }
  return { kind: 'unknown', status: null, message,
    hint: 'no status and no transport marker — read the trace, do not assume a flake' }
}

/** ⚠️ THE STEP NAME IS THE POINT. "Error: Gateway Timeout" and "Gateway Timeout
 *  while creating the probe user" cost the same to print and differ by the whole
 *  investigation. */
export function describeFailure(step, err) {
  const c = classifyHarnessFailure(err)
  const where = c.status === null ? step : `${step} (HTTP ${c.status})`
  return `${c.kind.toUpperCase()} — ${where}: ${c.message || '(no message)'}\n  → ${c.hint}`
}

/** Throw with the step attached, so the top-level handler has something to say. */
export function failAt(step, err) {
  const e = new Error(describeFailure(step, err))
  e.harnessStep = step
  e.harnessKind = classifyHarnessFailure(err).kind
  throw e
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }

  // ⚠️ THE EXACT FAILURE THAT MOTIVATED THIS FILE.
  ok('a bare Gateway Timeout is infrastructure',
    classifyHarnessFailure(new Error('Gateway Timeout')).kind === 'infrastructure')
  ok('and it says to re-run rather than investigate',
    classifyHarnessFailure(new Error('Gateway Timeout')).hint.includes('re-run'))
  ok('a 504 carried as a status is infrastructure',
    classifyHarnessFailure({ status: 504, message: 'upstream' }).kind === 'infrastructure')

  // ⚖️ THE TRAP: the disabled-gate probe EXPECTS a 503.
  ok('a 503 the product means is NOT an outage',
    classifyHarnessFailure({ status: 503, message: 'editor_not_available' }).kind === 'product')
  ok('a 503 with no product marker is infrastructure',
    classifyHarnessFailure({ status: 503, message: 'upstream unavailable' }).kind === 'infrastructure')

  ok('a 400 is ours', classifyHarnessFailure({ status: 400, message: 'bad body' }).kind === 'product')
  ok('a 401 is ours', classifyHarnessFailure({ status: 401, message: 'no jwt' }).kind === 'product')
  ok('ECONNRESET is transport', classifyHarnessFailure(new Error('read ECONNRESET')).kind === 'infrastructure')
  ok('fetch failed is transport', classifyHarnessFailure(new Error('fetch failed')).kind === 'infrastructure')

  // ⚠️ THE ONE THAT MUST NOT GUESS.
  ok('an unrecognised error is unknown, not a flake',
    classifyHarnessFailure(new TypeError('Cannot read properties of undefined')).kind === 'unknown')
  ok('and it says so rather than suggesting a re-run',
    !classifyHarnessFailure(new TypeError('x')).hint.includes('re-run'))

  ok('an empty error does not throw', classifyHarnessFailure(undefined).kind === 'unknown')

  ok('the description names the step',
    describeFailure('creating the probe user', new Error('Gateway Timeout'))
      .includes('creating the probe user'))
  ok('the description carries the status when there is one',
    describeFailure('signing in', { status: 429, message: 'slow down' }).includes('HTTP 429'))

  if (failed) process.exit(1)
  console.log('harness-failure selftest: all cases passed')
  process.exit(0)
}

#!/usr/bin/env node
// Credential-free: the classifier is pure, so the case that cost three matrix
// runs can be replayed exactly.
import { describeReadFailure, TRANSPORT_FAILED, ASSERTION_UNREADABLE } from './transportError.mjs'

let failed = 0
const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }

// ── THE FAILURE THAT ACTUALLY HAPPENED, THREE TIMES ─────────────────────────
// #467, #468 and #474 all died here. postgrest-js sets message '' when a
// non-2xx carries an empty body, and count assertions use head:true so there
// is never a body to parse on an error status.
{
  const r = describeReadFailure({
    what: 'non-sanctioned analysis rows',
    error: { message: '' },
    status: 544, statusText: '', elapsedMs: 8021,
  })
  ok('an empty body is TRANSPORT_FAILED', r.kind === TRANSPORT_FAILED)
  ok('and it says so in the text', r.text.includes('TRANSPORT_FAILED'))
  ok('the status survives the empty body', r.text.includes('544'))
  ok('the elapsed time survives too', r.text.includes('8021ms'))
  ok('emptiness is stated as a measurement, not implied', r.text.includes('body WAS EMPTY (0 bytes)'))
  // ⚠️ THE SENTENCE THAT PREVENTS THE WRONG REPAIR.
  ok('it refuses to be read as a failed property',
    r.text.includes('NOT evidence that the property under test failed'))
  ok('and it forbids the two tempting shortcuts',
    r.text.includes('Do not merge around this') && r.text.includes('do not widen a tolerance'))
}

// ⚖️ THE OPPOSITE CASE MUST NOT BE SWALLOWED. A real PostgREST error is a real
// finding and has to be diagnosed on its own evidence, not filed as transport.
{
  const r = describeReadFailure({
    what: 'non-sanctioned analysis rows',
    error: { message: 'canceling statement due to statement timeout' },
    status: 500, statusText: 'Internal Server Error', elapsedMs: 8003,
  })
  ok('a message-carrying error is NOT transport', r.kind === ASSERTION_UNREADABLE)
  ok('and the message is quoted verbatim',
    r.text.includes('canceling statement due to statement timeout'))
  ok('it does not tell the reader to ignore a real error',
    !r.text.includes('NOT evidence that the property under test failed'))
}

// ⚠️ EMPTINESS IS DECIDED ON THE MESSAGE, NOT THE STATUS. Keying off 5xx would
// classify a 500 that DID carry a payload as transport, which is guessing at
// exactly the point this exists to stop it.
{
  const carried = describeReadFailure({
    what: 'x', error: { message: 'PGRST116' }, status: 503, statusText: 'Service Unavailable', elapsedMs: 1,
  })
  ok('CONTROL a 5xx WITH a body is not transport', carried.kind === ASSERTION_UNREADABLE)
  const bare = describeReadFailure({
    what: 'x', error: { message: '' }, status: 200, statusText: 'OK', elapsedMs: 1,
  })
  ok('CONTROL an empty body is transport whatever the status says', bare.kind === TRANSPORT_FAILED)
}

// ⚠️ ABSENT IS NOT EMPTY-STRING, AND BOTH MUST BE SAFE. A missing message or a
// missing status must not throw inside the error path -- a classifier that
// crashes while reporting a crash loses the incident entirely.
{
  const r = describeReadFailure({ what: 'x', error: {}, status: undefined, statusText: undefined })
  ok('a missing message is still classified', r.kind === TRANSPORT_FAILED)
  ok('a missing status is named rather than printed as undefined', r.text.includes('HTTP unknown'))
  ok('a missing status text is named too', r.text.includes('(no status text)'))
  ok('a missing elapsed is named rather than NaN', r.text.includes('unknown elapsed'))
  ok('a null error object does not throw',
    describeReadFailure({ what: 'x', error: null }).kind === TRANSPORT_FAILED)
}

if (failed) process.exit(1)
console.log('transport-error selftest: all cases passed')

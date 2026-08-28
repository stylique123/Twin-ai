#!/usr/bin/env node
// WHETHER A RECORDING MAY ENTER THE #204 EVAL -- ACTUALLY CHECKED, NOT JUST STORED.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `packages/shared/src/evalConsent.ts` and `eval_consents` (migration 0174)
// were written, tested -- and called by NOTHING (measured 2026-08-27, same
// defect `render-cost.mjs` fixed for the render-cost model). A register
// nobody reads is a decision nobody made, and this is the one place in the
// product where being wrong costs somebody their face and voice -- so this
// exists to CONSULT the register, not just describe it.
//
// ⚠️ THIS DOES NOT ADMIT ANYONE ON ITS OWN. It is a read-only reporting tool
// for an operator to run before using a specific recording: give it a
// participant ref and the recording's own timestamp, and it prints the
// verdict `consentAdmits()` computes -- refuse by default, per the shared
// module's own rule. Wiring this into an automatic pipeline that gates real
// recordings is a separate, larger decision (which pipeline, at what point)
// that this script deliberately does not make.
//
//   node scripts/eval-consent.mjs <participant-ref> <recorded-at-iso>
//   node scripts/eval-consent.mjs --selftest      # no database needed
//
// ⚠️ THE TYPESCRIPT SOURCE, NOT A BUILD OUTPUT -- the same import style
// `scripts/render-cost.mjs` uses, for the same reason: `@twinai/shared` is
// consumed as source in this repo and has no build step.
import { consentAdmits } from '../packages/shared/src/evalConsent.ts'

/**
 * One participant's row -> the verdict line to print.
 *
 * Pure, so the selftest can exercise the whole shape without a database, and
 * so the refusal reasoning stays arguable rather than buried in a query.
 */
export function reportFor(row, recordedAtIso) {
  const verdict = consentAdmits(row, recordedAtIso)
  const line = verdict.admits
    ? `ADMITS: consent on record, dated before the recording, not withdrawn.`
    : `REFUSED (${verdict.refusal}): ${verdict.message}`
  return { verdict, line }
}

if (process.argv.includes('--selftest')) {
  let failures = 0
  const expect = (name, got, want) => {
    if (got !== want) { console.error(`selftest: ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++ }
  }

  const noRow = reportFor(null, '2026-01-01T00:00:00Z')
  expect('no row on record refuses', noRow.verdict.admits, false)
  expect('no row -> no_consent_on_record', noRow.verdict.refusal, 'no_consent_on_record')

  const withdrawn = reportFor({
    participant_ref: 'P-01', artifact_location: '/filing/p-01.pdf',
    granted_at: '2026-01-01T00:00:00Z', withdrawn_at: '2026-02-01T00:00:00Z',
  }, '2026-01-15T00:00:00Z')
  expect('a withdrawn consent refuses even though well-formed', withdrawn.verdict.admits, false)
  expect('withdrawn -> consent_withdrawn, not a dating error', withdrawn.verdict.refusal, 'consent_withdrawn')

  const afterRecording = reportFor({
    participant_ref: 'P-02', artifact_location: '/filing/p-02.pdf',
    granted_at: '2026-03-10T00:00:00Z', withdrawn_at: null,
  }, '2026-03-01T00:00:00Z')
  expect('consent dated AFTER the recording refuses', afterRecording.verdict.admits, false)
  expect('after-recording -> consent_after_recording', afterRecording.verdict.refusal, 'consent_after_recording')

  const clean = reportFor({
    participant_ref: 'P-03', artifact_location: '/filing/p-03.pdf',
    granted_at: '2026-01-01T00:00:00Z', withdrawn_at: null,
  }, '2026-02-01T00:00:00Z')
  expect('a live, pre-dated, located consent admits', clean.verdict.admits, true)
  expect('an admitted verdict prints ADMITS', clean.line.startsWith('ADMITS'), true)

  if (failures > 0) { console.error(`eval-consent selftest: ${failures} FAILED`); process.exit(1) }
  console.log('eval-consent selftest: OK (4 verdicts, incl. withdrawal and after-recording dating)')
  process.exit(0)
}

const [participantRef, recordedAtIso] = process.argv.slice(2)
if (!participantRef || !recordedAtIso) {
  console.error('usage: node scripts/eval-consent.mjs <participant-ref> <recorded-at-iso>')
  console.error('       node scripts/eval-consent.mjs --selftest')
  process.exit(2)
}

const { createClient } = await import('@supabase/supabase-js')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. eval_consents is service-role '
    + 'only by design -- no client, in either direction, ever touches it.')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: row, error } = await db
  .from('eval_consents')
  .select('participant_ref, artifact_location, granted_at, withdrawn_at')
  .eq('participant_ref', participantRef)
  .order('granted_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (error) { console.error(`could not read eval_consents: ${error.message}`); process.exit(1) }

const { verdict, line } = reportFor(row, recordedAtIso)
console.log(`participant ${participantRef}, recording ${recordedAtIso}`)
console.log(`  ${line}`)
process.exit(verdict.admits ? 0 : 1)

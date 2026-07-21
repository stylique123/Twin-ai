// CI guard: the VPS sign-off diagnostic (.github/workflows/vps-diag.yml) is the
// fail-closed authority for "the deployed worker matches the repo". This guard
// proves a caller cannot WEAKEN that authority via workflow inputs or host-key
// trust, by statically checking the workflow source:
//
//   1. No `expected_sha` (or any workflow_dispatch input) — a caller-pinned
//      stale SHA could make drift pass. Expected SHA must come only from
//      origin/main.
//   2. Expected SHA is derived from `git ls-remote origin main` and validated
//      as 40 hex chars.
//   3. Host-key verification is STRICT and pinned: `StrictHostKeyChecking=yes`,
//      a pinned `VPS_KNOWN_HOSTS` secret, and NO `ssh-keyscan` /
//      `StrictHostKeyChecking=no` (which trust a possibly-spoofed host).
//
//   node scripts/ci/check_vps_diag_authority.mjs            # PR guard
//   node scripts/ci/check_vps_diag_authority.mjs --selftest # unit-test the logic
import { readFileSync } from 'node:fs'

const WF = '.github/workflows/vps-diag.yml'

// PURE decision over the workflow text. Returns { ok, reasons }.
// Full-line comments are stripped first so that *explaining* why a footgun is
// absent (e.g. "No ssh-keyscan / StrictHostKeyChecking=no") never trips the
// guard — only real directives are evaluated.
export function evaluate(raw) {
  const reasons = []
  const text = raw.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')

  // 1. No caller inputs at all (expected_sha specifically, and no `inputs:`
  //    block under workflow_dispatch).
  if (/expected_sha/.test(text)) reasons.push('vps-diag defines `expected_sha` — a caller could pin a stale deployed SHA')
  // workflow_dispatch must be the input-less form `workflow_dispatch: {}`.
  const wd = text.match(/workflow_dispatch:\s*(\{\s*\}|[^\n]*)/)
  if (!wd) reasons.push('no workflow_dispatch trigger found')
  else if (!/workflow_dispatch:\s*\{\s*\}/.test(text) && /workflow_dispatch:[\s\S]*?\n\s+inputs:/.test(text)) {
    reasons.push('workflow_dispatch declares `inputs:` — sign-off authority must take no caller inputs')
  }

  // 2. EXP_SHA derived from origin/main + validated 40-hex.
  if (!/git ls-remote origin main/.test(text)) reasons.push('EXP_SHA is not derived from `git ls-remote origin main`')
  if (!/\[0-9a-f\]\{40\}/.test(text)) reasons.push('EXP_SHA is not validated as 40 hex chars')

  // 3. Strict, pinned host-key verification (no TOFU / MITM surface).
  if (/ssh-keyscan/.test(text)) reasons.push('uses `ssh-keyscan` (trusts first-contact host key — MITM surface)')
  if (/StrictHostKeyChecking=no/.test(text)) reasons.push('uses `StrictHostKeyChecking=no`')
  if (!/StrictHostKeyChecking=yes/.test(text)) reasons.push('missing `StrictHostKeyChecking=yes`')
  if (!/VPS_KNOWN_HOSTS/.test(text)) reasons.push('does not pin the host key via the `VPS_KNOWN_HOSTS` secret')

  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const good = `on: { workflow_dispatch: {} }
  EXP_SHA=$(git ls-remote origin main | head -1 | cut -f1)
  printf '%s' "$EXP_SHA" | grep -Eq '^[0-9a-f]{40}$'
  ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=known_hosts_vps ...
  VPS_KNOWN_HOSTS: \${{ secrets.VPS_KNOWN_HOSTS }}`
  const cases = [
    ['good workflow passes', good, true],
    ['expected_sha input', good.replace('workflow_dispatch: {}', "workflow_dispatch:\n    inputs:\n      expected_sha:\n        default: ''"), false],
    ['ssh-keyscan present', good + '\n  ssh-keyscan -H "$H" >> known_hosts', false],
    ['StrictHostKeyChecking=no', good.replace('StrictHostKeyChecking=yes', 'StrictHostKeyChecking=no'), false],
    ['missing VPS_KNOWN_HOSTS pin', good.replace(/VPS_KNOWN_HOSTS[^\n]*/g, ''), false],
    ['no 40-hex validation', good.replace("'^[0-9a-f]{40}$'", '""'), false],
    ['SHA not from origin/main', good.replace('git ls-remote origin main', 'echo abc'), false],
  ]
  let failed = 0
  for (const [name, text, exp] of cases) {
    const got = evaluate(text).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`vps-diag-authority selftest: ${failed} failed`); process.exit(1) }
  console.log('vps-diag-authority selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else {
  const { ok, reasons } = evaluate(readFileSync(WF, 'utf8'))
  console.log(`vps-diag-authority guard: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}

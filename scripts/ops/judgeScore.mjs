// THE OVERALL SCORE IS COMPUTED, NOT CHOSEN (owner WS1.1, 2026-10-05).
//
// ⚠️ Blind set 1: the reviewer listed "I spent weeks researching two-group
// machines" as invented and still gave script 16 a 6.2; the owner gave 3.5.
// The caps lived only in the prompt, so the model applied them or did not, and
// they covered only invented PRODUCT claims. Here the model reports dimension
// scores and counts each kind of problem; code averages the craft and applies
// the caps. Cap values are PROVISIONAL — set against the owner's blind ratings
// (invented claims 2.5–4.5) and re-fit after the next calibration.

export const CRAFT_KEYS = ['hook', 'structure', 'angle', 'her_info', 'value', 'conversion', 'sounds_like_her', 'scenes', 'arc']
export const FLAG_KEYS = ['invented_product', 'invented_experience', 'people_ask_unconfirmed', 'unconfirmed_offer', 'wrong_product', 'sensitive']

/** Provisional caps: a script with the problem cannot score above this. */
export const CAPS = {
  sensitive: 3,
  wrong_product: 3,
  invented_experience: 4.5,
  invented_product: 4.5,
  invented_product_2plus: 3.5,
  unconfirmed_offer: 4.5,
  people_ask_unconfirmed: 5,
}

const r1 = (x) => Math.round(x * 10) / 10

export function scoreRead(read) {
  const dims = CRAFT_KEYS.map((k) => Number(read?.[k])).filter(Number.isFinite)
  const craft = dims.length ? dims.reduce((a, b) => a + b, 0) / dims.length : NaN
  const f = read?.claim_flags ?? {}
  const n = (k) => Math.max(0, Math.floor(Number(f[k]) || 0))
  const caps = []
  if (n('sensitive')) caps.push(['sensitive', CAPS.sensitive])
  if (n('wrong_product')) caps.push(['wrong_product', CAPS.wrong_product])
  if (n('invented_experience')) caps.push(['invented_experience', CAPS.invented_experience])
  if (n('invented_product') >= 2) caps.push(['invented_product_2plus', CAPS.invented_product_2plus])
  else if (n('invented_product') === 1) caps.push(['invented_product', CAPS.invented_product])
  if (n('unconfirmed_offer')) caps.push(['unconfirmed_offer', CAPS.unconfirmed_offer])
  if (n('people_ask_unconfirmed')) caps.push(['people_ask_unconfirmed', CAPS.people_ask_unconfirmed])
  const cap = caps.length ? Math.min(...caps.map((c) => c[1])) : 10
  return { craft: r1(craft), cap, overall: r1(Math.min(craft, cap)), caps: caps.map((c) => c[0]) }
}

/** Combine reads: mean overall, spread (max − min) as the noise of this script. */
export function combineReads(reads) {
  const scored = reads.map(scoreRead).filter((s) => Number.isFinite(s.overall))
  if (!scored.length) return null
  const o = scored.map((s) => s.overall)
  return {
    overall: r1(o.reduce((a, b) => a + b, 0) / o.length),
    overall_spread: r1(Math.max(...o) - Math.min(...o)),
    craft: r1(scored.reduce((a, s) => a + s.craft, 0) / scored.length),
    caps_applied: [...new Set(scored.flatMap((s) => s.caps))],
    overall_reads: o,
  }
}

/** A difference is real only when it exceeds both scripts' read spread. */
export function isRealChange(before, after) {
  const noise = Math.max(Number(before?.overall_spread) || 0, Number(after?.overall_spread) || 0)
  return Math.abs(Number(after?.overall) - Number(before?.overall)) > noise
}

if (process.argv.includes('--selftest')) {
  const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } }
  const base = Object.fromEntries(CRAFT_KEYS.map((k) => [k, 7]))
  ok(scoreRead(base).overall === 7, 'clean script = craft mean')
  ok(scoreRead({ ...base, claim_flags: { invented_experience: 1 } }).overall === 4.5, 'invented experience caps at 4.5 (script 16)')
  ok(scoreRead({ ...base, claim_flags: { invented_product: 2 } }).overall === 3.5, 'two invented product claims cap at 3.5')
  ok(scoreRead({ ...base, claim_flags: { wrong_product: 1 } }).overall === 3, 'wrong product caps at 3 (script 7)')
  ok(scoreRead({ ...base, claim_flags: { people_ask_unconfirmed: 1 } }).overall === 5, '"people ask me" caps at 5')
  const c = combineReads([{ ...base }, { ...base, hook: 4 }, { ...base, claim_flags: { unconfirmed_offer: 1 } }])
  ok(c.overall_spread > 0 && c.caps_applied.includes('unconfirmed_offer'), 'spread and caps reported')
  ok(!isRealChange({ overall: 5, overall_spread: 0.8 }, { overall: 5.5, overall_spread: 0.3 }), 'a 0.5 change inside 0.8 noise is no change')
  ok(isRealChange({ overall: 4, overall_spread: 0.3 }, { overall: 5.2, overall_spread: 0.4 }), 'a 1.2 change beyond noise is real')
  console.log('judgeScore selftest: OK')
}

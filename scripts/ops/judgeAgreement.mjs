// HOW FAR THE REVIEWER AGREES WITH THE OWNER (WS1: hold-out + second judge).
//
// node scripts/ops/judgeAgreement.mjs <scores.json> <owner.json> [--holdout=<batch>]
//   scores.json: [{ batch, n, overall, judge2?: { overall } }]  (n = 0-based row)
//   owner.json:  { "<batch>": { "<script #>": rating } }        (kept out of git)
// Reports Pearson r with a 95% Fisher interval and the bias (judge − owner),
// per batch and pooled. --holdout names the batch the caps were NOT tuned on;
// only that number counts as evidence that a change helped.
import { readFileSync } from 'node:fs'

export function agreement(pairs) {
  const n = pairs.length
  if (n < 4) return { n, r: null, lo: null, hi: null, bias: null }
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1])
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0)
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), syy = ys.reduce((a, y) => a + (y - my) ** 2, 0)
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))), se = 1 / Math.sqrt(n - 3)
  const r2 = (x) => Math.round(x * 100) / 100
  return { n, r: r2(r), lo: r2(Math.tanh(z - 1.96 * se)), hi: r2(Math.tanh(z + 1.96 * se)), bias: r2(my - mx) }
}

function pairsFor(scores, owner, pick) {
  const out = []
  for (const s of scores) {
    const o = owner[s.batch]?.[String(Number(s.n) + 1)]
    const j = pick(s)
    if (Number.isFinite(o) && Number.isFinite(j)) out.push([o, j])
  }
  return out
}

if (process.argv.includes('--selftest')) {
  const a = agreement([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
  if (a.r !== 1 || a.bias !== 1) { console.error('FAIL', a); process.exit(1) }
  const b = agreement([[1, 1], [2, 2]])
  if (b.r !== null) { console.error('FAIL small n'); process.exit(1) }
  console.log('judgeAgreement selftest: OK')
} else if (process.argv[2] && process.argv[3]) {
  const scores = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const owner = JSON.parse(readFileSync(process.argv[3], 'utf8'))
  const holdout = (process.argv.find((a) => a.startsWith('--holdout=')) ?? '').slice(10)
  const batches = [...new Set(scores.map((s) => s.batch))]
  for (const [name, pick] of [['judge', (s) => Number(s.overall)], ['judge2', (s) => Number(s.judge2?.overall)]]) {
    for (const b of batches) console.log(name, b, b === holdout ? '(HOLD-OUT)' : '', JSON.stringify(agreement(pairsFor(scores.filter((s) => s.batch === b), owner, pick))))
    console.log(name, 'pooled', JSON.stringify(agreement(pairsFor(scores, owner, pick))))
  }
}

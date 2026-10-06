// PRIVACY CHECK, MEASURED (owner WS0): precision and recall of isPrivate on a
// labelled set, per category, with 95% Wilson intervals.
//   npx tsx scripts/ops/privacyEval.mts [file.json ...]
// Default: the synthetic set in fixtures/. Real labelled facts stay out of git.
import { readFileSync } from 'node:fs'
import { isPrivate } from '../../packages/shared/src/script/privacyGuard.ts'

const wilson = (k: number, n: number) => {
  if (!n) return [null, null]
  const z = 1.96, p = k / n, d = 1 + z * z / n
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d
  return [Math.round((c - h) * 100) / 100, Math.round((c + h) * 100) / 100]
}
const files = process.argv.slice(2).length ? process.argv.slice(2) : [new URL('./fixtures/privacy-synthetic.json', import.meta.url).pathname]
const cases = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).cases as Array<{ cat: string; label: 'P' | 'S'; text: string }>)
const rows = cases.map((c) => ({ ...c, said: isPrivate(c.text) ? 'P' : 'S' }))
const report = (name: string, rs: typeof rows) => {
  const tp = rs.filter((r) => r.label === 'P' && r.said === 'P').length
  const fn = rs.filter((r) => r.label === 'P' && r.said === 'S').length
  const fp = rs.filter((r) => r.label === 'S' && r.said === 'P').length
  const tn = rs.filter((r) => r.label === 'S' && r.said === 'S').length
  console.log(name.padEnd(14), `n=${rs.length}`, `recall ${tp}/${tp + fn} ${JSON.stringify(wilson(tp, tp + fn))}`, `precision ${tp}/${tp + fp} ${JSON.stringify(wilson(tp, tp + fp))}`, `false-alarm ${fp}/${fp + tn}`)
}
for (const cat of [...new Set(rows.map((r) => r.cat))]) report(cat, rows.filter((r) => r.cat === cat))
report('ALL', rows)
for (const r of rows) if (r.label !== r.said) console.log('  MISS', r.label, '->', r.said, '|', r.cat, '|', r.text)

/**
 * Small statistics for calibrating the deterministic judges (craftJudge,
 * hookJudge): a CSV reader for the advisor sets, Spearman rank correlation,
 * agreement within one point, and ridge least squares. Test/calibration only.
 */

/** RFC-4180-ish CSV: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ''])))
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
  const r = new Array<number>(xs.length)
  for (let i = 0; i < idx.length;) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++
    for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return r
}

function pearson(a: number[], b: number[]): number {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2 }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/** Spearman rank correlation (average ranks for ties). */
export const spearman = (a: number[], b: number[]): number => pearson(ranks(a), ranks(b))

/** Share of pairs whose integer scores differ by at most one point. */
export const within1 = (pred: number[], gold: number[]): number =>
  pred.filter((p, i) => Math.abs(p - gold[i]!) <= 1).length / Math.max(1, pred.length)

/** Ridge least squares with an unpenalised intercept; returns [b0, b1..bk]. */
export function ridge(X: number[][], y: number[], lambda: number): number[] {
  const k = X[0]!.length + 1
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  const v = new Array<number>(k).fill(0)
  for (let r = 0; r < X.length; r++) {
    const x = [1, ...X[r]!]
    for (let i = 0; i < k; i++) { v[i]! += x[i]! * y[r]!; for (let j = 0; j < k; j++) A[i]![j]! += x[i]! * x[j]! }
  }
  for (let i = 1; i < k; i++) A[i]![i]! += lambda
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < k; c++) {
    let p = c
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!]; [v[c], v[p]] = [v[p]!, v[c]!]
    const d = A[c]![c]! || 1e-12
    for (let r = 0; r < k; r++) {
      if (r === c) continue
      const f = A[r]![c]! / d
      for (let j = c; j < k; j++) A[r]![j]! -= f * A[c]![j]!
      v[r]! -= f * v[c]!
    }
  }
  return v.map((x, i) => x / (A[i]![i]! || 1e-12))
}

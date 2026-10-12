// Scoring for the invention gate against advisor labels (owner metrics, gate tuning v3).
// Pure; counts only. A row is one gate sentence:
//   { n, i, surface, cls, reason, label }  cls ∈ S,E,I,G,N or 'X' (no class: the gate failed
//   before classifying); label ∈ S,E,I,N or null (unlabelled). No text, ever.

export const GATE_CLASSES = ['S', 'E', 'I', 'G', 'N', 'X']
export const ADVISOR = ['S', 'E', 'I', 'N']
export const HALVES = { tune: (n) => n >= 0 && n <= 11, validation: (n) => n >= 12 && n <= 23 }

const SURFACE_GROUP = { script: 'script', title: 'title', caption: 'caption', publish_caption: 'caption', thumbnail_text: 'thumbnail', hook_option: 'hook' }

export function confusion(rows) {
  const m = Object.fromEntries(GATE_CLASSES.map((g) => [g, Object.fromEntries(ADVISOR.map((a) => [a, 0]))]))
  for (const r of rows) if (r.label && m[r.cls]) m[r.cls][r.label]++
  return m
}

/** The owner's metrics. false flag = gate I on advisor N or S / gate I (labelled). */
export function ownerMetrics(rows) {
  const lab = rows.filter((r) => r.label)
  const advI = lab.filter((r) => r.label === 'I')
  const gateI = lab.filter((r) => r.cls === 'I')
  const advS = lab.filter((r) => r.label === 'S')
  const scripts = [...new Set(rows.map((r) => r.n))]
  const misses = {}
  for (const r of advI) if (r.cls !== 'I') { const k = SURFACE_GROUP[r.surface] ?? r.surface ?? 'unknown'; misses[k] = (misses[k] ?? 0) + 1 }
  return {
    labelled: lab.length,
    unclassified: lab.filter((r) => r.cls === 'X').length,
    recall_strict_I: [advI.filter((r) => r.cls === 'I').length, advI.length],
    false_flag: [gateI.filter((r) => r.label === 'N' || r.label === 'S').length, gateI.length],
    false_I_on_S: [advS.filter((r) => r.cls === 'I').length, advS.length],
    flagged_scripts_gate: [scripts.filter((n) => rows.some((r) => r.n === n && r.cls === 'I')).length, scripts.length],
    flagged_scripts_advisor: [scripts.filter((n) => rows.some((r) => r.n === n && r.label === 'I')).length, scripts.length],
    n_hidden_I: [advI.filter((r) => r.cls === 'N').length, advI.length],
    recall_misses_by_surface: misses,
  }
}

const frac = ([k, n]) => `${k}/${n}${n ? ` = ${(100 * k / n).toFixed(1)}%` : ''}`

export function formatReport(name, rows) {
  const out = []
  for (const [half, inHalf] of Object.entries(HALVES)) {
    const rs = rows.filter((r) => inHalf(r.n))
    const m = ownerMetrics(rs)
    const c = confusion(rs)
    out.push(`-- ${name} / ${half} half (n ${half === 'tune' ? '0-11' : '12-23'}): ${new Set(rs.map((r) => r.n)).size} scripts, ${m.labelled} labelled sentences (${m.unclassified} unclassified: gate failed)`)
    out.push(`   confusion gate\\advisor   ${ADVISOR.map((a) => a.padStart(4)).join('')}`)
    for (const g of GATE_CLASSES) out.push(`                       ${g}  ${ADVISOR.map((a) => String(c[g][a]).padStart(4)).join('')}`)
    out.push(`   recall strict I ${frac(m.recall_strict_I)}; false flag (I on N|S / I) ${frac(m.false_flag)}; false I on S ${frac(m.false_I_on_S)}`)
    out.push(`   flagged scripts gate ${frac(m.flagged_scripts_gate)} vs advisor ${frac(m.flagged_scripts_advisor)}; N-hidden I ${frac(m.n_hidden_I)}`)
    out.push(`   recall misses by surface: ${JSON.stringify(m.recall_misses_by_surface)}`)
  }
  return out.join('\n')
}

// ── TWO JUDGES (owner Reply 13) ────────────────────────────────────────────
// Rows from a two-judge run also carry { fc, sc, verdict } (fast class, strong
// class, verdict ∈ pass|review|block). Rows without a verdict are ignored here.
//   REVIEW set = flagged at all: either judge I-HARD, or a judge G-SOFT (verdict review or block).
//   BLOCK set  = both judges I-HARD (verdict block).
export function twoJudgeMetrics(rows) {
  const rs = rows.filter((r) => r.verdict)
  const lab = rs.filter((r) => r.label)
  const advI = lab.filter((r) => r.label === 'I')
  const isFlag = (r) => r.verdict === 'review' || r.verdict === 'block'
  const flagged = lab.filter(isFlag)
  const blocks = lab.filter((r) => r.verdict === 'block')
  const scripts = [...new Set(rs.map((r) => r.n))]
  return {
    rows: rs.length,
    labelled: lab.length,
    review_recall_strict_I: [advI.filter(isFlag).length, advI.length],
    review_false_flags: [flagged.filter((r) => r.label === 'N' || r.label === 'S').length, flagged.length],
    review_only_lines: rs.filter((r) => r.verdict === 'review').length,
    block_precision_I_or_E: [blocks.filter((r) => r.label === 'I' || r.label === 'E').length, blocks.length],
    block_false_blocks: [blocks.filter((r) => r.label === 'S' || r.label === 'N').length, blocks.length],
    block_lines: rs.filter((r) => r.verdict === 'block').length,
    scripts_with_review: [scripts.filter((n) => rs.some((r) => r.n === n && r.verdict === 'review')).length, scripts.length],
  }
}

/** The two-judge metrics for the tune half, the validation half, and both combined. */
export function formatTwoJudgeReport(name, rows) {
  const out = []
  const parts = [
    ...Object.entries(HALVES).map(([h, f]) => [`${h} half (n ${h === 'tune' ? '0-11' : '12-23'})`, rows.filter((r) => f(r.n))]),
    ['combined (n 0-23)', rows.filter((r) => HALVES.tune(r.n) || HALVES.validation(r.n))],
  ]
  for (const [label, rs] of parts) {
    const m = twoJudgeMetrics(rs)
    out.push(`-- ${name} / two judges / ${label}: ${m.rows} rows with a verdict, ${m.labelled} labelled`)
    out.push(`   REVIEW set (either I-HARD or a G): recall strict I ${frac(m.review_recall_strict_I)}; false flags (on N|S / flagged) ${frac(m.review_false_flags)}; review-only lines ${m.review_only_lines}`)
    out.push(`   BLOCK set (both I-HARD): precision (I|E / blocks) ${frac(m.block_precision_I_or_E)}; false blocks (on S|N / blocks) ${frac(m.block_false_blocks)}; block lines ${m.block_lines}`)
    out.push(`   scripts with >=1 review line ${frac(m.scripts_with_review)}`)
  }
  return out.join('\n')
}

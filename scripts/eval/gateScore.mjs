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

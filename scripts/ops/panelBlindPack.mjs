// THE BLIND PACK FOR A SINGLE-ARM PANEL (owner, 11 Nov). Runs inside GitHub
// Actions (panel-export.yml), where the service key already lives, so nobody
// handles the key by hand. Fictional panel rows only (scenario.group 'panel').
//
// Writes into --out (refused inside the repository):
//   blind.md     every scored script under a random id, shuffled, with its creator
//                slug (to check facts against her material); no label, n or generation id
//   report.json  counts only: scripts, asked instead of writing, failures, the
//                gate's invented lines (after repair), the rule-based craft
//                PRE-SCORE (not the advisor's craft), check states, the panel
//                final pass cuts. "headline" puts asked next to craft and invented,
//                because the ask rule removes thin requests from the scored set.
//   key.json     id → { n, label, creator, generation_id }. THE ANSWER KEY: the
//                workflow never uploads it; it dies with the runner.
//   trace.json   ONLY with --trace (read-only, panel 13c trace): per script, the
//                shipped lines and for each whether it was in the writer's first
//                draft (writer_raw) or added later, the stage word counts
//                (beat_trace), what the writer was handed (writer_supply) versus
//                what her account stores (counts by source and kind), the word
//                budget record (what the lengthen step added, by item id), the
//                floor refill, the final pass, the gate counts and her request.
//                Counts and line text only; no keys.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/panelBlindPack.mjs <batch> --out=/private/dir [--trace]
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Why a row is not a scored script, or null. */
export function outcomeOf(row) {
  if (row.code === 'NEEDS_STORY' || row.scenario?.asked_instead) return 'asked'
  if (row.status !== 200) return `http_${row.status ?? 0}`
  if (row.scenario?.failure) return String(row.scenario.failure)
  if (!row.script_text) return 'no_script'
  return null
}

const linesOf = (text) => String(text ?? '').split('\n').map((l) => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean)
const round = (x) => Math.round(x * 100) / 100

/**
 * Pure: rows (script_batch_results) + blueprints by generation id → { blind, key, report }.
 * `craft(lines)` returns the 1–7 pre-score or null; `rand(n)` returns n random bytes.
 */
export function buildBlindPack(rows, blueprints = {}, craft = () => null, rand = (n) => randomBytes(n)) {
  const panel = rows.filter((r) => r.scenario?.group === 'panel')
  const report = { rows: panel.length, scripts: 0, asked: 0, failures: [], invented_lines: 0, scripts_with_invented: 0, invented_unknown: 0, craft_prescore_mean: null, craft_prescored: 0, check_status: {}, final_pass: {}, headline: null }
  const scored = []
  const crafts = []
  for (const r of panel) {
    const why = outcomeOf(r)
    if (why === 'asked') { report.asked++; continue }
    if (why) { report.failures.push({ reason: why }); continue }
    report.scripts++
    const bp = blueprints[r.generation_id] ?? {}
    const g = bp.invention_gate
    const inv = g?.after?.I ?? g?.before?.I
    if (typeof inv === 'number') { report.invented_lines += inv; if (inv > 0) report.scripts_with_invented++ } else report.invented_unknown++
    const cs = bp.check_status ?? 'none'
    report.check_status[cs] = (report.check_status[cs] ?? 0) + 1
    for (const [k, v] of Object.entries(bp.panel_final_pass ?? {})) if (typeof v === 'number') report.final_pass[k] = (report.final_pass[k] ?? 0) + v
    const c = craft(linesOf(r.script_text))
    if (Number.isFinite(c)) crafts.push(c)
    scored.push(r)
  }
  report.craft_prescored = crafts.length
  report.craft_prescore_mean = crafts.length ? round(crafts.reduce((a, b) => a + b, 0) / crafts.length) : null
  const requests = report.scripts + report.asked + report.failures.length
  report.headline = {
    requests,
    asked: report.asked,
    scripts: report.scripts,
    invented: `${report.scripts_with_invented} of ${report.scripts} scripts (${report.invented_lines} lines, gate after repair)`,
    craft_prescore: report.craft_prescore_mean,
    note: 'asked requests are not scripts: craft and invented are over the scripts written, not over all requests',
  }
  const ids = new Set()
  const withId = scored.map((r) => {
    let id
    do id = `S-${rand(3).toString('hex').toUpperCase()}`; while (ids.has(id))
    ids.add(id)
    return { id, sort: rand(4).readUInt32BE(0), r }
  }).sort((x, y) => x.sort - y.sort)
  const blind = withId.map(({ id, r }) => [`## ${id}`, `**Creator:** ${r.scenario?.creator ?? ''} · **Goal:** ${r.scenario?.body?.goal ?? ''} · **Request:** ${r.scenario?.body?.reference_note ?? r.scenario?.body?.note ?? ''}`, r.script_text, '', `Hooks: ${(r.hooks ?? []).join(' · ')}`, ''].join('\n')).join('\n')
  const key = Object.fromEntries(withId.map(({ id, r }) => [id, { n: r.n, label: r.scenario?.label ?? null, creator: r.scenario?.creator ?? null, generation_id: r.generation_id ?? null }]))
  return { blind: `# Panel — blind scripts (${withId.length})\n\n${blind}`, key, report }
}

const normLine = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').replace(/\s+/g, ' ').trim()
const wordsOf = (t) => new Set(normLine(t).split(' ').filter((w) => w.length >= 4))
/** Where a shipped line came from: 'first_draft' (in writer_raw), 'edited' (mostly in one draft line), 'added_later', or 'no_draft' (writer_raw not recorded). */
export function lineOrigin(line, draftLines) {
  if (!Array.isArray(draftLines)) return 'no_draft'
  const n = normLine(line)
  if (draftLines.some((d) => normLine(d) === n || normLine(d).includes(n))) return 'first_draft'
  const w = wordsOf(line)
  if (!w.size) return 'first_draft'
  const best = Math.max(0, ...draftLines.map((d) => { const dw = wordsOf(d); let hit = 0; for (const x of w) if (dw.has(x)) hit++; return hit / w.size }))
  return best >= 0.6 ? 'edited' : 'added_later'
}

/** A creator's fixture material as plain text items (stories, answers, product facts, offers, brand). */
export function fixtureItems(creator) {
  if (!creator) return []
  return [
    ...(creator.stories ?? []).map((x) => String(x.text ?? '')),
    ...Object.values(creator.answers ?? {}).map(String),
    ...(creator.products ?? []).flatMap((p) => [String(p.name ?? ''), String(p.offer ?? ''), ...(p.facts ?? []).map((f) => String(f.value ?? ''))]),
    String(creator.brand?.description ?? ''),
  ].filter((t) => t.trim())
}
/**
 * Line-level support: the share (0-1) of a line's words (4+ letters, numbers
 * kept) found in the single best-matching fixture item. A plain text-overlap
 * score, shown next to the human labels to see how far an automatic check
 * agrees with them. Not a judgement.
 */
export function supportScore(line, items) {
  const w = [...wordsOf(line)]
  if (!w.length || !items.length) return null
  let best = 0
  for (const it of items) { const iw = wordsOf(it); let hit = 0; for (const x of w) if (iw.has(x)) hit++; best = Math.max(best, hit / w.length) }
  return Math.round(best * 100) / 100
}

/**
 * Pure (panel 13c trace): rows + blueprints by generation id + stored counts by
 * owner → one record per row. `owners` maps generation id → owner id.
 */
export function buildTrace(rows, blueprints = {}, owners = {}, stored = {}, fixture = {}) {
  return rows.filter((r) => r.scenario?.group === 'panel').map((r) => {
    const bp = blueprints[r.generation_id] ?? {}
    const draft = Array.isArray(bp.writer_raw?.lines) ? bp.writer_raw.lines.map((l) => String(l?.line ?? '')).filter(Boolean) : null
    const shipped = Array.isArray(bp.script) ? bp.script.map((b) => String(b?.line ?? '')).filter((l) => l.trim()) : []
    const ws = bp.writer_supply ?? {}
    const body = r.scenario?.body ?? {}
    return {
      n: r.n, label: r.scenario?.label ?? null, creator: r.scenario?.creator ?? null, status: r.status, code: r.code ?? null,
      request: { note: body.reference_note ?? body.note ?? null, goal: body.goal ?? null, product: r.scenario?.product ?? null, angle: body.readiness_answers?.angle ?? null, answers: Object.keys(body.readiness_answers ?? {}), mn_answers: Object.keys(body.mn_answers ?? {}) },
      lines: shipped.map((line) => ({ line, origin: lineOrigin(line, draft), support: supportScore(line, fixtureItems(fixture[r.scenario?.creator])) })),
      first_draft_recorded: !!draft,
      first_draft_lines: draft ? draft.length : null,
      beat_trace: Array.isArray(bp.beat_trace) ? bp.beat_trace : null,
      handed: { knowledge: (ws.knowledge_ids ?? []).length, product_facts: (ws.product_fact_ids ?? []).length, answers: (ws.answer_keys ?? []).length, note: !!ws.note },
      stored: stored[owners[r.generation_id]] ?? null,
      word_budget: bp.word_budget ?? null,
      floor_refill: bp.floor_refill ?? null,
      panel_final_pass: bp.panel_final_pass ?? null,
      script_hygiene: bp.script_hygiene ?? null,
      gate: bp.invention_gate ? { outcome: bp.invention_gate.outcome ?? null, before: bp.invention_gate.before ?? null, after: bp.invention_gate.after ?? null } : null,
      check_status: bp.check_status ?? null,
      plan_b: !!bp.plan_b, qc: bp.qc_report ? { words_before: bp.qc_report.words_before ?? null, words_after: bp.qc_report.words_after ?? null, added: (bp.qc_report.added ?? []).length } : null,
    }
  })
}

async function loadCraft() {
  const target = join(REPO, 'scripts', 'ops', '.craftJudge.bundle.mjs')
  try { return (await import(target)).scoreCraft } catch { /* not built yet */ }
  const { buildSync } = await import('esbuild')
  buildSync({ entryPoints: [join(REPO, 'packages/shared/src/script/craftJudge.ts')], bundle: true, format: 'esm', platform: 'node', outfile: target, logLevel: 'silent' })
  return (await import(target)).scoreCraft
}

async function main() {
  const batch = process.argv[2]
  const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (!batch || batch.startsWith('--') || !outArg) throw new Error('usage: panelBlindPack.mjs <batch> --out=/private/dir')
  const out = resolve(outArg)
  if ((existsSync(out) ? realpathSync(out) : out).startsWith(realpathSync(REPO))) throw new Error('refusing to write the answer key inside the repository')
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await admin.from('script_batch_results').select('n, status, code, scenario, script_text, hooks, generation_id').eq('batch', batch)
  if (error) throw new Error(error.message)
  const ids = [...new Set((data ?? []).map((r) => r.generation_id).filter(Boolean))]
  const blueprints = {}
  for (let i = 0; i < ids.length; i += 50) {
    const { data: gs, error: ge } = await admin.from('generations').select('id, blueprint').in('id', ids.slice(i, i + 50))
    if (ge) throw new Error(ge.message)
    for (const g of gs ?? []) blueprints[g.id] = g.blueprint ?? {}
  }
  const scoreCraft = await loadCraft()
  const pack = buildBlindPack(data ?? [], blueprints, (lines) => { try { return scoreCraft(lines).craft } catch { return null } })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'blind.md'), pack.blind)
  writeFileSync(join(out, 'report.json'), JSON.stringify(pack.report, null, 1))
  writeFileSync(join(out, 'key.json'), JSON.stringify(pack.key, null, 1))
  if (process.argv.includes('--trace')) {
    // Read-only: who owns each script, and what her account stores (counts by source and kind).
    const owners = {}
    for (let i = 0; i < ids.length; i += 50) {
      const { data: gs } = await admin.from('generations').select('id, user_id').in('id', ids.slice(i, i + 50))
      for (const g of gs ?? []) owners[g.id] = g.user_id
    }
    const stored = {}
    for (const owner of [...new Set(Object.values(owners))]) {
      const { data: ks } = await admin.from('creator_knowledge').select('kind, source, basis, sensitive, creator_excluded_at').eq('owner_id', owner)
      const c = { total: 0, by_source: {}, by_kind: {}, inferred: 0, sensitive: 0, excluded: 0 }
      for (const k of ks ?? []) {
        c.total++
        c.by_source[k.source ?? 'none'] = (c.by_source[k.source ?? 'none'] ?? 0) + 1
        c.by_kind[k.kind ?? 'none'] = (c.by_kind[k.kind ?? 'none'] ?? 0) + 1
        if (k.basis === 'inferred') c.inferred++
        if (k.sensitive) c.sensitive++
        if (k.creator_excluded_at) c.excluded++
      }
      const { count: products } = await admin.from('product_entities').select('id', { count: 'exact', head: true }).eq('owner_id', owner)
      c.products = products ?? 0
      stored[owner] = c
    }
    // The fictional fixture (in the repo) for the line-level support score.
    const fx = JSON.parse(readFileSync(join(REPO, 'scripts/ops/fixtures/fictional-panel.json'), 'utf8'))
    const fixture = Object.fromEntries((fx.creators ?? []).map((c) => [c.key, c]))
    const trace = buildTrace(data ?? [], blueprints, owners, stored, fixture)
    writeFileSync(join(out, 'trace.json'), JSON.stringify(trace, null, 1))
    // Also one line per script in the job log (fictional panel only; counts and line text, no keys).
    for (const t of trace) console.log(`TRACE ${JSON.stringify(t)}`)
  }
  // Counts only in the log.
  console.log(JSON.stringify({ event: 'panel_blind_pack', batch, ...pack.report.headline }))
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })

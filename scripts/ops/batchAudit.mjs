// THE 12-PART SCRIPT BATCH AUDIT (read-only).
//
// Reads every successful row of `script_batch_results` (status 200) for one or
// more batches, joins its generation's blueprint and audience test, and the
// test account's stored facts / products / voice / ratings, then prints the
// same 12 metrics the 2026-10-03 audit used (docs/audits/script-batch-12-part-audit.md)
// as JSON and as markdown.
//
// It never writes: only SELECTs through supabase-js.
//
// Run:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/batchAudit.mjs --batch=part-2-idea
//   node scripts/ops/batchAudit.mjs --batch=part-1e-product,part-2-idea
//   node scripts/ops/batchAudit.mjs --all                 (every batch)
//   node scripts/ops/batchAudit.mjs --dump=/path/dump.json --all   (offline, from a saved dump)
// Flags: --owner=<uuid> (default: test account), --json-only, --md-only

import { readFileSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))
const OWNER = args.owner || 'c23267b3-1965-4dd1-b273-3f34a839f2a2'
const BATCHES = typeof args.batch === 'string' ? args.batch.split(',').map((s) => s.trim()).filter(Boolean) : null
if (!BATCHES && !args.all) {
  console.error('usage: node scripts/ops/batchAudit.mjs --batch=<label>[,<label>] | --all [--dump=file.json]')
  process.exit(2)
}

// ---------------------------------------------------------------- loading
async function loadLive() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dump=file)')
  const db = createClient(url, key, { auth: { persistSession: false } })
  const all = async (q) => {
    const out = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await q().range(from, from + 499)
      if (error) throw error
      out.push(...data)
      if (data.length < 500) return out
    }
  }
  const res = await all(() => {
    let q = db.from('script_batch_results').select('batch,n,generation_id,scenario,script_text,hooks,findings,judge,created_at').eq('status', 200).order('batch').order('n')
    return BATCHES ? q.in('batch', BATCHES) : q
  })
  const ids = [...new Set(res.map((r) => r.generation_id).filter(Boolean))]
  const gens = new Map(), tests = []
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const { data: g, error: e1 } = await db.from('generations').select('id,blueprint').in('id', chunk)
    if (e1) throw e1
    for (const x of g) gens.set(x.id, x.blueprint || {})
    const { data: t, error: e2 } = await db.from('audience_tests').select('generation_id,status,hooks,best_hook,fixes,improved,needs_her,created_at').in('generation_id', chunk)
    if (e2) throw e2
    tests.push(...t)
  }
  const rows = res.filter((r) => gens.has(r.generation_id)).map((r) => {
    const bp = gens.get(r.generation_id)
    return {
      ...r,
      beats: (bp.script || []).map((b) => ({ section: b.section, line: b.line, camera: b.camera, action: b.action_posing, direction: b.direction })),
      shots: (bp.shot_list || []).map((s) => ({ spoken_text: s.spoken_text, framing: s.framing, camera: s.camera, kind: s.kind, shot_type: s.shot_type, shot: s.shot })),
      hook_options: bp.hook_options, hook_audit: bp.hook_audit, arc: bp.arc, captions: bp.captions, rule_context: bp.rule_context, unsourced: bp.unsourced_figures,
    }
  })
  const one = async (q) => { const { data, error } = await q; if (error) throw error; return data }
  const facts = (await one(db.from('creator_knowledge').select('id,kind,text,sensitive,creator_excluded_at,product_entity_id').eq('owner_id', OWNER)))
    .map((f) => ({ ...f, excluded: !!f.creator_excluded_at }))
  const products = (await one(db.from('product_entities').select('id,name,offer,knowledge,creator_stories,archived_at').eq('owner_id', OWNER)))
  const ratings = await one(db.from('script_ratings').select('generation_id,stars,tags,change_note,created_at').eq('owner_id', OWNER))
  const voiceRow = (await one(db.from('brand_voices').select('profile,is_default').eq('owner_id', OWNER))).sort((a, b) => b.is_default - a.is_default)[0]
  const p = voiceRow?.profile || {}
  return { rows, tests, facts, products, ratings, voice: { vocabulary: p.vocabulary, recurring_ctas: p.recurring_ctas, sample_hooks: p.sample_hooks, hook_patterns: p.hook_patterns } }
}

function loadDump(file) {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  if (BATCHES) d.rows = d.rows.filter((r) => BATCHES.includes(r.batch))
  return d
}

// ---------------------------------------------------------------- helpers
// Same list as packages/shared/src/script/storyRotation.ts SENSITIVE (privacyGuard PRIVATE).
const PRIVATE = /\b(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school)\b/i
// Paraphrases of the account's sensitive stories that the regex above does not catch
// (the police / code-enforcement / neighbour-complaint / postpartum stories).
const PRIVATE_PARAPHRASE = /\b(animal control|neighbou?rs?\b.*\b(complain|call|smell)|complain\w*.*\bneighbou?r|nuisance|knock(ed)? on (my|our) door|court date|face fines|mayor'?s office|carbon filter|80,000|eighty thousand|financial hardship|eleven dollars)|\$11\b/i
// Adjacent: the officer / inspector visit. Not flagged sensitive on the account (fact cbd27272 and her own sample hook), but it is the same police story.
const PRIVATE_ADJACENT = /\b(officer|inspectors?|inspection)\b/i

const norm = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$%' ]+/g, ' ').replace(/\s+/g, ' ').trim()
const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, half: 0.5 }
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const UNITS = /^(?:-|\s)*(pounds?|lbs?|oz|ounces?|grams?|g|kg|batch(?:es)?|bags?|minutes?|hours?|days?|weeks?|months?|years?|%|percent|points?|scores?|cups?|seconds?|degrees?|pages?|lessons?|dollars?|bucks)\b/i
/** Same idea as privacyGuard statedFigures: "value|unit" for every figure >= 10 or with a unit. */
function figures(text) {
  const out = []
  const t = String(text ?? '')
  const re = /\$?(\d[\d,]*(?:\.\d+)?)|\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b|\b(half|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi
  for (const m of t.matchAll(re)) {
    const v = m[1] !== undefined ? Number(m[1].replace(/,/g, '')) : m[2] !== undefined ? TENS[m[2].toLowerCase()] + (m[3] ? SMALL[m[3].toLowerCase()] : 0) : SMALL[String(m[4]).toLowerCase()]
    if (!Number.isFinite(v)) continue
    const after = t.slice((m.index ?? 0) + m[0].length)
    const u = after.match(UNITS)
    let unit = u ? u[1].toLowerCase().replace(/(es|s)$/, '').replace(/^lb$/, 'pound').replace(/^ounce$/, 'oz').replace(/^percent$/, '%').replace(/^gram$/, 'g').replace(/^(dollar|buck)$/, '$') : ''
    if (m[0].startsWith('$')) unit = '$'
    if (v >= 10 || unit) {
      const start = Math.max(0, t.lastIndexOf(' ', Math.max(0, (m.index ?? 0) - 12)))
      out.push({ key: `${v}|${unit}`, bag: /^[\s\w-]{0,12}\bbags?\b/i.test(after.slice(u ? u[0].length : 0)), phrase: t.slice(start, (m.index ?? 0) + m[0].length + (u ? u[0].length : 0) + 0).trim() })
    }
  }
  return out
}
const lines = (r) => (r.beats || []).map((b) => String(b.line ?? '').trim()).filter(Boolean)
const spoken = (r) => (r.shots || []).map((s) => String(s.spoken_text ?? '').trim()).filter(Boolean)
const goalOf = (r) => r.scenario?.body?.goal ?? 'unknown'
const tag = (r) => `${r.batch}#${r.n}`
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0)
const by = (arr, f) => arr.reduce((m, x) => ((m[f(x)] ||= []).push(x), m), {})
const productName = (p) => String(p.name ?? '').replace(/\s*\(batch\)\s*$/i, '').trim()

// ---------------------------------------------------------------- audit
function audit(d) {
  const rows = d.rows
  const testBy = new Map(d.tests.map((t) => [t.generation_id, t]))
  const prodById = new Map(d.products.map((p) => [p.id, p]))
  const sensitive = d.facts.filter((f) => f.sensitive)
  const excluded = d.facts.filter((f) => f.excluded)
  const usable = d.facts.filter((f) => !f.sensitive && !f.excluded)
  const voiceText = [...(d.voice?.vocabulary || []), ...(d.voice?.recurring_ctas || [])].filter((s) => !PRIVATE.test(s)).join(' \n ')
  const productText = (p) => p ? [p.name, p.offer, JSON.stringify(p.knowledge || ''), JSON.stringify(p.creator_stories || '')].join(' \n ') : ''
  const scenarioText = (r) => JSON.stringify(r.scenario?.body || {})
  const allowedFor = (r) => {
    const sel = prodById.get(r.scenario?.body?.selected_product_id)
    return [usable.filter((f) => !f.product_entity_id || f.product_entity_id === sel?.id).map((f) => f.text).join(' \n '), productText(sel), scenarioText(r), voiceText].join(' \n ')
  }
  const out = { scope: { batches: Object.fromEntries(Object.entries(by(rows, (r) => r.batch)).map(([k, v]) => [k, v.length])), scripts: rows.length } }

  // 1 — fabrication
  const figHits = new Map() // key -> {scripts:Set, phrases:Set, traced}
  const allFactText = d.facts.map((f) => ({ id: f.id, text: f.text, sensitive: f.sensitive, excluded: f.excluded }))
    .concat(d.products.map((p) => ({ id: p.id, text: productText(p), product: productName(p) })))
  for (const r of rows) {
    const allowed = new Set(figures(allowedFor(r)).map((x) => x.key))
    const seen = new Set()
    for (const l of lines(r)) for (const f of figures(l)) {
      if (allowed.has(f.key) || seen.has(f.key)) continue
      seen.add(f.key)
      const e = figHits.get(f.key) || { scripts: [], phrases: new Set(), batches: {} }
      e.scripts.push(tag(r)); e.phrases.add(f.phrase); e.batches[r.batch] = (e.batches[r.batch] || 0) + 1
      figHits.set(f.key, e)
    }
  }
  const traceFig = (key) => allFactText.filter((f) => figures(f.text).some((x) => x.key === key)).map((f) => ({ id: f.id, text: String(f.text).slice(0, 110), sensitive: !!f.sensitive, excluded: !!f.excluded, product: f.product }))
  const figList = [...figHits.entries()].map(([k, e]) => ({ figure: k, scripts: e.scripts.length, by_batch: e.batches, examples: [...e.phrases].slice(0, 3), script_refs: e.scripts.slice(0, 6), traced_to: traceFig(k).slice(0, 3) }))
    .sort((a, b) => b.scripts - a.scripts)
  const inv = new Map()
  let judged = 0, judgeErr = 0, withInvented = 0
  for (const r of rows) {
    const j = r.judge || {}
    if (j.error) { judgeErr++; continue }
    if (!('invented_claims' in j)) continue
    judged++
    const c = (j.invented_claims || []).map((x) => (typeof x === 'string' ? x : x?.claim || x?.text || JSON.stringify(x)))
    if (c.length) withInvented++
    for (const s of c) { const k = norm(s).slice(0, 90); const e = inv.get(k) || { claim: s, scripts: [] }; e.scripts.push(tag(r)); inv.set(k, e) }
  }
  const findingCount = (k) => rows.filter((r) => (r.findings || []).some((f) => f.k === k || f.d === k)).length
  // n-gram: 5-word phrases in >=4 scripts that appear in no stored fact, product, voice or scenario text
  const corpus = norm([...d.facts.map((f) => f.text), ...d.products.map(productText), voiceText, ...rows.map(scenarioText)].join(' \n '))
  const gramScripts = new Map()
  for (const r of rows) {
    const g = new Set()
    for (const l of lines(r)) { const w = norm(l).split(' '); for (let i = 0; i + 5 <= w.length; i++) g.add(w.slice(i, i + 5).join(' ')) }
    for (const x of g) { if (!gramScripts.has(x)) gramScripts.set(x, []); gramScripts.get(x).push(tag(r)) }
  }
  const SPECIFIC = /\d|\b(two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|forty|fifty|sixty|ninety|hundred|minutes?|seconds?|days?|hours?|weeks?|months?|degrees?|grams?|ounces?|pounds?|percent|score|bins?|stamp|tamp\w*|crack|temperature|grind|ratio)\b/
  const grams = [...gramScripts.entries()].filter(([g, s]) => s.length >= 4 && SPECIFIC.test(g) && !corpus.includes(g))
    .sort((a, b) => b[1].length - a[1].length).slice(0, 25).map(([g, s]) => ({ phrase: g, scripts: s.length, refs: s.slice(0, 4) }))
  out.p1_fabrication = {
    scripts_with_unbacked_figure: new Set(figList.flatMap((f) => f.script_refs.length ? figHits.get(f.figure).scripts : [])).size,
    recurring_unbacked_figures: figList.filter((f) => f.scripts > 1),
    one_off_unbacked_figures: { count: figList.filter((f) => f.scripts === 1).length, examples: figList.filter((f) => f.scripts === 1).slice(0, 12).map((f) => ({ figure: f.figure, example: f.examples[0], ref: f.script_refs[0] })) },
    judge: { judged, judge_errors: judgeErr, scripts_with_invented_claims: withInvented, recurring_claims: [...inv.values()].filter((e) => e.scripts.length > 1).sort((a, b) => b.scripts.length - a.scripts.length).slice(0, 15).map((e) => ({ claim: e.claim, scripts: e.scripts.length, refs: e.scripts.slice(0, 4) })), one_off_claims: { count: [...inv.values()].filter((e) => e.scripts.length === 1).length, examples: [...inv.values()].filter((e) => e.scripts.length === 1).slice(0, 10).map((e) => ({ claim: e.claim, ref: e.scripts[0] })) } },
    findings: { unbacked_figure: findingCount('unbacked_figure'), unbacked_role: findingCount('unbacked_role'), writer_flagged_unsourced: findingCount('writer_flagged_unsourced'), guard_removed: findingCount('guard_removed') },
    recurring_unsourced_5grams: grams,
  }

  // 2 — private / sensitive
  const priv = []
  for (const r of rows) {
    const note = scenarioText(r)
    const consented = PRIVATE.test(note)
    const surfaces = [['line', lines(r)], ['spoken', spoken(r)], ['hook', [...(r.hooks || []), ...(r.hook_options || [])]], ['caption', r.captions || []]]
    const hits = []
    for (const [where, arr] of surfaces) for (const s of arr) {
      const t = String(s ?? '')
      const m = t.match(PRIVATE) || t.match(PRIVATE_PARAPHRASE)
      const a = !m && t.match(PRIVATE_ADJACENT)
      if (m || a) hits.push({ where, term: (m || a)[0], text: t.slice(0, 160), regex_caught: PRIVATE.test(t), strict: !!m })
    }
    if (hits.length) {
      const uniq = [...new Map(hits.map((h) => [h.text, h])).values()]
      priv.push({ ref: tag(r), strict: uniq.some((h) => h.strict), generation_id: r.generation_id, goal: goalOf(r), note: String(r.scenario?.body?.reference_note ?? '').slice(0, 80), she_typed_private_term: consented, hits: uniq.slice(0, 4) })
    }
  }
  const nonConsented = priv.filter((p) => !p.she_typed_private_term)
  out.p2_private = {
    sensitive_facts_on_account: sensitive.length,
    scripts_with_private_content: priv.length,
    not_typed_by_her: nonConsented.length,
    strict_private_not_typed_by_her: nonConsented.filter((p) => p.strict).length,
    adjacent_only_officer_inspector: nonConsented.filter((p) => !p.strict).length,
    regex_missed_paraphrase_only: nonConsented.filter((p) => p.hits.every((h) => !h.regex_caught)).length,
    by_batch: Object.fromEntries(Object.entries(by(nonConsented, (p) => p.ref.split('#')[0])).map(([k, v]) => [k, v.length])),
    scripts: priv,
  }

  // 3 — exclusion
  const exTerms = []
  for (const f of excluded) {
    const t = f.text.toLowerCase()
    for (const w of ['breville', 'brazil', 'ethiopia', 'blueberry', 'velvety', 'roasted nuts', 'milk chocolate']) if (t.includes(w) && !exTerms.includes(w)) exTerms.push(w)
  }
  const exHits = []
  for (const r of rows) {
    const allowedRaw = (scenarioText(r) + ' ' + productText(prodById.get(r.scenario?.body?.selected_product_id))).toLowerCase()
    const text = [...lines(r), ...(r.hooks || []), ...(r.captions || [])].join(' \n ').toLowerCase()
    const t = exTerms.filter((w) => text.includes(w) && !allowedRaw.includes(w))
    if (t.length) exHits.push({ ref: tag(r), terms: t })
  }
  // facts she said in ratings she had excluded but are NOT flagged excluded in the DB
  const ratedExcluded = (d.ratings || []).filter((x) => /exclud/i.test(x.change_note || '')).map((x) => x.change_note.slice(0, 200))
  const twoPound = rows.filter((r) => /two[- ]pound|2[- ]?(lb|pound)/i.test(lines(r).join(' '))).length
  const cupScore = rows.filter((r) => /cup score/i.test(lines(r).join(' '))).length
  out.p3_exclusion = {
    excluded_facts: excluded.length, excluded_terms: exTerms, scripts: rows.length,
    scripts_with_excluded_content: exHits.length, rate_pct: pct(exHits.length, rows.length), hits: exHits,
    rating_notes_saying_excluded: ratedExcluded,
    she_says_excluded_but_not_flagged: { two_pound_batches_scripts: twoPound, cup_score_scripts: cupScore },
  }

  // 4 — teleprompter vs shot list
  const t4 = { scripts: 0, full_agree: 0, opening_match: 0, closing_match: 0, count_match: 0, line_mismatch: 0, count_mismatch: 0, direction_mismatch_matching_lines: 0, examples: [] }
  for (const r of rows) {
    const a = lines(r).map(norm), b = spoken(r).map(norm)
    if (!a.length) continue
    t4.scripts++
    const open = a[0] === b[0], close = a.at(-1) === b.at(-1), cnt = a.length === b.length
    const setA = new Set(a), setB = new Set(b)
    const lineMis = a.some((x) => !setB.has(x)) || b.some((x) => !setA.has(x))
    const full = cnt && a.every((x, i) => x === b[i])
    let dirMis = false
    const sl = (r.shots || []).filter((s) => String(s.spoken_text ?? '').trim())
    const bl = (r.beats || []).filter((x) => String(x.line ?? '').trim())
    for (const bt of bl) {
      const s = sl.find((x) => norm(x.spoken_text) === norm(bt.line))
      if (s && bt.camera && s.camera && bt.camera !== s.camera) dirMis = true
    }
    t4.opening_match += open; t4.closing_match += close; t4.count_match += cnt; t4.full_agree += full && !dirMis
    t4.line_mismatch += lineMis; t4.count_mismatch += !cnt; t4.direction_mismatch_matching_lines += dirMis
    if ((!full || dirMis) && t4.examples.length < 8) t4.examples.push({ ref: tag(r), beats: a.length, spoken: b.length, opening_match: open, closing_match: close, direction_mismatch: dirMis })
  }
  out.p4_teleprompter_vs_shotlist = { ...t4, full_agree_pct: pct(t4.full_agree, t4.scripts), opening_pct: pct(t4.opening_match, t4.scripts), closing_pct: pct(t4.closing_match, t4.scripts), count_pct: pct(t4.count_match, t4.scripts) }

  // 5 — hooks
  const dist = { lt3: 0, '3to6': 0, gt6: 0 }
  let withTest = 0, firstIsBest = 0, firstIsAnyTested = 0
  const topByGoal = {}
  const misses = []
  for (const r of rows) {
    const n = (r.hook_options || []).length
    dist[n < 3 ? 'lt3' : n <= 6 ? '3to6' : 'gt6']++
    const t = testBy.get(r.generation_id)
    const hs = Array.isArray(t?.hooks) ? t.hooks : []
    if (!hs.length) continue
    withTest++
    const scores = hs.map((h) => Number(h.stopped ?? h.score ?? 0))
    const top = Math.max(...scores)
    const bestIdx = Number.isInteger(t.best_hook) ? t.best_hook : scores.indexOf(top)
    const bestHook = norm(hs[bestIdx]?.hook)
    const first = norm(lines(r)[0])
    const ok = first && (first === bestHook || first.startsWith(bestHook) || bestHook.startsWith(first))
    firstIsBest += !!ok
    firstIsAnyTested += hs.some((h) => norm(h.hook) === first)
    if (!ok && misses.length < 8) misses.push({ ref: tag(r), first_line: lines(r)[0], best_hook: hs[bestIdx]?.hook, best_score: scores[bestIdx], first_score: scores[hs.findIndex((h) => norm(h.hook) === first)] ?? null })
    ;(topByGoal[goalOf(r)] ||= []).push(top)
  }
  out.p5_hooks = {
    scripts_with_audience_test: withTest, first_line_is_top_hook: firstIsBest, pct: pct(firstIsBest, withTest), first_line_is_some_tested_hook: firstIsAnyTested,
    hook_options_count: dist,
    top_score_by_goal: Object.fromEntries(Object.entries(topByGoal).map(([g, v]) => [g, { n: v.length, avg: Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10, min: Math.min(...v), max: Math.max(...v) }])),
    score_scale: 'viewers (of the panel, usually 6) who said the hook stopped them',
    misses,
  }

  // 6 — diagnosed gap -> fix
  let gaps = 0, addressed = 0, writtenBack = 0
  const unfixed = []
  for (const r of rows) {
    const t = testBy.get(r.generation_id)
    if (!t || t.status !== 'done') continue
    const fixes = (t.fixes || []).filter((f) => f && f.fix && Number.isInteger(f.beat))
    const imp = t.improved || {}
    const changed = (imp.lines || []).map((l) => l.line)
    const added = (imp.lines_added || []).length
    const final = lines(r).map(norm)
    for (const f of fixes) {
      gaps++
      const hit = changed.some((l) => Math.abs(l - f.beat) <= 1) || added > 0
      if (hit) addressed++
      const wb = (imp.lines || []).filter((l) => Math.abs(l.line - f.beat) <= 1).some((l) => final.includes(norm(l.after))) || (imp.lines_added || []).some((l) => final.includes(norm(typeof l === 'string' ? l : l.line ?? l.text ?? l.after)))
      if (wb) writtenBack++
      if (!hit && unfixed.length < 8) unfixed.push({ ref: tag(r), issue: f.issue, fix: f.fix })
    }
  }
  out.p6_gap_to_fix = { actionable_gaps: gaps, addressed, written_back_to_final_script: writtenBack, pct_addressed: pct(addressed, gaps), pct_written_back: pct(writtenBack, gaps), unfixed_examples: unfixed }

  // 7 — arc by goal
  const arcG = {}
  for (const r of rows) {
    const a = r.arc
    const g = goalOf(r)
    const e = (arcG[g] ||= { scripts: 0, with_arc: 0, fits: 0, rows: {}, pfa: [], arc_mismatch_finding: 0, beats: [] })
    e.scripts++
    e.beats.push(lines(r).length)
    if ((r.findings || []).some((f) => f.k === 'arc_mismatch')) e.arc_mismatch_finding++
    if (!a) continue
    e.with_arc++; e.fits += !!a.fits; e.rows[a.row] = (e.rows[a.row] || 0) + 1
    if (typeof a.product_first_at === 'number') e.pfa.push(a.product_first_at)
  }
  out.p7_arc = Object.fromEntries(Object.entries(arcG).map(([g, e]) => [g, {
    scripts: e.scripts, with_arc: e.with_arc, fit_pct: pct(e.fits, e.with_arc), rows: e.rows,
    mean_product_first_at: e.pfa.length ? Math.round((100 * e.pfa.reduce((a, b) => a + b, 0)) / e.pfa.length) / 100 : null, n_product_first_at: e.pfa.length,
    arc_mismatch_findings: e.arc_mismatch_finding, mean_beats: Math.round((10 * e.beats.reduce((a, b) => a + b, 0)) / e.beats.length) / 10,
  }]))

  // 8 — DNA signature
  const sig = (d.voice?.vocabulary || []).filter((s) => !PRIVATE.test(s))
  const ctaKeys = ['link in my bio', 'link in bio', 'link to my website in my bio', 'free shipping', 'stick around']
  const sigCount = {}
  let anySig = 0, anySigOrCta = 0
  const sigByBatch = {}
  for (const r of rows) {
    const t = norm(lines(r).join(' '))
    const hit = sig.filter((s) => t.includes(norm(s)))
    for (const h of hit) sigCount[h] = (sigCount[h] || 0) + 1
    if (hit.length) anySig++
    if (hit.length || ctaKeys.some((c) => t.includes(c))) anySigOrCta++
    const b = (sigByBatch[r.batch] ||= [0, 0]); b[0] += hit.length > 0; b[1]++
  }
  out.p8_dna = { signature_phrases: sig, scripts_with_signature: anySig, pct: pct(anySig, rows.length), pct_incl_cta: pct(anySigOrCta, rows.length), per_phrase: sigCount, by_batch: Object.fromEntries(Object.entries(sigByBatch).map(([k, [a, b]]) => [k, `${a}/${b} (${pct(a, b)}%)`])) }

  // 9 — product fact exact match
  const p9 = { scripts_naming_price_or_size: 0, exact: 0, drift: [] }
  for (const r of rows) {
    const p = prodById.get(r.scenario?.body?.selected_product_id)
    if (!p) continue
    const factFigs = new Set(figures(productText(p)).map((x) => x.key))
    const answers = new Set(figures(scenarioText(r)).map((x) => x.key))
    const named = figures(lines(r).join(' ')).filter((f) => /\|(\$|oz|page|lesson|minute)$/.test(f.key) || (/\|pound$/.test(f.key) && f.bag))
    if (!named.length) continue
    p9.scripts_naming_price_or_size++
    const bad = named.filter((f) => !factFigs.has(f.key) && !answers.has(f.key))
    if (!bad.length) p9.exact++
    else p9.drift.push({ ref: tag(r), product: p.name, stored_offer: String(p.offer ?? '').replace(/\n/g, ' / ').slice(0, 120) || '(none stored)', said: [...new Set(bad.map((b) => b.phrase))].slice(0, 4) })
  }
  out.p9_product_facts = { ...p9, pct_exact: pct(p9.exact, p9.scripts_naming_price_or_size) }

  // 10 — cross-script contamination
  const named = d.products.filter((p) => productName(p).length > 3).map((p) => ({ id: p.id, name: productName(p), re: new RegExp('\\b' + productName(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+') + '\\b', 'i'), figs: figures(String(p.offer ?? '')).filter((f) => /\|(\$|oz|pound|page|lesson|minute)$/.test(f.key)).map((f) => f.key) }))
  const productFacts = d.facts.filter((f) => f.product_entity_id)
  const cont = []
  for (const r of rows) {
    const sel = r.scenario?.body?.selected_product_id
    const t = lines(r).join(' ')
    const note = scenarioText(r)
    const myFigs = new Set(figures(productText(prodById.get(sel)) + ' ' + note).map((x) => x.key))
    const hits = []
    for (const p of named) {
      if (p.id === sel) continue
      if (p.re.test(t) && !p.re.test(note)) hits.push(`names "${p.name}"`)
      const foreign = figures(t).filter((f) => p.figs.includes(f.key) && !myFigs.has(f.key))
      if (sel && foreign.length) hits.push(`uses ${p.name} figure ${foreign.map((f) => f.phrase).join(', ')}`)
    }
    for (const f of productFacts) {
      if (f.product_entity_id === sel) continue
      const key = norm(f.text).split(' ').slice(0, 6).join(' ')
      if (key.length > 15 && norm(t).includes(key)) hits.push(`uses fact of ${prodById.get(f.product_entity_id)?.name}: "${f.text.slice(0, 60)}"`)
    }
    if (hits.length) cont.push({ ref: tag(r), door: r.scenario?.body?.door, product: prodById.get(sel)?.name ?? r.scenario?.body?.reference_note?.slice(0, 50), hits: [...new Set(hits)].slice(0, 4) })
  }
  out.p10_contamination = { scripts_contaminated: cont.length, pct: pct(cont.length, rows.length), list: cont }

  // 11 — repeated corrections
  const CORR = [
    ['invented origin "bins"', /\bbins\b/i], ['"six months"', /\bsix months\b/i], ['custom roasts', /custom roast/i],
    ['"half the batch was scorching"', /scorch/i], ['"smelled completely off"', /smelled completely off/i], ['"Hello, I am Savannah / welcome back" greeting', /(hello,? i'?m savannah|hello,? i am savannah|welcome back)/i],
    ['"for twenty years"', /twenty years/i], ['"burnt / overly acidic"', /overly acidic|burnt/i], ['"permanent rule"', /permanent rule|formal rule/i], ['"roast date stamp"', /roast date/i],
    ['"half a gram" / exact grind numbers', /half a gram|\bgrams?\b/i], ['police / neighbor complaints', /police|neighbou?r|code enforcement|officer/i], ['two-pound batches', /two[- ]pound|2[- ]?(lb|pound)/i], ['cup scores', /cup score/i],
    ['velvety body / excluded Brazil-Ethiopia notes', /velvety|milk chocolate|roasted nuts|blueberr/i], ['invented espresso technique (tamp, honey, cinnamon)', /\btamp|honey|cinnamon/i],
  ]
  const p11 = CORR.map(([what, re]) => { const s = rows.filter((r) => re.test(lines(r).join(' ')) && !re.test(scenarioText(r))); return { correction: what, scripts_repeating: s.length, refs: s.slice(0, 5).map(tag) } })
  out.p11_repeated_corrections = { ratings_on_account: (d.ratings || []).length, ratings_with_notes: (d.ratings || []).filter((x) => x.change_note).length, all_ratings_before_batch: true, repeats: p11.filter((x) => x.scripts_repeating > 0).sort((a, b) => b.scripts_repeating - a.scripts_repeating) }

  // 12 — camera labels
  const DEMO = /\b(show|shows|showing|hold(s|ing)? up|pour|grind|scoop|screen|hands?\b.*\b(bag|bean|kettle|grinder)|b-?roll|demonstrat|close-?up of|overhead|insert|over the shoulder|point(s|ing)? (to|at) the)\b/i
  const c12 = { beats_total: 0, beats_with_camera: 0, front: 0, back: 0, talking: 0, demo: 0, talking_back: 0, demo_front: 0, examples: [] }
  for (const r of rows) for (const b of r.beats || []) {
    if (!String(b.line ?? '').trim()) continue
    c12.beats_total++
    if (!b.camera) continue
    c12.beats_with_camera++
    c12[b.camera === 'back' ? 'back' : 'front']++
    const isDemo = DEMO.test(`${b.action ?? ''} ${b.direction ?? ''}`)
    if (isDemo) { c12.demo++; if (b.camera === 'front') c12.demo_front++ } else { c12.talking++; if (b.camera === 'back') c12.talking_back++ }
    if (((isDemo && b.camera === 'front') || (!isDemo && b.camera === 'back')) && c12.examples.length < 6) c12.examples.push({ ref: tag(r), camera: b.camera, action: String(b.action ?? '').slice(0, 100) })
  }
  out.p12_camera = { ...c12, pct_labelled: pct(c12.beats_with_camera, c12.beats_total), pct_backwards: pct(c12.talking_back + c12.demo_front, c12.beats_with_camera), pct_demo_labelled_front: pct(c12.demo_front, c12.demo) }
  return out
}

// ---------------------------------------------------------------- markdown
function md(o) {
  const L = []
  const t = (head, rows) => { L.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map((x) => String(x ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`)); L.push('') }
  L.push(`# Script batch audit — ${Object.keys(o.scope.batches).join(', ')}`, '', `${o.scope.scripts} successful scripts. ${Object.entries(o.scope.batches).map(([k, v]) => `${k}: ${v}`).join(', ')}`, '')
  const p1 = o.p1_fabrication
  L.push('## 1. Fabrication', `Scripts with at least one unbacked figure: **${p1.scripts_with_unbacked_figure}**. Judge ran on ${p1.judge.judged} (errored on ${p1.judge.judge_errors}); ${p1.judge.scripts_with_invented_claims} had invented claims. Findings: ${JSON.stringify(p1.findings)}`, '')
  t(['figure', 'scripts', 'example', 'traced to stored fact'], p1.recurring_unbacked_figures.slice(0, 15).map((f) => [f.figure, f.scripts, f.examples[0], f.traced_to[0] ? `${f.traced_to[0].text}${f.traced_to[0].sensitive ? ' (SENSITIVE)' : ''}${f.traced_to[0].excluded ? ' (EXCLUDED)' : ''}` : 'fresh']))
  t(['judge claim (recurring)', 'scripts'], p1.judge.recurring_claims.map((c) => [c.claim, c.scripts]))
  L.push(`One-off unbacked figures: ${p1.one_off_unbacked_figures.count}; one-off judge claims: ${p1.judge.one_off_claims.count}.`, '')
  t(['recurring unsourced 5-gram', 'scripts'], p1.recurring_unsourced_5grams.slice(0, 12).map((g) => [g.phrase, g.scripts]))
  const p2 = o.p2_private
  L.push('## 2. Private content', `**${p2.strict_private_not_typed_by_her}** scripts carry private content (sensitive-story terms) she did not type; ${p2.adjacent_only_officer_inspector} more carry only the officer/inspector visit. ${p2.regex_missed_paraphrase_only} of all ${p2.not_typed_by_her} slip past the guard regex.`, '')
  t(['script', 'generation', 'kind', 'she typed it', 'content'], p2.scripts.map((s) => [s.ref, s.generation_id, s.strict ? 'private' : 'adjacent', s.she_typed_private_term ? 'yes' : 'no', s.hits.map((h) => `[${h.where}] ${h.text}`).join(' // ')]))
  const p3 = o.p3_exclusion
  L.push('## 3. Exclusion', `${p3.scripts_with_excluded_content}/${p3.scripts} scripts (${p3.rate_pct}%) contain a deliberately excluded fact (${p3.excluded_terms.join(', ')}). Facts she says she excluded but are not flagged: two-pound batches in ${p3.she_says_excluded_but_not_flagged.two_pound_batches_scripts} scripts, cup scores in ${p3.she_says_excluded_but_not_flagged.cup_score_scripts}.`, '')
  const p4 = o.p4_teleprompter_vs_shotlist
  t(['metric', 'value'], [['scripts', p4.scripts], ['full agreement', `${p4.full_agree} (${p4.full_agree_pct}%)`], ['opening line match', `${p4.opening_match} (${p4.opening_pct}%)`], ['closing line match', `${p4.closing_match} (${p4.closing_pct}%)`], ['scene count match', `${p4.count_match} (${p4.count_pct}%)`], ['exact line mismatch', p4.line_mismatch], ['scene-count mismatch', p4.count_mismatch], ['camera mismatch on matching lines', p4.direction_mismatch_matching_lines]])
  const p5 = o.p5_hooks
  L.push('## 5. Hooks', `First line = top-tested hook: **${p5.first_line_is_top_hook}/${p5.scripts_with_audience_test} (${p5.pct}%)**. hook_options count: ${JSON.stringify(p5.hook_options_count)}.`, '')
  t(['goal', 'n', 'avg top score', 'min', 'max'], Object.entries(p5.top_score_by_goal).map(([g, v]) => [g, v.n, v.avg, v.min, v.max]))
  const p6 = o.p6_gap_to_fix
  L.push('## 6. Gap to fix', `${p6.addressed}/${p6.actionable_gaps} actionable gaps addressed (${p6.pct_addressed}%); ${p6.written_back_to_final_script} written back into the final script (${p6.pct_written_back}%).`, '')
  L.push('## 7. Arc by goal')
  t(['goal', 'scripts', 'with arc', 'fit %', 'rows', 'mean product_first_at', 'arc_mismatch findings', 'mean beats'], Object.entries(o.p7_arc).map(([g, v]) => [g, v.scripts, v.with_arc, v.fit_pct, JSON.stringify(v.rows), v.mean_product_first_at, v.arc_mismatch_findings, v.mean_beats]))
  L.push('## 8. DNA', `${o.p8_dna.scripts_with_signature} scripts (${o.p8_dna.pct}%) use a signature phrase; ${o.p8_dna.pct_incl_cta}% counting her CTAs. Per phrase: ${JSON.stringify(o.p8_dna.per_phrase)}`, '')
  const p9 = o.p9_product_facts
  L.push('## 9. Product facts', `${p9.exact}/${p9.scripts_naming_price_or_size} (${p9.pct_exact}%) exact.`, '')
  t(['script', 'product', 'stored', 'said'], p9.drift.slice(0, 20).map((x) => [x.ref, x.product, x.stored_offer, x.said.join('; ')]))
  L.push('## 10. Contamination', `${o.p10_contamination.scripts_contaminated} scripts (${o.p10_contamination.pct}%).`, '')
  t(['script', 'for', 'contamination'], o.p10_contamination.list.slice(0, 25).map((x) => [x.ref, x.product, x.hits.join('; ')]))
  L.push('## 11. Repeated corrections', `${o.p11_repeated_corrections.ratings_on_account} ratings (${o.p11_repeated_corrections.ratings_with_notes} with notes).`, '')
  t(['correction', 'scripts repeating', 'examples'], o.p11_repeated_corrections.repeats.map((x) => [x.correction, x.scripts_repeating, x.refs.join(', ')]))
  const c = o.p12_camera
  L.push('## 12. Camera labels', `${c.beats_with_camera}/${c.beats_total} spoken beats labelled (${c.pct_labelled}%); front ${c.front}, back ${c.back}. Demo beats labelled front: ${c.demo_front}/${c.demo} (${c.pct_demo_labelled_front}%); talking beats labelled back: ${c.talking_back}/${c.talking}. Backwards overall: ${c.pct_backwards}%.`, '')
  return L.join('\n')
}

const data = args.dump ? loadDump(args.dump) : await loadLive()
const result = audit(data)
if (!args['md-only']) console.log(JSON.stringify(result, null, 2))
if (!args['json-only']) console.log('\n' + md(result))

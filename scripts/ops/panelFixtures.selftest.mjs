// Coverage self-test for the fictional panel fixture (Track C, forty fixtures).
//   node scripts/ops/panelFixtures.selftest.mjs
// No network, no database, no model calls: it only reads the JSON fixture and
// the template data, so it costs nothing to run.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))
const tplSrc = readFileSync(new URL('../../packages/shared/src/script/templates/templateData.ts', import.meta.url), 'utf8')

// T1..T13 from templateData.ts: `export const Tn: ScriptTemplate = { ... goals ... duration_profiles ... }`.
const TEMPLATES = {}
for (const m of tplSrc.matchAll(/export const (T\d+): ScriptTemplate = \{[\s\S]*?goals: \[([^\]]*)\][\s\S]*?duration_profiles: \[([^\]]*)\]/g)) {
  const list = (s) => [...s.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  TEMPLATES[m[1]] = { goals: list(m[2]), profiles: list(m[3]) }
}
assert.equal(Object.keys(TEMPLATES).length, 13, 'templateData.ts has T1-T13')

const PROFILES = ['sprint', 'standard', 'deep']
const GOALS = ['sell', 'leads', 'educate', 'entertain', 'personal_brand']
const CREATOR_TYPES = ['physical_product', 'software', 'service_coach', 'maker', 'entertainer']
const LACKS = ['creator_truth', 'urgency', 'dated_item', 'hesitation']
const MIN = { perTemplate: 3, perProfile: 8, perGoal: 2, perCreatorType: 3 }

const creators = new Map(fixture.creators.map((c) => [c.key, c]))
const reqs = fixture.requests
assert.ok(reqs.length >= 40, 'at least forty requests')
assert.equal(new Set(reqs.map((r) => r.id)).size, reqs.length, 'request ids are unique')
// Plan v5.1 item I: coverage requests are appended at the END; the first 24 (golden set) stay as they were.
for (const [n, r] of reqs.entries()) assert.equal(r.id, `panel-${String(n + 1).padStart(2, '0')}`, `request ${n} keeps its place`)
for (const r of reqs.slice(0, 40)) assert.ok(!('angle' in r) && !('outside' in r), `${r.id}: first forty unchanged`)
const ANGLES = ['teach_list', 'contrarian_claim', 'feeling_story', 'result_first', 'problem_question', 'curiosity']

for (const c of fixture.creators) {
  assert.ok(CREATOR_TYPES.includes(c.creator_type), `${c.key}: creator_type`)
  assert.match(c.display_name, /\(fictional\)/, `${c.key}: marked fictional`)
}

// Every request parses: known creator, product, template, a profile the template allows.
for (const r of reqs) {
  const tag = r.id
  const c = creators.get(r.creator)
  assert.ok(c, `${tag}: creator`)
  assert.ok(typeof r.note === 'string' && r.note.trim(), `${tag}: note`)
  assert.ok(['idea', 'product'].includes(r.door), `${tag}: door`)
  assert.equal(r.door === 'product', Boolean(r.product), `${tag}: door matches product`)
  if (r.product) assert.ok(c.products.some((p) => p.key === r.product), `${tag}: product exists`)
  const t = TEMPLATES[r.template]
  assert.ok(t, `${tag}: template`)
  assert.ok(t.profiles.includes(r.profile), `${tag}: ${r.template} allows ${r.profile}`)
  assert.ok(Array.isArray(r.lacks) && r.lacks.every((l) => LACKS.includes(l)), `${tag}: lacks`)
  if (r.angle != null) assert.ok(ANGLES.includes(r.angle), `${tag}: angle`)
  // Outside items: fictional, verified, sourced at example.com, a day-level date in the text, no "(fictional" scaffold.
  for (const o of r.outside ?? []) {
    assert.equal(o.verified, true, `${tag}: outside item verified`)
    assert.match(String(o.source), /^https:\/\/example\.com\//, `${tag}: outside source`)
    assert.match(String(o.text), /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}\b/, `${tag}: outside item dated`)
    assert.ok(!/\(\s*fictional/i.test(o.text), `${tag}: outside text is not scaffold`)
  }
  // No numbers anywhere in what the request itself says; numbers live only in supplied items.
  assert.ok(!/\d/.test(r.note), `${tag}: note has no numbers`)

  // `lacks` must be TRUE of the material on file, or the case tests nothing.
  const facts = (r.product ? c.products.filter((p) => p.key === r.product) : c.products).flatMap((p) => p.facts)
  const has = {
    creator_truth: c.stories.length > 0,
    urgency: facts.some((f) => f.field === 'urgency'),
    dated_item: facts.some((f) => f.field === 'dated' || f.date || f.published_at) || (r.outside ?? []).some((o) => o.verified === true),
    hesitation: facts.some((f) => f.field === 'hesitation'),
  }
  for (const l of r.lacks) assert.equal(has[l], false, `${tag}: claims to lack ${l} but has it`)
  // The gates the template depends on are honestly declared.
  if (r.template === 'T13' && !has.urgency) assert.ok(r.lacks.includes('urgency'), `${tag}: T13 without urgency must say so`)
  if ((r.template === 'T5' || r.template === 'T10') && !has.dated_item) assert.ok(r.lacks.includes('dated_item'), `${tag}: ${r.template} without a dated item must say so`)
  if (!has.creator_truth) assert.ok(r.lacks.includes('creator_truth'), `${tag}: no stories must say so`)
}

// Fictional only: links are example.com, no ids or keys.
const raw = JSON.stringify(fixture)
for (const u of raw.match(/https?:\/\/[^\s"']+/g) ?? []) assert.match(u, /^https:\/\/example\.com\//, `link ${u}`)
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw), 'no uuids')
// New creators carry no numbers outside their product facts.
for (const key of ['pip-sprocket', 'quiet-loom']) {
  const { products, ...rest } = creators.get(key)
  assert.ok(!/\d/.test(JSON.stringify(rest)), `${key}: no numbers outside supplied items`)
}

// Coverage.
const count = (fn) => reqs.reduce((m, r) => { const k = fn(r); m[k] = (m[k] ?? 0) + 1; return m }, {})
const byTemplate = count((r) => r.template)
const byProfile = count((r) => r.profile)
const byGoal = count((r) => r.goal)
const byType = count((r) => creators.get(r.creator).creator_type)
const byLack = {}
for (const r of reqs) for (const l of r.lacks) byLack[l] = (byLack[l] ?? 0) + 1
for (const t of Object.keys(TEMPLATES)) assert.ok((byTemplate[t] ?? 0) >= MIN.perTemplate, `${t}: ${byTemplate[t] ?? 0} < ${MIN.perTemplate}`)
for (const p of PROFILES) assert.ok((byProfile[p] ?? 0) >= MIN.perProfile, `${p}: ${byProfile[p] ?? 0} < ${MIN.perProfile}`)
for (const g of GOALS) assert.ok((byGoal[g] ?? 0) >= MIN.perGoal, `goal ${g}`)
for (const t of CREATOR_TYPES) assert.ok((byType[t] ?? 0) >= MIN.perCreatorType, `type ${t}`)
assert.ok(reqs.some((r) => r.lacks.includes('creator_truth')), 'a no-creator-truth case')
assert.ok(reqs.some((r) => r.template === 'T13' && r.lacks.includes('urgency')), 'T13 without urgency')
assert.ok(reqs.some((r) => r.template === 'T13' && !r.lacks.includes('urgency')), 'T13 with urgency, as control')
for (const t of ['T5', 'T10']) assert.ok(reqs.some((r) => r.template === t && r.lacks.includes('dated_item')), `${t} without a dated item`)
assert.ok(reqs.some((r) => r.lacks.includes('hesitation')), 'an objection case without a hesitation item')
assert.ok(reqs.some((r) => r.goal === 'leads' && r.creator === 'pip-sprocket'), 'an objection case WITH a hesitation item, as control')

if (process.argv.includes('--table')) console.log(JSON.stringify({ byTemplate, byProfile, byGoal, byType, byLack }, null, 1))
console.log('panel fixtures selftest: ok')

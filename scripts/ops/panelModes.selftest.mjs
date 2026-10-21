// Self-test for the panel modes harness (Reference mode + Idea mode subset).
//   node scripts/ops/panelModes.selftest.mjs
// No network, no database, no model calls.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { panelScenarios, panelSelection, panelFilterFromEnv, isPanelGroup, modeOf, fictionalTranscriptRow, storeFictionalReference, panelEstimate, PANEL_EST_USD_PER_REQUEST } from './panelRun.mjs'
import { panelEmail } from './seedFictionalPanel.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))
const accounts = { accounts: fixture.creators.map((c, i) => ({ key: c.key, owner_id: `owner-${i}`, email: panelEmail(c.key), products: Object.fromEntries(c.products.map((p) => [p.key, `pid-${c.key}-${p.key}`])) })) }

// Selection: modes pick only the explicit mode requests; older requests read as 'panel'.
assert.equal(modeOf({}), 'panel')
assert.equal(modeOf({ mode: 'reference' }), 'reference')
const all = panelSelection(fixture)
assert.equal(all.length, fixture.requests.length, 'no filter = every request')
const modes = panelSelection(fixture, { modes: ['reference', 'idea'] })
assert.equal(modes.length, 16, 'reference+idea = the sixteen mode requests')
assert.deepEqual(modes.map((n) => fixture.requests[n].id), Array.from({ length: 16 }, (_, i) => `panel-${48 + i}`))
assert.equal(panelSelection(fixture, { modes: ['reference'] }).length, 8)
assert.equal(panelSelection(fixture, { modes: ['idea'] }).length, 8)
assert.equal(panelSelection(fixture, { modes: ['panel'] }).length, 47, 'panel = the pre-modes requests')
assert.throws(() => panelSelection(fixture, { modes: ['remix'] }), /unknown mode/)
// Range: 1-based request numbers, as in panel-NN.
assert.deepEqual(panelSelection(fixture, { range: '48-63' }), modes)
assert.deepEqual(panelSelection(fixture, { range: '1,3-4' }), [0, 2, 3])
assert.deepEqual(panelSelection(fixture, { range: '40-50', modes: ['reference'] }).map((n) => n + 1), [48, 49, 50])
for (const bad of ['a-b', '5-2', '0']) assert.throws(() => panelSelection(fixture, { range: bad }), /PANEL_RANGE/)

// Env + group parsing: the workflow's free-text group input carries panel:<mode> tokens.
assert.equal(isPanelGroup('panel'), true)
assert.equal(isPanelGroup('panel:reference,panel:idea'), true)
assert.equal(isPanelGroup('product,idea'), false, 'the heartbeat idea group is not the panel')
assert.deepEqual(panelFilterFromEnv({}, 'panel'), { modes: [], range: '' })
assert.deepEqual(panelFilterFromEnv({}, 'panel:reference,panel:idea'), { modes: ['reference', 'idea'], range: '' })
assert.deepEqual(panelFilterFromEnv({ PANEL_MODES: 'reference, idea', PANEL_RANGE: ' 48-63 ' }, 'panel'), { modes: ['reference', 'idea'], range: '48-63' })

// Scenarios keep the fixture index as n (so idempotency keys never move) and apply limit after the filter.
const sc = panelScenarios(fixture, accounts, Infinity, { modes: ['reference', 'idea'] })
assert.equal(sc.length, 16)
assert.equal(sc[0].n, 47)
assert.equal(panelScenarios(fixture, accounts, 3, { modes: ['idea'] }).map((s) => s.id).join(), 'panel-56,panel-57,panel-58')
// A limited mode run needs only its own creators seeded.
{
  const one = { accounts: accounts.accounts.filter((a) => a.key === 'mayas-coffee') }
  assert.equal(panelScenarios(fixture, one, 1, { modes: ['reference'] }).length, 1)
}

// Reference-mode bodies: door reference, a fictional example.com url, reference_use, no product; the
// transcript_id is added at run time from the stored fictional reference.
for (const s of sc.filter((x) => x.mode === 'reference')) {
  assert.equal(s.body.door, 'reference', s.id)
  assert.match(s.body.reference_url, /^https:\/\/example\.com\/fictional-reference\//, s.id)
  assert.ok(s.body.reference_use, s.id)
  assert.equal(s.body.selected_product_id, undefined, s.id)
  assert.equal(s.body.transcript_id, undefined, 'stored at run time, not in the fixture')
  assert.equal(s.reference.fictional, true)
  assert.ok(s.body.reference_note.trim(), 'the edge also requires a note or url')
}
// Idea-mode bodies: door idea, the idea text as reference_note, no url, no product.
for (const s of sc.filter((x) => x.mode === 'idea')) {
  assert.equal(s.body.door, 'idea', s.id)
  assert.equal(s.body.reference_url, undefined, s.id)
  assert.equal(s.body.selected_product_id, undefined, s.id)
  assert.equal(s.reference, null)
  assert.ok(s.body.reference_note.trim())
}
// A reference request without a stored fictional reference is refused.
{
  const bad = { ...fixture, requests: [{ ...fixture.requests[47], reference: { ...fixture.requests[47].reference, fictional: false } }] }
  assert.throws(() => panelScenarios(bad, accounts), /fictional stored reference/)
}

// The stored row: the creator's own, subject 'reference' (never her voice), example.com only.
const ref = fixture.requests[47].reference
const row = fictionalTranscriptRow('owner-0', ref)
assert.equal(row.owner_id, 'owner-0')
assert.equal(row.subject, 'reference')
assert.equal(row.source_url, ref.url)
assert.deepEqual(row.structure, ref.structure)
assert.throws(() => fictionalTranscriptRow('o', { ...ref, url: 'https://www.tiktok.com/@someone/video/1' }), /example\.com/)
assert.throws(() => fictionalTranscriptRow('o', { ...ref, fictional: undefined }), /fictional/)

// storeFictionalReference: reuses a prior row for the same owner+url, else inserts once. Fake client.
function fakeAdmin(existing) {
  const calls = { inserts: [] }
  const q = (result) => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => result, single: async () => result }
    return chain
  }
  return {
    calls,
    from: (t) => {
      assert.equal(t, 'transcripts')
      return {
        select: () => q({ data: existing ? { id: existing } : null }).select(),
        insert: (r) => { calls.inserts.push(r); return q({ data: { id: 'new-id' }, error: null }) },
      }
    },
  }
}
{
  const a = fakeAdmin('old-id')
  assert.equal(await storeFictionalReference(a, 'owner-0', ref), 'old-id')
  assert.equal(a.calls.inserts.length, 0)
  const b = fakeAdmin(null)
  assert.equal(await storeFictionalReference(b, 'owner-0', ref), 'new-id')
  assert.equal(b.calls.inserts.length, 1)
  assert.equal(b.calls.inserts[0].subject, 'reference')
}

// Cost planning figure: sixteen requests at $0.05.
assert.equal(PANEL_EST_USD_PER_REQUEST, 0.05)
assert.equal(panelEstimate(16), 0.8)

// The runner never fetches a reference url itself.
const src = readFileSync(new URL('./panelRun.mjs', import.meta.url), 'utf8')
assert.ok(!/fetch\([^)]*reference/.test(src), 'no fetch of a reference url')

console.log('panel modes selftest: ok')

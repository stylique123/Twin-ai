#!/usr/bin/env node
// Credential-free. The whole point of the factory shape is that this file can
// import the module on a machine with no staging credentials, so if it ever
// stops being importable without them, this test stops running at all.
import { makeEditorFixtures, fullDecisionV2, DECISION_V2_REQUIRED_FIELDS } from './editorFixtures.mjs'

let pass = 0, fail = 0
const eq = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : (fail++, console.error(`FAIL ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`))
}
const ok = (what, cond, detail = '') => { cond ? pass++ : (fail++, console.error(`FAIL ${what} ${detail}`)) }

// ── a fake admin that records what it was asked to do ────────────────────────
function fakeAdmin(result = { error: null }) {
  const calls = []
  return {
    calls,
    from(table) {
      return { insert: async (row) => { calls.push({ kind: 'insert', table, row }); return result } }
    },
    rpc: async (name, args) => { calls.push({ kind: 'rpc', name, args }); return result },
  }
}
const sha256 = (s) => `sha(${s})`

// ── the factory refuses to be built wrong ────────────────────────────────────
ok('a missing admin client is refused, not deferred to first use',
  (() => { try { makeEditorFixtures(null, sha256); return false } catch { return true } })())

// ── scratchProject ───────────────────────────────────────────────────────────
{
  const admin = fakeAdmin()
  const f = makeEditorFixtures(admin, sha256)
  const id = await f.scratchProject('owner-1', 'gen-1', 'asset-1')
  const { table, row } = admin.calls[0]
  eq('inserts into edit_projects', table, 'edit_projects')
  eq('the project starts queued', row.status, 'queued')
  eq('owner, generation and source are carried through',
    [row.owner_id, row.generation_id, row.source_asset_id], ['owner-1', 'gen-1', 'asset-1'])
  ok('the returned id IS the row id', id === row.id, `${id} vs ${row.id}`)
  // ⚖️ Two projects must not share an idempotency key — edit_projects_idem_uniq
  // is a real unique index on (owner_id, idempotency_key).
  const admin2 = fakeAdmin()
  const f2 = makeEditorFixtures(admin2, sha256)
  await f2.scratchProject('owner-1', 'gen-1', 'asset-1')
  ok('a second project gets a different idempotency key',
    admin.calls[0].row.idempotency_key !== admin2.calls[0].row.idempotency_key)
}

// ── fabricateLease ───────────────────────────────────────────────────────────
{
  const admin = fakeAdmin()
  const f = makeEditorFixtures(admin, sha256)
  const lease = await f.fabricateLease('owner-1', 'proj-1')
  const row = admin.calls[0].row
  eq('the lease row is a running editor_v2 job',
    [row.type, row.status, row.attempts], ['editor_v2', 'running', 1])
  eq('the payload names the project', row.payload, { project_id: 'proj-1' })
  eq('the lease it returns matches the row it wrote',
    [lease.jobId, lease.worker, lease.attempt], [row.id, row.locked_by, 1])
  // ⚠️ BOTH ORIGINAL COPIES USED THIS EXACT KEY, and jobs_dedup_key_uniq is a
  // real unique index — two leases for the SAME project collide by design.
  eq('the dedup key is per-project and ends in :hx', row.dedup_key, 'editor_v2:proj-1:hx')
  ok('locked_by is the worker name', row.locked_by === lease.worker)
  const custom = await makeEditorFixtures(fakeAdmin(), sha256).fabricateLease('o', 'p', 'p8-sweep')
  eq('the worker name is overridable', custom.worker, 'p8-sweep')
}

// ── errors surface, they do not resolve quietly ──────────────────────────────
{
  const f = makeEditorFixtures(fakeAdmin({ error: { message: 'boom' } }), sha256)
  for (const [name, call] of [
    ['scratchProject', () => f.scratchProject('o', 'g', 'a')],
    ['fabricateLease', () => f.fabricateLease('o', 'p')],
    ['advanceTo', () => f.advanceTo('p', { jobId: 'j', worker: 'w', attempt: 1 }, ['inspecting'])],
  ]) {
    let threw = false
    try { await call() } catch (e) { threw = /boom/.test(e.message) && e.message.startsWith(name) }
    ok(`${name} throws, naming itself, when the database refuses`, threw)
  }
}

// ── advanceTo ────────────────────────────────────────────────────────────────
{
  const admin = fakeAdmin()
  const f = makeEditorFixtures(admin, sha256)
  const lease = { jobId: 'j1', worker: 'w1', attempt: 2 }
  await f.advanceTo('proj-1', lease, ['inspecting', 'transcribing', 'analyzing', 'directing'])
  eq('one fenced advance per stage, IN ORDER',
    admin.calls.map((c) => c.args.p_to), ['inspecting', 'transcribing', 'analyzing', 'directing'])
  eq('every call carries the lease', admin.calls.every((c) =>
    c.args.p_job === 'j1' && c.args.p_worker === 'w1' && c.args.p_attempt === 2), true)
  eq('it uses the fenced RPC, not a table write', admin.calls[0].name, 'editor_advance_stage')
  const empty = fakeAdmin()
  await makeEditorFixtures(empty, sha256).advanceTo('p', lease, [])
  eq('no stages means no calls', empty.calls.length, 0)
}

// ── dirBegin ─────────────────────────────────────────────────────────────────
{
  const admin = fakeAdmin()
  const f = makeEditorFixtures(admin, sha256)
  const lease = { jobId: 'j1', worker: 'w1', attempt: 3 }
  await f.dirBegin('proj-9', lease, 'asset-9')
  const { name, args } = admin.calls[0]
  eq('it opens the Director call through the fenced RPC', name, 'editor_director_begin')
  eq('the envelope digest is derived from the project', args.p_envelope_sha256, 'sha(env-proj-9)')
  eq('model and provider are the pinned pair', [args.p_model, args.p_provider], ['gemini-3.5-flash', 'google'])
  eq('the attempt defaults to the lease attempt', args.p_attempt, 3)
  // ⚖️ The override exists so a phase can prove a STALE attempt is refused; 0 is
  // a legitimate override and `??` keeps it, where `||` would silently discard it.
  const admin2 = fakeAdmin()
  await makeEditorFixtures(admin2, sha256).dirBegin('p', lease, 'a', 0)
  eq('an attempt override of 0 is honoured, not treated as absent', admin2.calls[0].args.p_attempt, 0)
}

// ── fullDecisionV2 ───────────────────────────────────────────────────────────
{
  const d = fullDecisionV2()
  eq('it is schema 2 — 0092 rejects anything else', d.schemaVersion, 2)
  for (const k of DECISION_V2_REQUIRED_FIELDS) {
    ok(`the required field ${k} is present`, k in d)
  }
  eq('zoomRequests defaults to none', d.zoomRequests, [])
  // ⚠️ THE WHOLE POINT OF THE OVERRIDE: a chosen zoom count, still complete.
  const z = fullDecisionV2({ zoomRequests: [{ startCs: 0, endCs: 50 }, { startCs: 60, endCs: 90 }] })
  eq('an override sets the field', z.zoomRequests.length, 2)
  eq('and leaves the decision COMPLETE',
    DECISION_V2_REQUIRED_FIELDS.filter((k) => !(k in z)), [])
  ok('overriding does not mutate the shared default', fullDecisionV2().zoomRequests.length === 0)
}

console.log(`editor-fixtures selftest: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

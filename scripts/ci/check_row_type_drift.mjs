// THE TYPESCRIPT ROW INTERFACES AND THE TABLES THEY CLAIM TO MODEL.
//
// C4 on the open-items ledger. The failure it guards is the one the Track C
// drift audit found and named: `brand_voices.profile` is written straight from
// the provider object with no projection through `VoiceProfile`, so the shared
// interface is A DESCRIPTION, NOT A GATE. `editing_style` was produced, stored,
// and absent from the interface — for months, silently, because nothing
// compares the two.
//
// The same shape produced D1 on the audit: onboarding asked `workKind` and
// `forbiddenClaims`, and there was no column. Grepping the tree for
// `work_kind` returned nothing. A question asked and dropped.
//
// Both directions are real bugs and they fail differently:
//
//   * A TS FIELD WITH NO COLUMN is a read that returns `undefined` forever, or
//     a write that fails 42703 naming a column the author is sure exists. It
//     never throws at compile time, because the interface is the only thing
//     that says the column is there.
//   * A COLUMN WITH NO TS FIELD is data the product stores and no reader can
//     see. This is the quieter one and it is how `editing_style` survived: the
//     value is there, it costs storage, nothing consumes it, and no test can
//     fail because nothing references it to be wrong about.
//
// SO THE DEFAULT IS BOTH-WAYS-STRICT, and a column deliberately absent from a
// client interface must SAY SO in `SERVER_ONLY`. That list is the point of the
// check: it converts "nobody noticed" into "someone wrote down why", which is
// the only difference between an omission and a decision.
//
// ── WHAT THIS IS EVIDENCE OF, AND WHAT IT IS NOT ──────────────────────────
//
// Migration-derived, exactly as `check_takes_delete_policy.mjs` is, and with
// the same caveat stated the same way: the AUTHORITATIVE schema is the live
// catalog. This reads the migration text, which is what CI has without
// credentials. It will not see a column added by hand in the dashboard — and
// that is a drift this cannot catch, so it must not be claimed to.
//
// The parser is deliberately conservative. A drift check that reports false
// positives gets an allowlist entry per run and is dead within a month, so
// anything it cannot parse with confidence it SKIPS AND REPORTS as unparsed
// rather than guessing. Unparsed is visible; a wrong answer is not.
//
//   node scripts/ci/check_row_type_drift.mjs            # live: the real tree
//   node scripts/ci/check_row_type_drift.mjs --selftest # fixtures
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

// ── The map. A row interface, the file it lives in, and the table it models ──
//
// Only interfaces that CLAIM to be a row shape belong here. A DTO assembled by
// an edge function is not a row and adding it would make this check assert
// something untrue.
const MODELS = [
  {
    iface: 'EditProject',
    file: 'packages/shared/src/editor/contracts.ts',
    table: 'edit_projects',
    // Columns the pipeline owns that no client reads. Each is a decision with a
    // reason, because the whole value of this list is that it cannot be grown
    // by someone who has not thought about the entry they are adding.
    serverOnly: [
      // Multi-tenancy the client never selects — RLS resolves it server-side,
      // and a client that could read it could enumerate workspaces.
      'workspace_id',
      // Deduplication for start-editor-v2. The client MINTS one and sends it;
      // it never reads the stored copy back, and comparing to it would let a
      // retry look successful when it collided.
      'idempotency_key',
      // Version pins, written at each stage so a finished project records which
      // code produced it. Diagnostics for us; meaningless to a creator, and a
      // client branching on them would couple the UI to worker deploys.
      'analysis_version', 'director_version', 'compiler_version', 'renderer_version',
      // The operator-facing half of a failure. `failure_code` is the stable,
      // classified value the UI explains via `failureExplain.ts`; the details
      // are unclassified text and MUST NOT reach a creator — that is the
      // distinction §9 draws between a code and a raw error.
      'failure_details',
      // Cancellation bookkeeping. The client calls the cancel RPC and reads
      // `status`; a second source of truth for "is it cancelled" is how a UI
      // ends up disagreeing with the database.
      'cancel_requested_at',
      // The pinned manifest and script, plus their digests. These are the
      // immutability spine (0091): every stage reads the frozen copy. They are
      // large, and a client that read them could not verify them anyway.
      'boot_manifest', 'boot_manifest_sha', 'script_snapshot', 'script_snapshot_sha',
    ],
  },
  {
    iface: 'MediaAsset',
    file: 'packages/shared/src/editor/contracts.ts',
    table: 'media_assets',
    serverOnly: [
      'workspace_id',                                  // as above
      // Ordering within one generation's captures, assigned server-side. The
      // client orders by `created_at` and never needs the counter.
      'seq',
      // Probe internals. `metadata` is the raw ffprobe object — unbounded and
      // untrusted, and §5.3's whole point is that only the BOUNDED projection
      // crosses to a consumer. The other two are re-probe bookkeeping.
      'metadata', 'validation_version', 'capture_contract_version',
      // Frame rate as a rational. Deliberately absent from the client shape:
      // there is no surface that shows it, and exposing a two-column rational
      // invites a consumer to divide them and render "29.97".
      'frame_rate_num', 'frame_rate_den',
    ],
  },
  {
    // The row every surface starts from, and the one whose interface had
    // drifted furthest: `capability_flags` and `scene_timeline` were READ BY
    // THE CLIENT and absent from the shape, so `getGeneration` — which selects
    // `*` — returned a value the type said did not have them. That is the
    // `editing_style` failure with the direction reversed: not data nobody can
    // see, but data everybody reads through a cast.
    iface: 'Generation',
    file: 'packages/shared/src/types.ts',
    table: 'generations',
    serverOnly: [
      // Billing bookkeeping for one creation. The client shows a BALANCE, read
      // from the profile; a per-row charge is an accounting detail, and a UI
      // that summed these would disagree with the ledger the moment a refund
      // or a grant happened anywhere else.
      'credits_spent',
      // A CAPABILITY, not a field. Anyone holding this token can view the
      // generation without logging in, which is the entire design of the
      // login-free review link. The client obtains one through
      // `ensure_review_token` when it deliberately creates a link; a client
      // that could SELECT it could mint a public link for any row it can read.
      'review_token',
      // The client resolves its source through `media_assets` instead
      // (kind='source', status='ready'), which carries the same fact PLUS the
      // readiness this id cannot express. Reading the id alone would let a
      // surface offer a take that has not finished probing.
      'source_asset_id',
      // Deduplication for generate-blueprint (0119), and server-only for the
      // same reason `edit_projects.idempotency_key` is: the client MINTS one
      // per click-intent and sends it, and never reads the stored copy back.
      //
      // Reading it back would be actively wrong here. A replay returns the
      // EXISTING row, so the key it carries is the one the FIRST call stored —
      // a client that compared them would see a match and conclude its own
      // request had done the work, when the truth is that it was refused and
      // handed someone else's (its own earlier) result. The observable fact a
      // caller needs is the generation, which it already has.
      'idempotency_key',
    ],
  },
]

// ── SQL: build each table's column set from the migration chain ──────────────

function migrations() {
  const dir = join(REPO, 'supabase', 'migrations')
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => ({ file: f, sql: readFileSync(join(dir, f), 'utf8') }))
}

/** Comments stripped so a `-- add column foo` in prose cannot invent a column. */
export function stripSql(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

const IDENT = String.raw`"?([a-zA-Z_][a-zA-Z0-9_]*)"?`

/**
 * Columns for one table across all migrations, plus anything that referenced
 * the table in a way this parser did not understand.
 *
 * Handles the three statements this tree actually uses: `create table`,
 * `alter table … add column`, `alter table … drop column`. A `create table` body
 * is split at top-level commas only, so a `numeric(10, 2)` or a multi-column
 * constraint cannot be read as extra columns.
 */
export function columnsFor(table, files) {
  const cols = new Set()
  const unparsed = []

  for (const { file, sql: raw } of files) {
    const sql = stripSql(raw)

    const createRe = new RegExp(
      String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?${table}\b\s*\(`, 'gi')
    let m
    while ((m = createRe.exec(sql)) !== null) {
      const body = balanced(sql, m.index + m[0].length - 1)
      if (body === null) { unparsed.push(`${file}: unbalanced create table`); continue }
      for (const part of splitTopLevel(body)) {
        const t = part.trim()
        if (t === '') continue
        // Table-level constraints are not columns.
        if (/^(constraint|primary\s+key|unique|check|foreign\s+key|exclude|like|partition)\b/i.test(t)) continue
        const nameMatch = t.match(new RegExp(`^${IDENT}\\s`))
        if (!nameMatch) { unparsed.push(`${file}: cannot read column from ${JSON.stringify(t.slice(0, 40))}`); continue }
        cols.add(nameMatch[1])
      }
    }

    const addRe = new RegExp(
      String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?${table}\b([\s\S]*?);`, 'gi')
    while ((m = addRe.exec(sql)) !== null) {
      const stmt = m[1]
      for (const a of stmt.matchAll(new RegExp(String.raw`add\s+column\s+(?:if\s+not\s+exists\s+)?${IDENT}`, 'gi'))) {
        cols.add(a[1])
      }
      for (const d of stmt.matchAll(new RegExp(String.raw`drop\s+column\s+(?:if\s+exists\s+)?${IDENT}`, 'gi'))) {
        cols.delete(d[1])
      }
    }
  }
  return { cols, unparsed }
}

/** The substring inside the parens starting at `open`, or null if unbalanced. */
function balanced(s, open) {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') { depth--; if (depth === 0) return s.slice(open + 1, i) }
  }
  return null
}

/** Split on commas that are not inside parentheses. */
export function splitTopLevel(body) {
  const out = []
  let depth = 0, start = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1 }
  }
  out.push(body.slice(start))
  return out
}

// ── TypeScript: the declared fields of one interface ─────────────────────────

/**
 * Field names of `interface <name> { … }`, ignoring comments and nested object
 * literals. Optional (`?`) and readonly are accepted; the check is about the
 * NAME existing, not its modifiers.
 */
export function fieldsOf(src, iface) {
  const re = new RegExp(String.raw`export\s+interface\s+${iface}\s*(?:extends\s+[^{]+)?\{`, 'm')
  const m = re.exec(src)
  if (!m) return null
  const body = balancedBrace(src, m.index + m[0].length - 1)
  if (body === null) return null
  // Strip comments first, then any nested braces, so an inline object type's
  // members are not read as fields of the row.
  const flat = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  let stripped = flat, prev = null
  while (stripped !== prev) { prev = stripped; stripped = stripped.replace(/\{[^{}]*\}/g, ' ') }
  const out = new Set()
  for (const f of stripped.matchAll(/(?:^|[;\n])\s*(?:readonly\s+)?["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s*\??\s*:/g)) {
    out.add(f[1])
  }
  return out
}

function balancedBrace(s, open) {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(open + 1, i) }
  }
  return null
}

// ── The comparison ───────────────────────────────────────────────────────────

export function compare(model, cols, fields) {
  const problems = []
  const serverOnly = new Set(model.serverOnly ?? [])

  for (const f of fields) {
    if (!cols.has(f)) {
      problems.push(
        `${model.iface}.${f} has no column in public.${model.table} — a select of it `
        + `returns undefined forever and a write fails 42703; nothing catches this at compile time`)
    }
  }
  for (const c of cols) {
    if (fields.has(c) || serverOnly.has(c)) continue
    problems.push(
      `public.${model.table}.${c} is stored and absent from ${model.iface} — either add the `
      + `field or name the column in SERVER_ONLY with a reason; unlisted means nobody noticed, `
      + `which is how brand_voices.editing_style was written and read by nothing`)
  }
  // A stale allowlist is its own drift: a column dropped from the table but
  // still excused here hides the next real omission behind a name that no
  // longer exists.
  for (const s of serverOnly) {
    if (!cols.has(s)) {
      problems.push(
        `${model.iface}: SERVER_ONLY names public.${model.table}.${s}, which the migrations `
        + `do not create — remove it, or the list stops meaning anything`)
    }
  }
  return problems
}

function evaluate() {
  const files = migrations()
  const problems = []
  const notes = []
  for (const model of MODELS) {
    const src = readFileSync(join(REPO, model.file), 'utf8')
    const fields = fieldsOf(src, model.iface)
    if (!fields) { problems.push(`${model.file}: interface ${model.iface} not found`); continue }
    const { cols, unparsed } = columnsFor(model.table, files)
    if (cols.size === 0) { problems.push(`no columns parsed for public.${model.table} — the map is wrong or the parser is`); continue }
    for (const u of unparsed) notes.push(`${model.table}: UNPARSED — ${u}`)
    problems.push(...compare(model, cols, fields))
    notes.push(`${model.iface} ↔ public.${model.table}: ${fields.size} fields, ${cols.size} columns`)
  }
  return { problems, notes }
}

// ── Selftest ─────────────────────────────────────────────────────────────────

function selftest() {
  const cases = []
  const t = (name, fn) => cases.push([name, fn])

  t('a create table yields its columns, not its constraints', () => {
    const { cols } = columnsFor('t', [{ file: 'f', sql:
      `create table if not exists public.t (
         id uuid primary key default gen_random_uuid(),
         owner_id uuid not null references auth.users(id),
         amount numeric(10, 2),
         constraint t_ck check (amount > 0),
         unique (id, owner_id)
       );` }])
    return same([...cols].sort(), ['amount', 'id', 'owner_id'])
  })

  t('numeric(10, 2) does not become a column called 2', () => {
    const { cols } = columnsFor('t', [{ file: 'f', sql: 'create table t (a numeric(10, 2), b int);' }])
    return same([...cols].sort(), ['a', 'b'])
  })

  t('alter add column is picked up, drop column removes it', () => {
    const { cols } = columnsFor('t', [
      { file: '1', sql: 'create table t (a int);' },
      { file: '2', sql: 'alter table public.t add column if not exists b text;' },
      { file: '3', sql: 'alter table t drop column if exists a;' },
    ])
    return same([...cols].sort(), ['b'])
  })

  t('a comment mentioning add column invents nothing', () => {
    const { cols } = columnsFor('t', [
      { file: '1', sql: 'create table t (a int);\n-- alter table t add column ghost text;' },
    ])
    return same([...cols].sort(), ['a'])
  })

  t('another table is not confused for this one', () => {
    // `media_assets` vs a hypothetical `media_assets_archive`: the \b anchor.
    const { cols } = columnsFor('t', [{ file: '1', sql: 'create table t_archive (x int); create table t (a int);' }])
    return same([...cols].sort(), ['a'])
  })

  t('interface fields are read, nested object members are not', () => {
    const f = fieldsOf(`export interface R {
      id: string
      nested?: { inner: number; deeper: { x: 1 } }
      /** a doc comment: not a field */
      tail: string | null
    }`, 'R')
    return same([...f].sort(), ['id', 'nested', 'tail'])
  })

  t('a TS field with no column FAILS', () => {
    const p = compare({ iface: 'R', table: 't', serverOnly: [] }, new Set(['id']), new Set(['id', 'ghost']))
    return p.length === 1 && /R\.ghost has no column/.test(p[0])
  })

  t('a column with no TS field FAILS unless excused', () => {
    const bad = compare({ iface: 'R', table: 't', serverOnly: [] }, new Set(['id', 'secret']), new Set(['id']))
    const ok = compare({ iface: 'R', table: 't', serverOnly: ['secret'] }, new Set(['id', 'secret']), new Set(['id']))
    return bad.length === 1 && /t\.secret is stored and absent/.test(bad[0]) && ok.length === 0
  })

  t('a SERVER_ONLY entry for a column that does not exist FAILS', () => {
    const p = compare({ iface: 'R', table: 't', serverOnly: ['gone'] }, new Set(['id']), new Set(['id']))
    return p.length === 1 && /SERVER_ONLY names public\.t\.gone/.test(p[0])
  })

  t('a matching pair is silent', () => {
    return compare({ iface: 'R', table: 't', serverOnly: [] }, new Set(['id']), new Set(['id'])).length === 0
  })

  let failed = 0
  for (const [name, fn] of cases) {
    let ok = false
    try { ok = fn() === true } catch (e) { ok = false; name.length && console.error(`  threw: ${e.message}`) }
    if (ok) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name}`); failed++ }
  }
  if (failed) { console.error(`row-type-drift selftest: ${failed} failed`); process.exit(1) }
  console.log('row-type-drift selftest: all cases passed'); process.exit(0)
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const { problems, notes } = evaluate()
    for (const n of notes) console.log(`  ${n}`)
    console.log('NOTE: migration-derived. The authoritative schema is the live catalog; a column')
    console.log('      added by hand in the dashboard is a drift this cannot see.')
    if (problems.length) { for (const p of problems) console.error(`::error::${p}`); process.exit(1) }
    console.log(`row-type-drift guard: OK (${MODELS.length} row interfaces agree with their tables)`)
  }
}

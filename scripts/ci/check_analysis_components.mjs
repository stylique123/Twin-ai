// THE ONE PLACE THAT KNOWS HOW MANY ANALYSIS COMPONENTS EXIST.
//
// Registering a single analysis component (alignment, #242) required updating
// twelve sites that each privately encoded the component namespace, none of
// them referencing any other:
//
//   SQL    media_analyses component CHECK constraint
//   SQL    editor_record_analysis's digest-keyed guard
//   SQL    editor_record_analysis's per-component byte cap CASE
//   YAML   staging-integration.yml's hand-picked migration list
//   JS     scripts/staging-integration/phase3.mjs   sanctioned set
//   JS     scripts/staging-integration/phase4.mjs   sanctioned set
//   JS     scripts/staging-integration/phase5.mjs   SANCTIONED const
//   JS     scripts/staging-integration/phase6.mjs   digest-component expectations
//   TS     worker/src/jobs/editorAnalyze.ts         digest-keyed union
//   TS     worker/src/jobs/editorDirector.ts        digest-keyed iteration
//   TS     worker/src/jobs/directorContract.ts      componentDigests requireKeys
//   TS     packages/shared/src/editor/director.ts   componentDigests requireKeys
//
// Nothing compared them. Every disagreement therefore surfaced ~40 minutes into
// a staging matrix run against real Gemini and ASR on a serialised project, and
// every failure named a symptom rather than the cause — four runs, and the
// alignment code was never implicated once.
//
// This is the medicine MAX_CUES got: ONE frozen catalog
// (scripts/ci/analysis_components.json), and a build-time guard that fails when
// any site disagrees with it. Offline, in under a second, before the matrix.
//
// WHY THIS READS THE SITES INSTEAD OF REWRITING THEM TO IMPORT THE CATALOG.
// Making phase3-6 import the catalog would be the deeper fix, but those four
// files run ONLY inside the staging matrix, so the change could not be
// validated by anything cheaper than the ~40-minute run this guard exists to
// stop spending. Parsing them read-only touches no runtime behaviour and cannot
// break the matrix. The import refactor is a safe follow-up once the guard is
// established and can prove the refactor preserved the sets.
//
// FAILS CLOSED. Every site below is a REQUIRED anchor: if a regex stops
// matching because a file was restructured, that is a failure, not a pass. A
// guard that silently stops checking is worse than no guard.
//
//   node scripts/ci/check_analysis_components.mjs --selftest
//   node scripts/ci/check_analysis_components.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const CATALOG_PATH = 'scripts/ci/analysis_components.json'
export const MIGRATIONS_DIR = 'supabase/migrations'
export const WORKFLOW = '.github/workflows/staging-integration.yml'

export const PHASE3 = 'scripts/staging-integration/phase3.mjs'
export const PHASE4 = 'scripts/staging-integration/phase4.mjs'
export const PHASE5 = 'scripts/staging-integration/phase5.mjs'
export const PHASE6 = 'scripts/staging-integration/phase6.mjs'
export const TS_SITES = [
  'worker/src/jobs/editorAnalyze.ts',
  'worker/src/jobs/editorDirector.ts',
  'worker/src/jobs/directorContract.ts',
  'packages/shared/src/editor/director.ts',
]

// A migration "touches the component contract" if it re-states the bounding
// CHECK or redefines the writer. Those are the two things whose disagreement
// with the catalog can only be discovered in staging.
export function touchesComponentContract(sql) {
  return /media_analyses_component_bounded/.test(sql) ||
    /function\s+(public\.)?editor_record_analysis/i.test(sql)
}

export function migrationNumber(filename) {
  const m = /^(\d{4})_/.exec(filename)
  return m ? Number(m[1]) : null
}

// --- parsers -------------------------------------------------------------
// Each returns null when its anchor is absent, which the caller treats as a
// failure. `null` never means "nothing to check".

const listFrom = (s) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

export function parseCheckConstraint(sql) {
  const m = /add\s+constraint\s+media_analyses_component_bounded\s+check\s*\(\s*component\s+in\s*\(([^)]*)\)/i.exec(sql)
  return m ? listFrom(m[1]) : null
}

export function parseDigestGuard(sql) {
  const m = /p_component\s+not\s+in\s*\(([^)]*)\)/i.exec(sql)
  return m ? listFrom(m[1]) : null
}

// Returns { explicit: {name: bytes}, fallback: bytes } for the cap CASE.
export function parseCapCase(sql) {
  const m = /cap\s*:=\s*case\s+p_component\s+(.*?)\s+end\s*;/is.exec(sql)
  if (!m) return null
  const body = m[1]
  const explicit = {}
  for (const w of body.matchAll(/when\s+'([a-z_]+)'\s+then\s+(\d+)/gi)) explicit[w[1]] = Number(w[2])
  const e = /else\s+(\d+)/i.exec(body)
  return { explicit, fallback: e ? Number(e[1]) : null }
}

// What the CASE would ACTUALLY return for a component — the whole point of the
// cap trap is that this differs from what anyone intended.
export function effectiveCap(capCase, name) {
  if (!capCase) return null
  return Object.prototype.hasOwnProperty.call(capCase.explicit, name)
    ? capCase.explicit[name]
    : capCase.fallback
}

// phase3/phase4 embed the namespace as a PostgREST `not in` filter string.
// The staging matrix applies a hand-picked list, written as a shell loop:
//   for f in 0090_editor_capture_intent 0091_… 0097_…; do psql … done
// Returns the migration NUMBERS in that loop, or null if the loop is gone.
export function parseAppliedMigrations(yaml) {
  const m = /for\s+f\s+in\s+((?:\d{4}_[a-z0-9_]+\s*)+);\s*do/.exec(yaml)
  if (!m) return null
  return new Set([...m[1].matchAll(/(\d{4})_[a-z0-9_]+/g)].map((x) => Number(x[1])))
}

export function parseNotInFilter(js) {
  const m = /\.not\(\s*'component'\s*,\s*'in'\s*,\s*'\(([^)]*)\)'/.exec(js)
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : null
}

export function parseSanctionedConst(js) {
  const m = /const\s+SANCTIONED\s*=\s*\[([^\]]*)\]/.exec(js)
  return m ? listFrom(m[1]) : null
}

// phase6 asserts on the digest-keyed trio via repeated array literals AND
// hardcoded counts. Both must track the catalog.
export function parsePhase6DigestArrays(js) {
  const arrays = [...js.matchAll(/\[\s*('(?:visual|audio|hook|inspection|speech|[a-z_]+)'(?:\s*,\s*'[a-z_]+')*)\s*\]\.every\(/g)]
    .map((m) => listFrom(m[1]))
  return arrays.length ? arrays : null
}

export function parsePhase6Counts(js) {
  const counts = []
  for (const re of [/recEv\.length\s*===\s*(\d+)/, /reused\.length\s*===\s*(\d+)/]) {
    const m = re.exec(js)
    if (!m) return null
    counts.push(Number(m[1]))
  }
  return counts
}

export function parseTsDigestSets(path, ts) {
  const sets = []
  if (path.endsWith('editorAnalyze.ts')) {
    const m = /component:\s*((?:'[a-z_]+'\s*\|\s*)*'[a-z_]+')/.exec(ts)
    if (m) sets.push(listFrom(m[1]))
  }
  if (path.endsWith('editorDirector.ts')) {
    // `as const)` is the closing anchor, so a greedy match to it is safe and
    // survives the pairs being reordered or wrapped across lines.
    const m = /for\s*\(const\s*\[name,\s*comp\]\s*of\s*\[(.*)\]\s*as const\)/s.exec(ts)
    if (m) sets.push([...m[1].matchAll(/\['([a-z_]+)',/g)].map((x) => x[1]))
  }
  if (path.endsWith('directorContract.ts') || path.endsWith('director.ts')) {
    const m = /requireKeys\(\s*cd\s*,\s*\[([^\]]*)\]/.exec(ts)
    if (m) sets.push(listFrom(m[1]))
  }
  return sets.length ? sets : null
}

// --- the guard -----------------------------------------------------------

const same = (a, b) => a && b && a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')
const show = (a) => (a ? `[${[...a].sort().join(', ')}]` : '(anchor not found)')

/**
 * files: { path: contents }, plus `migrations: {name: sql}` for the directory.
 * Returns an array of human-readable reasons; empty means the sites agree.
 */
export function evaluate(catalog, files, migrations) {
  const reasons = []
  const all = catalog.components.map((c) => c.name)
  const digest = catalog.components.filter((c) => c.digestKeyed).map((c) => c.name)
  const consumed = catalog.components.filter((c) => c.consumedByDirector).map((c) => c.name)

  if (all.length === 0) reasons.push('catalog declares zero components — that is never right, failing closed')
  if (new Set(all).size !== all.length) reasons.push('catalog declares a duplicate component name')

  // The LAST migration that states each thing is the one in force. Reading the
  // latest definer rather than a pinned filename is what lets a new migration
  // (0100) legitimately change the contract without editing this guard.
  const names = Object.keys(migrations).sort()
  const latest = (pred) => names.filter((n) => pred(migrations[n])).pop() ?? null

  // 1. the bounding CHECK constraint
  const checkFile = latest((s) => parseCheckConstraint(s) !== null)
  if (!checkFile) {
    reasons.push(`no migration states the media_analyses component CHECK — REQUIRED anchor missing (fail closed)`)
  } else {
    const got = parseCheckConstraint(migrations[checkFile])
    if (!same(got, all)) reasons.push(`${MIGRATIONS_DIR}/${checkFile}: component CHECK is ${show(got)}, catalog says ${show(all)}`)
  }

  // 2 + 3. editor_record_analysis's digest guard and its cap CASE
  const fnFile = latest((s) => /function\s+(public\.)?editor_record_analysis/i.test(s) && /cap\s*:=\s*case/i.test(s))
  if (!fnFile) {
    reasons.push(`no migration defines editor_record_analysis with a cap CASE — REQUIRED anchor missing (fail closed)`)
  } else {
    const sql = migrations[fnFile]
    const got = parseDigestGuard(sql)
    if (!same(got, digest)) reasons.push(`${MIGRATIONS_DIR}/${fnFile}: digest-keyed guard is ${show(got)}, catalog says ${show(digest)}`)

    const capCase = parseCapCase(sql)
    if (!capCase) {
      reasons.push(`${MIGRATIONS_DIR}/${fnFile}: cap CASE unparseable — REQUIRED anchor missing (fail closed)`)
    } else {
      if (capCase.fallback !== catalog.recordAnalysisDefaultCapBytes) {
        reasons.push(`${MIGRATIONS_DIR}/${fnFile}: cap CASE else-branch is ${capCase.fallback} bytes, catalog declares ${catalog.recordAnalysisDefaultCapBytes}`)
      }
      // THE CAP TRAP. Compare the cap the CASE would really produce against the
      // one the catalog declares, so a component silently inheriting the else
      // branch is caught here rather than as a permanent component_too_large.
      for (const c of catalog.components) {
        if (!c.digestKeyed) continue
        const eff = effectiveCap(capCase, c.name)
        if (eff !== c.maxResultBytes) {
          const how = Object.prototype.hasOwnProperty.call(capCase.explicit, c.name)
            ? `an explicit branch of ${eff}`
            : `NO branch of its own, so it silently inherits the else default of ${eff}`
          reasons.push(
            `${MIGRATIONS_DIR}/${fnFile}: component '${c.name}' has ${how} bytes, but the catalog declares ${c.maxResultBytes}. ` +
            `component_too_large is PERMANENT (no retry) — give '${c.name}' its own branch in the cap CASE, or correct the catalog.`)
        }
      }
    }
  }

  // 4. the staging matrix's hand-picked migration list
  const wf = files[WORKFLOW]
  if (wf == null) {
    reasons.push(`${WORKFLOW}: REQUIRED file missing (fail closed)`)
  } else {
    // ONLY the apply loop counts, never the surrounding prose. That file
    // explains at length which migrations it deliberately does NOT apply
    // (0095 is left to Track C's lane), and a comment naming a migration must
    // not read as applying it — that is the difference between documenting an
    // omission and fixing it.
    const applied = parseAppliedMigrations(wf)
    if (applied === null) {
      reasons.push(`${WORKFLOW}: the migration apply loop ("for f in 0090_… ; do") was not found — REQUIRED anchor missing (fail closed)`)
    } else for (const n of names) {
      const num = migrationNumber(n)
      if (num == null || num <= catalog.stagingMigrationBaseline) continue
      if (!touchesComponentContract(migrations[n])) continue
      if (!applied.has(num)) {
        reasons.push(
          `${WORKFLOW}: migration ${n} changes the component contract but is not in the matrix's apply list. ` +
          `Staging would run against a schema that does not match this checkout, and the failure would look unrelated.`)
      }
    }
  }

  // 5-8. the staging-integration phase scripts
  for (const [path, parse, expected, label] of [
    [PHASE3, parseNotInFilter, all, 'sanctioned-component filter'],
    [PHASE4, parseNotInFilter, all, 'sanctioned-component filter'],
    [PHASE5, parseSanctionedConst, all, 'SANCTIONED const'],
  ]) {
    const c = files[path]
    if (c == null) { reasons.push(`${path}: REQUIRED file missing (fail closed)`); continue }
    const got = parse(c)
    if (got === null) reasons.push(`${path}: ${label} anchor not found — REQUIRED (fail closed)`)
    else if (!same(got, expected)) reasons.push(`${path}: ${label} is ${show(got)}, catalog says ${show(expected)}`)
  }

  const p6 = files[PHASE6]
  if (p6 == null) {
    reasons.push(`${PHASE6}: REQUIRED file missing (fail closed)`)
  } else {
    const arrays = parsePhase6DigestArrays(p6)
    if (arrays === null) reasons.push(`${PHASE6}: digest-component array anchors not found — REQUIRED (fail closed)`)
    else for (const a of arrays) {
      if (!same(a, digest)) reasons.push(`${PHASE6}: asserts over ${show(a)}, catalog says the digest-keyed set is ${show(digest)}`)
    }
    const counts = parsePhase6Counts(p6)
    if (counts === null) reasons.push(`${PHASE6}: hardcoded digest-component counts not found — REQUIRED (fail closed)`)
    else for (const n of counts) {
      if (n !== digest.length) reasons.push(`${PHASE6}: expects ${n} digest components, catalog says ${digest.length}`)
    }
  }

  // 9-12. the TypeScript sites. editorDirector tracks the CONSUMED set, not the
  // stored one — a component can be recorded long before anything reads it, and
  // that gap is declared in the catalog rather than inferred from a diff.
  for (const path of TS_SITES) {
    const c = files[path]
    if (c == null) { reasons.push(`${path}: REQUIRED file missing (fail closed)`); continue }
    const isDirector = path.endsWith('editorDirector.ts')
    const want = isDirector ? consumed : digest
    const axis = isDirector ? 'consumedByDirector' : 'digest-keyed'
    const sets = parseTsDigestSets(path, c)
    if (sets === null) reasons.push(`${path}: ${axis} set anchor not found — REQUIRED (fail closed)`)
    else for (const s of sets) {
      if (!same(s, want)) reasons.push(`${path}: ${axis} set is ${show(s)}, catalog says ${show(want)}`)
    }
  }

  // A component the Director consumes but nobody stores is incoherent in a way
  // no single site can see.
  for (const c of catalog.components) {
    if (c.consumedByDirector && !c.digestKeyed) {
      reasons.push(`catalog: '${c.name}' is consumedByDirector but not digestKeyed — the Director would read evidence nothing writes`)
    }
  }

  return reasons
}

// --- selftest ------------------------------------------------------------

function selftest() {
  let failed = 0
  const ok = (cond, msg) => { if (!cond) { console.error(`SELFTEST FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }

  const catalog = {
    components: [
      { name: 'inspection', digestKeyed: false, consumedByDirector: false, maxResultBytes: null },
      { name: 'speech', digestKeyed: false, consumedByDirector: false, maxResultBytes: null },
      { name: 'visual', digestKeyed: true, consumedByDirector: true, maxResultBytes: 262144 },
      { name: 'audio', digestKeyed: true, consumedByDirector: true, maxResultBytes: 65536 },
      { name: 'hook', digestKeyed: true, consumedByDirector: true, maxResultBytes: 16384 },
    ],
    recordAnalysisDefaultCapBytes: 16384,
    stagingMigrationBaseline: 89,
  }
  const CHECK = `alter table public.media_analyses
  add constraint media_analyses_component_bounded
  check (component in ('inspection', 'speech', 'visual', 'audio', 'hook'));`
  const FN = `create or replace function public.editor_record_analysis(...)
  if p_component not in ('visual','audio','hook') then
    raise exception 'nope';
  end if;
  cap := case p_component when 'visual' then 262144 when 'audio' then 65536 else 16384 end;`
  const migrations = () => ({ '0083_bounds.sql': CHECK, '0087_writers.sql': FN })
  const files = () => ({
    [WORKFLOW]: 'for f in 0090_a 0091_b; do psql; done',
    [PHASE3]: `.not('component', 'in', '("inspection","speech","visual","audio","hook")')`,
    [PHASE4]: `.not('component', 'in', '("inspection","speech","visual","audio","hook")')`,
    [PHASE5]: `const SANCTIONED = ['inspection', 'speech', 'visual', 'audio', 'hook']`,
    [PHASE6]: `['visual', 'audio', 'hook'].every((c) => x)\nrecEv.length === 3\nreused.length === 3\n['visual', 'audio', 'hook'].every((c) => y)`,
    'worker/src/jobs/editorAnalyze.ts': `component: 'visual' | 'audio' | 'hook', schemaVersion: number`,
    'worker/src/jobs/editorDirector.ts': `for (const [name, comp] of [['visual', visual], ['audio', audio], ['hook', hook]] as const) {`,
    'worker/src/jobs/directorContract.ts': `requireKeys(cd, ['visual', 'audio', 'hook'], 'identity.componentDigests')`,
    'packages/shared/src/editor/director.ts': `requireKeys(cd, ['visual', 'audio', 'hook'], 'identity.componentDigests')`,
  })

  // --- the agreeing baseline must be silent, or nothing below means anything
  ok(evaluate(catalog, files(), migrations()).length === 0,
    'CONTROL: a fully agreeing set of sites produces zero findings')

  // --- each site, disagreed with one at a time ---------------------------
  const one = (mutate, label, match) => {
    const f = files(); const m = migrations()
    mutate(f, m)
    const r = evaluate(catalog, f, m)
    ok(r.length > 0 && r.some((x) => match.test(x)), `${label} → caught (${r[0]?.slice(0, 90) ?? 'NOTHING'})`)
  }

  one((f, m) => { m['0083_bounds.sql'] = CHECK.replace("'hook'", "'hook', 'alignment'") },
    'a component added to the CHECK but not the catalog', /component CHECK is/)
  one((f, m) => { m['0087_writers.sql'] = FN.replace("'visual','audio','hook'", "'visual','audio'") },
    'a component dropped from the digest guard', /digest-keyed guard is/)
  one((f) => { f[PHASE3] = f[PHASE3].replace(',"hook"', '') },
    'phase3 filter out of step', /phase3.*filter is/)
  one((f) => { f[PHASE4] = f[PHASE4].replace(',"speech"', '') },
    'phase4 filter out of step', /phase4.*filter is/)
  one((f) => { f[PHASE5] = f[PHASE5].replace(", 'hook'", '') },
    'phase5 SANCTIONED out of step', /phase5.*SANCTIONED const is/)
  one((f) => { f[PHASE6] = f[PHASE6].replace(/recEv\.length === 3/, 'recEv.length === 4') },
    'phase6 count out of step', /expects 4 digest components/)
  one((f) => { f[PHASE6] = f[PHASE6].replace(/\['visual', 'audio', 'hook'\]\.every\(\(c\) => x\)/, `['visual', 'audio'].every((c) => x)`) },
    'phase6 digest array out of step', /asserts over/)
  // editorDirector reports against the consumedByDirector axis, the rest
  // against digest-keyed; either way an out-of-step site must be named.
  for (const p of TS_SITES) {
    one((f) => { f[p] = f[p].replace(/hook/g, 'alignment') }, `${p} out of step`, /(digest-keyed|consumedByDirector) set is/)
  }

  // --- THE CAP TRAP, the failure this guard exists for -------------------
  {
    const c = JSON.parse(JSON.stringify(catalog))
    c.components.push({ name: 'alignment', digestKeyed: true, consumedByDirector: false, maxResultBytes: 524288 })
    const m = migrations()
    // The realistic near-miss: alignment IS registered everywhere, but nobody
    // gave it a branch in the cap CASE, so it inherits 16 KiB.
    m['0087_writers.sql'] = FN.replace("'visual','audio','hook'", "'visual','audio','hook','alignment'")
    m['0083_bounds.sql'] = CHECK.replace("'hook'", "'hook', 'alignment'")
    const r = evaluate(c, files(), m)
    ok(r.some((x) => /silently inherits the else default of 16384/.test(x)),
      'CAP TRAP: a new component with no branch of its own is caught, naming the 16 KiB it would silently inherit')
    ok(r.some((x) => /PERMANENT/.test(x)),
      '…and says component_too_large is permanent, so the reader knows it is not a flake')
  }
  {
    // The same component WITH its own branch, and the catalog agreeing, is fine.
    const c = JSON.parse(JSON.stringify(catalog))
    c.components.push({ name: 'alignment', digestKeyed: true, consumedByDirector: true, maxResultBytes: 524288 })
    const m = migrations()
    m['0083_bounds.sql'] = CHECK.replace("'hook'", "'hook', 'alignment'")
    m['0087_writers.sql'] = FN
      .replace("'visual','audio','hook'", "'visual','audio','hook','alignment'")
      .replace('else 16384', "when 'alignment' then 524288 else 16384")
    const f = files()
    f[PHASE3] = f[PHASE3].replace('"hook"', '"hook","alignment"')
    f[PHASE4] = f[PHASE4].replace('"hook"', '"hook","alignment"')
    f[PHASE5] = f[PHASE5].replace("'hook'", "'hook', 'alignment'")
    f[PHASE6] = f[PHASE6].replace(/'visual', 'audio', 'hook'/g, "'visual', 'audio', 'hook', 'alignment'")
      .replace(/=== 3/g, '=== 4')
    for (const p of TS_SITES) f[p] = f[p].replace(/'hook'/, "'hook' | 'alignment'").replace(/\['hook', hook\]/, "['hook', hook], ['alignment', alignment]")
    // directorContract/director use a plain list, editorAnalyze a union
    f['worker/src/jobs/directorContract.ts'] = `requireKeys(cd, ['visual', 'audio', 'hook', 'alignment'], 'x')`
    f['packages/shared/src/editor/director.ts'] = `requireKeys(cd, ['visual', 'audio', 'hook', 'alignment'], 'x')`
    f['worker/src/jobs/editorDirector.ts'] = `for (const [name, comp] of [['visual', visual], ['audio', audio], ['hook', hook], ['alignment', alignment]] as const) {`
    ok(evaluate(c, f, m).length === 0,
      'CONTROL: alignment registered EVERYWHERE, with its own cap branch, is silent — the guard is satisfiable')
  }

  // --- STORED vs CONSUMED are different sets ------------------------------
  // This distinction is not hypothetical: #242 registered alignment across
  // thirteen sites and deliberately left editorDirector's iteration alone,
  // because storing the evidence and reading it are separate plan items. A
  // guard that assumed one set would have demanded a change the author was
  // right to omit — and the half-wiring the plan warns against.
  {
    const c = JSON.parse(JSON.stringify(catalog))
    c.components.push({ name: 'alignment', digestKeyed: true, consumedByDirector: false, maxResultBytes: 524288 })
    const m = migrations()
    m['0083_bounds.sql'] = CHECK.replace("'hook'", "'hook', 'alignment'")
    m['0087_writers.sql'] = FN
      .replace("'visual','audio','hook'", "'visual','audio','hook','alignment'")
      .replace('else 16384', "when 'alignment' then 524288 else 16384")
    const f = files()
    f[PHASE3] = f[PHASE3].replace('"hook"', '"hook","alignment"')
    f[PHASE4] = f[PHASE4].replace('"hook"', '"hook","alignment"')
    f[PHASE5] = f[PHASE5].replace("'hook'", "'hook', 'alignment'")
    f[PHASE6] = f[PHASE6].replace(/'visual', 'audio', 'hook'/g, "'visual', 'audio', 'hook', 'alignment'").replace(/=== 3/g, '=== 4')
    f['worker/src/jobs/editorAnalyze.ts'] = `component: 'visual' | 'audio' | 'hook' | 'alignment', schemaVersion: number`
    f['worker/src/jobs/directorContract.ts'] = `requireKeys(cd, ['visual', 'audio', 'hook', 'alignment'], 'x')`
    f['packages/shared/src/editor/director.ts'] = `requireKeys(cd, ['visual', 'audio', 'hook', 'alignment'], 'x')`
    // editorDirector deliberately UNCHANGED — alignment is stored, not consumed.
    ok(evaluate(c, f, m).length === 0,
      'STORED-NOT-CONSUMED: a component wired everywhere but absent from the Director iteration is silent when the catalog declares consumedByDirector=false')

    // …and the moment the catalog says it IS consumed, the missing site is named.
    const c2 = JSON.parse(JSON.stringify(c))
    c2.components.at(-1).consumedByDirector = true
    const r = evaluate(c2, f, m)
    ok(r.some((x) => /editorDirector\.ts: consumedByDirector set is/.test(x)),
      '…and flipping consumedByDirector to true immediately names editorDirector as the site that must change')
  }
  {
    const c = JSON.parse(JSON.stringify(catalog))
    c.components.push({ name: 'ghost', digestKeyed: false, consumedByDirector: true, maxResultBytes: null })
    ok(evaluate(c, files(), migrations()).some((x) => /the Director would read evidence nothing writes/.test(x)),
      'a component consumed but never stored is incoherent and is caught in the catalog itself')
  }

  // --- the migration-list check -----------------------------------------
  {
    const m = migrations()
    m['0100_alignment.sql'] = FN   // > baseline, redefines the writer
    const r = evaluate(catalog, files(), m)
    ok(r.some((x) => /not in the matrix's apply list/.test(x)),
      'a contract-touching migration above the baseline that staging never applies is caught')
    const f2 = files()
    f2[WORKFLOW] = 'for f in 0090_a 0100_alignment; do psql; done'
    ok(!evaluate(catalog, f2, m).some((x) => /apply list/.test(x)),
      '…and is silent once the workflow actually applies it')

    // The near-miss that a whole-file grep would wave through: that workflow
    // documents its deliberate OMISSIONS by name, so a migration mentioned only
    // in prose must still count as not applied.
    const f3 = files()
    f3[WORKFLOW] = '# NOT ADDED: 0100_register_alignment_component, left to another lane.\nfor f in 0090_a; do psql; done'
    ok(evaluate(catalog, f3, m).some((x) => /not in the matrix's apply list/.test(x)),
      'a migration named only in a COMMENT does not count as applied — documenting an omission is not fixing it')

    const f4 = files()
    f4[WORKFLOW] = 'psql -f whatever.sql'
    ok(evaluate(catalog, f4, m).some((x) => /apply loop.*not found/.test(x)),
      'FAIL CLOSED: the apply loop vanishing is a failure, not an empty allowlist that passes')
  }
  {
    const m = migrations()
    m['0095_creative_transfer_lineage.sql'] = 'create table lineage(x int);'
    ok(!evaluate(catalog, files(), m).some((x) => /apply list/.test(x)),
      'CONTROL: a migration that does NOT touch the component contract is not demanded (0095 stays Track C\'s lane)')
    const m2 = migrations()
    m2['0085_speech.sql'] = CHECK   // below the baseline
    ok(!evaluate(catalog, files(), m2).some((x) => /apply list/.test(x)),
      'CONTROL: a contract migration BELOW the staging baseline is assumed already applied')
  }

  // --- fail closed on missing anchors -----------------------------------
  for (const [label, mutate] of [
    ['the CHECK constraint disappears', (f, m) => { delete m['0083_bounds.sql'] }],
    ['editor_record_analysis disappears', (f, m) => { delete m['0087_writers.sql'] }],
    ['the cap CASE is restructured beyond recognition', (f, m) => { m['0087_writers.sql'] = FN.replace(/cap := case.*$/s, 'cap := lookup(p_component);') }],
    ['a phase script is deleted', (f) => { delete f[PHASE5] }],
    ['a TS site is deleted', (f) => { delete f['worker/src/jobs/editorAnalyze.ts'] }],
    ['the workflow is deleted', (f) => { delete f[WORKFLOW] }],
    ['phase6 loses its count assertions', (f) => { f[PHASE6] = f[PHASE6].replace(/recEv\.length === 3/, 'recEv.length > 0') }],
  ]) {
    const f = files(); const m = migrations()
    mutate(f, m)
    ok(evaluate(catalog, f, m).length > 0, `FAIL CLOSED: ${label} → failure, never a silent pass`)
  }

  // --- catalog sanity ----------------------------------------------------
  ok(evaluate({ ...catalog, components: [] }, files(), migrations()).length > 0, 'an empty catalog fails rather than vacuously passing')
  ok(evaluate({ ...catalog, components: [...catalog.components, catalog.components[0]] }, files(), migrations())
    .some((x) => /duplicate/.test(x)), 'a duplicated component name in the catalog is caught')

  if (failed) { console.error(`\ncheck_analysis_components selftest: ${failed} failure(s)`); process.exit(1) }
  console.log('\ncheck_analysis_components selftest: all cases passed')
}

// --- entrypoint ----------------------------------------------------------

function readAll() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  const migrations = {}
  for (const n of readdirSync(MIGRATIONS_DIR)) {
    if (n.endsWith('.sql')) migrations[n] = readFileSync(`${MIGRATIONS_DIR}/${n}`, 'utf8')
  }
  const files = {}
  for (const p of [WORKFLOW, PHASE3, PHASE4, PHASE5, PHASE6, ...TS_SITES]) {
    try { files[p] = readFileSync(p, 'utf8') } catch { /* missing → evaluate() fails closed */ }
  }
  return { catalog, files, migrations }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    selftest()
  } else {
    const { catalog, files, migrations } = readAll()
    const reasons = evaluate(catalog, files, migrations)
    const names = catalog.components.map((c) => c.name)
    const digest = catalog.components.filter((c) => c.digestKeyed).map((c) => c.name)
    if (reasons.length) {
      console.error(`::error::The analysis-component namespace disagrees with ${CATALOG_PATH} in ${reasons.length} place(s):`)
      for (const r of reasons) console.error(`  - ${r}`)
      console.error(`\nThe catalog is the single source of truth. Change it first, then make every site agree.`)
      process.exit(1)
    }
    console.log(`analysis-components guard: OK — ${names.length} components (${names.join(', ')}), ${digest.length} digest-keyed (${digest.join(', ')}); all 12 sites agree`)
  }
}

#!/usr/bin/env node
// THE READER `referenceAssessment` WAS WRITTEN FOR AND NEVER GOT.
//
// ⚠️ 0106 ADDED THREE COLUMNS TO `gallery_items` AND NOTHING HAS EVER WRITTEN
// ONE. Measured 2026-09-05: 14,712 cards, `requires_filming_objects` null in
// all 14,712, `requires_screen_recording` null in all 14,712,
// `requirements_source` null in all 14,712. The gallery ranks on niche alone.
//
// ⚠️ THE COLUMN NAMES DRIFTED FROM THE PROSE AND THAT COST A GREP. §7a calls
// these signals `production_mode_match` and `recreate_feasibility`, and
// referenceAssessment.ts's header still uses those names. NEITHER EXISTS in the
// database. Searching for the documented name returns nothing, which reads
// exactly like "this was never built" — so both names are written here, once,
// together: the concepts are production_mode_match / recreate_feasibility, the
// COLUMNS are requires_filming_objects / requires_screen_recording /
// requirements_source.
//
// ── WHY A SCRIPT AND NOT A SQL UPDATE ─────────────────────────────────────
//
// ⚖️ THE MARKER LISTS STAY THE ONLY AUTHORITY. Re-expressing OBJECT_MARKERS and
// SCREEN_MARKERS as SQL `like` clauses would put the rule in a second place, and
// the two would drift the first time a marker was added — the defect this repo
// has now paid for in the refund rule and the claims question. So the real
// `assessFromText` is bundled from source and IT decides. The only SQL this
// emits is a candidate filter GENERATED from those same lists, never hand-typed.
//
// ── WHAT IT REFUSES TO DO ─────────────────────────────────────────────────
//
// ⚖️ A NULL IS NEVER WRITTEN OVER A NULL. `isConclusive` gates every write: a
// card the text cannot settle stays visibly unassessed rather than being stamped
// "looked at" and hidden from the vision pass that could actually answer it.
// Measured yield is 463 of 14,712 (3.15%) — this is a converter for the cards
// that ANNOUNCE what they are, not an assessor of the gallery.
//
// ⚠️ AND ZERO SCREEN-RECORDING MATCHES IS A REAL ANSWER, NOT A BROKEN LIST.
// 37 cards contain the word "screen" and none is a screen recording: screen
// heels, "everytime he's on screen", 1989 laptop screens, dots on a screen.
// `dashboard` appears zero times in the entire corpus. The list is correctly
// silent, which is what NON_MARKERS exists to protect.
//
//   node scripts/qa/gallery-requirements-backfill.mjs --selftest
//   node scripts/qa/gallery-requirements-backfill.mjs --candidate-sql
//   node scripts/qa/gallery-requirements-backfill.mjs --decide < rows.json
import { build } from 'esbuild'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const out = join(mkdtempSync(join(tmpdir(), 'galreq-')), 'm.mjs')
await build({
  entryPoints: [join(REPO, 'packages/shared/src/referenceAssessment.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
})
const M = await import(pathToFileURL(out).href)
const { assessFromText, isConclusive, NON_MARKERS } = M

/** ⚠️ READ OFF THE BUNDLED MODULE, NOT RETYPED. The candidate SQL below is
 *  generated from whatever the shared file currently says; adding a marker
 *  there widens the filter here with no second edit. */
const markersOf = (fn) => {
  // The lists are module-private, so they are recovered by probing the real
  // function rather than by importing them — which also proves the probe and
  // the writer agree, since a marker that did not fire would not appear.
  const src = readFileSync(join(REPO, 'packages/shared/src/referenceAssessment.ts'), 'utf8')
  const at = src.indexOf(`const ${fn}`)
  if (at === -1) throw new Error(`marker list ${fn} not found`)
  // ⚠️ CUT FROM `= [`, AND CLOSE ON A BRACKET AT THE START OF A LINE. The first
  // version sliced to `indexOf(']')` and landed inside `readonly string[]` — the
  // declaration's OWN type annotation — extracting nothing and generating a
  // candidate filter with zero clauses. The selftest caught it, which is the
  // only reason it is not in the commit. Same trap the community-surface parity
  // guard paid for, three files apart.
  const open = src.indexOf('= [', at)
  const close = src.indexOf('\n]', open)
  if (open === -1 || close === -1) throw new Error(`marker list ${fn} is not a bracketed literal`)
  const list = [...src.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (list.length === 0) throw new Error(`marker list ${fn} parsed empty`)
  return list
}
const OBJECT = markersOf('OBJECT_MARKERS')
const SCREEN = markersOf('SCREEN_MARKERS')

const esc = (s) => s.replace(/'/g, "''")
const candidateSql = () => {
  const all = [...OBJECT, ...SCREEN]
  const clauses = all.map((m) => `t like '%${esc(m)}%'`).join('\n     or ')
  return `-- GENERATED from OBJECT_MARKERS + SCREEN_MARKERS (${all.length} markers). Do not hand-edit.\n`
    + `select id, title, why from public.gallery_items,\n`
    + `  lateral (select lower(coalesce(title,'') || ' ' || coalesce(why,'')) as t) x\n`
    + ` where requirements_source is null\n   and (${clauses});`
}

if (process.argv.includes('--selftest')) {
  let bad = 0
  const eq = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      console.error(`selftest: ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); bad++
    }
  }
  eq('marker lists recovered', [OBJECT.length > 10, SCREEN.length > 5], [true, true])
  eq('an unboxing card concludes filming',
    isConclusive(assessFromText({ title: 'unboxing the new one', why: '' })), true)
  eq('and says which', assessFromText({ title: 'unboxing', why: '' }).requiresFilmingObjects, true)
  // ⚠️ NULL, NEVER FALSE. "we could not tell" and "it does not need it" are
  // different answers and only null says the first.
  eq('an unreadable card concludes nothing',
    assessFromText({ title: '', why: '' }).requiresFilmingObjects, null)
  eq('and is not written', isConclusive(assessFromText({ title: '', why: '' })), false)
  // ⚠️ THE WORDS THAT LOOK LIKE MARKERS. If any of these ever concludes, the
  // backfill would stamp thousands of cards on a word that means nothing.
  for (const w of NON_MARKERS) {
    if (isConclusive(assessFromText({ title: w, why: '' }))) {
      console.error(`selftest: NON_MARKER "${w}" concluded — it must not`); bad++
    }
  }
  // The real corpus's "screen" cards, verbatim shapes, must stay silent.
  for (const t of ['screen heels prototype', "just screaming everytime he's on screen",
    'laptop computers still had tiny screens', 'a flat 2D pattern of moving dots on a screen']) {
    if (isConclusive(assessFromText({ title: t, why: '' }))) {
      console.error(`selftest: corpus phrase concluded: "${t}"`); bad++
    }
  }
  eq('candidate sql filters to unwritten rows', candidateSql().includes('requirements_source is null'), true)
  if (bad) { console.error(`gallery-requirements backfill selftest: ${bad} FAILED`); process.exit(1) }
  console.log(`gallery-requirements backfill selftest: OK `
    + `(${OBJECT.length} object + ${SCREEN.length} screen markers, ${NON_MARKERS.length} non-markers, 4 corpus phrases)`)
  process.exit(0)
}

if (process.argv.includes('--candidate-sql')) { console.log(candidateSql()); process.exit(0) }

if (process.argv.includes('--decide')) {
  const rows = JSON.parse(readFileSync(0, 'utf8'))
  if (!Array.isArray(rows)) { console.error('--decide expects a JSON array of {id,title,why}'); process.exit(1) }
  const writes = []
  for (const r of rows) {
    const a = assessFromText({ title: r.title, why: r.why })
    if (!isConclusive(a)) continue
    writes.push({ id: r.id, requires_filming_objects: a.requiresFilmingObjects,
      requires_screen_recording: a.requiresScreenRecording,
      requirements_source: a.source, evidence: a.evidence })
  }
  console.log(JSON.stringify({
    considered: rows.length,
    conclusive: writes.length,
    skippedAsUnreadable: rows.length - writes.length,
    writes,
    whatThisDoesNotEstablish: [
      'A card that concludes nothing is NOT recorded as needing nothing — it stays null.',
      'Text markers only. A card that shows a product without naming it is invisible here.',
      'requires_screen_recording has never once been concluded on this corpus (0 of 14,712).',
    ],
  }, null, 2))
  process.exit(0)
}

console.error('one of --selftest | --candidate-sql | --decide required')
process.exit(1)

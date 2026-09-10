// FILL gallery_items.caption_shape FROM THE CLASSIFIER THAT HAD NOWHERE TO WRITE.
//
// ⚠️ WHY A SCRIPT AND NOT A WORKER JOB — this was built as a worker job first
// and the job was wrong. `worker/src/jobs/directorContract.ts:8` states the
// rule: "NEVER import @twinai/shared from a worker file" — the worker is
// self-contained with no shared runtime dependency because of how its Docker
// image is built. Edge functions cannot import it either;
// `generate-blueprint/index.ts:1853` mirrors `communityMap.ts` by hand for
// exactly that reason.
//
// ⚖️ SO THE ONLY WAY TO RUN THE REAL CLASSIFIER IS TO RUN IT WHERE IT LIVES.
// The alternative is a second copy of eight regexes in the worker behind a
// parity test — the repository's established pattern, and the wrong trade here:
// 0196's own header warns that a corpus quietly mixing two vocabularies is
// unrecoverable, and two copies of a pattern set is how that starts. A script
// in this workspace imports the module itself, so there is exactly one
// vocabulary and no parity test to keep honest.
//
// Run: node --experimental-strip-types scripts/backfill-caption-shapes.ts --selftest
//      node --experimental-strip-types scripts/backfill-caption-shapes.ts --plan rows.json
//
// ⚠️ IT WRITES NOTHING ITSELF. `--plan` reads rows and prints the classification
// as JSON for an authorised writer to apply. This script never holds a
// service-role key and never opens a connection: the writes go through the
// operator's own authorised Supabase access. A backfill script that carried
// credentials would be a second place a production key has to live.

import { readFileSync, writeFileSync } from 'node:fs'
import { assessedCaptionShape, captionBody, isLikelyEnglish, CAPTION_SHAPE_VERSION, MIN_CLASSIFIABLE_CHARS, CAPTION_SHAPES }
  from '../packages/shared/src/corpus/captionShape.ts'

export type NoShapeReason = 'no_title' | 'empty_after_strip' | 'too_short' | 'not_english' | 'no_pattern_match'

export interface CaptionVerdict {
  shape: string | null
  basis: 'inferred' | null
  reason: NoShapeReason | null
}

/**
 * The gates in the order the measurement found them.
 *
 * ⚠️ A SHAPE AND A REASON ARE MUTUALLY EXCLUSIVE, and 0196 enforces that with a
 * CHECK rather than trusting this function. The database is the authority
 * because a second writer will eventually exist.
 */
export function classifyOne(title: string | null | undefined): CaptionVerdict {
  const t = (title ?? '').trim()
  if (!t) return { shape: null, basis: null, reason: 'no_title' }
  const body = captionBody(t)
  if (!body) return { shape: null, basis: null, reason: 'empty_after_strip' }
  // ⚠️ TOO SHORT AND WRONG-LANGUAGE ARE TWO FACTS AND `isLikelyEnglish` FOLDS
  // THEM. Its false is correct as a gate and useless as an explanation: without
  // this split a 10-character English caption is recorded as `not_english`,
  // which is a false fact in the column whose purpose is to be trustworthy.
  // This is the PR's own defect class, committed inside the PR that names it,
  // and its own selftest caught it on "How to win".
  if (body.length < MIN_CLASSIFIABLE_CHARS) return { shape: null, basis: null, reason: 'too_short' }
  if (!isLikelyEnglish(body)) return { shape: null, basis: null, reason: 'not_english' }
  const a = assessedCaptionShape(t)
  // ⚠️ NULL, NOT AN ASSESSED CARRYING A NULL VALUE. `assessedCaptionShape`
  // returns null outright when nothing matches — read off its own behaviour
  // after a first draft crashed on `.value`.
  const shape = a === null ? null : ((a as { value?: string | null }).value ?? null)
  if (!shape) return { shape: null, basis: null, reason: 'no_pattern_match' }
  return { shape, basis: 'inferred', reason: null }
}

/** The five column values 0196 expects for one row, including its provenance. */
export function rowUpdate(id: string, title: string | null | undefined, at: string) {
  const v = classifyOne(title)
  return {
    id,
    caption_shape: v.shape,
    caption_shape_basis: v.basis,
    caption_shape_reason: v.reason,
    caption_shape_version: CAPTION_SHAPE_VERSION,
    caption_shape_at: at,
  }
}

export function tallyOf(rows: ReadonlyArray<{ title?: string | null }>): Record<string, number> {
  const t: Record<string, number> = {}
  for (const r of rows) {
    const v = classifyOne(r.title)
    const k = v.shape ?? v.reason ?? 'unknown'
    t[k] = (t[k] ?? 0) + 1
  }
  return t
}

/**
 * One `UPDATE … FROM (VALUES …)` per batch, ready for an authorised writer.
 *
 * ⚠️ ONE STATEMENT PER BATCH, NOT ONE PER ROW. 16,343 single-row updates is
 * 16,343 round trips against an instance already short of IO budget; the same
 * work as eight statements is the difference between minutes and hours.
 *
 * ⚖️ AND IT NAMES THE VERSION IN THE WHERE CLAUSE, so re-running is safe: a row
 * already at this version is not rewritten, and a row that failed last time is
 * picked up. Idempotence comes from the version, not from remembering.
 */
export function planSql(rows: ReadonlyArray<{ id: string; title?: string | null }>, at: string): string {
  if (rows.length === 0) return ''
  // ⚠️ THE ESCAPING IS UNREACHABLE BY CONSTRUCTION AND STAYS ANYWAY. Every
  // value that reaches it is a shape, a basis, a reason or an ISO timestamp —
  // fixed vocabularies that cannot contain a quote — so removing it breaks no
  // test, which mutation-testing confirmed. It stays because it costs nothing
  // and the day someone emits a caption here it is the difference between a
  // broken statement and a working one. What actually PROTECTS this is the
  // vocabulary assertion in the selftest, not this line.
  const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`)
  const values = rows.map((r) => {
    const u = rowUpdate(r.id, r.title, at)
    return `('${u.id}'::uuid, ${q(u.caption_shape)}, ${q(u.caption_shape_basis)}, `
      + `${q(u.caption_shape_reason)}, ${u.caption_shape_version}, ${q(u.caption_shape_at)}::timestamptz)`
  }).join(',\n  ')
  return `update public.gallery_items g set
  caption_shape = v.shape,
  caption_shape_basis = v.basis,
  caption_shape_reason = v.reason,
  caption_shape_version = v.version,
  caption_shape_at = v.at
from (values
  ${values}
) as v(id, shape, basis, reason, version, at)
where g.id = v.id
  and (g.caption_shape_version is null or g.caption_shape_version < v.version);`
}

if (process.argv.includes('--plan')) {
  const file = process.argv[process.argv.indexOf('--plan') + 1]
  if (!file) { console.error('--plan needs a JSON file of [{id, title}]'); process.exit(2) }
  const rows = JSON.parse(readFileSync(file, 'utf8')) as Array<{ id: string; title?: string | null }>
  const at = new Date().toISOString()
  const size = 1500
  for (let i = 0; i < rows.length; i += size) {
    writeFileSync(`${file}.batch${String(i / size).padStart(2, '0')}.sql`, planSql(rows.slice(i, i + size), at))
  }
  console.error(JSON.stringify({ rows: rows.length, batches: Math.ceil(rows.length / size), tally: tallyOf(rows) }, null, 1))
  process.exit(0)
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const check = (what: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) { failed++; console.log(`  ✗ ${what} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
    else console.log(`  ✓ ${what}`)
  }

  check('no caption at all', classifyOne(null).reason, 'no_title')
  check('whitespace is no caption', classifyOne('   ').reason, 'no_title')
  // A creator DID write something; it carries no words to read. Not the same
  // fact as an empty caption, and 0196 stores the difference.
  check('hashtags and links only', classifyOne('#fyp #viral https://x.test @someone').reason, 'empty_after_strip')
  check('a non-Latin script stops before the patterns', classifyOne('घरसे शुरू करे ये नया business').reason, 'not_english')
  // ⚠️ THE SPLIT THIS SELFTEST FORCED. Short English is `too_short`, never
  // `not_english` — a wrong reason is worse than no reason, because a reader
  // acts on it.
  check('short English is too_short, NOT not_english', classifyOne('How to win').reason, 'too_short')
  check('a 12-char English body is judged, not refused for length',
    classifyOne('How to win it').reason === 'too_short', false)
  check('real English matching nothing is its OWN reason',
    classifyOne('Brisbane doing what it does best, lively streets and world class eats').reason, 'no_pattern_match')
  check('a shape carries its basis', classifyOne('How to build a landing page in one afternoon'),
    { shape: 'how_to', basis: 'inferred', reason: null })

  // ⚠️ THE INVARIANT 0196 ENFORCES, ASSERTED HERE TOO. A row carrying both, or
  // neither, is a row two readers can disagree about.
  const cases = [null, '   ', '#a #b', 'घरसे शुरू', 'Brisbane streets and eats are lively',
    'How to grow on TikTok', 'Stop doing this to your hair', '5 tips for better sleep',
    'Is this the best camera?', 'Nobody talks about this']
  let xor = true, basisMatches = true
  for (const c of cases) {
    const v = classifyOne(c)
    if (!((v.shape === null) !== (v.reason === null))) xor = false
    if ((v.basis !== null) !== (v.shape !== null)) basisMatches = false
  }
  check('exactly one of shape/reason, on every input', xor, true)
  check('a basis is present exactly when a shape is', basisMatches, true)

  // ⚠️ GERMAN IS THE MEASURED CASE AND IT IS RECORDED, NOT ENDORSED.
  // `isLikelyEnglish` is letter-based, so German passes it and lands in
  // `no_pattern_match` — 6.4% of bodies with text. Widening the language gate is
  // a separate decision on measured evidence; asserting the wish here would make
  // that decision silently.
  check('German reaches no_pattern_match, not not_english',
    classifyOne('Du verstehst Marketing nicht. Und das ist der Grund.').reason, 'no_pattern_match')

  // Every update carries its provenance, or 0196's is-attributed CHECK rejects it.
  const u = rowUpdate('abc', 'How to do it', '2026-09-10T00:00:00.000Z')
  check('a classified update carries basis, version and timestamp',
    [u.caption_shape_basis !== null, u.caption_shape_version === CAPTION_SHAPE_VERSION, u.caption_shape_at !== null],
    [true, true, true])
  check('an unclassified update still carries its version, so a re-run can skip it',
    rowUpdate('abc', null, '2026-09-10T00:00:00.000Z').caption_shape_version, CAPTION_SHAPE_VERSION)

  check('the tally counts shapes and reasons in one map',
    tallyOf([{ title: 'How to win big' }, { title: null }, { title: 'How to lose big' }]),
    { how_to: 2, no_title: 1 })

  // ⚠️ THE WHERE CLAUSE IS THE IDEMPOTENCE, and a plan without it would rewrite
  // every row on every run — including rows a later version already improved.
  const sql = planSql([{ id: '00000000-0000-0000-0000-000000000001', title: 'How to win big' }], '2026-09-10T00:00:00.000Z')
  check('the plan guards on the version', /caption_shape_version is null or g.caption_shape_version < v.version/.test(sql), true)
  check('the plan is ONE statement, not one per row', (sql.match(/^update /gm) ?? []).length, 1)
  // ⚠️ NO CAPTION TEXT REACHES THE SQL AT ALL, and this is the assertion that
  // says so. A first draft "tested" quote-escaping by checking that a caption
  // containing an apostrophe still classified — which asserted nothing, because
  // the caption is never emitted: only the shape, basis and reason are, and
  // those come from fixed vocabularies. Mutation-testing found it by removing
  // the escaping and watching the selftest pass. The real property is stronger
  // and worth pinning: a creator's words cannot break the statement, and no
  // prose lands in a SQL log.
  const quoted = planSql(
    [{ id: '00000000-0000-0000-0000-000000000002', title: "Don't do this to your hair -- drop table" }],
    '2026-09-10T00:00:00.000Z')
  check('the caption itself never appears in the SQL', quoted.includes('drop table'), false)
  check('the caption itself never appears in the SQL (apostrophe)', quoted.includes("Don't"), false)
  check('only the classification does', quoted.includes("'negative_command'"), true)

  // ⚖️ THIS IS THE ASSERTION THAT ACTUALLY GUARDS THE STATEMENT. Every quoted
  // literal the plan emits must come from a known vocabulary — the eight
  // shapes, the one basis, the five reasons, or an ISO timestamp. It fails the
  // moment a future edit lets creator text into the SQL, which is the only way
  // this statement can break.
  const KNOWN = new Set([...CAPTION_SHAPES as readonly string[], 'inferred',
    'no_title', 'empty_after_strip', 'too_short', 'not_english', 'no_pattern_match'])
  const sample = planSql([
    { id: '00000000-0000-0000-0000-000000000003', title: "Don't do this" },
    { id: '00000000-0000-0000-0000-000000000004', title: 'घरसे शुरू करे ये नया business' },
    { id: '00000000-0000-0000-0000-000000000005', title: null },
    { id: '00000000-0000-0000-0000-000000000006', title: '5 tips for better sleep tonight' },
  ], '2026-09-10T00:00:00.000Z')
  const literals = [...sample.matchAll(/'([^']*)'/g)].map((m) => m[1])
    .filter((v) => !/^[0-9a-f-]{36}$/.test(v) && !/^\d{4}-\d{2}-\d{2}T/.test(v))
  check('every emitted literal is from a known vocabulary',
    literals.filter((v) => !KNOWN.has(v)), [])
  check('an empty batch produces no statement', planSql([], '2026-09-10T00:00:00.000Z'), '')

  console.log(failed === 0 ? 'backfill-caption-shapes selftest OK' : `backfill-caption-shapes selftest FAILED (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

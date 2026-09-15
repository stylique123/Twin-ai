// AIM A MODEL AT THE FIRST CLAUSE, AND RECORD WHAT IT DECLINES.
//
// ⚠️ A SCRIPT, FOR THE REASON `backfill-caption-shapes.ts` ALREADY PAID FOR.
// The worker may not import `@twinai/shared` (`worker/src/jobs/directorContract
// .ts:8`), so a worker job would need a SECOND COPY of this taxonomy behind a
// parity test -- and 0196's header warns that a corpus quietly mixing two
// vocabularies is unrecoverable. A script in this workspace imports the real
// module, so there is exactly one vocabulary and no parity test to keep honest.
//
// ⚠️⚠️ AND IT HOLDS NO CREDENTIALS AND MAKES NO MODEL CALL. Both phases read a
// file and write files. The model call is run by whoever holds the key -- it
// lives on the worker VPS as `GEMINI_API_KEY` and does not belong in this
// environment. A backfill script carrying a production key would be a second
// place that key has to live, and this file is not it.
//
// Run: node --experimental-strip-types scripts/classify-caption-shapes-model.ts --prompts rows.json
//      node --experimental-strip-types scripts/classify-caption-shapes-model.ts --apply rows.json replies.txt
//
// PHASE 1 `--prompts` splits the rows three ways: those worth a model call get a
// numbered prompt file plus a manifest; those a gate refuses get their reason
// written straight to SQL, with NO spend; those already carrying a shape are
// skipped untouched.
//
// PHASE 2 `--apply` joins a reply file back onto the manifest and emits the SQL.
//
// ⚖️ THE REFUSALS SHIP WITHOUT WAITING FOR THE MODEL, and that is deliberate.
// Recording `not_a_hook` where today the column says `no_pattern_match` is a
// real gain in precision for zero cost: one says a filter declined to spend,
// the other says no model was ever asked. The owner's ruling on the editor
// applies -- its scoring waits for publishes, its inputs should not.

import { readFileSync, writeFileSync } from 'node:fs'
import {
  MODEL_SHAPE_VERSION, assessedModelShape, buildClassifyPrompt, parseVerdictLine,
  worthAModelRead,
} from '../packages/shared/src/corpus/captionShapeModel'

export interface InRow { id: string; title?: string | null; caption_shape?: string | null }

export interface RowUpdate {
  id: string
  caption_shape: string | null
  caption_shape_basis: 'inferred' | null
  caption_shape_reason: string | null
  caption_shape_version: number
  caption_shape_at: string
}

export interface Split {
  /** Rows worth a call, in prompt order. The manifest for phase 2. */
  ask: Array<{ id: string; clause: string }>
  /** Rows a gate refused. Written now; no model involved. */
  refused: RowUpdate[]
  /** Rows already carrying a shape from the pattern set. */
  skipped: string[]
}

/**
 * ⚠️ A ROW THAT ALREADY HAS A SHAPE IS NEVER TOUCHED. The pattern set is
 * cheaper, deterministic and auditable; a model read must not overwrite one.
 * The caller is expected to pass only unclassified rows, and this asserts it
 * rather than trusting the query -- the same reason 0196 put the shape/reason
 * exclusion in a CHECK instead of in the writer.
 */
export function split(rows: ReadonlyArray<InRow>, at: string): Split {
  const out: Split = { ask: [], refused: [], skipped: [] }
  for (const r of rows) {
    if (typeof r.caption_shape === 'string' && r.caption_shape.trim() !== '') {
      out.skipped.push(r.id)
      continue
    }
    const v = worthAModelRead(r.title)
    if (v.send) {
      out.ask.push({ id: r.id, clause: v.clause })
      continue
    }
    out.refused.push({
      id: r.id,
      caption_shape: null,
      caption_shape_basis: null,
      caption_shape_reason: v.reason,
      caption_shape_version: MODEL_SHAPE_VERSION,
      caption_shape_at: at,
    })
  }
  return out
}

/**
 * Join a reply file onto the manifest.
 *
 * ⚠️ THE LINE NUMBER IS NOT TRUSTED AS THE INDEX. A model that drops or
 * reorders a line would silently shift every label onto the wrong row, which is
 * worse than no labels at all -- a whole column of confident, misattributed
 * verdicts. So each reply must carry its own number and that number is what
 * joins; a line whose number is missing, unparseable or out of range is
 * discarded, and any manifest row with no matching reply is recorded
 * `model_unavailable` rather than left to look unasked.
 */
export function applyReplies(
  manifest: ReadonlyArray<{ id: string; clause: string }>,
  reply: string,
  at: string,
): RowUpdate[] {
  const byIndex = new Map<number, string>()
  for (const line of reply.split(/\r?\n/)) {
    const t = line.trim()
    if (t === '') continue
    const n = Number((t.split('|')[0] ?? '').trim())
    if (!Number.isInteger(n) || n < 1 || n > manifest.length) continue
    // ⚠️ FIRST REPLY WINS. A duplicated number is ambiguous, and taking the last
    // would let a trailing echo of the prompt overwrite a real answer.
    if (!byIndex.has(n)) byIndex.set(n, t)
  }
  return manifest.map((m, i) => {
    const line = byIndex.get(i + 1)
    if (line === undefined) {
      return {
        id: m.id, caption_shape: null, caption_shape_basis: null,
        caption_shape_reason: 'model_unavailable',
        caption_shape_version: MODEL_SHAPE_VERSION, caption_shape_at: at,
      }
    }
    const v = parseVerdictLine(line)
    if ('refusal' in v) {
      return {
        id: m.id, caption_shape: null, caption_shape_basis: null,
        caption_shape_reason: v.refusal,
        caption_shape_version: MODEL_SHAPE_VERSION, caption_shape_at: at,
      }
    }
    // ⚠️ THE BASIS COMES FROM THE MODULE, NOT FROM A LITERAL HERE. Writing
    // `basis: 'inferred'` in this file would be a SECOND place that decides what
    // a model read is worth, and the day someone adds a stronger basis for a
    // model the two disagree silently. `assessedModelShape` owns it, and 0213's
    // CHECK is the third party that refuses anything else.
    const a = assessedModelShape(v, at)
    // ⚠️ NARROWED ON `basis`, NEVER CAST. `Assessed<T>` is a discriminated union
    // whose `indeterminate` and `not_checked` arms carry NO `value`, so reading
    // `a.value` off the union is a type error -- and the repo's rule is that a
    // cast defeats the compiler. Caught by the test-typecheck ratchet, which
    // checks this file under stricter settings than the shared package does.
    //
    // ⚖️ AND ONLY `inferred` IS ACCEPTED, not merely "has a value". If a future
    // change let this module return `observed`, a caption read would be written
    // to the column as an observation of a hook nobody heard -- the exact
    // laundering `captionShape.ts` is named to prevent. 0213's CHECK refuses it
    // at the database too, so this is the second of two guards, not the only one.
    if (a === null || a.basis !== 'inferred') {
      return {
        id: m.id, caption_shape: null, caption_shape_basis: null,
        caption_shape_reason: 'model_reply_unreadable',
        caption_shape_version: MODEL_SHAPE_VERSION, caption_shape_at: at,
      }
    }
    return {
      id: m.id, caption_shape: a.value, caption_shape_basis: 'inferred',
      caption_shape_reason: null,
      caption_shape_version: MODEL_SHAPE_VERSION, caption_shape_at: at,
    }
  })
}

/**
 * One `UPDATE … FROM (VALUES …)` per batch, ready for an authorised writer.
 *
 * ⚖️ THE VERSION IS IN THE WHERE CLAUSE, so re-running is safe and idempotence
 * comes from the version rather than from remembering what ran.
 */
export function planSql(updates: ReadonlyArray<RowUpdate>): string {
  if (updates.length === 0) return ''
  const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`)
  const values = updates.map((u) =>
    `('${u.id}'::uuid, ${q(u.caption_shape)}, ${q(u.caption_shape_basis)}, `
    + `${q(u.caption_shape_reason)}, ${u.caption_shape_version}, ${q(u.caption_shape_at)}::timestamptz)`,
  ).join(',\n  ')
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
  and g.caption_shape is null
  and (g.caption_shape_version is null or g.caption_shape_version < v.version);`
}

export function tallyOf(updates: ReadonlyArray<RowUpdate>): Record<string, number> {
  const t: Record<string, number> = {}
  for (const u of updates) {
    const k = u.caption_shape ?? u.caption_shape_reason ?? 'unknown'
    t[k] = (t[k] ?? 0) + 1
  }
  return t
}

function readRows(file: string): InRow[] {
  return JSON.parse(readFileSync(file, 'utf8')) as InRow[]
}

if (process.argv.includes('--prompts')) {
  const file = process.argv[process.argv.indexOf('--prompts') + 1]
  if (!file) { console.error('--prompts needs a JSON file of [{id, title, caption_shape}]'); process.exit(2) }
  const at = new Date().toISOString()
  const s = split(readRows(file), at)
  const size = 200
  for (let i = 0; i < s.ask.length; i += size) {
    const batch = s.ask.slice(i, i + size)
    const n = String(i / size).padStart(2, '0')
    writeFileSync(`${file}.prompt${n}.txt`, buildClassifyPrompt(batch.map((b) => b.clause)))
    writeFileSync(`${file}.manifest${n}.json`, JSON.stringify(batch, null, 1))
  }
  if (s.refused.length) writeFileSync(`${file}.refused.sql`, planSql(s.refused))
  console.error(JSON.stringify({
    rows: s.ask.length + s.refused.length + s.skipped.length,
    ask: s.ask.length, refused: s.refused.length, skipped: s.skipped.length,
    prompts: Math.ceil(s.ask.length / size), refusedTally: tallyOf(s.refused),
  }, null, 1))
}

if (process.argv.includes('--apply')) {
  const i = process.argv.indexOf('--apply')
  const mf = process.argv[i + 1]
  const rf = process.argv[i + 2]
  if (!mf || !rf) { console.error('--apply needs <manifest.json> <replies.txt>'); process.exit(2) }
  const manifest = JSON.parse(readFileSync(mf, 'utf8')) as Array<{ id: string; clause: string }>
  const updates = applyReplies(manifest, readFileSync(rf, 'utf8'), new Date().toISOString())
  writeFileSync(`${rf}.sql`, planSql(updates))
  console.error(JSON.stringify({ rows: updates.length, tally: tallyOf(updates) }, null, 1))
}

// ⚠️ THERE IS NO `--selftest` FLAG, DELIBERATELY. The sibling script's one is
// never run: no workflow invokes it, and `node --experimental-strip-types`
// cannot even load this file, because resolving `./captionShape` from inside the
// shared package needs the bundler's extensionless resolution and tsc refuses
// `.ts` in an import path (TS5097). A selftest that cannot execute is the exact
// "built, and nothing calls it" defect this repository keeps finding.
//
// ⚖️ SO THE ASSERTIONS LIVE IN `packages/shared/src/__tests__` INSTEAD, where CI
// runs them on every push -- the same choice made for check_ops_event_severity,
// and for the same reason.

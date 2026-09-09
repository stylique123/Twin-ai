// `was_filmed` HAD TWO UNREACHABLE STATES.
//
// ⚠️ MEASURED BEFORE BUILDING. 0191 made `was_filmed` three-state on purpose —
// true filmed, false looked at it and did not film it, NULL not answered — and
// grepping the repository for a writer found the column named only in the
// migration and in one `generate-blueprint` comment saying it is left null on
// purpose. Nothing asked. A three-state column with two unreachable states is a
// boolean that always says "unknown".
//
// ⚠️ AND IT IS NOT DERIVABLE FROM `posts`. Production, today: 4 rows with
// status 'posted' against 85 generations, because posting THROUGH Twin is rare.
// Reading "no post row" as "not filmed" would invent 81 declines — measured,
// not assumed, and the reason this is a question rather than a query.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  filmedAsk, ASK_AFTER_MS,
  FILMED_ASK_QUESTION, FILMED_YES, FILMED_NO, FILMED_WHY,
} from '../filmedAsk'

const NOW = Date.parse('2026-09-09T12:00:00.000Z')
const long = new Date(NOW - ASK_AFTER_MS - 1000).toISOString()
const recent = new Date(NOW - 60_000).toISOString()
const unanswered = { was_filmed: null, filmed_answered_at: null }

describe('when the question is asked, which is most of the design', () => {
  it('asks once she has come back to a script old enough to have an answer', () => {
    expect(filmedAsk({ outcome: unanswered, generatedAt: long, now: NOW }).kind).toBe('ask')
  })

  it('does NOT ask at the end of the build', () => {
    // ⚠️⚠️ THE LOAD-BEARING ONE. She has not filmed anything yet; "no" would
    // mean "not yet" and would be stored as "declined" — manufacturing the
    // negative signal this exists to measure honestly.
    expect(filmedAsk({ outcome: unanswered, generatedAt: recent, now: NOW }).kind).toBe('too_soon')
  })

  it('an unknown generation time is never treated as long ago', () => {
    // ⚠️ THE NULL CHECK PRECEDES THE ARITHMETIC. `now - Date.parse(null)` is
    // NaN and every comparison against NaN is false, so an unguarded version
    // reads as "too soon" by accident rather than by decision — and the day
    // somebody flips the comparison it silently starts asking everyone.
    expect(filmedAsk({ outcome: unanswered, generatedAt: null, now: NOW }).kind).toBe('too_soon')
    expect(filmedAsk({ outcome: unanswered, generatedAt: 'not a date', now: NOW }).kind).toBe('too_soon')
  })

  it('an answer survives an unknown generation time', () => {
    // ⚠️ THIS CASE WAS MISSING AND A MUTANT LIVED IN THE GAP. Moving the
    // answered check BELOW the timestamp guards left every assertion green,
    // because the only "already answered" case tested carried a valid time and
    // still fell through to the answered branch. The combination that actually
    // breaks is an answer on a row whose generation time we do not know: with
    // the order swapped that returns `too_soon` and hides what she told us.
    //
    // ⚖️ THE TEST WAS INCOMPLETE, NOT THE RULE WRONG. The order in the module
    // was right the whole time; nothing was holding it there.
    for (const generatedAt of [null, 'not a date']) {
      expect(filmedAsk({
        outcome: { was_filmed: false, filmed_answered_at: long }, generatedAt, now: NOW,
      }), String(generatedAt)).toMatchObject({ kind: 'answered', wasFilmed: false })
    }
  })

  it('an early answer is shown, not hidden again by the clock', () => {
    // ⚖️ SHE FILMED IT IN THE FIRST HOUR — the best possible outcome — and a
    // timer that ran before the answered check would hide her own answer.
    expect(filmedAsk({
      outcome: { was_filmed: true, filmed_answered_at: recent }, generatedAt: recent, now: NOW,
    })).toMatchObject({ kind: 'answered', wasFilmed: true })
  })
})

describe('a generation with no outcome row is never asked', () => {
  it('returns no_row rather than inventing something to answer into', () => {
    // ⚠️⚠️ CREATING A ROW HERE WOULD FABRICATE `had_reference`, WHICH IS NOT
    // NULL, plus the niche and substance budget that made the row worth having.
    // 0191's entire argument is that this context is unrecoverable afterwards;
    // the 85 generations written before it are permanently unattributable and
    // the honest handling is to ask nothing.
    expect(filmedAsk({ outcome: null, generatedAt: long, now: NOW }).kind).toBe('no_row')
    expect(filmedAsk({ outcome: null, generatedAt: null, now: NOW }).kind).toBe('no_row')
  })
})

describe('both answers are answers', () => {
  it('false is carried through as a real value, never collapsed into null', () => {
    // ⚠️ `false` IS THE ONLY NEGATIVE SIGNAL IN THIS PRODUCT. Everything else
    // Twin measures is enthusiasm at the moment of clicking.
    const r = filmedAsk({
      outcome: { was_filmed: false, filmed_answered_at: long }, generatedAt: long, now: NOW,
    })
    expect(r).toMatchObject({ kind: 'answered', wasFilmed: false })
  })

  it('the wording does not make "no" read as a confession', () => {
    // ⚖️ A QUESTION THAT FEELS LIKE A PERFORMANCE REVIEW GETS AVOIDED, and
    // avoidance produces exactly the NULL-heavy data this change exists to end.
    expect(FILMED_NO).toBe('Not this one')
    expect(FILMED_NO.toLowerCase()).not.toMatch(/fail|didn|no,|couldn/)
    expect(FILMED_YES).toMatch(/^Yes/)
    // And it must promise that answering costs her nothing.
    expect(FILMED_WHY).toMatch(/changes nothing about this script/i)
    expect(FILMED_ASK_QUESTION).toMatch(/\?$/)
  })

  it('every creator-facing string is plain English, not our vocabulary', () => {
    for (const s of [FILMED_ASK_QUESTION, FILMED_YES, FILMED_NO, FILMED_WHY]) {
      expect(s).not.toMatch(/generation|outcome|corpus|null|column|beat|RPC/i)
    }
  })
})

// ── THE MIGRATION: ONE COLUMN, AND ONLY HERS ──────────────────────────────
const MIG = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'migrations', '0192_did_you_film_it.sql'), 'utf8')

describe('the function may set that one column and no other', () => {
  it('the UPDATE names was_filmed and filmed_answered_at, and no frozen context', () => {
    // ⚠️⚠️ THE WHOLE SECURITY ARGUMENT. `authenticated` holds SELECT on
    // `generation_outcomes` and nothing else, so this function is the entire
    // write surface. If the UPDATE ever touches the context, answering a
    // question becomes rewriting the thing the answer is about.
    const upd = MIG.slice(MIG.indexOf('update public.generation_outcomes'), MIG.indexOf('get diagnostics'))
    expect(upd).toMatch(/set was_filmed = p_filmed/)
    expect(upd).toMatch(/filmed_answered_at = now\(\)/)
    for (const frozen of ['niche', 'sub_niche', 'substance_budget_beats', 'reference_duration_sec', 'had_reference']) {
      expect(upd, frozen).not.toMatch(new RegExp(`\\b${frozen}\\s*=`))
    }
  })

  it('a signed-in caller must own the row, tested on auth.uid()', () => {
    // ⚖️ 0114's RULE, AFTER TWO WRONG ATTEMPTS THERE: a guard keyed to a role
    // NAME changes meaning with the connection. The function is security
    // definer, so without this any signed-in user could rewrite any outcome.
    expect(MIG).toMatch(/security definer/)
    expect(MIG).toMatch(/v_uid uuid := auth\.uid\(\)/)
    expect(MIG).toMatch(/if v_uid is null then\s*\n\s*return false/)
    expect(MIG).toMatch(/and owner_id = v_uid/)
  })

  it('null is not writable through the function', () => {
    // ⚠️ SILENCE IS ALREADY THE COLUMN'S NULL. Letting a caller SET null would
    // make "she un-answered" and "she was never asked" the same row, and the
    // second is the state this table is trying to shrink.
    expect(MIG).toMatch(/if p_filmed is null then\s*\n\s*return false/)
  })

  it('missing and not-yours answer identically', () => {
    // ⚖️ A DISTINCT "not yours" WOULD LET ANYONE PROBE WHICH IDS EXIST — 0114's
    // rule, and the same reason `enqueue-extraction` returns 404 for both.
    expect(MIG).toMatch(/MISSING AND NOT-YOURS ANSWER IDENTICALLY/i)
    expect(MIG).toMatch(/return v_updated > 0/)
  })

  it('revokes before granting, because replace keeps the old grants', () => {
    // ⚠️ THE DEFAULT ON A NEW FUNCTION IS EXECUTE TO PUBLIC. Granting to
    // `authenticated` without revoking ADDS to a set that already includes
    // anon — the function-shaped version of the table-privilege trap 0191 hit
    // and verified on production.
    const rev = MIG.indexOf('revoke all on function')
    const grant = MIG.indexOf('grant execute on function')
    expect(rev).toBeGreaterThan(-1)
    expect(grant).toBeGreaterThan(rev)
    expect(MIG).toMatch(/revoke all on function public\.set_generation_filmed\(uuid, boolean\) from public/)
    expect(MIG).toMatch(/revoke all on function public\.set_generation_filmed\(uuid, boolean\) from anon/)
  })

  it('filmed_answered_at arrives WITH a writer and a reader, as 0191 required', () => {
    // ⚖️ 0191 CARRIED THIS COLUMN AND DROPPED IT because `check_column_readers`
    // failed the build, and recorded the rule: the change that starts asking
    // her is the change that should add the column, with a writer, a reader and
    // a reason on the same day. This is that change.
    expect(MIG).toMatch(/add column if not exists filmed_answered_at timestamptz/)
    expect(MIG).toMatch(/filmed_answered_at = now\(\)/)
  })
})

// ── AND IT IS ACTUALLY ON A SCREEN ────────────────────────────────────────
const PANEL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'components', 'DidYouFilmIt.tsx'), 'utf8')
const RESULT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'Result.tsx'), 'utf8')

describe('the question reaches a creator', () => {
  it('Result.tsx renders it, with the generation time it needs', () => {
    // ⚠️ A COMPONENT NOTHING RENDERS is the defect class this session has
    // closed eleven times. The panel is useless without `generatedAt` — it
    // would never leave `too_soon`.
    expect(RESULT).toMatch(/<DidYouFilmIt generationId=\{gen\.id\} generatedAt=\{gen\.created_at \?\? null\} \/>/)
    expect(RESULT).toMatch(/import \{ DidYouFilmIt \}/)
  })

  it('the panel writes through the RPC, never through a table update', () => {
    expect(PANEL).toMatch(/setGenerationFilmed\(/)
    expect(PANEL).not.toMatch(/\.from\('generation_outcomes'\)/)
  })

  it('local state moves only when the write landed', () => {
    // ⚠️ SHOWING "saved" ON A FAILED RPC would tell her Twin knows something it
    // does not, and she would never think to answer again.
    expect(PANEL).toMatch(/if \(ok\) setOutcome\(/)
    expect(PANEL).toMatch(/else setFailed\(true\)/)
  })

  it('nothing renders before the row is known', () => {
    // ⚖️ RENDERING FIRST AND HIDING ON LOAD would flash the question at every
    // creator whose generation predates the table.
    expect(PANEL).toMatch(/if \(!loaded\) return null/)
  })

  it('it reads filmed_answered_at, which is why the column may exist', () => {
    expect(PANEL).toMatch(/ask\.answeredAt/)
  })
})

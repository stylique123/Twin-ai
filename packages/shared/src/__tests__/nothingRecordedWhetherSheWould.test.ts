// NOTHING RECORDED WHETHER SHE WOULD HAVE.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14: 134 scripts generated, 6 camera opens,
// 0 exports. 128 scripts never had a camera opened and no row anywhere says
// whether the creator would have recorded them. `recordingFunnel.ts` calls this
// "the single most valuable event this product does not yet collect", and its
// constants have sat written and unread since it was created.
//
// ⚠️⚠️ WITHOUT IT THE DROP IS UNATTRIBUTABLE. 128 non-openers is equally
// consistent with a bad script, an irrelevant premise, an intimidating record
// button, no time, or somebody only ever clicking around — and those need
// OPPOSITE fixes.
//
// ⚠️ WHOLE-LINE COMMENTS ARE STRIPPED BEFORE MATCHING, because the migration
// and the component both quote these constants in prose while explaining them.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  SCRIPT_INTENTS, NO_RECORD_REASONS, SCRIPT_INTENT_LABELS, NO_RECORD_REASON_LABELS,
  NOT_A_SCRIPT_REJECTION, OPTIONAL_STAGES,
} from '../recordingFunnel'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const code = (p: string) => readFileSync(join(REPO, p), 'utf8')
  .split('\n').filter((l) => !/^\s*(--|\/\/|\*|\/\*)/.test(l)).join('\n')

const MIGRATION = code('supabase/migrations/0211_nothing_recorded_whether_she_would.sql')
const API = code('packages/shared/src/api.ts')
const ASK = code('apps/web/src/components/ScriptIntentAsk.tsx')
const RESULT = code('apps/web/src/pages/Result.tsx')

describe('the database is the authority on the values', () => {
  it('the CHECK lists exactly the intents the code knows', () => {
    // ⚠️ A CLIENT IS NOT A VALIDATOR. If these drift, a value the UI offers
    // becomes a failed write the creator sees as a broken button.
    for (const i of SCRIPT_INTENTS) expect(MIGRATION).toContain(`'${i}'`)
    expect(MIGRATION).toContain('generations_script_intent_known')
  })

  it('the CHECK lists exactly the reasons the code knows', () => {
    for (const r of NO_RECORD_REASONS) expect(MIGRATION).toContain(`'${r}'`)
    expect(MIGRATION).toContain('generations_no_record_reason_known')
  })

  it('a reason without a refusal is refused by the database', () => {
    // "It feels generic" attached to would_record is two answers that
    // contradict each other; counting it would be counting a contradiction.
    expect(MIGRATION).toContain('generations_reason_needs_a_refusal')
    expect(MIGRATION).toMatch(/no_record_reason is null or script_intent = 'would_not_record'/)
  })

  it('the answer and its timestamp arrive together or not at all', () => {
    expect(MIGRATION).toContain('generations_intent_time_needs_an_intent')
    expect(MIGRATION).toMatch(/\(script_intent is null\) = \(script_intent_at is null\)/)
  })

  it('there is NO DEFAULT — an unanswered question must read as NULL', () => {
    // ⚠️ OPTIONAL_STAGES contains script_intent for exactly this reason: a
    // question nobody was shown is our omission, not their abandonment.
    expect(OPTIONAL_STAGES.has('script_intent')).toBe(true)
    const addBlock = MIGRATION.slice(MIGRATION.indexOf('add column if not exists script_intent'))
      .slice(0, 400)
    expect(addBlock).not.toMatch(/default/i)
  })

  it('grants only these three columns to the client', () => {
    // Column grants are what stop a client patching anything else on the row.
    expect(MIGRATION).toMatch(
      /grant update \(script_intent, script_intent_at, no_record_reason\)\s*on public\.generations to authenticated/)
  })
})

/** ⚠️ BOUNDED TO THIS FUNCTION, AND THE FIRST VERSION WAS NOT.
 *  `updateGenerationChoice` sits immediately after `recordScriptIntent` with an
 *  IDENTICAL "require the row back" line, so a fixed 1200-char window spilled
 *  into it and the assertion was satisfied by the NEIGHBOUR's code — a mutant
 *  that gutted this function survived. The test was wrong, not the code. */
const recordFn = (() => {
  const at = API.indexOf('export async function recordScriptIntent')
  expect(at).toBeGreaterThan(-1)
  const rest = API.slice(at + 10)
  const next = rest.indexOf('export async function')
  return next === -1 ? API.slice(at) : API.slice(at, at + 10 + next)
})()

describe('the write path', () => {
  it('exists and validates before the round trip', () => {
    expect(API).toContain('export async function recordScriptIntent')
    expect(API).toContain('SCRIPT_INTENTS.includes(intent)')
    expect(API).toContain('NO_RECORD_REASONS.includes(why)')
  })

  it('refuses a reason without a refusal, like the database does', () => {
    expect(API).toMatch(/why !== null && intent !== 'would_not_record'.*return false/s)
  })

  it('requires the row back — !error is not success', () => {
    // A PostgREST UPDATE matching no row returns no error, so an intent the
    // creator could not write would report as saved.
    expect(recordFn).toContain(".select('id')")
    expect(recordFn).toContain('Array.isArray(data) && data.length > 0')
  })

  it('sets the timestamp itself rather than leaving it to a default', () => {
    expect(recordFn).toContain('script_intent_at: new Date().toISOString()')
  })
})

describe('what the creator is actually asked', () => {
  it('asks in plain English, naming no subsystem', () => {
    expect(ASK).toContain('Would you record this one?')
    for (const s of ['script_intent', 'funnel', 'intent stage', 'conversion']) {
      // The creator must never read Twin's insides.
      expect(ASK.slice(ASK.indexOf('return ('))).not.toContain(`>${s}<`)
    }
  })

  it('renders every intent and every reason from the shared constants', () => {
    // ⚠️ MAPPED, NOT RETYPED. A hand-written list is how the UI and the CHECK
    // drift into a failed write.
    expect(ASK).toContain('SCRIPT_INTENTS.map')
    expect(ASK).toContain('NO_RECORD_REASONS.map')
    expect(ASK).toContain('SCRIPT_INTENT_LABELS[i]')
    expect(ASK).toContain('NO_RECORD_REASON_LABELS[r]')
    // And the labels themselves are the creator-facing ones.
    expect(SCRIPT_INTENT_LABELS.would_not_record).toBe('No')
    expect(NO_RECORD_REASON_LABELS.just_exploring).toBe('I’m just looking around')
  })

  it('is skippable, and a skip records NOTHING', () => {
    // A question that blocks the teleprompter would buy an answer by making the
    // product worse. A dismissal is honestly stored as null.
    expect(ASK).toContain('Skip')
    expect(ASK).toContain('setDismissed(true)')
    const skip = ASK.slice(ASK.indexOf('setDismissed(true)') - 200, ASK.indexOf('setDismissed(true)') + 60)
    expect(skip).not.toContain('onAnswer')
  })

  it('only asks WHY after a no', () => {
    expect(ASK).toMatch(/if \(i === 'would_not_record'\) setIntent\(i\)/)
    expect(ASK).toContain('What put you off?')
  })

  it('lets her decline to say why', () => {
    // Forcing a reason would make the honest answer impossible, which is why
    // the column is nullable even on a refusal.
    expect(ASK).toContain("send('would_not_record', null)")
    expect(ASK).toContain('rather not say')
  })

  it('a failed write keeps asking instead of thanking her', () => {
    // Showing success for an answer that was never stored is the silent-failure
    // shape this repo keeps closing.
    expect(ASK).toContain('else setFailed(true)')
    expect(ASK).toContain('didn’t save')
  })

  it('never re-asks once answered or dismissed', () => {
    expect(ASK).toContain('if (answered || done || dismissed) return null')
  })

  it('keeps the two non-rejections separable', () => {
    // Somebody browsing at 2am who says "just looking" is not evidence the
    // writer failed; pooling them poisons every quality number.
    expect(NOT_A_SCRIPT_REJECTION.has('no_time')).toBe(true)
    expect(NOT_A_SCRIPT_REJECTION.has('just_exploring')).toBe(true)
    expect(NOT_A_SCRIPT_REJECTION.has('script_generic')).toBe(false)
  })
})

describe('the chain is mounted', () => {
  it('Result.tsx renders the ask — the reader-removal assertion', () => {
    // ⚠️ Delete this and the component, the migration, the grant and the write
    // path all still exist and nothing ever collects an answer.
    expect(RESULT).toContain('<ScriptIntentAsk')
    expect(RESULT).toContain('recordScriptIntent(id, intent, reason)')
  })

  it('is placed ABOVE the teleprompter, not after recording', () => {
    // Asked after recording it would only reach the 4% who recorded — the
    // population whose answer we least need.
    const ask = RESULT.indexOf('<ScriptIntentAsk')
    const tele = RESULT.indexOf('Script teleprompter')
    expect(ask).toBeGreaterThan(-1)
    expect(ask).toBeLessThan(tele)
  })

  it('reads the answered flag from the row, not from local state alone', () => {
    expect(RESULT).toContain('answered={gen?.script_intent != null}')
  })
})

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDITED_QUESTIONS, orphaned, orphanedCount, GENERATION_DIRS } from '../questionAudit'

// ⚠️ AN AUDIT THAT CANNOT GO STALE IS THE WHOLE POINT. `questionRegistry.ts` is
// a correct, complete specification that the product never adopted, and nothing
// ever failed to say so. This guard greps the LIVE TREE, so:
//
//   • wire a reader for a field listed as orphaned -> this FAILS, and the
//     verdict must be updated to LIVE. Good news breaks the test on purpose.
//   • delete the audit entry instead of fixing the question -> this FAILS.
//   • change the question's wording without touching the audit -> this FAILS,
//     because the asked text is matched against the screen.

const repo = join(import.meta.dirname, '..', '..', '..', '..')

/** ⚠️ EXIT CODE 1 FROM grep MEANS "NO MATCHES", NOT "THE CHECK BROKE". Treating
 *  it as failure would make every genuinely-absent field look like a tooling
 *  error; treating a REAL error as no-match would make every field look absent
 *  and pass the whole suite vacuously. Codes are separated deliberately. */
function matchingFiles(pattern: string, dirs: readonly string[]): string[] {
  const present = dirs.filter((d) => { try { readFileSync(join(repo, d)); return true } catch { return true } })
  try {
    const out = execFileSync(
      'grep', ['-rl', '--include=*.ts', '--include=*.tsx', pattern, ...present],
      { cwd: repo, encoding: 'utf8' },
    )
    return out.split('\n').filter(Boolean)
  } catch (e) {
    const code = (e as { status?: number }).status
    if (code === 1) return []            // no matches — the expected orphan case
    throw e                              // 2+ is a real failure and must not pass
  }
}

describe('the grep helper is trustworthy before anything is concluded from it', () => {
  // ⚠️ VALIDATE THE INSTRUMENT ON A KNOWN-PRESENT CASE. A helper that always
  // returned [] would make every orphan claim pass while proving nothing.
  it('finds a token that is definitely there', () => {
    expect(matchingFiles('generate-blueprint', ['supabase/functions']).length).toBeGreaterThan(0)
  })

  it('finds nothing for a token that is definitely not', () => {
    expect(matchingFiles('zzz_not_a_real_identifier_zzz', GENERATION_DIRS)).toEqual([])
  })
})

describe('every ORPHANED verdict is still true today', () => {
  for (const q of AUDITED_QUESTIONS.filter((x) => x.absentFrom)) {
    it(`${q.field} still reaches nothing that writes a script`, () => {
      const hits = matchingFiles(q.field, q.absentFrom!)
        // Its own tests are not a downstream reader.
        .filter((f) => !/__tests__|\.test\.|\.selftest\./.test(f))
      // If this fails because someone WIRED it: that is good news. Change the
      // verdict to LIVE and delete `absentFrom` — do not weaken the grep.
      expect(hits, `${q.field} now appears in ${hits.join(', ')} — update its verdict`).toEqual([])
    })
  }
})

describe('the audit describes questions the product actually asks', () => {
  const onboarding = readFileSync(
    join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8',
  )

  // ⚠️ THE MUTATION THIS CATCHES: quietly reworded questions. An audit that
  // names a question nobody asks any more is describing a product that no longer
  // exists, and its verdicts stop meaning anything.
  for (const q of AUDITED_QUESTIONS.filter((x) => x.screen.startsWith('Onboarding'))) {
    it(`"${q.asked}" is still on the screen`, () => {
      expect(onboarding).toContain(q.asked)
    })
  }

  it('every audited field is named in the onboarding draft it is written to', () => {
    const draft = readFileSync(join(repo, 'apps', 'web', 'src', 'lib', 'onboardingDraft.ts'), 'utf8')
    for (const q of AUDITED_QUESTIONS) expect(draft).toContain(q.field)
  })
})

describe('the root cause is recorded, not just the symptoms', () => {
  // ⚖️ THE SIX SCAN ANSWERS NEVER LEAVE THE BROWSER. This is the fact that
  // explains the duplication across four screens, and it is the one a later
  // reader is most likely to lose.
  it('savePreScriptBrief still omits every orphaned scan field', () => {
    const onboarding = readFileSync(
      join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8',
    )
    const at = onboarding.indexOf('savePreScriptBrief(')
    expect(at).toBeGreaterThan(-1)
    const call = onboarding.slice(at, onboarding.indexOf('})', at))
    for (const q of orphaned().filter((x) => x.verdict === 'ORPHANED_LOCAL')) {
      expect(call, `${q.field} is now persisted — update its verdict`).not.toContain(q.field)
    }
  })

  // ⚠️ THE INVERSE, AND WITHOUT IT THE WIRING HAS NO GUARD. A field whose
  // verdict says "persisted, but nothing reads it" must actually BE persisted;
  // otherwise deleting the write would move it back to localStorage-only and
  // every test here would still pass, because the audit only ever checked that
  // orphans were absent.
  it('every field the audit calls persisted is really in the write', () => {
    const onboarding = readFileSync(
      join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8',
    )
    const at = onboarding.indexOf('savePreScriptBrief(')
    const call = onboarding.slice(at, onboarding.indexOf('})', at))
    const persisted = AUDITED_QUESTIONS.filter((q) => q.verdict === 'ORPHANED_NO_READER')
    expect(persisted.length).toBeGreaterThanOrEqual(5)
    for (const q of persisted) {
      expect(call, `${q.field} is no longer persisted — its verdict is now wrong`).toContain(q.field)
    }
  })

  it('names more than one orphan, so a single fix cannot empty the audit silently', () => {
    expect(orphanedCount()).toBeGreaterThanOrEqual(6)
  })

  it('every orphan states what it costs, and never states nothing', () => {
    for (const q of orphaned()) {
      expect(q.cost.length).toBeGreaterThan(40)
      expect(q.cost.toLowerCase()).not.toMatch(/^nothing\b/)
    }
  })
})

// ── EVERY VERDICT MUST BE BACKED BY EVIDENCE ──────────────────────────────
//
// ⚠️ THE HOLE THIS CLOSES WAS IN THIS FILE. `audienceKnowledge` was recorded as
// ORPHANED_WRONG_WRITER -- "generation reads it, onboarding never writes it".
// Then the six-answer write landed, onboarding began persisting it, and the
// audit kept reporting an orphan that had been FIXED. It carried no
// `absentFrom`, and no case above covered its verdict, so there was nothing to
// break. The audit had gone stale in exactly the way it exists to prevent, and
// the suite stayed green through both states.
//
// ⚖️ SO THE RULE IS NOW STRUCTURAL RATHER THAN PER-ENTRY: a verdict that
// nothing can falsify is itself a failure. Each kind below states what must be
// TRUE of the tree for it to hold, and a new verdict added to the union with no
// rule here fails the last case.

const writeCall = (): string => {
  const onboarding = readFileSync(
    join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8',
  )
  const at = onboarding.indexOf('savePreScriptBrief(')
  expect(at, 'savePreScriptBrief call not found — the guard cannot conclude anything').toBeGreaterThan(-1)
  return onboarding.slice(at, onboarding.indexOf('})', at))
}

/** persisted by onboarding? / read by anything that writes a script? */
const evidence = (field: string) => ({
  persisted: writeCall().includes(field),
  readByGeneration: matchingFiles(field, GENERATION_DIRS).length > 0,
})

const RULES: Record<string, (e: { persisted: boolean; readByGeneration: boolean }) => boolean> = {
  // Written where it is asked, and something downstream acts on it.
  LIVE: (e) => e.persisted && e.readByGeneration,
  // Never leaves the browser.
  ORPHANED_LOCAL: (e) => !e.persisted,
  // Leaves the browser and lands nowhere.
  ORPHANED_NO_READER: (e) => e.persisted && !e.readByGeneration,
  // Generation reads it; the screen that ASKS it does not write it.
  ORPHANED_WRONG_WRITER: (e) => e.readByGeneration && !e.persisted,
}

describe('a verdict nothing can falsify is a failure', () => {
  it.each(AUDITED_QUESTIONS.map((q) => [q.field, q.verdict] as const))(
    '%s is really %s',
    (field, verdict) => {
      const rule = RULES[verdict]
      expect(rule, `no rule for verdict ${verdict} — add one, do not leave it unchecked`).toBeTypeOf('function')
      const e = evidence(field)
      expect(
        rule(e),
        `${field} is recorded as ${verdict} but the tree says persisted=${e.persisted}, readByGeneration=${e.readByGeneration}`,
      ).toBe(true)
    },
  )

  // ⚠️ AND THE UNION CANNOT GROW PAST THE RULES. A new verdict with no entry
  // here would make every question carrying it unverifiable, which is the state
  // this whole block exists to end.
  it('every verdict in use has a rule', () => {
    const used = new Set(AUDITED_QUESTIONS.map((q) => q.verdict))
    for (const v of used) expect(Object.keys(RULES)).toContain(v)
  })
})

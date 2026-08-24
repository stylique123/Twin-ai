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
    // ⚠️ THIS ASSERTED `>= 5` AND WAS THE TWIN OF THE `>= 6` ALREADY FIXED
    // ABOVE: a snapshot pretending to be a property. Wiring readers for
    // contentGoals, desiredFormats and formatExploration legitimately took the
    // ORPHANED_NO_READER count from five to two and failed it. A floor that
    // drops every time somebody FIXES something is a floor that has to be edited
    // downward until it means nothing.
    //
    // ⚖️ THE REAL PROPERTY IS "NOT VACUOUS, AND EVERY ONE OF THEM IS IN THE
    // WRITE". The non-vacuity that does not decay is the roster itself, which is
    // asserted separately; here it is enough that whatever IS labelled persisted
    // really is persisted. If the list ever empties, that is the audit finishing
    // its job rather than the guard breaking.
    const persisted = AUDITED_QUESTIONS.filter((q) => q.verdict === 'ORPHANED_NO_READER')
    for (const q of persisted) {
      expect(call, `${q.field} is no longer persisted — its verdict is now wrong`).toContain(q.field)
    }
  })

  // ⚠️ THIS ASSERTED `>= 6` AND WAS A SNAPSHOT PRETENDING TO BE A PROPERTY.
  // Two legitimate fixes -- audienceKnowledge and audienceSeg both turning out
  // to be LIVE -- took the count to 5 and failed it. Good news is SUPPOSED to
  // break a case here, but it should break the specific verdict case (it does),
  // not a magic number that then has to be edited downward after every fix
  // until it means nothing.
  //
  // ⚖️ SO THE PROPERTY IS STATED DIRECTLY, and the fear it was really guarding
  // -- entries DELETED rather than questions fixed -- gets a floor that only
  // deletion can breach. An orphan count falls legitimately; the roster does not.
  it('names more than one orphan, so a single fix cannot empty the audit silently', () => {
    expect(orphanedCount()).toBeGreaterThanOrEqual(2)
  })

  it('the roster never shrinks — a question is fixed, not deleted', () => {
    expect(AUDITED_QUESTIONS.length).toBeGreaterThanOrEqual(7)
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

const onboardingSource = (): string => readFileSync(
  join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8',
)

/**
 * ⚠️ AN ANSWER CAN REACH THE BRIEF UNDER A DIFFERENT NAME, and the first
 * version of this helper could not see that. `audienceSeg` has reached
 * generation since #398 -- the confirm step seeds the free-text `audience` from
 * the chooser label when the creator typed nothing -- and grepping the write
 * call for "audienceSeg" answered "not persisted". That is how a LIVE field
 * stayed recorded as an orphan, in a guard written to stop exactly that.
 *
 * ⚖️ THE INDIRECT PATH MUST BE DECLARED AND MUST BE REAL. `travelsAs` names the
 * key, and this checks BOTH that the key is written AND that one line of the
 * page mentions the field and the key together. A declared path that does not
 * exist fails rather than laundering an orphan into LIVE.
 */
const travels = (field: string, travelsAs: string | undefined): boolean => {
  if (!travelsAs) return false
  if (!writeCall().includes(travelsAs)) return false
  return onboardingSource().split('\n').some((l) => l.includes(field) && l.includes(travelsAs))
}

/**
 * ⚠️ AND AN UNDECLARED PATH MUST BE CAUGHT TOO, or the fix above is a rubber
 * stamp: it would only ever validate a path somebody remembered to declare,
 * while the failure mode is forgetting. Reverting audienceSeg to
 * ORPHANED_LOCAL passed cleanly until this existed.
 *
 * ⚖️ THE APPROXIMATION IS DELIBERATE AND ITS LIMIT IS NAMED. Proving an answer
 * reaches the brief by NO route is not decidable by grep. What is checkable:
 * does any single line of the page mention this field beside a key that IS
 * written? That is how audienceSeg reaches `audience`, and it is the shape any
 * seeding line has. A path spread across several statements would still slip
 * through, and that is a known limit rather than a claim of completeness.
 */
const leaksThroughAnotherKey = (field: string): boolean => {
  const call = writeCall()
  // ⚠️ EVERY KEY, NOT THE FIRST ON EACH LINE. The anchored version of this
  // regex captured only `forbiddenClaims` from
  //   forbiddenClaims, audience, promotes: q4,
  // so `audience` was never in the set and the check passed the very mutation
  // it was written for. Measured, not assumed: the mutation was re-run.
  const writtenKeys = [...call.matchAll(/(\w+)\s*[,:]/g)].map((m) => m[1])
    .filter((k) => k !== field && k.length > 3)
  return onboardingSource().split('\n').some((l) =>
    l.includes(field) && writtenKeys.some((k) => l.includes(k)))
}

/** persisted by onboarding? / read by anything that writes a script? */
const evidence = (field: string, travelsAs?: string) => ({
  persisted: writeCall().includes(field) || travels(field, travelsAs),
  readByGeneration: matchingFiles(travelsAs ?? field, GENERATION_DIRS).length > 0,
  leaksThroughAnotherKey: leaksThroughAnotherKey(field),
})

type Evidence = { persisted: boolean; readByGeneration: boolean; leaksThroughAnotherKey: boolean }

const RULES: Record<string, (e: Evidence) => boolean> = {
  // Written where it is asked, and something downstream acts on it.
  LIVE: (e) => e.persisted && e.readByGeneration,
  // Never leaves the browser -- under its own name OR any other.
  ORPHANED_LOCAL: (e) => !e.persisted && !e.leaksThroughAnotherKey,
  // Leaves the browser and lands nowhere.
  ORPHANED_NO_READER: (e) => e.persisted && !e.readByGeneration,
  // Generation reads it; the screen that ASKS it does not write it.
  ORPHANED_WRONG_WRITER: (e) => e.readByGeneration && !e.persisted,
}

describe('a verdict nothing can falsify is a failure', () => {
  it.each(AUDITED_QUESTIONS.map((q) => [q.field, q.verdict, q.travelsAs] as const))(
    '%s is really %s',
    (field, verdict, travelsAs) => {
      const rule = RULES[verdict]
      expect(rule, `no rule for verdict ${verdict} — add one, do not leave it unchecked`).toBeTypeOf('function')
      const e = evidence(field, travelsAs)
      expect(
        rule(e),
        `${field} is recorded as ${verdict} but the tree says persisted=${e.persisted}, readByGeneration=${e.readByGeneration}, leaksThroughAnotherKey=${e.leaksThroughAnotherKey}`,
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

describe('a declared indirect path must actually exist', () => {
  // ⚠️ OTHERWISE `travelsAs` BECOMES AN EXCUSE RATHER THAN EVIDENCE. Naming a
  // key would be enough to launder any orphan into LIVE, which is worse than
  // the hole it was added to close.
  it.each(AUDITED_QUESTIONS.filter((q) => q.travelsAs).map((q) => [q.field, q.travelsAs!] as const))(
    '%s really does reach the brief as %s',
    (field, travelsAs) => {
      const linked = readFileSync(
        join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8',
      ).split('\n').filter((l) => l.includes(field) && l.includes(travelsAs))
      expect(
        linked.length,
        `${field} claims to travel as ${travelsAs}, but no line of Onboarding.tsx links them`,
      ).toBeGreaterThan(0)
    },
  )

  // ⚖️ AND AN ORPHAN MAY NOT QUIETLY CARRY ONE. If a field has a real indirect
  // path it is not an orphan, whatever the verdict says.
  it('no ORPHANED verdict declares a path', () => {
    for (const q of AUDITED_QUESTIONS.filter((x) => x.verdict !== 'LIVE')) {
      expect(q.travelsAs, `${q.field} is called ${q.verdict} but declares a path`).toBeUndefined()
    }
  })
})

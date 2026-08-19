// ⚠️ DERIVED FILE — DO NOT EDIT. The source of truth is
// `packages/shared/src/scriptValidator.ts`, where the checks and their tests
// live. Edge functions cannot import `@twinai/shared` under Deno deploy, so the
// copy is kept honest by `scripts/ci/check_script_validator_parity.mjs`.
//
// ── THE ONE ALLOWED DIFFERENCE ────────────────────────────────────────────
//
// The shared file imports four things the edge bundler cannot resolve. They are
// inlined below, and EVERYTHING FROM THE MARKER DOWN is compared character for
// character.
//
// ⚖️ THE INLINED SHAPES ARE DELIBERATELY STRUCTURAL AND LOOSE, because this
// function is called through `validateWhatWeCan`, which never touches
// `WriterInput` or `mayStateAsFact` — those exist here only so `validateScript`
// still type-checks in the copy. Drift in them cannot change any answer the edge
// actually computes; drift below the marker can, and that is what is guarded.

import { speechIssues, speakableShare } from './speechPolish.ts'

type CreativeDecisionPlan = {
  objective: string
  audienceLevel: string | null
  cta: string | null
  ownershipLanguage: boolean
}
type WriterSlotLike = { content: string; classification: string; attribution: string | null }
type WriterInput = { decisionPlan: CreativeDecisionPlan; content: readonly WriterSlotLike[] }

const STATEABLE_AS_FACT_EDGE: ReadonlySet<string> =
  new Set(['verified_fact', 'user_confirmed', 'researched_fact'])
const mayStateAsFact = (c: string): boolean => STATEABLE_AS_FACT_EDGE.has(c)

export const SCRIPT_CHECKS = [
  'goal_visible',
  'audience_level_respected',
  'all_slots_filled',
  'no_unsupported_claim',
  'ownership_language_allowed',
  'cta_matches_plan',
  'no_unresolved_placeholder',
  'no_copied_reference_wording',
  'spoken_length_in_range',
] as const
export type ScriptCheckCode = (typeof SCRIPT_CHECKS)[number]

export interface CheckResult {
  code: ScriptCheckCode
  passed: boolean
  /** Present when it failed, in words a creator could read. */
  detail?: string
}

/**
 * ⚠️ TWO OF THESE NINE CANNOT RUN WITHOUT RESOLVED SLOTS, AND SAYING SO IS THE
 * WHOLE POINT. `all_slots_filled` and `no_unsupported_claim` are checks ON THE
 * SUPPLIED CONTENT — they compare the script against what was actually handed to
 * the writer. A caller that has no per-slot resolutions has nothing to compare
 * against, and running them anyway against an empty list would report "0 slots
 * empty, no opinion asserted" — a confident pass on a question nobody asked.
 *
 * ⚖️ SILENCE IS NOT A PASS. That rule is why the partial report below marks them
 * `not_run` rather than omitting them: a check that vanished from a report is
 * indistinguishable from one that succeeded, which is how a guard quietly stops
 * covering its case.
 */
export const CHECKS_NEEDING_SLOTS: ReadonlySet<ScriptCheckCode> =
  new Set<ScriptCheckCode>(['all_slots_filled', 'no_unsupported_claim'])

export const CHECK_STATES = ['pass', 'fail', 'not_run'] as const
export type CheckState = (typeof CHECK_STATES)[number]

export interface PartialCheck {
  code: ScriptCheckCode
  state: CheckState
  detail?: string
  /** Present on `not_run`: what the caller would have to supply. */
  needs?: string
}

export interface PartialReport {
  checks: readonly PartialCheck[]
  failed: readonly PartialCheck[]
  notRun: readonly ScriptCheckCode[]
  /** ⚠️ A PARTIAL REPORT NEVER BLOCKS. It cannot see the content half of the
   *  contract, so treating its silence as approval is exactly the mistake the
   *  `not_run` state exists to prevent. */
  blocked: false
}

/** ⚖️ THREE WORDS, NOT A SCALE. A judgement that produces 6.2 invites somebody
 *  to average it with another 6.2 and act on 6.2 — which is how a score that
 *  nobody measured starts deciding things. */
export const JUDGEMENTS = ['relevance', 'usefulness', 'speakability'] as const
export type JudgementCode = (typeof JUDGEMENTS)[number]
export const VERDICTS = ['pass', 'weak', 'fail'] as const
export type Verdict = (typeof VERDICTS)[number]

export interface ScriptReport {
  checks: readonly CheckResult[]
  failed: readonly CheckResult[]
  /** ⚠️ A SCRIPT THAT FAILS A BINARY CHECK IS NOT SHIPPED, whatever a judgement
   *  says about it. The decidable half is a gate; the judgements are a report. */
  blocked: boolean
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const wordsOf = (s: string): string[] => norm(s).split(' ').filter(Boolean)

/** ⚠️ A BRACKET THAT REACHED A TELEPROMPTER IS THE MOST VISIBLE FAILURE THIS
 *  SYSTEM HAS EVER SHIPPED — a creator reading "[Phone Model]" aloud. Declared
 *  clips are `[SHOW: …]` and are NOT placeholders; they are directions. */
const PLACEHOLDER = /\[(?!SHOW:)[^\]]*\]|\{\{[^}]*\}\}|<[a-z_ ]+>/i

/**
 * Every decidable check, run in one pass.
 *
 * ⚠️ RETURNS ALL OF THEM, PASSED AND FAILED. A report that listed only failures
 * cannot tell you whether a check ran — which is how a check silently stops
 * covering its case and nobody notices for months.
 */
/**
 * The seven checks that need only the script and the plan.
 *
 * ⚠️ ONE IMPLEMENTATION, TWO ENTRY POINTS. `validateScript` and
 * `validateWhatWeCan` both run exactly this — a second copy for the partial
 * caller would be free to drift, and two implementations of the same question
 * eventually disagree about the answer.
 */
function planChecks(
  script: string,
  plan: CreativeDecisionPlan,
  opts: { referenceTranscript?: string | null },
): CheckResult[] {
  const checks: CheckResult[] = []
  const add = (code: ScriptCheckCode, passed: boolean, detail?: string) =>
    checks.push(passed ? { code, passed } : { code, passed, detail })

  const text = String(script ?? '')
  const lower = norm(text)

  // 1. The goal is visible in the script rather than only in the plan.
  const goalWords: Record<string, readonly string[]> = {
    sell: ['buy', 'get', 'order', 'grab', 'try'],
    leads: ['dm', 'message', 'book', 'call', 'link'],
    authority: ['i', 'we', 'my', 'built', 'learned'],
    educate: ['how', 'why', 'means', 'works', 'step'],
  }
  const wanted = goalWords[plan.objective] ?? []
  add('goal_visible',
    wanted.length === 0 || wanted.some((w) => new RegExp(`\\b${w}\\b`).test(lower)),
    'Nothing in the script does what this video is for.')

  // 2. Audience level. Beginner must explain; expert must not open with basics.
  const explains = /\b(which means|in other words|that is|basically|think of it as)\b/.test(lower)
  add('audience_level_respected',
    plan.audienceLevel !== 'beginner' || explains,
    'This is written for a beginner and explains nothing.')

  // 5. Ownership language only where the plan authorised it.
  const ownership = /\b(we built|we made|our product|our customers|when we designed)\b/.test(lower)
  add('ownership_language_allowed', !ownership || plan.ownershipLanguage,
    'The script claims to have built something the creator does not own.')

  // 6. The CTA the plan settled is the CTA in the script.
  const cta = plan.cta?.trim()
  add('cta_matches_plan', !cta || norm(text).includes(norm(cta)),
    'The closing ask is not the one that was decided.')

  // 7. No placeholder reached the script.
  const ph = text.match(PLACEHOLDER)
  add('no_unresolved_placeholder', ph === null,
    ph ? `“${ph[0]}” would be read aloud.` : undefined)

  // 8. ⚖️ THE REFERENCE IS A STRUCTURE TO BORROW, NEVER WORDING TO COPY. Checked
  // as a run of shared words, because a paraphrase is fine and a lifted sentence
  // is not.
  const ref = opts.referenceTranscript ? wordsOf(opts.referenceTranscript) : []
  let lifted: string | null = null
  if (ref.length >= 8) {
    const mine = wordsOf(text)
    for (let i = 0; i + 8 <= ref.length && lifted === null; i++) {
      const run = ref.slice(i, i + 8).join(' ')
      if (mine.join(' ').includes(run)) lifted = run
    }
  }
  add('no_copied_reference_wording', lifted === null,
    lifted ? `Eight words in a row come from the reference: “${lifted}”.` : undefined)

  // 9. Speakable.
  const share = speakableShare(text)
  const hard = speechIssues(text).filter((i) => i.code === 'sentence_too_long').length
  add('spoken_length_in_range', share !== null && share >= 0.5 && hard === 0,
    'Several lines are too long to say in one breath.')

  return checks
}

/**
 * Every decidable check, run in one pass.
 *
 * ⚠️ RETURNS ALL OF THEM, PASSED AND FAILED. A report that listed only failures
 * cannot tell you whether a check ran — which is how a check silently stops
 * covering its case and nobody notices for months.
 */
export function validateScript(
  script: string,
  input: WriterInput,
  opts: { referenceTranscript?: string | null } = {},
): ScriptReport {
  const text = String(script ?? '')
  const lower = norm(text)
  const checks = planChecks(text, input.decisionPlan, opts)
  const add = (code: ScriptCheckCode, passed: boolean, detail?: string) =>
    checks.push(passed ? { code, passed } : { code, passed, detail })

  // 3. Every slot the container declared was supplied.
  const emptySlots = input.content.filter((s) => s.content.trim() === '')
  add('all_slots_filled', emptySlots.length === 0,
    `${emptySlots.length} part(s) of this video were never filled in.`)

  // 4. ⚠️ NO CLAIM STATED AS FACT THAT WAS NOT SUPPLIED AS ONE. An opinion
  // promoted to a fact is the single most damaging thing a writer can do here.
  const opinions = input.content.filter((s) => !mayStateAsFact(s.classification))
  const asserted = opinions.filter((s) => {
    const key = wordsOf(s.content).filter((w) => w.length > 4).slice(0, 3)
    if (key.length === 0) return false
    const near = key.every((w) => lower.includes(w))
    // Stated as a fact when the script carries the content and never frames it.
    return near && !/\b(i think|i find|in my|for me|personally|i reckon)\b/.test(lower)
  })
  add('no_unsupported_claim', asserted.length === 0,
    'An opinion is being stated as a fact.')

  const failed = checks.filter((c) => !c.passed)
  return { checks, failed, blocked: failed.length > 0 }
}

/**
 * What can be checked when the caller has a plan but no resolved slots.
 *
 * ⚠️ THIS EXISTS BECAUSE `generate-blueprint` HAS NO PER-SLOT RESOLUTIONS. It
 * hands the container's beats to the model as prose and lets it fill them from a
 * knowledge block, so there is no record of what was supplied for each beat to
 * check the script against. Passing an empty `content` list to `validateScript`
 * would report "0 slots empty, no opinion asserted" — two confident passes on
 * questions nobody asked, which is worse than no report at all.
 *
 * ⚖️ SO THE TWO UNANSWERABLE CHECKS COME BACK `not_run`, NAMING WHAT WOULD
 * ANSWER THEM. When the resolver stack reaches the edge function, those two
 * states are the worklist.
 */
export function validateWhatWeCan(
  script: string,
  plan: CreativeDecisionPlan,
  opts: { referenceTranscript?: string | null } = {},
): PartialReport {
  const ran: PartialCheck[] = planChecks(String(script ?? ''), plan, opts)
    .map((c) => (c.passed
      ? { code: c.code, state: 'pass' as const }
      : { code: c.code, state: 'fail' as const, detail: c.detail }))
  const notRun: PartialCheck[] = [...CHECKS_NEEDING_SLOTS].map((code) => ({
    code,
    state: 'not_run' as const,
    needs: 'the content resolved for each beat, which this caller does not build yet',
  }))
  // ⚖️ IN THE DECLARED ORDER, so a reader diffing two reports is comparing the
  // same rows rather than chasing whichever order a Set happened to yield.
  const byCode = new Map([...ran, ...notRun].map((c) => [c.code, c]))
  const checks = SCRIPT_CHECKS.map((code) => byCode.get(code)!).filter(Boolean)
  return {
    checks,
    failed: checks.filter((c) => c.state === 'fail'),
    notRun: checks.filter((c) => c.state === 'not_run').map((c) => c.code),
    blocked: false,
  }
}

/**
 * Could this script be sent unchanged to a hundred other creators?
 *
 * ⚠️ THE FOUNDING DEFECT, STATED AS A CHECK. A script perfectly in somebody's
 * voice that says nothing only they could say is the exact failure this product
 * was built to end. Not every SENTENCE needs to be personal — the premise and
 * the content do.
 *
 * ⚖️ IT LOOKS FOR GROUNDING THAT COULD ONLY HAVE COME FROM THIS CREATOR: a
 * product they hold, a fact somebody researched for this video, an experience
 * they attested to. A script with none of those is generic however well it
 * reads, and saying so is more useful than a score.
 */
export function isGeneric(input: WriterInput): boolean {
  return !input.content.some((s) =>
    s.attribution !== null
    && (s.classification === 'user_confirmed'
      || s.classification === 'researched_fact'
      || s.classification === 'verified_fact'))
}

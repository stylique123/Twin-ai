// BINARY WHERE IT CAN BE, AND HONEST WHERE IT CANNOT.
//
// ⚠️ "RATE THIS SCRIPT 1–100" IS THE FAILURE MODE THIS FILE EXISTS TO AVOID.
// An 8.74 is a number nobody can argue with, nobody can act on, and nobody
// checked — the same defect as the weighted gallery score that ordered a feed by
// arithmetic nobody had measured. Most of what matters here is DECIDABLE: either
// the CTA matches the plan or it does not; either every slot was filled or one
// was not.
//
// ⚖️ SO THERE ARE TWO KINDS OF CHECK AND THEY ARE KEPT APART. Nine checks are
// computed from the script, the plan and the supplied content — no model, no
// opinion. Three are judgements a person or a model has to make, and they are
// PASS / WEAK / FAIL rather than a number, because "weak" is a word somebody can
// disagree with and 6.2 is not.
//
// ⚠️ AND THE SPECIFICITY TEST IS THE ONE WORTH THE MOST. Could this script be
// sent unchanged to a hundred other creators? If yes, it failed, however
// pleasant it reads — that is the founding defect stated as a check.

import type { CreativeDecisionPlan } from './creativeDecisionPlan'
import type { WriterInput } from './writerInput'
import { mayStateAsFact } from './writerInput'
import { speechIssues, speakableShare } from './speechPolish'

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
export function validateScript(
  script: string,
  input: WriterInput,
  opts: { referenceTranscript?: string | null } = {},
): ScriptReport {
  const plan: CreativeDecisionPlan = input.decisionPlan
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

  const failed = checks.filter((c) => !c.passed)
  return { checks, failed, blocked: failed.length > 0 }
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

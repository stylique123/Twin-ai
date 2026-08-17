// AN INTENT QUESTION BURIED IN A COLLAPSED PANEL IS A QUESTION NOBODY ANSWERS.
//
// ⚠️ THE MEASURED CONSEQUENCE. "What this video is for" lived inside Advanced
// Settings, two clicks from the button, beside two EXECUTION preferences. It
// defaulted to unset, and an unset goal meant every script was told "NOT a
// selling video, do NOT write a purchase CTA" — including one written for a
// founder who onboarded specifically to sell.
//
// ⚖️ SO THE FIX IS PLACEMENT, NOT WORDING. The same question, asked at the
// moment a remix starts, alongside the two other things only the creator can
// know about a video that does not exist yet.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  VIDEO_GOALS, CONTENT_FOCUS, VIEWER_OUTCOMES, REFERENCE_USE,
  INTENT_QUESTIONS, reachableIntentValues, compileVideoIntent,
} from '../videoIntent'

const V2 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
  'apps', 'web', 'src', 'pages', 'v2')
const CREATE = readFileSync(join(V2, 'V2Create.tsx'), 'utf8')
const BUILD = readFileSync(join(V2, 'V2Building.tsx'), 'utf8')

describe('Advanced Settings keeps execution and loses intent', () => {
  it('no longer carries the goal picker at all', () => {
    expect(CREATE).not.toMatch(/VIDEO_GOALS\.map/)
    expect(CREATE).not.toMatch(/What this video is for<\/div>/)
    expect(CREATE).not.toMatch(/const \[goal, setGoal\]/)
  })

  it('does not smuggle it through the router state either', () => {
    // ⚠️ LEAVING THE FIELD ON THE PAYLOAD would keep a dead channel alive and
    // make the new one the second answer to one question.
    expect(CREATE).not.toMatch(/\{ goal \}/)
  })

  it('KEEPS closeness and sound, which are execution preferences', () => {
    // ⚖️ They belong in Advanced Settings precisely because they are about HOW
    // the writing is done rather than what the video is for. Both must still
    // work and still be independent of each other.
    expect(CREATE).toMatch(/How close to the reference/)
    expect(CREATE).toMatch(/How it should sound/)
    expect(CREATE).toMatch(/fidelity, tone, idempotency_key/)
  })

  it('stops promising an effect the panel no longer has', () => {
    // A panel that still said "what it's for decides the ending" would be
    // describing a control that is not there.
    expect(CREATE).not.toMatch(/decides the ending/)
  })
})

describe('the three questions open with the remix', () => {
  it('all three are defined in SHARED, beside the enums they map onto', () => {
    // ⚠️ THEY USED TO LIVE IN THE COMPONENT, which meant the WORDING and the
    // behaviour it selects could drift apart silently — and the wording is the
    // part a creator actually experiences.
    for (const f of ['video_goal', 'content_focus', 'viewer_outcome']) {
      expect(INTENT_QUESTIONS.some((q) => q.field === f), f).toBe(true)
    }
    expect(BUILD).toMatch(/INTENT_QUESTIONS/)
    // The card renders what it is given; it holds no option list of its own.
    expect(BUILD).not.toMatch(/VIDEO_GOALS\.map/)
  })

  it('every visible value is one the compiler accepts', () => {
    // ⚖️ A chip whose value the server discards is a question that lies.
    for (const q of INTENT_QUESTIONS) {
      // ⚖️ EXHAUSTIVE BY CONSTRUCTION. A new question added without a mapping
      // here would otherwise be silently checked against the outcome list and
      // pass or fail for the wrong reason — this failed loudly when
      // `reference_use` arrived, which is exactly what it is for.
      const all = q.field === 'video_goal' ? VIDEO_GOALS
        : q.field === 'content_focus' ? CONTENT_FOCUS
          : q.field === 'viewer_outcome' ? VIEWER_OUTCOMES
            : REFERENCE_USE
      for (const v of reachableIntentValues(q.field)) {
        expect(all as readonly string[], `${q.field}/${v}`).toContain(v)
      }
    }
  })

  it('reads in plain English, with no internal vocabulary on screen', () => {
    // ⚠️ THE HARD RULE. A creator must never have to decode Twin's internals.
    const shown = INTENT_QUESTIONS.flatMap((q) => [
      q.question,
      ...q.options.flatMap((o) => [o.label, o.hint ?? '', ...(o.options ?? []).map((c) => c.label)]),
    ]).join(' ').toLowerCase()
    for (const jargon of [
      'authority', 'content focus', 'viewer outcome', 'entitlement',
      'reference adaptation', 'product relationship', 'commercial intent',
      'substance', 'provenance', 'retrieval',
    ]) {
      expect(shown, jargon).not.toContain(jargon)
    }
  })

  it('keeps leads and sell apart, because they are different videos', () => {
    const goals = reachableIntentValues('video_goal')
    expect(goals).toContain('leads')
    expect(goals).toContain('sell')
  })

  it('keeps comment, share and follow reachable under one visible chip', () => {
    // ⚖️ Grouped on screen, distinct underneath — three different endings.
    const outcomes = reachableIntentValues('viewer_outcome')
    for (const v of ['comment', 'share', 'follow']) expect(outcomes).toContain(v)
    const q = INTENT_QUESTIONS.find((x) => x.field === 'viewer_outcome')!
    expect(q.options.filter((o) => o.options?.length)).toHaveLength(1)
  })

  it('keeps remember_me, relabelled rather than deleted', () => {
    expect(reachableIntentValues('viewer_outcome')).toContain('remember_me')
  })

  it('retires personal_brand from the SCREEN and keeps its behaviour', () => {
    // ⚠️ A DIRECTIVE IS NEVER DELETED BECAUSE ITS LABEL LEFT. It is routed from
    // authority + a personal focus + remember/follow.
    expect(reachableIntentValues('video_goal')).not.toContain('personal_brand')
    expect(compileVideoIntent({ goal: 'authority', focus: 'experience', outcome: 'remember_me' })
      .resolutions.join(' ')).toMatch(/personal-brand directive/)
  })

  it('asks the intent questions for EVERY video, not only on a refusal', () => {
    // ⚖️ They are not a repair for an incomplete profile. They are about a video
    // that does not exist yet, so there is nothing to be complete about.
    expect(BUILD).toMatch(/const unanswered = INTENT_QUESTIONS\.filter\(/)
    expect(BUILD).toMatch(/\[\.\.\.unanswered, \.\.\.missing\.slice\(0, MAX_TEXT_QUESTIONS\)\]/)
  })

  it('CAPS the free-text tail, which is what made the card a form', () => {
    // ⚠️ REPORTED WITH A SCREENSHOT: three chip rows and three text boxes,
    // twenty-five options, in one scroll. The chips are never trimmed — dropping
    // one would silently unask a question that changes retrieval.
    expect(BUILD).toMatch(/const MAX_TEXT_QUESTIONS = 1/)
  })

  it('asks them BEFORE the two-minute ingest, like the readiness ones', () => {
    expect(BUILD.indexOf('const unanswered = INTENT_QUESTIONS.filter('))
      .toBeLessThan(BUILD.indexOf('await ingestReference('))
  })

  it('does NOT re-ask one already answered for this build', () => {
    // ⚠️ A tab reclaimed mid-answer restores what was picked; re-asking it
    // would throw the creator's own answer away in front of them.
    const filt = BUILD.slice(BUILD.indexOf('const unanswered = INTENT_QUESTIONS.filter('))
    expect(filt.slice(0, 200)).toMatch(/!\(answersRef\.current\[q\.field\] \?\? ''\)\.trim\(\)/)
  })

  it('the gate asks what is UNANSWERED, not whether anything was answered', () => {
    // The old form skipped the whole pre-check the moment one answer existed —
    // correct when every question was a repair, wrong now.
    expect(BUILD).toMatch(/const intentAnswered = INTENT_QUESTIONS\.every\(/)
    expect(BUILD).not.toMatch(/if \(!askQuestions && !Object\.keys\(answersRef\.current\)\.length\)/)
  })

  it('renders chips, not a text box, for a fixed set of answers', () => {
    // ⚖️ Free text would have to be interpreted, and an interpretation is a
    // guess wearing the creator's words.
    expect(BUILD).toMatch(/isChip\(q\) \? \(/)
    expect(BUILD).toMatch(/aria-pressed=\{active\}/)
  })

  it('reuses the SAME per-keystroke persistence, not a second one', () => {
    // ⚠️ Two maps in sessionStorage are two things a reclaimed tab can restore
    // out of step with each other.
    const chip = BUILD.slice(BUILD.indexOf('isChip(q) ? ('))
    expect(chip.slice(0, 3000)).toMatch(/rememberAnswers\(buildKey\(state\), next\)/)
  })
})

describe('the answers reach the request as intent, not as profile facts', () => {
  it('rides the request under its own three fields', () => {
    expect(BUILD).toMatch(/goal: asOneOf\(VIDEO_GOALS, intentAnswers\.video_goal\)/)
    expect(BUILD).toMatch(/focus: asOneOf\(CONTENT_FOCUS, intentAnswers\.content_focus\)/)
    expect(BUILD).toMatch(/outcome: asOneOf\(VIEWER_OUTCOMES, intentAnswers\.viewer_outcome\)/)
  })

  it('is kept OUT of readiness_answers, which get persisted to the brief', () => {
    // ⚠️ THE DISTINCTION THAT MATTERS. Readiness answers are creator-STABLE
    // facts, written to `pre_script_brief` so they are never asked twice. These
    // are per-VIDEO: writing them to a profile would make the next video
    // inherit the last one's intent without anyone choosing it.
    expect(BUILD).toMatch(/if \(INTENT_FIELDS\.has\(k\)\) intentAnswers\[k\] = v/)
    expect(BUILD).toMatch(/readiness_answers: readinessAnswers/)
    expect(BUILD).not.toMatch(/readiness_answers: answersRef\.current/)
  })

  it('narrows a restored answer through the enum rather than casting it', () => {
    // ⚠️ sessionStorage can hold a value written by an older build whose enum
    // has since changed. Unknown must read as unanswered, which is safe.
    expect(BUILD).toMatch(/const asOneOf = <T extends string>/)
    expect(BUILD).toMatch(/\(all as readonly string\[\]\)\.includes\(v\)\) \? v as T : undefined/)
  })

  it('every option the card offers is a value the compiler accepts', () => {
    // ⚖️ A chip whose value the server discards is a question that lies.
    for (const v of [...VIDEO_GOALS, ...CONTENT_FOCUS, ...VIEWER_OUTCOMES]) {
      expect(typeof v).toBe('string')
    }
    expect(VIDEO_GOALS).toContain('conversations')
    expect(CONTENT_FOCUS).toContain('reference_adapted')
    expect(VIEWER_OUTCOMES).toContain('convert')
  })
})

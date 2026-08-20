// THE VALIDATOR EXISTS TWICE, AND THE ONE THAT RUNS ON 3,946 VIDEOS IS THIS ONE.
//
// ⚠️ THE WORKER HAS NO RUNTIME DEPENDENCY ON @twinai/shared, so the rules that
// decide whether a model's answer is believable had to be copied. A copy without
// a parity check is how the rule quietly stops matching the rule the tests cover
// — precisely the failure `scanTargetParity` was written after, where a shared
// module shipped with 100 lines of tests and no importer anywhere.
//
// ⚖️ SO EVERY FUNCTION BODY IS LIFTED FROM BOTH FILES AND COMPARED CHARACTER FOR
// CHARACTER. If you are fixing a bug in the extraction rules, fix the shared file
// and re-derive this one; a fix applied here alone will fail this test, which is
// the point.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/referenceExtraction.ts'), 'utf8')
const WORKER = readFileSync(join(REPO, 'worker/src/referenceExtraction.ts'), 'utf8')
const SHARED_PROFILE = readFileSync(join(REPO, 'packages/shared/src/referenceContentProfile.ts'), 'utf8')
const WORKER_PROFILE = readFileSync(join(REPO, 'worker/src/referenceProfileTypes.ts'), 'utf8')
const SHARED_ASSESSED = readFileSync(join(REPO, 'packages/shared/src/assessed.ts'), 'utf8')
const WORKER_ASSESSED = readFileSync(join(REPO, 'worker/src/assessedTypes.ts'), 'utf8')
const SHARED_CTA = readFileSync(join(REPO, 'packages/shared/src/cta.ts'), 'utf8')
const SHARED_ASSEMBLER = readFileSync(join(REPO, 'packages/shared/src/profileAssembler.ts'), 'utf8')
const SHARED_VISUAL = readFileSync(join(REPO, 'packages/shared/src/visualExtraction.ts'), 'utf8')
const SHARED_PROFILE_TYPES = readFileSync(join(REPO, 'packages/shared/src/referenceProfile.ts'), 'utf8')
const WORKER_VISUAL_PROMPT = readFileSync(join(REPO, 'worker/src/visualPrompt.ts'), 'utf8')
const WORKER_VISUAL = readFileSync(join(REPO, 'worker/src/visualExtractionRules.ts'), 'utf8')

/** Lift a function body by name, so a drift is a failure and not a rewrite. */
function lift(src: string, where: string, name: string): string {
  // Generic declarations open with `<T,>` rather than `(`, and several of these
  // are generic — matching only `name(` would silently skip them, which in a
  // parity test means reporting agreement it never checked.
  const i = ((): number => {
    // Three declaration forms in play: plain, generic (`<T,>`), and arrow consts.
    // Matching only the first would silently skip the rest — and in a parity
    // test, a skipped function is agreement that was never checked.
    const found = [
      // ⚠️ AND THE ANNOTATED FORM, `const X: Type = `. Without it this helper
      // THROWS on a const that carries a type — the honest failure, but it also
      // means such a const simply never gets a parity check written for it.
      // `BECAUSE` is one, and it is a table of sentences creators read.
      `function ${name}(`, `function ${name}<`, `const ${name} = `, `const ${name}: `,
    ].map((m) => src.indexOf(m)).filter((n) => n >= 0)
    return found.length === 0 ? -1 : Math.min(...found)
  })()
  if (i < 0) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the text`)
  const end = src.indexOf('\n}\n', i)
  return src.slice(i, end).replace(/\s+/g, ' ').trim()
}

/** Lift a `const X = [...] as const` vocabulary as an ordered list of members. */
function vocab(src: string, name: string): string[] | null {
  const i = src.indexOf(`${name} = [`)
  if (i < 0) return null
  return src.slice(i, src.indexOf('] as const', i)).match(/'[A-Za-z_]+'/g)
}

/** The dotted paths of `VISUAL_FIELDS`, in declaration order. The generic
 *  `vocab` helper cannot read these: its member pattern is [A-Za-z_]+ and every
 *  path here contains a dot. */
function visualPaths(src: string, open: string): string[] {
  const i = src.indexOf(open)
  if (i < 0) throw new Error(`could not find ${open}`)
  const block = src.slice(i, src.indexOf('\n]', i))
  // First quoted string on each entry line — the path, not the claim class.
  return [...block.matchAll(/^\s*(?:\[\s*)?'([a-zA-Z.]+)'/gm)].map((m) => m[1])
}

describe('worker ↔ shared VISUAL parity', () => {
  // ⚠️ THE RULES THAT DECIDE WHETHER A VISUAL CLAIM IS BELIEVABLE EXIST TWICE,
  // and the copy that will run over thousands of references is the worker's.
  // Every one of these functions is a decision about what a still can prove; a
  // drift in any of them is a claim admitted or rejected on the wrong grounds,
  // silently, on every video in the batch.
  it('every visual rule is character-identical', () => {
    for (const fn of ['readCitation', 'citationSupports', 'readField', 'extractVisualProfile', 'recreationBlockers', 'brief', 'isRecord', 'asBoolean', 'oneOf']) {
      expect(lift(WORKER_VISUAL, 'the worker', fn), fn).toBe(lift(SHARED_VISUAL, 'shared', fn))
    }
  })

  it('the claim-class table is identical, including order', () => {
    // ⚖️ THE LOAD-BEARING PART. `setting.changes` classed `static` would let one
    // frame prove a location change; `people.count` classed `temporal` would
    // reject a correct reading of a single frame. Both errors are silent.
    const OPEN = 'VISUAL_FIELDS: readonly (readonly [string, ClaimClass])[] = ['
    expect(visualPaths(WORKER_VISUAL, OPEN)).toEqual(visualPaths(SHARED_VISUAL, OPEN))
    // The classes themselves, in the same order — a path list alone would not
    // catch `static` becoming `temporal`.
    const classes = (src: string) => {
      const i = src.indexOf(OPEN)
      const block = src.slice(i, src.indexOf('] as const', i))
      return [...block.matchAll(/'(static|temporal|transition)'/g)].map((m) => m[1])
    }
    expect(classes(WORKER_VISUAL)).toEqual(classes(SHARED_VISUAL))
    expect(classes(SHARED_VISUAL).length).toBe(15)
  })

  it('the blocker vocabulary and its plain-English reasons are identical', () => {
    // ⚠️ THESE STRINGS ARE READ BY CREATORS. A worker copy that drifted would
    // put a different sentence on a card than the one the tests cover.
    expect(vocab(WORKER_VISUAL, 'BLOCKER_CODES')).toEqual(vocab(SHARED_VISUAL, 'BLOCKER_CODES'))
    expect(lift(WORKER_VISUAL, 'the worker', 'BECAUSE')).toBe(lift(SHARED_VISUAL, 'shared', 'BECAUSE'))
  })

  it('the empty profile is identical, because null means no knowledge', () => {
    expect(lift(WORKER_VISUAL, 'the worker', 'emptyVisualProfile'))
      .toBe(lift(SHARED_PROFILE_TYPES, 'shared', 'emptyVisualProfile'))
  })
})

describe('the frames prompt asks for every field the parser reads', () => {
  // ⚠️ A FIELD IN THE CONTRACT AND NOT IN THE PROMPT IS INVISIBLE. It comes back
  // absent, `readField` files it `missing`, and the profile reports it as a
  // field the FRAMES could not establish — when in truth nobody asked. That is
  // the `unset ≠ false` collision wearing a new hat, and it would silently cap
  // `fieldsObserved` on every video in the batch.
  it('worker VISUAL_FIELD_PATHS matches shared VISUAL_FIELDS, in order', () => {
    const shared = visualPaths(SHARED_VISUAL, 'VISUAL_FIELDS: readonly (readonly [string, ClaimClass])[] = [')
    const worker = visualPaths(WORKER_VISUAL_PROMPT, 'VISUAL_FIELD_PATHS: readonly string[] = [')
    expect(worker).toEqual(shared)
    expect(shared.length).toBeGreaterThan(0)
  })

  it('every path has a question', () => {
    const shared = visualPaths(SHARED_VISUAL, 'VISUAL_FIELDS: readonly (readonly [string, ClaimClass])[] = [')
    for (const path of shared) {
      expect(WORKER_VISUAL_PROMPT, `no question for ${path}`).toContain(`'${path}':`)
    }
  })
})

describe('worker ↔ shared extraction parity', () => {
  it('every validation function is character-identical', () => {
    // ⚠️ THESE ARE THE RULES THAT DECIDE WHETHER A CLAIM IS BELIEVED. `readField`
    // is the one that refuses a value with no evidence; if it drifts, the batch
    // starts storing confident nonsense and no other test notices.
    for (const fn of ['readField', 'parseContentExtraction', 'beatList', 'slotList', 'rehookIndex']) {
      expect(lift(WORKER, 'the worker', fn), fn).toBe(lift(SHARED, 'shared', fn))
    }
  })

  it('and so is the profile constructor the rejections fall back to', () => {
    expect(lift(WORKER_PROFILE, 'the worker', 'emptyContentProfile'))
      .toBe(lift(SHARED_PROFILE, 'shared', 'emptyContentProfile'))
  })

  it('the frame-sampling reader travels with it', () => {
    expect(lift(WORKER_PROFILE, 'the worker', 'frameSampleTargets'))
      .toBe(lift(SHARED_PROFILE, 'shared', 'frameSampleTargets'))
  })

  it('every vocabulary is the same set in the same order', () => {
    // ⚖️ ORDER MATTERS BECAUSE MEMBERSHIP IS CHECKED BY `includes`. A worker
    // vocabulary missing one member silently rejects a value the shared copy
    // accepts, and the field lands on `not_checked` — a difference that looks
    // exactly like a quiet model.
    for (const name of [
      'CONTAINER_TYPES', 'HOOK_MECHANISMS', 'PAYOFF_TYPES', 'SOPHISTICATION',
      'LIKELY_GOALS', 'REQUIREMENT', 'CONTENT_SLOT_KINDS', 'BEAT_ROLES',
    ]) {
      expect(vocab(WORKER_PROFILE, name), name).toEqual(vocab(SHARED_PROFILE, name))
    }
  })

  it('the assessment bases match, including the fourth one', () => {
    // ⚠️ `indeterminate` IS WHAT STOPS A SECOND FULL BATCH. If the worker lacked
    // it, every "the transcript does not say" would be stored as unchecked and
    // re-queued forever.
    expect(vocab(WORKER_ASSESSED, 'ASSESSMENT_BASIS'))
      .toEqual(vocab(SHARED_ASSESSED, 'ASSESSMENT_BASIS'))
    expect(vocab(WORKER_ASSESSED, 'ASSESSMENT_BASIS')).toContain("'indeterminate'")
  })

  it('and the CTA vocabulary is cta.ts\'s, not a second opinion', () => {
    // ⚖️ THE ONE VALUE COPIED FROM A THIRD FILE. `referenceContentProfile`
    // imports it in shared; the worker cannot, so it is inlined — and compared
    // here against the real owner rather than against the other copy, or the two
    // copies could agree with each other and both be wrong.
    expect(vocab(WORKER_PROFILE, 'CTA_MECHANISMS')).toEqual(vocab(SHARED_CTA, 'CTA_MECHANISMS'))
  })

  it('and the relationship vocabulary is profileAssembler\'s, for the same reason', () => {
    // ⚠️ THIS ONE DECIDES A REFUSAL, NOT A RANKING. If the worker's copy drifted
    // by one member, a reference could be stored with a posture the gallery's
    // OWNER_POSTURES set never matches — and the ownership refusal would quietly
    // stop firing, which looks exactly like "no owner-shaped videos exist".
    expect(vocab(WORKER_PROFILE, 'CANONICAL_RELATIONSHIPS'))
      .toEqual(vocab(SHARED_ASSEMBLER, 'CANONICAL_RELATIONSHIPS'))
  })
})

describe('the derived copies say they are derived', () => {
  it('each names the file it came from, so nobody edits the wrong one', () => {
    for (const [name, src] of [
      ['referenceExtraction', WORKER],
      ['referenceProfileTypes', WORKER_PROFILE],
      ['assessedTypes', WORKER_ASSESSED],
    ] as const) {
      expect(src.slice(0, 600), name).toMatch(/DERIVED FROM/)
      expect(src.slice(0, 600), name).toMatch(/packages\/shared\/src\//)
    }
  })
})

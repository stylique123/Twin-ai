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
      `function ${name}(`, `function ${name}<`, `const ${name} = `,
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

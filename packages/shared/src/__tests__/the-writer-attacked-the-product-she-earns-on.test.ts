// IT WROTE FIVE HOOKS AGAINST THE PRODUCT SHE TAKES A COMMISSION ON.
//
// ⚠️⚠️ OBSERVED ON LIVE RUNS, TWICE, ON ONE AFFILIATE PRODUCT. Asked to explain
// a postpartum support band she earns commission on — and then asked why she
// recommends it — the writer produced:
//
//   "a postpartum belly band will not heal your deep core"
//   "wearing a belly band all day actually weakens your core"
//   "stop wrapping your belly"  ·  "stop relying on waist wraps"
//
// One of those runs identified the subject in its own adaptation note as "a
// commercial product showcase featuring branded postpartum support bands", and
// then wrote a video telling viewers they do not need one. No disclosure, because
// the product was not in the script it was arguing against.
//
// ⚠️ SILENCE WAS NEVER THE FAILURE MODE. Given no product the writer does not
// abstain — it invents a stance, and the contrarian hook is the most rewarded
// shape in this niche, so the stance lands against whatever the video is
// nominally about. Getting the product to the prompt removes the CAUSE in the
// cases that fix covers; this removes the OUTPUT in every case.
//
// ⚖️ EXECUTED, NOT READ. The rule is transpiled out of the edge file and run,
// because a regex over source cannot tell whether a rule fires.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

// ⚖️ THE EXPRESSION IS LIFTED AND WRAPPED IN A FUNCTION, so the two inputs that
// decide it — a subject product and a mentioned product — are supplied as
// arguments rather than asserted about in prose.
function loadStanceRule(): (subjectName: string | null, mentionName: string) => string {
  const start = EDGE.indexOf('const stanceProductName = String(')
  expect(start, 'the stance rule must exist in the edge function').toBeGreaterThan(-1)
  const end = EDGE.indexOf('\n\n', EDGE.indexOf('const productStanceLine', start))
  expect(end).toBeGreaterThan(start)
  const body = EDGE.slice(start, end)
  const js = transformSync(
    `function rule(ownedEntity, mentionedProductName) {\n${body}\n return productStanceLine }`,
    { loader: 'ts', format: 'cjs' },
  ).code
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${js}; return rule`)() as (o: unknown, m: string) => string
  return (subjectName, mentionName) => fn(subjectName === null ? null : { name: subjectName }, mentionName)
}

const stance = loadStanceRule()

const BAND = 'Bloom Postpartum Support Band'

describe('a selected product gets the rule, however it was selected', () => {
  it('fires for the subject product', () => {
    expect(stance(BAND, '')).toContain(BAND)
  })

  it('fires for a MENTIONED product too, which is the audited case', () => {
    // ⚠️⚠️ THE RUNS THAT FAILED WERE NON-COMMERCIAL OBJECTIVES — "explain it"
    // and "why I made it" — where the product travels as a mention, not a
    // subject. A rule that only covered the subject would not have covered a
    // single one of the observed failures.
    expect(stance(null, BAND)).toContain(BAND)
  })

  it('and the subject wins when both are present, because it names one product', () => {
    expect(stance('90-Day 1:1 Coaching', BAND)).toContain('90-Day 1:1 Coaching')
    expect(stance('90-Day 1:1 Coaching', BAND)).not.toContain(BAND)
  })
})

describe('no product, no rule', () => {
  it('stays empty when nothing was selected', () => {
    // ⚖️ AN IDEA VIDEO MAY STILL CRITICISE A PRODUCT CATEGORY. This rule is
    // about the product SHE CHOSE; extending it to every video would make Twin
    // unable to write an honest critique of anything, which is a different
    // product.
    expect(stance(null, '')).toBe('')
    expect(stance('', '')).toBe('')
  })

  it('whitespace is not a product name', () => {
    expect(stance('   ', '')).toBe('')
  })
})

describe('what it forbids is arguing against, and nothing wider', () => {
  const line = stance(BAND, '')

  it('forbids the four shapes the live runs actually produced', () => {
    expect(line).toMatch(/does not work/i)
    expect(line).toMatch(/harmful/i)
    expect(line).toMatch(/unnecessary/i)
    expect(line).toMatch(/stop using it/i)
  })

  it('forbids positioning the creator against the category', () => {
    // ⚠️ "HERE IS THE PART MOST COMPANIES SKIP" was one of the observed hooks —
    // positioning her against the industry she takes commission from. Banning
    // only direct attacks on the named product would have let that one through.
    expect(line).toMatch(/category/i)
  })

  it('does NOT require praise, and says so', () => {
    // ⚠️⚠️ THE FAILURE MODE OF THIS VERY FIX. "Be positive about the product"
    // would manufacture exactly the claims the claim rules spend seventy lines
    // refusing — a worse defect than the one being fixed, introduced by the fix.
    expect(line).toMatch(/NOT required to praise/i)
    expect(line).toMatch(/must not invent a benefit/i)
  })

  it('leaves silence available', () => {
    expect(line).toMatch(/saying nothing about it at all/i)
  })

  it('still permits a limit THE CREATOR stated in her own words', () => {
    // ⚖️ HER OWN FRAMING OF THIS PRODUCT WAS "support while you heal, not a
    // fix", and the one run that worked used it. A rule that banned every
    // qualifying sentence would delete the most credible thing an affiliate
    // creator can say.
    expect(line).toMatch(/limit THE CREATOR STATED/i)
    expect(line).toMatch(/in their words/i)
  })
})

describe('the rule reaches the prompt', () => {
  it('is interpolated into the template, not merely computed', () => {
    // ⚖️ A COMPUTED STRING THAT NEVER REACHES THE TEMPLATE is the shape
    // `creator_summary` had for a whole release, and this repo has been caught
    // by it before.
    expect(EDGE).toContain('${mentionLine}${productStanceLine}${evidenceBlock}')
  })
})

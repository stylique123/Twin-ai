// A PAID BRAND WITH NO DISCLOSURE IS NOT RETURNED.
//
// ⚠️ MEASURED: three of four idea-mode runs named a sponsor the creator never
// mentioned; one carried an efficacy claim about a product she has never used,
// an invented price, and no disclosure — on a paid relationship.
//
// ⚠️ AND THE RULE COULD NOT FIRE. `generate-blueprint` derived
// `disclosureRequired` from a relationship read out of a query filtered to
// OWN_PRODUCT/OWN_SERVICE, so it was structurally always false — a live-looking
// branch guarding a state the system could not enter. Sponsored and affiliate
// products becoming selectable is what turns it into a real obligation.
import { describe, expect, it } from 'vitest'
import {
  disclosureRequiredFor, textDiscloses, scriptDiscloses,
  disclosureRefusalMessage, DISCLOSURE_PHRASES,
} from '../disclosureCheck'
import { ENTITY_RELATIONSHIPS } from '../productEntity'

const beat = (line: string) => ({ line })

describe('who owes a disclosure', () => {
  it('the paid ties, and only those', () => {
    expect(disclosureRequiredFor('SPONSOR')).toBe(true)
    expect(disclosureRequiredFor('AFFILIATE')).toBe(true)
    expect(disclosureRequiredFor('OWN_PRODUCT')).toBe(false)
    expect(disclosureRequiredFor('OWN_SERVICE')).toBe(false)
    expect(disclosureRequiredFor('REVIEW_ONLY')).toBe(false)
  })

  it('reads the entitlement table rather than listing relationships again', () => {
    // ⚖️ A SECOND LIST HERE would be a second answer to one question — the
    // two-derivations defect the capability question had. Every relationship in
    // the enum gets an answer, which is only true if the table is the source.
    for (const r of ENTITY_RELATIONSHIPS) {
      expect(typeof disclosureRequiredFor(r), r).toBe('boolean')
    }
  })

  it('no product means no obligation', () => {
    // ⚠️ MOST VIDEOS SELL NOTHING. The edge asks the relationship first and
    // only then the script, so a null relationship never reaches this check —
    // pinned here as the rule rather than left to the call site.
    expect(scriptDiscloses([beat('hello')])).toBe(false)
  })
})

describe('what counts as disclosing it', () => {
  it('recognises the ordinary ways creators say it', () => {
    for (const p of ['This is a paid partnership.', 'They sent me this one.', 'I earn a commission if you buy it.']) {
      expect(textDiscloses(p), p).toBe(true)
    }
  })

  it('does NOT match "ad" inside ordinary words', () => {
    // ⚠️ "ready", "already" and "advice" all contain "ad". A bare substring test
    // would report every second script as disclosed, which is the failure mode
    // that makes a compliance check worthless — the same shape as `one` inside
    // "money" in the count contract.
    for (const p of ['I am ready to film', 'I already told you', 'here is my advice']) {
      expect(textDiscloses(p), p).toBe(false)
    }
    expect(DISCLOSURE_PHRASES).not.toContain('ad')
  })

  it('says nothing about an empty or missing script', () => {
    expect(textDiscloses('')).toBe(false)
    expect(textDiscloses(null)).toBe(false)
    expect(scriptDiscloses([])).toBe(false)
    expect(scriptDiscloses(null)).toBe(false)
  })
})

describe('early and out loud is part of the obligation', () => {
  const four = (discloseAt: number) =>
    [0, 1, 2, 3].map((i) => beat(i === discloseAt ? 'This is a paid partnership.' : 'A line.'))

  it('a disclosure in the last beat does not count', () => {
    // ⚠️ MOST VIEWERS NEVER REACH IT. The prompt already says "early, not buried
    // at the very end"; the check reads the same way, or the instruction is one
    // more thing nobody verifies.
    expect(scriptDiscloses(four(3))).toBe(false)
    expect(scriptDiscloses(four(0))).toBe(true)
    expect(scriptDiscloses(four(2))).toBe(true)
  })

  it('a one- or two-beat script is exempt from the position rule', () => {
    // ⚖️ "NOT LAST" IS NOT A CONSTRAINT when there is nowhere else to put it.
    expect(scriptDiscloses([beat('Sponsored by them.')])).toBe(true)
    expect(scriptDiscloses([beat('A line.'), beat('Sponsored by them.')])).toBe(true)
  })
})

describe('the verdict, and what the creator is told', () => {
  it('refuses a paid product whose script never says so', () => {
    // THE MEASURED RUN, in two parts: the tie obliges, the script is silent.
    expect(disclosureRequiredFor('SPONSOR')).toBe(true)
    expect(scriptDiscloses([
      beat('Stop buying the viral pads.'), beat('They are gentle.'), beat('Link below.'),
    ])).toBe(false)
  })

  it('returns a paid product whose script does say so', () => {
    expect(scriptDiscloses([
      beat('This is a paid partnership with them.'), beat('Here is what it does.'), beat('Link below.'),
    ])).toBe(true)
  })

  it('never refuses a product the creator owns', () => {
    expect(disclosureRequiredFor('OWN_PRODUCT')).toBe(false)
  })

  it('the message names the product and what Twin looked for', () => {
    // ⚠️ A REFUSAL THAT CANNOT BE UNDERSTOOD IS ONE PEOPLE ROUTE AROUND. A
    // creator who disclosed in words outside the list must be able to see why
    // it was not recognised.
    const m = disclosureRefusalMessage('Medicube Zero Pore Pad')
    expect(m).toContain('Medicube Zero Pore Pad')
    expect(m).toMatch(/paid partnership|sponsored/)
    expect(m).toMatch(/early/)
    expect(m).not.toMatch(/_|null|undefined/)
  })

  it('still reads as a sentence when the product has no name yet', () => {
    expect(disclosureRefusalMessage(null)).toContain('a product you are paid to feature')
    expect(disclosureRefusalMessage('  ')).toContain('a product you are paid to feature')
  })
})

// ── AND THE EDGE ENFORCES IT ──────────────────────────────────────────────
//
// ⚖️ THE EDGE CANNOT IMPORT @twinai/shared, so the rule lives twice and this
// copy is the tested one. Without these the check would be a module nobody
// runs — the defect class this session has spent the day closing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const CARD = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

describe('the obligation is reachable, and it is checked', () => {
  it('a paid tie can now be CHOSEN — this is what makes the rule real', () => {
    expect(EDGE).toMatch(/\.in\('relationship', \['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR'\]\)/)
    expect(CARD).toMatch(/p\.relationship === 'AFFILIATE' \|\| p\.relationship === 'SPONSOR'/)
  })

  it('but the STOPGAP still cannot auto-select one', () => {
    // ⚠️ THE ASYMMETRY IS THE POLICY. A creator asking for a video about their
    // sponsored product has said so; auto-selecting one they never mentioned
    // would infer a paid promotion from nothing.
    const stopgap = EDGE.slice(EDGE.indexOf('data: stopgapEntity'))
    expect(stopgap.slice(0, 900)).toMatch(/\.in\('relationship', \['OWN_PRODUCT', 'OWN_SERVICE'\]\)/)
    expect(stopgap.slice(0, 900)).not.toMatch(/'SPONSOR'/)
  })

  it('refuses the script, and refunds, rather than patching it', () => {
    // ⚠️ THE CREATOR HAS ALREADY BEEN CHARGED by this point. Charging for a
    // script we will not hand over is the one outcome worse than either.
    expect(EDGE).toMatch(/code: 'DISCLOSURE_MISSING'/)
    expect(EDGE).toMatch(/await refundOnce\('disclosure_missing'\)/)
    const at = EDGE.indexOf("code: 'DISCLOSURE_MISSING'")
    expect(EDGE.lastIndexOf("await refundOnce('disclosure_missing')", at)).toBeGreaterThan(-1)
  })

  it('the two copies share the phrase list and the position rule', () => {
    for (const phrase of DISCLOSURE_PHRASES) expect(EDGE, phrase).toContain(`'${phrase}'`)
    // ⚖️ THE POSITION RULE TOO, not only the words: a disclosure in the last
    // beat must fail on both sides or one of them is a different rule.
    expect(EDGE).toMatch(/return at < lines\.length - 1/)
    expect(EDGE).toMatch(/if \(lines\.length <= 2\) return true/)
  })

  it('and "ad" is not in either list', () => {
    expect(EDGE).not.toMatch(/'ad',/)
  })
})

describe('the creator reads the shared words, not a second copy', () => {
  it('the build screen renders the refusal from this module', () => {
    // ⚠️ TWO TEXTS FOR ONE RULE DRIFT. The server's sentence stays as the
    // fallback for callers that are not this screen; the words a creator reads
    // live where the rule lives.
    expect(CARD).toMatch(/code === 'DISCLOSURE_MISSING'/)
    expect(CARD).toMatch(/disclosureRefusalMessage\(named\)/)
  })
})

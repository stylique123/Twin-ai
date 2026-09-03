/**
 * A DISCLAIMER IS NOT A CALL TO ACTION, AND FILING IT AS ONE INVERTS IT.
 *
 * ⚠️ FOUND ON A REAL LICENSED PROFESSIONAL. The scan of a Senior MSK
 * Physiotherapist captured this as a recurring CTA:
 *
 *     "Always discuss this with your physiotherapist or surgeon."
 *
 * He writes it on rehab posts, beside "I can't provide individual
 * rehabilitation advice through social media". It is a safety disclaimer.
 *
 * ⚖️ THE TWO FILINGS PRODUCE OPPOSITE BEHAVIOUR. A recurring CTA is something
 * scripts may END ON — a thing to say to drive an action. A claim restriction
 * is something scripts must OBEY. Filed as a CTA, his safety line becomes a
 * closing flourish. Filed correctly, it becomes a boundary the writer cannot
 * cross. Same sentence, opposite meaning, decided by which array it lands in.
 *
 * ⚠️ AND THE COMPLIANCE PIPE ALREADY WORKS. `forbiddenClaims` runs
 * Onboarding.tsx:1603 → api.ts:1586 → generate-blueprint:5745, where it becomes
 * a COMPLIANCE block telling the writer these are "not negotiable against
 * anything the reference does". So this is not a missing mechanism. The
 * mechanism is armed and we were feeding it nothing, while the answer sat one
 * field away in the wrong bucket.
 */

/** Normalise for matching only. The ORIGINAL string is what survives — a
 *  creator's own words are what a compliance field must show back to them. */
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()

/**
 * ⚖️ INTENT PATTERNS, NOT KEYWORDS. "Consult" alone would catch "consult my
 * free guide", which is a genuine CTA. Each pattern below requires the
 * SAFETY-REFERRAL shape: deferring to a professional, or disowning the advice.
 * A rule that swallows real CTAs costs the creator their closing line, which is
 * the failure this fix exists to prevent — in the other direction.
 */
const DISCLAIMER_PATTERNS: readonly RegExp[] = Object.freeze([
  // Defer to a named professional.
  /\b(?:always|please|do)?\s*(?:discuss|consult|speak|talk|check)\s+(?:this\s+|it\s+)?with\s+(?:your|a|an)\s+(?:doctor|gp|physician|physio\w*|surgeon|therapist|clinician|specialist|nurse|dentist|vet|pharmacist|lawyer|solicitor|attorney|accountant|adviser|advisor|financial\b[\w\s]*)/i,
  /\bcleared\s+by\s+(?:your|a|an)\s+(?:doctor|gp|physio\w*|surgeon|clinician|specialist)/i,
  /\bseek\s+(?:professional|medical|legal|financial)\s+(?:advice|guidance|help)/i,
  // Disown the advice.
  /\bnot\s+(?:medical|legal|financial|dietary|veterinary|investment|tax)\s+advice\b/i,
  /\bthis\s+is\s+not\s+(?:a\s+)?(?:diagnosis|treatment|prescription)\b/i,
  /\b(?:can(?:'|no)?t|cannot|unable to)\s+(?:provide|give|offer)\s+(?:individual|personal|personalised|personalized|specific)\s+\w*\s*(?:advice|guidance|rehabilitation|treatment)/i,
  /\bfor\s+(?:educational|informational)\s+purposes\s+only\b/i,
  /\bnot\s+a\s+substitute\s+for\s+(?:professional|medical|legal)\b/i,
  // Outcome hedges a regulator cares about.
  /\bresults?\s+(?:may|will)\s+vary\b/i,
  /\bindividual\s+results\s+vary\b/i,
])

/** Is this line a safety disclaimer rather than a call to action? */
export function isDisclaimer(line: unknown): boolean {
  if (typeof line !== 'string') return false
  const t = norm(line)
  if (t === '') return false
  return DISCLAIMER_PATTERNS.some((re) => re.test(t))
}

export interface SplitCtas {
  /** What survives as a genuine call to action. Order preserved. */
  ctas: string[]
  /** Safety disclaimers, in the creator's own words, for the claims field. */
  disclaimers: string[]
}

/**
 * Split what the scan called "recurring CTAs" into the two things it actually
 * contains.
 *
 * ⚠️ ORDER AND WORDING ARE PRESERVED IN BOTH LISTS. The disclaimers are shown
 * back to the creator for confirmation, so they must read as the sentence they
 * wrote, not as our paraphrase of it. Duplicates are collapsed case-insensitively
 * because a phrase repeated across twenty captions is one restriction.
 */
export function splitDisclaimersFromCtas(raw: unknown): SplitCtas {
  if (!Array.isArray(raw)) return { ctas: [], disclaimers: [] }
  const ctas: string[] = []
  const disclaimers: string[] = []
  const seenCta = new Set<string>()
  const seenDis = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (t === '') continue
    const key = norm(t)
    if (isDisclaimer(t)) {
      if (!seenDis.has(key)) { seenDis.add(key); disclaimers.push(t) }
    } else if (!seenCta.has(key)) {
      seenCta.add(key); ctas.push(t)
    }
  }
  return { ctas, disclaimers }
}

/**
 * The claims-field prefill, as ONE string, because that is what the field holds.
 *
 * ⚖️ IT IS OFFERED AS A GUESS, NEVER AS AN ANSWER. The caller marks it. A
 * restriction the creator never confirmed is still our inference about their
 * registration, and presenting it as settled is how a creator stops reading a
 * screen that is telling them something they need to check.
 */
export function claimsPrefillFrom(disclaimers: readonly string[]): string | null {
  const kept = disclaimers.map((d) => d.trim()).filter((d) => d !== '')
  return kept.length === 0 ? null : kept.join(' · ')
}

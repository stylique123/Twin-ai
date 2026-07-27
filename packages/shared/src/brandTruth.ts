// Track C · Batch A.1 — `BrandTruthSnapshotV1`.
//
// AUTHORITY: docs/twinai-selective-transfer-reasoning-contract.md, sha256
// 3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07.
// §2.3 (define one versioned snapshot, project once, validate strictly, hash,
// never reread mutable live DNA), §5 (authority hierarchy), §10.2 (per-field
// provenance and confidence; inferred business facts are never authoritative).
//
// WHY THIS IS AN EXPLICIT PROJECTION AND NOT A RE-TYPED `VoiceProfile`
// -------------------------------------------------------------------
// The Batch A drift audit (docs/track-c-batch-a-dna-drift-audit.md, against exact
// main 42eb0d5) established that the shared type is a DESCRIPTION, NOT A GATE:
// `dna-poll/index.ts:288` writes the provider object straight into
// `brand_voices.profile` with no projection through `VoiceProfile`. Tightening
// the interface therefore changes nothing about what is stored. Three findings
// follow from that, and this module is shaped by them:
//
//   D1 `editing_style` — produced and stored, absent from `VoiceProfile`, and not
//      in the runtime REQUIRED set. Read from the RAW stored object, and when it
//      is missing say so explicitly instead of defaulting.
//   D2 `brand_colors` vs `BrandKit.palette` — TWO HOMES FOR ONE FACT, written in
//      the same statement and never reconciled. Resolved here by a stated
//      precedence, with the loser RECORDED rather than dropped.
//   D3 `goal` — exists only in the self-reported `CreatorDNA`. It is authority
//      level 2 (user intent). Nothing synthesized may occupy that slot, because
//      synthesis is level 6.
//
// A fourth finding drives the absence handling: the runtime REQUIRED list omits
// exactly the two fields the shared type cannot see, while the synthesis prompt
// insists "a confident, specific inference is far more useful than a blank". The
// system pressures the model to fill everything and enforces the least. So an
// absent field is recorded as absent WITH A REASON — never silently defaulted,
// and never invented.

// ---------------------------------------------------------------- provenance

/**
 * How a field's value came to exist. §10.2 requires this per field, and D3 is why
 * it cannot be per object: `goal` is `user_asserted` while `offer` sitting beside
 * it in the same snapshot is `inferred`.
 */
export type Provenance = 'observed' | 'user_asserted' | 'derived' | 'inferred'

/** §5 authority hierarchy, as the number each provenance may occupy. */
export const AUTHORITY_LEVEL: Record<Provenance, number> = {
  observed: 4,        // source recording reality / what was actually seen
  user_asserted: 2,   // user intent
  derived: 5,         // computed from evidence
  inferred: 6,        // model inference — labelled, bounded, never factual
}

/** Why a field has no value. Recorded instead of defaulting (§7 Step 1). */
export type AbsenceReason =
  | 'not_produced_by_synthesis'
  | 'not_in_required_set_and_omitted'
  | 'no_self_reported_value'
  | 'source_record_missing'
  | 'rejected_wrong_authority_level'

export interface TruthField<T> {
  value: T | null
  provenance: Provenance | null
  /** 0..1000 milli-units. Integer, so a snapshot hashes byte-identically. */
  confidenceMilli: number
  /** Non-null exactly when `value` is null. */
  absenceReason: AbsenceReason | null
  /**
   * Whether this field may be cited as TRUTH. False for anything inferred that
   * carries a business fact — such a value may still inform a bounded creative
   * choice, but it can never become an authoritative claim (§10.2).
   */
  authoritative: boolean
}

// ------------------------------------------------------------------ snapshot

/**
 * Fields whose value is a BUSINESS FACT. §5 puts these at level 1 (verified
 * business truth) and §6 lists them among `prohibitedTransfers`. An inferred
 * value for one of these is retained but is NEVER authoritative.
 */
export const BUSINESS_FACT_FIELDS = [
  'product', 'offer', 'audience', 'pricing', 'claims',
] as const
export type BusinessFactField = (typeof BUSINESS_FACT_FIELDS)[number]

/**
 * Fields that express USER INTENT (§5 level 2). Only the user may assert them.
 * A synthesized value must be REFUSED rather than placed here — that is D3's
 * whole point, and the mutation control proves the check is load-bearing.
 */
export const USER_INTENT_FIELDS = ['goal'] as const
export type UserIntentField = (typeof USER_INTENT_FIELDS)[number]

export interface BrandColorSet {
  primary: string | null
  secondary: string | null
  highlight: string | null
}

/** A fact that had two homes and had to be resolved. D2. */
export interface TruthConflict {
  field: string
  /** Every candidate seen, in the order the precedence rule considered them. */
  candidates: Array<{ source: string; value: string }>
  chosenSource: string
  /** The rule that decided, named so the choice is auditable, not opaque. */
  resolution:
    | 'manual_brand_kit_wins'
    | 'brand_kit_is_the_rendered_home'
    | 'synthesis_only_candidate'
    | 'brand_kit_pending_so_synthesis_used'
}

export interface BrandTruthSnapshotV1 {
  schemaVersion: 1
  ownerId: string
  brandVoiceId: string | null

  /** Level 1. Only `observed` or `user_asserted` values are authoritative here. */
  businessTruth: {
    product: TruthField<string>
    offer: TruthField<string>
    audience: TruthField<string>
    audiencePain: TruthField<string>
    dreamOutcome: TruthField<string>
  }

  /** Level 2. `user_asserted` ONLY — anything else is refused. */
  userIntent: {
    goal: TruthField<string>
    platforms: TruthField<string[]>
  }

  /** Level 3. Pinned brand truth: how it sounds and looks. */
  brandVoice: {
    summary: TruthField<string>
    niche: TruthField<string>
    subNiche: TruthField<string>
    tone: TruthField<string>
    pacing: TruthField<string>
    hookStyle: TruthField<string>
    hookPatterns: TruthField<string[]>
    vocabulary: TruthField<string[]>
    recurringCtas: TruthField<string[]>
    pov: TruthField<string[]>
    enemy: TruthField<string>
    dos: TruthField<string[]>
    donts: TruthField<string[]>
    sampleHooks: TruthField<string[]>
    formats: TruthField<string[]>
    titleStyle: TruthField<string>
    thumbnailStyle: TruthField<string>
    /** D1: produced and stored, invisible to `VoiceProfile`. Read from raw. */
    editingStyle: TruthField<string>
  }

  visualIdentity: {
    /** D2: resolved from the two homes, with the loser recorded in `conflicts`. */
    colors: TruthField<BrandColorSet>
    logoPath: TruthField<string>
  }

  /** Values that exist but may never be cited as truth. Never silently dropped. */
  nonAuthoritativeSignals: Array<{ field: string; reason: string }>
  /** Every two-homes reconciliation this projection had to perform. */
  conflicts: TruthConflict[]
  /** Fields with no value, each carrying why. */
  absences: Array<{ field: string; reason: AbsenceReason }>
}

// -------------------------------------------------------------- projection

export class BrandTruthError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'BrandTruthError'
    this.code = code
  }
}

/** The inputs the projection is allowed to read. Nothing else. */
export interface BrandTruthSources {
  ownerId: string
  brandVoiceId: string | null
  /** `profiles.dna` — SELF-REPORTED. Authority level 2. */
  selfReported: Record<string, unknown> | null
  /**
   * `brand_voices.profile` — the RAW stored synthesis object, deliberately typed
   * as an open record rather than `VoiceProfile`. The audit showed the interface
   * is not on the write path, so typing this parameter as `VoiceProfile` would
   * make D1 and D2 unreadable by construction.
   */
  synthesized: Record<string, unknown> | null
  /** `brand_voices` brand-kit columns. */
  brandKit: {
    palette?: { primary?: string; secondary?: string; highlight?: string }
    palette_source?: 'auto' | 'manual' | 'pending'
    logo_path?: string | null
  } | null
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t === '') return null
  // The synthesis prompt forbids these, which is exactly why they must be caught:
  // a placeholder that reaches the snapshot becomes a "fact" downstream.
  if (/^(n\/a|na|unspecified|unknown|none|tbd)$/i.test(t)) return null
  return t
}

function strArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.map(str).filter((s): s is string => s !== null)
  return out.length === 0 ? null : out
}

function present<T>(value: T, provenance: Provenance, confidenceMilli: number, authoritative: boolean): TruthField<T> {
  return { value, provenance, confidenceMilli, absenceReason: null, authoritative }
}
function absent<T>(reason: AbsenceReason): TruthField<T> {
  return { value: null, provenance: null, confidenceMilli: 0, absenceReason: reason, authoritative: false }
}

/**
 * Confidence for a synthesized field, in milli-units.
 *
 * The runtime REQUIRED set (`dna.ts:365`) is the only structural signal the
 * system actually has about whether a synthesized value was demanded or merely
 * permitted. A field the provider was REQUIRED to return carries more weight than
 * one it could have omitted — but neither is evidence, so both stay well under
 * certainty. Nothing inferred is ever 1.000.
 */
const RUNTIME_REQUIRED = new Set([
  'summary', 'niche', 'sub_niche', 'audience', 'audience_pain', 'dream_outcome',
  'offer', 'tone', 'pacing', 'hook_style', 'hook_patterns', 'formats',
  'title_style', 'thumbnail_style', 'vocabulary', 'recurring_ctas', 'pov',
  'enemy', 'dos', 'donts', 'sample_hooks',
])
const CONF_SYNTH_REQUIRED = 600
const CONF_SYNTH_OPTIONAL = 400
const CONF_USER_ASSERTED = 1000

function synthField<T>(
  raw: Record<string, unknown> | null,
  key: string,
  read: (v: unknown) => T | null,
  opts: { businessFact?: boolean } = {},
): TruthField<T> {
  if (raw === null) return absent<T>('source_record_missing')
  const v = read(raw[key])
  if (v === null) {
    // D1/D2's fourth finding: a field outside the REQUIRED set could always be
    // omitted, and saying WHICH kind of absence this is keeps the two apart.
    return absent<T>(RUNTIME_REQUIRED.has(key)
      ? 'not_produced_by_synthesis'
      : 'not_in_required_set_and_omitted')
  }
  const conf = RUNTIME_REQUIRED.has(key) ? CONF_SYNTH_REQUIRED : CONF_SYNTH_OPTIONAL
  // §10.2: synthesis is inference. An inferred BUSINESS FACT is retained — it can
  // still inform a bounded creative choice — but it is NOT authoritative.
  return present(v, 'inferred', conf, opts.businessFact !== true)
}

/**
 * D2 — resolve the two homes of the brand palette into ONE field.
 *
 * PRECEDENCE, and why:
 *   1. a `manual` brand kit. The creator hand-picked it; `types.ts` calls it
 *      sacred and a re-scan must not overwrite it. That is `user_asserted`.
 *   2. `pending` means the scan could not read any colours, so the kit holds
 *      nothing usable and synthesis is the only candidate.
 *   3. otherwise the brand kit wins, because it is the home the renderer and the
 *      settings UI actually read. `dna-poll:288` writes both in one statement, so
 *      an `auto` kit and `profile.brand_colors` normally AGREE; when they do not,
 *      something drifted and the drift is recorded rather than resolved silently.
 *
 * The loser is always written to `conflicts`, which is the whole point: D2 is a
 * defect precisely because nothing today records that two answers existed.
 */
function resolveColors(
  synth: Record<string, unknown> | null,
  kit: BrandTruthSources['brandKit'],
  conflicts: TruthConflict[],
): TruthField<BrandColorSet> {
  const readSet = (v: unknown): BrandColorSet | null => {
    if (v === null || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    const pick = (k: string): string | null => {
      const s = str(o[k])
      return s !== null && HEX_RE.test(s) ? s.toLowerCase() : null
    }
    const set = { primary: pick('primary'), secondary: pick('secondary'), highlight: pick('highlight') }
    return set.primary === null && set.secondary === null && set.highlight === null ? null : set
  }
  const fromKit = readSet(kit?.palette)
  const fromSynth = readSet(synth?.brand_colors)
  const source = kit?.palette_source ?? 'auto'

  const candidates: TruthConflict['candidates'] = []
  if (fromKit) candidates.push({ source: `brand_kit:${source}`, value: JSON.stringify(fromKit) })
  if (fromSynth) candidates.push({ source: 'profile.brand_colors', value: JSON.stringify(fromSynth) })

  const record = (chosenSource: string, resolution: TruthConflict['resolution']): void => {
    // Only a genuine DISAGREEMENT is a conflict. Two identical answers are the
    // normal case (one write statement produced both) and recording it would
    // bury the real drift in noise.
    if (candidates.length > 1 && candidates[0].value !== candidates[1].value) {
      conflicts.push({ field: 'visualIdentity.colors', candidates, chosenSource, resolution })
    }
  }

  if (fromKit !== null && source === 'manual') {
    record('brand_kit:manual', 'manual_brand_kit_wins')
    return present(fromKit, 'user_asserted', CONF_USER_ASSERTED, true)
  }
  if (source === 'pending' || fromKit === null) {
    if (fromSynth === null) return absent<BrandColorSet>('not_in_required_set_and_omitted')
    record('profile.brand_colors', source === 'pending'
      ? 'brand_kit_pending_so_synthesis_used'
      : 'synthesis_only_candidate')
    // Synthesized colours are read from imagery WHEN images were attached and
    // guessed otherwise, and the stored row does not say which. The weaker label
    // is the honest one.
    return present(fromSynth, 'inferred', CONF_SYNTH_OPTIONAL, false)
  }
  record(`brand_kit:${source}`, 'brand_kit_is_the_rendered_home')
  return present(fromKit, 'inferred', CONF_SYNTH_OPTIONAL, false)
}

export function projectBrandTruth(src: BrandTruthSources): BrandTruthSnapshotV1 {
  if (typeof src.ownerId !== 'string' || src.ownerId.trim() === '') {
    throw new BrandTruthError('ownerId is required', 'brand_truth_owner_missing')
  }
  const synth = src.synthesized
  const self = src.selfReported
  const conflicts: TruthConflict[] = []
  const nonAuthoritativeSignals: BrandTruthSnapshotV1['nonAuthoritativeSignals'] = []

  // ---- level 2: user intent. D3. -------------------------------------------
  // `goal` has NO synthesized counterpart, and that is not an oversight to paper
  // over: a synthesized goal would be a level-6 value sitting in a level-2 slot.
  // The projection reads it from the self-reported record ONLY.
  const goalRaw = str(self?.goal)
  const goal: TruthField<string> = goalRaw === null
    ? absent<string>('no_self_reported_value')
    : present(goalRaw, 'user_asserted', CONF_USER_ASSERTED, true)
  const platformsRaw = strArray(self?.platforms)

  // ---- level 1: business truth ---------------------------------------------
  const businessTruth = {
    product: readBusiness(self, synth, 'product', 'product'),
    // `offer` has NO self-reported counterpart. `CreatorDNA.product` is what the
    // creator sells; the synthesized `offer` is "what they sell OR the action
    // they push". Reading `product` into this slot would be exactly the silent
    // substitution §7 forbids — it would promote an inferred field to
    // user_asserted by borrowing a neighbouring value's authority. Synthesis
    // only, and therefore never authoritative.
    offer: synthField(synth, 'offer', str, { businessFact: true }),
    audience: readBusiness(self, synth, 'audience', 'audience'),
    audiencePain: synthField(synth, 'audience_pain', str, { businessFact: true }),
    dreamOutcome: synthField(synth, 'dream_outcome', str, { businessFact: true }),
  }
  for (const [name, f] of Object.entries(businessTruth)) {
    if (f.value !== null && !f.authoritative) {
      nonAuthoritativeSignals.push({
        field: `businessTruth.${name}`,
        reason: `provenance=${String(f.provenance)}; a business fact that was not observed or `
          + 'user-asserted may inform a bounded creative choice but can never be cited as truth',
      })
    }
  }

  const snapshot: BrandTruthSnapshotV1 = {
    schemaVersion: 1,
    ownerId: src.ownerId,
    brandVoiceId: src.brandVoiceId,
    businessTruth,
    userIntent: {
      goal,
      platforms: platformsRaw === null
        ? absent<string[]>('no_self_reported_value')
        : present(platformsRaw, 'user_asserted', CONF_USER_ASSERTED, true),
    },
    brandVoice: {
      summary: synthField(synth, 'summary', str),
      niche: synthField(synth, 'niche', str),
      subNiche: synthField(synth, 'sub_niche', str),
      tone: synthField(synth, 'tone', str),
      pacing: synthField(synth, 'pacing', str),
      hookStyle: synthField(synth, 'hook_style', str),
      hookPatterns: synthField(synth, 'hook_patterns', strArray),
      vocabulary: synthField(synth, 'vocabulary', strArray),
      recurringCtas: synthField(synth, 'recurring_ctas', strArray),
      pov: synthField(synth, 'pov', strArray),
      enemy: synthField(synth, 'enemy', str),
      dos: synthField(synth, 'dos', strArray),
      donts: synthField(synth, 'donts', strArray),
      sampleHooks: synthField(synth, 'sample_hooks', strArray),
      formats: synthField(synth, 'formats', strArray),
      titleStyle: synthField(synth, 'title_style', str),
      thumbnailStyle: synthField(synth, 'thumbnail_style', str),
      // D1. Read from the RAW object; `VoiceProfile` cannot express this field, so
      // a projection routed through the interface would lose a value that IS in
      // the row. Self-reported `editing_style` is preferred when present, because
      // it is level 2 rather than level 6.
      editingStyle: (() => {
        const own = str(self?.editing_style)
        if (own !== null) return present(own, 'user_asserted', CONF_USER_ASSERTED, true)
        return synthField(synth, 'editing_style', str)
      })(),
    },
    visualIdentity: {
      colors: resolveColors(synth, src.brandKit, conflicts),
      logoPath: (() => {
        const p = str(src.brandKit?.logo_path)
        return p === null
          ? absent<string>('no_self_reported_value')
          : present(p, 'user_asserted', CONF_USER_ASSERTED, true)
      })(),
    },
    nonAuthoritativeSignals,
    conflicts,
    absences: [],
  }
  snapshot.absences = collectAbsences(snapshot)
  return snapshot
}

/**
 * A level-1 business fact that MAY be self-reported. Self-reported wins, because
 * `user_asserted` outranks `inferred` and the user is the authority on their own
 * product and audience.
 */
function readBusiness(
  self: Record<string, unknown> | null,
  synth: Record<string, unknown> | null,
  selfKey: string,
  synthKey: string,
): TruthField<string> {
  const own = str(self?.[selfKey])
  if (own !== null) return present(own, 'user_asserted', CONF_USER_ASSERTED, true)
  return synthField(synth, synthKey, str, { businessFact: true })
}

function collectAbsences(s: BrandTruthSnapshotV1): BrandTruthSnapshotV1['absences'] {
  const out: BrandTruthSnapshotV1['absences'] = []
  const walk = (group: Record<string, TruthField<unknown>>, prefix: string): void => {
    for (const [k, f] of Object.entries(group)) {
      if (f.absenceReason !== null) out.push({ field: `${prefix}.${k}`, reason: f.absenceReason })
    }
  }
  walk(s.businessTruth as unknown as Record<string, TruthField<unknown>>, 'businessTruth')
  walk(s.userIntent as unknown as Record<string, TruthField<unknown>>, 'userIntent')
  walk(s.brandVoice as unknown as Record<string, TruthField<unknown>>, 'brandVoice')
  walk(s.visualIdentity as unknown as Record<string, TruthField<unknown>>, 'visualIdentity')
  return out.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0))
}

// --------------------------------------------------------------- validator

/**
 * STRICT semantic validation (§2.3 step 3). This is a GATE, not a description —
 * the whole reason `VoiceProfile` failed to constrain anything is that nothing
 * ever ran it against the stored row.
 */
export function validateBrandTruthSnapshot(s: BrandTruthSnapshotV1): BrandTruthSnapshotV1 {
  const fail = (m: string, code: string): never => { throw new BrandTruthError(m, code) }

  if (s.schemaVersion !== 1) fail('schemaVersion must be 1', 'brand_truth_schema_version')
  if (typeof s.ownerId !== 'string' || s.ownerId.trim() === '') {
    fail('ownerId is required', 'brand_truth_owner_missing')
  }

  const groups: Array<[string, Record<string, TruthField<unknown>>]> = [
    ['businessTruth', s.businessTruth as unknown as Record<string, TruthField<unknown>>],
    ['userIntent', s.userIntent as unknown as Record<string, TruthField<unknown>>],
    ['brandVoice', s.brandVoice as unknown as Record<string, TruthField<unknown>>],
    ['visualIdentity', s.visualIdentity as unknown as Record<string, TruthField<unknown>>],
  ]

  for (const [groupName, group] of groups) {
    for (const [key, f] of Object.entries(group)) {
      const path = `${groupName}.${key}`
      // Shape: value and absence are mutually exclusive, always.
      if (f.value === null && f.absenceReason === null) {
        fail(`${path}: a missing value must record an absence reason`, 'brand_truth_absence_unexplained')
      }
      if (f.value !== null && f.absenceReason !== null) {
        fail(`${path}: a present value must not carry an absence reason`, 'brand_truth_absence_contradiction')
      }
      // §10.2: EVERY present field carries a provenance label. This is the check
      // the mutation control removes — with it gone, an unlabelled inferred
      // business fact would sail through as truth.
      if (f.value !== null && f.provenance === null) {
        fail(`${path}: a present value must carry a provenance label`, 'brand_truth_provenance_missing')
      }
      if (f.provenance !== null && !(f.provenance in AUTHORITY_LEVEL)) {
        fail(`${path}: unknown provenance ${JSON.stringify(f.provenance)}`, 'brand_truth_provenance_unknown')
      }
      if (!Number.isInteger(f.confidenceMilli) || f.confidenceMilli < 0 || f.confidenceMilli > 1000) {
        fail(`${path}: confidenceMilli must be an integer 0..1000`, 'brand_truth_confidence_range')
      }
      if (f.value === null && f.confidenceMilli !== 0) {
        fail(`${path}: an absent field cannot carry confidence`, 'brand_truth_absent_with_confidence')
      }
    }
  }

  // §5 level 2 — D3. Only the user may assert user intent. A synthesized value
  // here would be a level-6 inference occupying a level-2 slot.
  for (const key of USER_INTENT_FIELDS) {
    const f = (s.userIntent as unknown as Record<string, TruthField<unknown>>)[key]
    if (f === undefined) fail(`userIntent.${key} is required`, 'brand_truth_user_intent_missing')
    if (f.value !== null && f.provenance !== 'user_asserted') {
      fail(
        `userIntent.${key}: provenance ${String(f.provenance)} (authority level `
        + `${AUTHORITY_LEVEL[f.provenance as Provenance]}) cannot occupy a level-2 user-intent slot; `
        + 'only the user may assert their own intent',
        'brand_truth_authority_violation',
      )
    }
  }

  // §10.2 — an inferred business fact may exist, but never as truth, and its
  // demotion must be RECORDED so a reader can see it was considered and refused.
  for (const [key, f] of Object.entries(
    s.businessTruth as unknown as Record<string, TruthField<unknown>>,
  )) {
    if (f.value === null) continue
    const authoritativeProvenance = f.provenance === 'observed' || f.provenance === 'user_asserted'
    if (f.authoritative !== authoritativeProvenance) {
      fail(
        `businessTruth.${key}: authoritative=${String(f.authoritative)} contradicts provenance `
        + `${String(f.provenance)}; a business fact is authoritative only when observed or user-asserted`,
        'brand_truth_business_fact_authority',
      )
    }
    if (!f.authoritative
      && !s.nonAuthoritativeSignals.some((n) => n.field === `businessTruth.${key}`)) {
      fail(
        `businessTruth.${key} is non-authoritative but was not recorded in nonAuthoritativeSignals; `
        + 'a demoted business fact must be visible, not merely flagged',
        'brand_truth_demotion_unrecorded',
      )
    }
  }

  // D2 — a resolved conflict must name a source that was actually a candidate.
  for (const c of s.conflicts) {
    if (c.candidates.length < 2) {
      fail(`conflict on ${c.field} lists fewer than two candidates`, 'brand_truth_conflict_vacuous')
    }
    if (!c.candidates.some((x) => x.source === c.chosenSource)) {
      fail(
        `conflict on ${c.field} chose ${c.chosenSource}, which is not among its candidates`,
        'brand_truth_conflict_unsourced',
      )
    }
    const distinct = new Set(c.candidates.map((x) => x.value))
    if (distinct.size < 2) {
      fail(
        `conflict on ${c.field} records candidates that all agree; that is not a conflict`,
        'brand_truth_conflict_not_a_conflict',
      )
    }
  }

  return s
}

// ------------------------------------------------------------------ hashing

/**
 * Canonical JSON: object keys sorted at every depth, no insignificant whitespace.
 * Two snapshots carrying the same facts hash identically regardless of the order
 * the projection happened to build them in (§2.3 step 4).
 */
export function canonicalBrandTruth(s: BrandTruthSnapshotV1): string {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon)
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(o).sort()) out[k] = canon(o[k])
      return out
    }
    return v
  }
  return JSON.stringify(canon(s))
}

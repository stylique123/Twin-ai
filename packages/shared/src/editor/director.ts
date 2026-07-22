// Editor v2 — Phase 7 Director: the PURE canonical input-envelope contract.
//
// GATE 0 SCOPE ONLY: envelope serializer, projection, untrusted-input
// validators, and fixtures. NO provider call, NO database access, NO
// directing-stage logic — those land only after Gate 0 passes audit.
//
// -----------------------------------------------------------------------------
// UPSTREAM-DERIVED BOUNDS (Phase-5 compatibility theorem)
// -----------------------------------------------------------------------------
// The ONLY size invariant Phase 5 enforces on a speech component that reaches
// `directing` is the serialized-byte budget (worker editorSpeech.ts):
//     bytes(component) <= UPSTREAM_SPEECH_BUDGET_BYTES = 1_000_000
// (fail-closed `speech_component_too_large` after compaction). Every Director
// bound below is DERIVED from that contract — none is a new product limit, and
// no eligible component can ever be rejected here:
//
//   * Element-count caps: each compact element costs at least its structural
//     skeleton (every real emission only ADDS bytes):
//       word     {confidence,endMs,id,startMs,text}                  >= 59 B
//       candidate{confidence,endMs,evidence,evidenceCodes,id,kind,
//                 nextWordId,prevWordId,ruleVersion,safeToConsider,
//                 startMs,wordIds}                                   >= 204 B
//       boundary {endMs,endWordId,evidence,id,kind,startMs,
//                 startWordId}                                       >= 105 B
//     (bytes include the array separator; the worker unit test re-derives these
//     minima from the literal compact shapes and asserts equality.) Therefore
//     N_words <= floor(1e6/59) = 16949, N_candidates <= floor(1e6/204) = 4901,
//     N_boundaries <= floor(1e6/105) = 9523. The caps below are exactly those
//     floors: defense-in-depth that a LEGAL component can never trip.
//
//   * Time cap: source eligibility rejects duration > SOURCE_MAX_DURATION_MS
//     (validate_source `too_long`, default 30*60*1000), and Phase-5 word times
//     are clamped into [0, durationMs] — so envelope centiseconds <= 180000.
//
//   * BYTE-DOMINATION THEOREM (the one-inference proof). The compact component
//     serializes word text TWICE (per-word `text` + the always-retained
//     `transcript`); the envelope carries it ONCE (word tuples only, no
//     transcript field). Every envelope tuple is coefficient-wise dominated by
//     its compact counterpart at ratio <= 2/3:
//       word tuple  [text,cs,conf]              <= Lesc + 14
//                     vs component-attributable  = 60 + 2*Lesc  (ratio <= 1/2)
//       cand tuple  [k,sCs,eCs,cf,cl,se,[refs]] <= 24 + sum_refs(D+1)
//                     vs compact  >= 204 + sum_refs(D+4)
//                     (fixed 24/204 < 2/3; per-ref (D+1)/(D+4) <= 6/9 = 2/3;
//                      D<=5 digits since indexes <= 16948) => ratio <= 2/3
//       bound tuple [k,sw,ew]                   <= 16   vs compact >= 105
//     The enriched candidate tuple adds five small scalars (startCs, endCs,
//     confCode, silenceClassCode, selectionEnabled) — a FIXED +6 bytes against
//     the 204-byte compact skeleton, so 24/204 < 2/3 and the per-element
//     domination is UNCHANGED. With the Phase-5 bridge-corruption backstop
//     (`speech_transcript_mismatch` in editorSpeech.ts: sum of per-word
//     serialized text bytes <= transcript bytes + 2N + 1024 — true for every
//     real ASR output, since words ARE the transcript's tokens), each envelope
//     element is <= 2/3 of its compact counterpart. Hence for ANY legal
//     component C <= 1e6:
//       envelope_speech <= (2/3)*C + 512 <= 667179 bytes
//       envelope_total  <= 667179 + MAX_SCRIPT_BYTES + MAX_SUMMARY_BYTES
//                          + IDENTITY_BUNDLE_MAX_BYTES + wrapper(<=224)
//                       <= ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES = 751371
//     and since a provider token spans >= 1 UTF-8 byte:
//       tokens <= bytes <= DIRECTOR_INPUT_MAX_BYTES (819200)
//              <= PROVIDER_TOKEN_CEILING (838860 = 80% of 1048576).
//     One inference covers EVERY eligible <=30-minute component — no
//     truncation, sampling, chunking, second call, or new rejection.
//
// WHAT THE TWO PROOF LAYERS ESTABLISH (kept distinct):
//   * The conservative byte bound (tokens <= bytes) proves UNIVERSALLY,
//     tokenizer-independently: any envelope passing the DIRECTOR_INPUT_MAX_BYTES
//     fail-closed guard fits under 80% of the provider context.
//   * A recorded real countTokens number on the max-compat fixture is
//     CONFIRMATORY EVIDENCE of actual tokenizer behavior on that one fixture;
//     it proves nothing universal and is never load-bearing for the guarantee.

// ---------------------------------------------------------------------------
// Frozen versions + provider bundle identity
// ---------------------------------------------------------------------------
export const DIRECTOR_VERSION = 'director-1'
export const DIRECTOR_PROVIDER = 'google'
export const DIRECTOR_MODEL = 'gemini-3.5-flash'
export const DIRECTOR_ENVELOPE_SCHEMA_VERSION = 1
export const DIRECTOR_DECISION_SCHEMA_VERSION = 1
export const PIPELINE_EPOCH_V2 = 2 // Phase 7 bumps the boot-manifest epoch 1 -> 2

// ---------------------------------------------------------------------------
// Derived bounds (see theorem above). Never hand-tuned — tests re-derive them.
// ---------------------------------------------------------------------------
export const UPSTREAM_SPEECH_BUDGET_BYTES = 1_000_000
export const MIN_COMPACT_WORD_BYTES = 59
export const MIN_COMPACT_CANDIDATE_BYTES = 204
export const MIN_COMPACT_BOUNDARY_BYTES = 105
export const MAX_WORDS = 16949 // floor(1e6 / 59)
export const MAX_CANDIDATES = 4901 // floor(1e6 / 204) — SPEECH CANDIDATES (c*)
export const MAX_BOUNDARIES = 9523 // floor(1e6 / 105) — SPEECH UNITS (u*), distinct from candidates
export const MAX_TIME_CS = 180000 // SOURCE_MAX_DURATION_MS / 10 (30 min)
export const MAX_SCRIPT_BYTES = 65536 // == SCRIPT_SNAPSHOT_MAX_BYTES (pinned once)
export const MAX_SUMMARY_BYTES = 16384 // our own summary builder's enforced cap
export const IDENTITY_BUNDLE_MAX_BYTES = 2048 // serialized identity+bundle cap
export const ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES = 751371 // 667179+65536+16384+2048+224

// Provider context (gemini-3.5-flash) and the enforced input byte cap.
export const PROVIDER_CONTEXT_TOKENS = 1048576
export const PROVIDER_TOKEN_CEILING = Math.floor(PROVIDER_CONTEXT_TOKENS * 0.8) // 838860
export const DIRECTOR_INPUT_MAX_BYTES = 819200 // > analytic max, <= token ceiling

// The exact measured serialized size of buildMaxUpstreamCompatFixture(), frozen
// by the Gate-0 tests (recomputed from the real serializer and asserted for
// byte EQUALITY — never approximate).
export const EXPECTED_MAX_COMPAT_ENVELOPE_BYTES = 563014

// Legends (index == code in the compact tuples). Order is FROZEN — a decision
// signal the server cross-checks against the re-resolved immutable component.
export const SPEECH_CANDIDATE_KINDS = ['silence', 'filler', 'false_start', 'repetition'] as const
export const BOUNDARY_KINDS = ['punctuation_sentence', 'asr_segment', 'pause_utterance'] as const
// Phase-5 candidate.confidence enum, ascending. code 0..2.
export const CANDIDATE_CONFIDENCE_CODES = ['low', 'medium', 'high'] as const
// Silence banding (editorSpeech.ts evidence.class); 'none' (code 0) for every
// non-silence kind. Silence candidates carry a class in 1..3.
export const SILENCE_CLASS_CODES = ['none', 'uncertain', 'removable', 'dead_air'] as const
export type SpeechCandidateKindName = (typeof SPEECH_CANDIDATE_KINDS)[number]
export type CandidateConfidenceName = (typeof CANDIDATE_CONFIDENCE_CODES)[number]
export type SilenceClassName = (typeof SILENCE_CLASS_CODES)[number]

// FEATURE SAFETY: auto filler removal is OFF (EDITOR_FEATURES.autoFillerRemoval
// = false). A `filler` candidate is inert evidence and must NEVER be marked
// selection-enabled. Every other allowed kind MAY be selectable (1). This is
// the single source of truth for the projection AND the validator.
export function kindSelectionEnabled(kind: SpeechCandidateKindName): 0 | 1 {
  return kind === 'filler' ? 0 : 1
}

// ---------------------------------------------------------------------------
// Compact envelope types (canonical, sorted-key serialization)
// ---------------------------------------------------------------------------
// word:      [textJson, startCs, confPct]                index == word id
//            confPct: INTEGER 0..100 (= round(confidence*100)); startCs:
//            INTEGER 0..180000 (= round(startMs/10)), nondecreasing.
// candidate: [kindCode, startCs, endCs, confidenceCode, silenceClassCode,
//             selectionEnabled, [wordIdx...]]           index == candidate id
//            A DECISION-SUFFICIENT tuple: the Director can tell a removable /
//            dead_air / uncertain silence span apart, read its confidence, and
//            respect selection safety WITHOUT the words the candidate covers
//            (pure-silence candidates legitimately have []). silenceClassCode
//            is 0 (none) for every non-silence kind; selectionEnabled is 0 for
//            filler and 1 otherwise. refs are strictly ascending in-range word
//            indexes.
// boundary:  [kindCode, startWordIdx, endWordIdx] with start <= end.
export type EnvWord = [string, number, number]
export type EnvCandidate = [number, number, number, number, number, number, number[]]
export type EnvBoundary = [number, number, number]

export interface DirectorEnvelopeIdentity {
  projectId: string
  generationId: string
  sourceAssetId: string
  sourceChecksum: string // 64-hex
  bootManifestSha: string // 64-hex
  scriptSnapshotSha: string // 64-hex
  componentVersions: { inspection: string; speech: string }
  componentDigests: { visual: string; audio: string; hook: string } // 64-hex each
}

export interface DirectorBundleIdentity {
  version: string
  provider: string
  model: string
  promptSha256: string
  schemaSha256: string
  configSha256: string
}

export interface DirectorEnvelope {
  schemaVersion: number
  pipelineEpoch: number
  bundle: DirectorBundleIdentity
  identity: DirectorEnvelopeIdentity
  script: unknown
  summaries: unknown
  words: EnvWord[]
  candidates: EnvCandidate[]
  boundaries: EnvBoundary[]
}

// ---------------------------------------------------------------------------
// Pure STRICT canonical JSON. Unlike JSON.stringify it never silently coerces:
// a non-finite number, an `undefined` anywhere, or a non-plain object (Date,
// Map, class instance) THROWS instead of serializing as null / being dropped /
// collapsing to {}. Callers on the untrusted boundary wrap it so the throw
// becomes a stable DirectorEnvelopeError code.
// ---------------------------------------------------------------------------
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number')
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((el) => {
      if (el === undefined) throw new Error('canonicalJson: undefined array element')
      return canonicalJson(el)
    }).join(',')}]`
  }
  if (typeof value === 'object') {
    if (!isPlainObject(value)) throw new Error('canonicalJson: non-plain object')
    const keys = Object.keys(value).sort()
    const parts: string[] = []
    for (const k of keys) {
      const v = value[k]
      if (v === undefined) throw new Error(`canonicalJson: undefined property ${k}`)
      parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`)
    }
    return `{${parts.join(',')}}`
  }
  throw new Error(`canonicalJson: unsupported value type ${typeof value}`)
}

const ENC = new TextEncoder()
export function utf8ByteLength(s: string): number {
  return ENC.encode(s).length
}

export function serializeDirectorEnvelope(env: DirectorEnvelope): string {
  return canonicalJson(env)
}
export function envelopeByteLength(env: DirectorEnvelope): number {
  return utf8ByteLength(serializeDirectorEnvelope(env))
}

// Conservative, tokenizer-independent bound: every provider token spans >= 1
// UTF-8 byte, so tokenCount <= serialized UTF-8 byte length.
export function conservativeTokenBound(env: DirectorEnvelope): number {
  return envelopeByteLength(env)
}

// ---------------------------------------------------------------------------
// Untrusted-input validation. Accepts `unknown`; every malformed case fails
// with a STABLE DirectorEnvelopeError code (never an incidental TypeError or
// JSON coercion). Unknown-key policy: the top level, bundle, identity and its
// sub-objects allow EXACTLY the declared keys — anything else is rejected.
// ---------------------------------------------------------------------------
export class DirectorEnvelopeError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'DirectorEnvelopeError'
    this.code = code
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEX64_RE = /^[0-9a-f]{64}$/

function fail(message: string, code: string): never {
  throw new DirectorEnvelopeError(message, code)
}
function requireKeys(obj: Record<string, unknown>, keys: readonly string[], where: string): void {
  for (const k of keys) {
    if (!(k in obj)) fail(`${where}: missing key ${k}`, 'director_envelope_missing_key')
  }
  for (const k of Object.keys(obj)) {
    if (!keys.includes(k)) fail(`${where}: unknown key ${k}`, 'director_envelope_unknown_key')
  }
}
function requireIntIn(v: unknown, lo: number, hi: number, where: string, code: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
    fail(`${where}: expected integer in [${lo},${hi}]`, code)
  }
  return v as number
}
function requireShortString(v: unknown, maxBytes: number, where: string): string {
  if (typeof v !== 'string' || v.length === 0 || utf8ByteLength(v) > maxBytes) {
    fail(`${where}: expected non-empty string <= ${maxBytes} bytes`, 'director_envelope_bad_string')
  }
  return v
}
function requireExact(v: unknown, expected: string, where: string): void {
  if (v !== expected) fail(`${where}: expected ${expected}`, 'director_envelope_bad_bundle')
}
function requireMatch(v: unknown, re: RegExp, where: string): string {
  if (typeof v !== 'string' || !re.test(v)) fail(`${where}: malformed`, 'director_envelope_bad_string')
  return v
}
// Serialize a sub-document safely: cyclic / non-finite / undefined / non-plain /
// unsupported values become a stable code instead of a raw throw escaping.
function safeCanonicalBytes(v: unknown, where: string): number {
  try {
    return utf8ByteLength(canonicalJson(v))
  } catch {
    fail(`${where}: not canonically serializable`, 'director_envelope_unserializable')
  }
}

const TOP_KEYS = ['schemaVersion', 'pipelineEpoch', 'bundle', 'identity', 'script', 'summaries', 'words', 'candidates', 'boundaries'] as const
const BUNDLE_KEYS = ['version', 'provider', 'model', 'promptSha256', 'schemaSha256', 'configSha256'] as const
const IDENTITY_KEYS = ['projectId', 'generationId', 'sourceAssetId', 'sourceChecksum', 'bootManifestSha', 'scriptSnapshotSha', 'componentVersions', 'componentDigests'] as const

export function validateDirectorEnvelope(input: unknown): DirectorEnvelope {
  if (!isPlainObject(input)) fail('envelope: not a plain object', 'director_envelope_not_object')
  requireKeys(input, TOP_KEYS, 'envelope')

  if (input.schemaVersion !== DIRECTOR_ENVELOPE_SCHEMA_VERSION) {
    fail('envelope schemaVersion mismatch', 'director_envelope_schema_mismatch')
  }
  if (input.pipelineEpoch !== PIPELINE_EPOCH_V2) {
    fail('envelope pipelineEpoch mismatch', 'director_envelope_epoch_mismatch')
  }

  const bundle = input.bundle
  if (!isPlainObject(bundle)) fail('bundle: not an object', 'director_envelope_bad_bundle')
  requireKeys(bundle, BUNDLE_KEYS, 'bundle')
  // EXACT provider bundle identity — the envelope is pinned to this Director
  // build + provider + model; anything else is not a valid Director input.
  requireExact(bundle.version, DIRECTOR_VERSION, 'bundle.version')
  requireExact(bundle.provider, DIRECTOR_PROVIDER, 'bundle.provider')
  requireExact(bundle.model, DIRECTOR_MODEL, 'bundle.model')
  requireMatch(bundle.promptSha256, HEX64_RE, 'bundle.promptSha256')
  requireMatch(bundle.schemaSha256, HEX64_RE, 'bundle.schemaSha256')
  requireMatch(bundle.configSha256, HEX64_RE, 'bundle.configSha256')

  const identity = input.identity
  if (!isPlainObject(identity)) fail('identity: not an object', 'director_envelope_bad_identity')
  requireKeys(identity, IDENTITY_KEYS, 'identity')
  requireMatch(identity.projectId, UUID_RE, 'identity.projectId')
  requireMatch(identity.generationId, UUID_RE, 'identity.generationId')
  requireMatch(identity.sourceAssetId, UUID_RE, 'identity.sourceAssetId')
  requireMatch(identity.sourceChecksum, HEX64_RE, 'identity.sourceChecksum')
  requireMatch(identity.bootManifestSha, HEX64_RE, 'identity.bootManifestSha')
  requireMatch(identity.scriptSnapshotSha, HEX64_RE, 'identity.scriptSnapshotSha')
  const cv = identity.componentVersions
  if (!isPlainObject(cv)) fail('identity.componentVersions: not an object', 'director_envelope_bad_identity')
  requireKeys(cv, ['inspection', 'speech'], 'identity.componentVersions')
  requireShortString(cv.inspection, 64, 'componentVersions.inspection')
  requireShortString(cv.speech, 64, 'componentVersions.speech')
  const cd = identity.componentDigests
  if (!isPlainObject(cd)) fail('identity.componentDigests: not an object', 'director_envelope_bad_identity')
  requireKeys(cd, ['visual', 'audio', 'hook'], 'identity.componentDigests')
  requireMatch(cd.visual, HEX64_RE, 'componentDigests.visual')
  requireMatch(cd.audio, HEX64_RE, 'componentDigests.audio')
  requireMatch(cd.hook, HEX64_RE, 'componentDigests.hook')
  const idBytes = safeCanonicalBytes({ bundle, identity }, 'identity+bundle')
  if (idBytes > IDENTITY_BUNDLE_MAX_BYTES) {
    fail(`identity+bundle ${idBytes} > ${IDENTITY_BUNDLE_MAX_BYTES}`, 'director_identity_too_large')
  }

  const words = input.words
  if (!Array.isArray(words)) fail('words: not an array', 'director_envelope_bad_word')
  if (words.length > MAX_WORDS) fail(`words ${words.length} > ${MAX_WORDS}`, 'director_input_too_many_words')
  const n = words.length
  let prevStartCs = 0
  for (let i = 0; i < n; i++) {
    const w = words[i]
    if (!Array.isArray(w) || w.length !== 3) fail(`word ${i}: tuple shape`, 'director_envelope_bad_word')
    if (typeof w[0] !== 'string') fail(`word ${i}: text not a string`, 'director_envelope_bad_word')
    const startCs = requireIntIn(w[1], 0, MAX_TIME_CS, `word ${i} startCs`, 'director_envelope_bad_word')
    requireIntIn(w[2], 0, 100, `word ${i} confPct`, 'director_envelope_bad_word')
    if (i > 0 && startCs < prevStartCs) fail(`word ${i}: startCs decreases`, 'director_envelope_bad_word')
    prevStartCs = startCs
  }

  const candidates = input.candidates
  if (!Array.isArray(candidates)) fail('candidates: not an array', 'director_envelope_bad_candidate')
  if (candidates.length > MAX_CANDIDATES) {
    fail(`candidates ${candidates.length} > ${MAX_CANDIDATES}`, 'director_input_too_many_candidates')
  }
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (!Array.isArray(c) || c.length !== 7) fail(`candidate ${i}: tuple shape`, 'director_envelope_bad_candidate')
    const kindCode = requireIntIn(c[0], 0, SPEECH_CANDIDATE_KINDS.length - 1, `candidate ${i} kind`, 'director_envelope_bad_candidate')
    const startCs = requireIntIn(c[1], 0, MAX_TIME_CS, `candidate ${i} startCs`, 'director_envelope_bad_candidate')
    const endCs = requireIntIn(c[2], 0, MAX_TIME_CS, `candidate ${i} endCs`, 'director_envelope_bad_candidate')
    if (startCs > endCs) fail(`candidate ${i}: startCs > endCs`, 'director_envelope_bad_candidate')
    requireIntIn(c[3], 0, CANDIDATE_CONFIDENCE_CODES.length - 1, `candidate ${i} confidenceCode`, 'director_envelope_bad_candidate')
    const silClass = requireIntIn(c[4], 0, SILENCE_CLASS_CODES.length - 1, `candidate ${i} silenceClassCode`, 'director_envelope_bad_candidate')
    const selectionEnabled = requireIntIn(c[5], 0, 1, `candidate ${i} selectionEnabled`, 'director_envelope_bad_candidate')
    const kindName = SPEECH_CANDIDATE_KINDS[kindCode]
    // kind <-> silenceClass coherence: silence carries a real class (1..3);
    // every other kind carries `none` (0).
    if (kindName === 'silence') {
      if (silClass === 0) fail(`candidate ${i}: silence requires a non-none class`, 'director_envelope_bad_candidate')
    } else if (silClass !== 0) {
      fail(`candidate ${i}: non-silence must have silenceClass none`, 'director_envelope_bad_candidate')
    }
    // FEATURE SAFETY (independent of the projection): a filler candidate may
    // never be selection-enabled while auto filler removal is off.
    if (kindName === 'filler' && selectionEnabled !== 0) {
      fail(`candidate ${i}: filler must not be selection-enabled`, 'director_envelope_filler_selectable')
    }
    const refs = c[6]
    if (!Array.isArray(refs)) fail(`candidate ${i}: refs not an array`, 'director_envelope_bad_candidate')
    let prev = -1
    for (const r of refs) {
      requireIntIn(r, 0, n - 1, `candidate ${i} ref`, 'director_envelope_bad_candidate')
      if ((r as number) <= prev) fail(`candidate ${i}: refs not strictly ascending`, 'director_envelope_bad_candidate')
      prev = r as number
    }
  }

  const boundaries = input.boundaries
  if (!Array.isArray(boundaries)) fail('boundaries: not an array', 'director_envelope_bad_boundary')
  if (boundaries.length > MAX_BOUNDARIES) {
    fail(`boundaries ${boundaries.length} > ${MAX_BOUNDARIES}`, 'director_input_too_many_boundaries')
  }
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i]
    if (!Array.isArray(b) || b.length !== 3) fail(`boundary ${i}: tuple shape`, 'director_envelope_bad_boundary')
    requireIntIn(b[0], 0, BOUNDARY_KINDS.length - 1, `boundary ${i} kind`, 'director_envelope_bad_boundary')
    const sw = requireIntIn(b[1], 0, n - 1, `boundary ${i} startWordIdx`, 'director_envelope_bad_boundary')
    const ew = requireIntIn(b[2], 0, n - 1, `boundary ${i} endWordIdx`, 'director_envelope_bad_boundary')
    if (sw > ew) fail(`boundary ${i}: start > end`, 'director_envelope_bad_boundary')
  }

  const scriptBytes = safeCanonicalBytes(input.script, 'script')
  if (scriptBytes > MAX_SCRIPT_BYTES) fail(`script ${scriptBytes} > ${MAX_SCRIPT_BYTES}`, 'director_script_too_large')
  const summaryBytes = safeCanonicalBytes(input.summaries, 'summaries')
  if (summaryBytes > MAX_SUMMARY_BYTES) fail(`summaries ${summaryBytes} > ${MAX_SUMMARY_BYTES}`, 'director_summaries_too_large')

  const env = input as unknown as DirectorEnvelope
  const total = envelopeByteLength(env)
  if (total > DIRECTOR_INPUT_MAX_BYTES) {
    fail(`envelope ${total} > ${DIRECTOR_INPUT_MAX_BYTES}`, 'director_input_too_large')
  }
  return env
}

// ---------------------------------------------------------------------------
// The real projection: Phase-5 speech component -> compact envelope arrays.
//
// NOT LOSSLESS. The projection intentionally drops per-word endMs, the full
// float confidence, and all evidence detail; it QUANTIZES confidence to a code
// and times to centiseconds. It is only DECISION-SUFFICIENT: every word,
// candidate, and boundary keeps its POSITIONAL id, so the server re-resolves
// the full immutable SpeechCandidate/word/boundary by tuple index against the
// pinned component before compilation. The tuple carries exactly what the
// Director needs to DECIDE (span, class, confidence, selection safety); the
// authoritative values live in the pinned component, never re-derived from the
// envelope. Malformed input is REJECTED with a stable code — never clamped or
// coerced.
// ---------------------------------------------------------------------------
export interface SpeechWordLike { id: string; text: string; startMs: number; confidence: number }
export interface SpeechCandidateLike {
  id: string; kind: string; wordIds: string[]
  prevWordId: string | null; nextWordId: string | null
  startMs: number; endMs: number; confidence: string
  evidence?: Record<string, unknown> | null
}
export interface SpeechBoundaryLike { id: string; kind: string; startWordId: string; endWordId: string }

function widIndex(id: string | null | undefined, n: number, where: string): number {
  if (id === null || id === undefined) return -1
  if (typeof id !== 'string') fail(`${where}: non-string word id`, 'director_projection_bad_ref')
  const m = /^w(\d+)$/.exec(id)
  if (!m) fail(`${where}: malformed word id ${id}`, 'director_projection_bad_ref')
  const i = Number(m[1])
  if (!Number.isInteger(i) || i < 0 || i >= n) fail(`${where}: word id ${id} out of range`, 'director_projection_bad_ref')
  return i
}
function reqMsToCs(ms: unknown, where: string): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) fail(`${where}: non-finite ms`, 'director_projection_bad_ref')
  const cs = Math.round(ms / 10)
  if (cs < 0 || cs > MAX_TIME_CS) fail(`${where}: ms out of range`, 'director_projection_bad_ref')
  return cs
}
function reqConfPct(conf: unknown, where: string): number {
  if (typeof conf !== 'number' || !Number.isFinite(conf) || conf < 0 || conf > 1) {
    fail(`${where}: confidence out of [0,1]`, 'director_projection_bad_ref')
  }
  return Math.round(conf * 100)
}

export function projectSpeechToEnvelope(speech: {
  words: SpeechWordLike[]
  candidates: SpeechCandidateLike[]
  boundaries: SpeechBoundaryLike[]
}): { words: EnvWord[]; candidates: EnvCandidate[]; boundaries: EnvBoundary[] } {
  const n = speech.words.length
  const words: EnvWord[] = speech.words.map((w, i) => {
    if (w.id !== `w${i}`) fail(`word ${i}: positional id mismatch (${w.id})`, 'director_projection_bad_ref')
    if (typeof w.text !== 'string') fail(`word ${i}: text not a string`, 'director_projection_bad_ref')
    return [w.text, reqMsToCs(w.startMs, `word ${i} start`), reqConfPct(w.confidence, `word ${i} confidence`)]
  })
  const candidates: EnvCandidate[] = speech.candidates.map((c, i) => {
    if (c.id !== `c${i}`) fail(`candidate ${i}: positional id mismatch (${c.id})`, 'director_projection_bad_ref')
    const kindCode = SPEECH_CANDIDATE_KINDS.indexOf(c.kind as SpeechCandidateKindName)
    if (kindCode < 0) fail(`candidate ${i}: unknown kind ${c.kind}`, 'director_projection_bad_ref')
    const kindName = SPEECH_CANDIDATE_KINDS[kindCode]
    const startCs = reqMsToCs(c.startMs, `candidate ${i} start`)
    const endCs = reqMsToCs(c.endMs, `candidate ${i} end`)
    if (startCs > endCs) fail(`candidate ${i}: span reversed`, 'director_projection_bad_ref')
    const confCode = CANDIDATE_CONFIDENCE_CODES.indexOf(c.confidence as CandidateConfidenceName)
    if (confCode < 0) fail(`candidate ${i}: invalid confidence ${String(c.confidence)}`, 'director_projection_bad_ref')
    let silClass = 0
    if (kindName === 'silence') {
      const cls = c.evidence && typeof c.evidence === 'object' ? (c.evidence as Record<string, unknown>).class : undefined
      silClass = SILENCE_CLASS_CODES.indexOf(cls as SilenceClassName)
      if (silClass <= 0) fail(`candidate ${i}: invalid silence class ${String(cls)}`, 'director_projection_bad_ref')
    }
    const selectionEnabled = kindSelectionEnabled(kindName)
    const refs = c.wordIds.map((id) => widIndex(id, n, `candidate ${i} ref`))
    for (let r = 1; r < refs.length; r++) {
      if (refs[r] <= refs[r - 1]) fail(`candidate ${i}: refs not strictly ascending`, 'director_projection_bad_ref')
    }
    return [kindCode, startCs, endCs, confCode, silClass, selectionEnabled, refs]
  })
  const boundaries: EnvBoundary[] = speech.boundaries.map((b, i) => {
    if (b.id !== `u${i}`) fail(`boundary ${i}: positional id mismatch (${b.id})`, 'director_projection_bad_ref')
    const kindCode = BOUNDARY_KINDS.indexOf(b.kind as (typeof BOUNDARY_KINDS)[number])
    if (kindCode < 0) fail(`boundary ${i}: unknown kind ${b.kind}`, 'director_projection_bad_ref')
    const sw = widIndex(b.startWordId, n, `boundary ${i} start`)
    const ew = widIndex(b.endWordId, n, `boundary ${i} end`)
    if (sw > ew) fail(`boundary ${i}: start > end`, 'director_projection_bad_ref')
    return [kindCode, sw, ew]
  })
  return { words, candidates, boundaries }
}

// ---------------------------------------------------------------------------
// Fixtures — two DISTINCT things (never conflated):
//
// (a) buildMaxUpstreamCompatFixture — the MAXIMUM UPSTREAM-COMPATIBLE fixture:
//     a deterministic synthetic Phase-5 component saturating the 1,000,000-byte
//     budget with an adversarial, envelope-maximizing composition (ref-heavy,
//     SELECTABLE non-filler candidates so the shipped selection semantics are
//     exercised), projected by the REAL projection, with maximum-length
//     identity strings, a full 64-KiB script and full summaries. Its measured
//     bytes freeze EXPECTED_MAX_COMPAT_ENVELOPE_BYTES. It is NOT the
//     simultaneous saturation of every envelope sub-cap — those are jointly
//     infeasible for a legal component (which is the point of the derivation).
// (b) DIRECTOR_INPUT_MAX_BYTES — an INDEPENDENT global fail-closed guard,
//     proven unreachable by any legal component (analytic bound), and <= the
//     token ceiling so passing it implies < 80% context.
// ---------------------------------------------------------------------------
const HEX64 = 'f'.repeat(64)
const UUID0 = '00000000-0000-0000-0000-000000000000'

// Deterministic composition (counts frozen; legality asserted at build).
// This is the ENVELOPE-MAXIMIZING legal direction: because the component
// carries word text twice (text + transcript), long-text words approach the
// worst domination ratio 1/2. 234 words x 2005 chars + 100 ref-heavy SELECTABLE
// `repetition` candidates + 100 boundaries saturates the budget at 999,608 of
// 1,000,000 bytes (99.96%).
export const MAX_COMPAT_WORDS = 234
export const MAX_COMPAT_WORD_TEXT_CHARS = 2005
export const MAX_COMPAT_CANDIDATES = 100
export const MAX_COMPAT_REFS_PER_CANDIDATE = 16
export const MAX_COMPAT_BOUNDARIES = 100

export interface MaxLegalSpeechComponent {
  words: Array<{ id: string; text: string; startMs: number; endMs: number; confidence: number }>
  candidates: Array<SpeechCandidateLike & {
    safeToConsider: boolean; evidenceCodes: string[]; ruleVersion: string
  }>
  boundaries: Array<SpeechBoundaryLike & { startMs: number; endMs: number; evidence: string[] }>
  transcript: string
  serializedBytes: number
}

export function buildMaxLegalSpeechComponent(): MaxLegalSpeechComponent {
  const words = Array.from({ length: MAX_COMPAT_WORDS }, (_, i) => ({
    id: `w${i}`, text: 'a'.repeat(MAX_COMPAT_WORD_TEXT_CHARS),
    startMs: Math.min(2 * i, 1_800_000), endMs: Math.min(2 * i + 1, 1_800_000),
    confidence: 0.99,
  }))
  const transcript = words.map((w) => w.text).join(' ')
  const candidates = Array.from({ length: MAX_COMPAT_CANDIDATES }, (_, i) => {
    // 16 strictly-ascending in-range refs (indexes < MAX_COMPAT_WORDS).
    const base = 1 + (i % 13) * 16
    const refs = Array.from({ length: MAX_COMPAT_REFS_PER_CANDIDATE }, (_, r) => `w${base + r}`)
    // `repetition` is a SELECTABLE (non-filler) kind — exercises selection=1.
    return {
      id: `c${i}`, kind: 'repetition', startMs: 0, endMs: 1,
      wordIds: refs, prevWordId: `w${base - 1}`,
      nextWordId: base + 16 < MAX_COMPAT_WORDS ? `w${base + 16}` : null,
      confidence: 'medium', safeToConsider: true,
      evidenceCodes: ['immediate_repeat'], evidence: {} as Record<string, unknown>,
      ruleVersion: 'speech-rules-3',
    }
  })
  const boundaries = Array.from({ length: MAX_COMPAT_BOUNDARIES }, (_, i) => ({
    id: `u${i}`, kind: 'asr_segment',
    startWordId: `w${i % (MAX_COMPAT_WORDS - 1)}`, endWordId: `w${i % (MAX_COMPAT_WORDS - 1) + 1}`,
    startMs: 0, endMs: 1, evidence: ['trailing'],
  }))
  const component = { words, candidates, boundaries, transcript }
  const serializedBytes = utf8ByteLength(JSON.stringify(component))
  if (serializedBytes > UPSTREAM_SPEECH_BUDGET_BYTES) {
    throw new Error(`buildMaxLegalSpeechComponent: ${serializedBytes} exceeds the upstream budget`)
  }
  return { ...component, serializedBytes }
}

export function buildMaxUpstreamCompatFixture(): DirectorEnvelope {
  const comp = buildMaxLegalSpeechComponent()
  const proj = projectSpeechToEnvelope(comp)

  // Script padded to EXACTLY MAX_SCRIPT_BYTES canonical bytes.
  const script = { generationId: UUID0, hook: '', scenes: [] as unknown[], schemaVersion: 1 }
  script.hook = 'a'.repeat(MAX_SCRIPT_BYTES - utf8ByteLength(canonicalJson(script)))
  if (utf8ByteLength(canonicalJson(script)) !== MAX_SCRIPT_BYTES) {
    throw new Error('buildMaxUpstreamCompatFixture: script padding miscomputed')
  }
  // Summaries padded to EXACTLY MAX_SUMMARY_BYTES canonical bytes.
  const summaries = { pad: '' }
  summaries.pad = 'a'.repeat(MAX_SUMMARY_BYTES - utf8ByteLength(canonicalJson(summaries)))
  if (utf8ByteLength(canonicalJson(summaries)) !== MAX_SUMMARY_BYTES) {
    throw new Error('buildMaxUpstreamCompatFixture: summary padding miscomputed')
  }

  const max64 = 'v'.repeat(64)
  return {
    schemaVersion: DIRECTOR_ENVELOPE_SCHEMA_VERSION,
    pipelineEpoch: PIPELINE_EPOCH_V2,
    bundle: {
      // EXACT pinned identity (validated) — not padded.
      version: DIRECTOR_VERSION, provider: DIRECTOR_PROVIDER, model: DIRECTOR_MODEL,
      promptSha256: HEX64, schemaSha256: HEX64, configSha256: HEX64,
    },
    identity: {
      projectId: UUID0, generationId: UUID0, sourceAssetId: UUID0,
      sourceChecksum: HEX64, bootManifestSha: HEX64, scriptSnapshotSha: HEX64,
      componentVersions: { inspection: max64, speech: max64 },
      componentDigests: { visual: HEX64, audio: HEX64, hook: HEX64 },
    },
    script,
    summaries,
    words: proj.words,
    candidates: proj.candidates,
    boundaries: proj.boundaries,
  }
}

// ===========================================================================
// DIRECTOR DECISION (provider OUTPUT) contract.
//
// The provider returns ONLY indices + bounded text — never authoritative
// timestamps or ids. validateDirectorDecision re-resolves every index against
// the pinned envelope (server-side authority), rejects fabricated / out-of-
// range refs, rejects non-selectable and filler selections, and IGNORES any
// timestamps the model emits (span authority = the pinned envelope tuple).
// Bounded free-text is stored as INERT data, never interpreted — the model
// cannot widen its own authority (prompt-injection containment).
// ===========================================================================
export const MAX_DECISION_SELECTIONS = MAX_CANDIDATES // one per candidate, at most
export const MAX_DECISION_SUMMARY_CHARS = 2000
export const MAX_DECISION_REASON_CHARS = 500

// Raw provider output shape (what generateContent must return under the strict
// responseSchema). Only these fields are consumed.
export interface RawDirectorDecision {
  selections: Array<{ candidateIndex: number; reason?: string }>
  keptBoundaries?: number[]
  summary?: string
}

// The persisted, re-resolved decision. kind/selectionEnabled/span are copied
// FROM the pinned envelope so a DB trigger can independently re-verify the
// filler guard without trusting the model.
export interface DirectorSelection {
  candidateIndex: number
  kind: SpeechCandidateKindName
  selectionEnabled: 0 | 1
  startCs: number
  endCs: number
}
export interface DirectorDecision {
  schemaVersion: number
  selections: DirectorSelection[]
  keptBoundaries: number[]
  summary: string
}

export class DirectorDecisionError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'DirectorDecisionError'
    this.code = code
  }
}
function failDecision(message: string, code: string): never {
  throw new DirectorDecisionError(message, code)
}

// The JSON schema handed to generateContent (Gemini structured output). Kept
// here so the worker duplicate is pinned by the parity test.
export function directorResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      selections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidateIndex: { type: 'integer' },
            reason: { type: 'string' },
          },
          required: ['candidateIndex'],
        },
      },
      keptBoundaries: { type: 'array', items: { type: 'integer' } },
      summary: { type: 'string' },
    },
    required: ['selections'],
  }
}

export function validateDirectorDecision(raw: unknown, envelope: DirectorEnvelope): DirectorDecision {
  if (!isPlainObject(raw)) failDecision('decision: not a plain object', 'director_decision_not_object')
  if (!('selections' in raw) || !Array.isArray(raw.selections)) {
    failDecision('decision: selections missing/not array', 'director_decision_bad_selections')
  }
  const sels = raw.selections as unknown[]
  if (sels.length > MAX_DECISION_SELECTIONS) failDecision('decision: too many selections', 'director_decision_too_large')
  const seen = new Set<number>()
  const selections: DirectorSelection[] = sels.map((s) => {
    if (!isPlainObject(s)) failDecision('selection: not an object', 'director_decision_bad_selections')
    const idx = s.candidateIndex
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= envelope.candidates.length) {
      failDecision(`selection: candidateIndex ${String(idx)} out of range`, 'director_decision_bad_ref')
    }
    if (seen.has(idx)) failDecision(`selection: duplicate candidateIndex ${idx}`, 'director_decision_duplicate')
    seen.add(idx)
    if ('reason' in s && s.reason !== undefined) {
      if (typeof s.reason !== 'string' || s.reason.length > MAX_DECISION_REASON_CHARS) {
        failDecision('selection: reason too long / not a string', 'director_decision_bad_summary')
      }
    }
    // AUTHORITY = the pinned envelope tuple, never the model.
    const tuple = envelope.candidates[idx]
    const kindCode = tuple[0]
    const kind = SPEECH_CANDIDATE_KINDS[kindCode]
    const selectionEnabled = tuple[5] as 0 | 1
    // Filler is checked FIRST so the dedicated filler-disabled code surfaces
    // (filler tuples always carry selectionEnabled=0 too).
    if (kind === 'filler') failDecision(`selection ${idx}: filler is disabled`, 'director_decision_filler')
    if (selectionEnabled !== 1) failDecision(`selection ${idx}: not selection-enabled`, 'director_decision_not_selectable')
    return { candidateIndex: idx, kind, selectionEnabled, startCs: tuple[1], endCs: tuple[2] }
  })

  let keptBoundaries: number[] = []
  if ('keptBoundaries' in raw && raw.keptBoundaries !== undefined) {
    if (!Array.isArray(raw.keptBoundaries)) failDecision('keptBoundaries: not an array', 'director_decision_bad_boundary')
    keptBoundaries = (raw.keptBoundaries as unknown[]).map((b) => {
      if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b >= envelope.boundaries.length) {
        failDecision(`keptBoundaries: index ${String(b)} out of range`, 'director_decision_bad_boundary')
      }
      return b
    })
  }

  let summary = ''
  if ('summary' in raw && raw.summary !== undefined) {
    if (typeof raw.summary !== 'string' || raw.summary.length > MAX_DECISION_SUMMARY_CHARS) {
      failDecision('summary too long / not a string', 'director_decision_bad_summary')
    }
    summary = raw.summary
  }

  return { schemaVersion: DIRECTOR_DECISION_SCHEMA_VERSION, selections, keptBoundaries, summary }
}

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
//     `transcript`), and every envelope tuple is coefficient-wise dominated by
//     its compact counterpart:
//       word tuple  [text,cs,conf]   <= Lesc + 15      vs compact Lesc + 59
//       cand tuple  [k,p,n,[refs]]   <= 18 + (D+1)/ref vs >= 204 + (D+4)/ref
//       bound tuple [k,sw,ew]        <= 17             vs >= 105
//     With the Phase-5 bridge-corruption backstop (`speech_transcript_mismatch`
//     in editorSpeech.ts: sum of per-word serialized text bytes <= transcript
//     bytes + 2N + 1024 — true for every real ASR output, since words ARE the
//     transcript's tokens), per-word text contributes at most HALF its compact
//     cost, and the worst remaining per-term ratio is the candidate ref ratio
//     (D+1)/(D+4) <= 6/9 = 2/3 (D <= 5 digits since indexes <= 16948).
//     Hence for ANY legal component C <= 1e6:
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
export const EXPECTED_MAX_COMPAT_ENVELOPE_BYTES = 563096

// Kind legends (index == kindCode in the compact tuples).
export const SPEECH_CANDIDATE_KINDS = ['silence', 'filler', 'false_start', 'repetition'] as const
export const BOUNDARY_KINDS = ['punctuation_sentence', 'asr_segment', 'pause_utterance'] as const
export type SpeechCandidateKindName = (typeof SPEECH_CANDIDATE_KINDS)[number]

// ---------------------------------------------------------------------------
// Compact envelope types (canonical, sorted-key serialization)
// ---------------------------------------------------------------------------
// word:      [textJson, startCs, confPct]                index == word id
//            confPct: INTEGER 0..100 (= round(confidence*100)); startCs:
//            INTEGER 0..180000 (= round(startMs/10)). Documented projection:
//            endMs and float confidence stay in the pinned component; Phase 8
//            derives every millisecond from IDs against that component.
// candidate: [kindCode, prevIdx, nextIdx, [wordIdx...]]  index == candidate id
//            prevIdx/nextIdx: word index or -1 (upstream null anchor).
//            refs: strictly ascending in-range word indexes (upstream wordIds
//            are consecutive ascending runs; silence candidates have []).
// boundary:  [kindCode, startWordIdx, endWordIdx] with start <= end.
export type EnvWord = [string, number, number]
export type EnvCandidate = [number, number, number, number[]]
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
// Pure canonical JSON (identical semantics to worker editorManifest.canonicalJson)
// ---------------------------------------------------------------------------
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    const parts = keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
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
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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
function requireMatch(v: unknown, re: RegExp, where: string): string {
  if (typeof v !== 'string' || !re.test(v)) fail(`${where}: malformed`, 'director_envelope_bad_string')
  return v
}
// Serialize a sub-document safely: cyclic / unsupported values become a stable
// code instead of a raw TypeError/RangeError escaping the serializer.
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
  requireShortString(bundle.version, 64, 'bundle.version')
  requireShortString(bundle.provider, 64, 'bundle.provider')
  requireShortString(bundle.model, 64, 'bundle.model')
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
  for (let i = 0; i < n; i++) {
    const w = words[i]
    if (!Array.isArray(w) || w.length !== 3) fail(`word ${i}: tuple shape`, 'director_envelope_bad_word')
    if (typeof w[0] !== 'string') fail(`word ${i}: text not a string`, 'director_envelope_bad_word')
    requireIntIn(w[1], 0, MAX_TIME_CS, `word ${i} startCs`, 'director_envelope_bad_word')
    requireIntIn(w[2], 0, 100, `word ${i} confPct`, 'director_envelope_bad_word')
  }

  const candidates = input.candidates
  if (!Array.isArray(candidates)) fail('candidates: not an array', 'director_envelope_bad_candidate')
  if (candidates.length > MAX_CANDIDATES) {
    fail(`candidates ${candidates.length} > ${MAX_CANDIDATES}`, 'director_input_too_many_candidates')
  }
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (!Array.isArray(c) || c.length !== 4) fail(`candidate ${i}: tuple shape`, 'director_envelope_bad_candidate')
    requireIntIn(c[0], 0, SPEECH_CANDIDATE_KINDS.length - 1, `candidate ${i} kind`, 'director_envelope_bad_candidate')
    requireIntIn(c[1], -1, n - 1, `candidate ${i} prevIdx`, 'director_envelope_bad_candidate')
    requireIntIn(c[2], -1, n - 1, `candidate ${i} nextIdx`, 'director_envelope_bad_candidate')
    const refs = c[3]
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
// LOSSLESS in evidence identity: every word, candidate (incl. its prev/next
// anchors and full ref run) and boundary keeps its positional id; only the
// documented field projections apply (confidence -> integer percent, startMs
// -> centiseconds; endMs/float confidence remain in the pinned component that
// Phase 8 reads by id).
// ---------------------------------------------------------------------------
export interface SpeechWordLike { id: string; text: string; startMs: number; confidence: number }
export interface SpeechCandidateLike {
  id: string; kind: string; wordIds: string[]
  prevWordId: string | null; nextWordId: string | null
}
export interface SpeechBoundaryLike { id: string; kind: string; startWordId: string; endWordId: string }

function widIndex(id: string | null | undefined, n: number, where: string): number {
  if (id === null || id === undefined) return -1
  const m = /^w(\d+)$/.exec(id)
  if (!m) fail(`${where}: malformed word id ${id}`, 'director_projection_bad_ref')
  const i = Number(m[1])
  if (!Number.isInteger(i) || i < 0 || i >= n) fail(`${where}: word id ${id} out of range`, 'director_projection_bad_ref')
  return i
}

export function projectSpeechToEnvelope(speech: {
  words: SpeechWordLike[]
  candidates: SpeechCandidateLike[]
  boundaries: SpeechBoundaryLike[]
}): { words: EnvWord[]; candidates: EnvCandidate[]; boundaries: EnvBoundary[] } {
  const n = speech.words.length
  const words: EnvWord[] = speech.words.map((w, i) => {
    if (w.id !== `w${i}`) fail(`word ${i}: positional id mismatch (${w.id})`, 'director_projection_bad_ref')
    return [w.text, Math.round(w.startMs / 10), Math.max(0, Math.min(100, Math.round(w.confidence * 100)))]
  })
  const candidates: EnvCandidate[] = speech.candidates.map((c, i) => {
    const k = SPEECH_CANDIDATE_KINDS.indexOf(c.kind as SpeechCandidateKindName)
    if (k < 0) fail(`candidate ${i}: unknown kind ${c.kind}`, 'director_projection_bad_ref')
    return [k, widIndex(c.prevWordId, n, `candidate ${i} prev`), widIndex(c.nextWordId, n, `candidate ${i} next`),
      c.wordIds.map((id) => widIndex(id, n, `candidate ${i} ref`))]
  })
  const boundaries: EnvBoundary[] = speech.boundaries.map((b, i) => {
    const k = BOUNDARY_KINDS.indexOf(b.kind as (typeof BOUNDARY_KINDS)[number])
    if (k < 0) fail(`boundary ${i}: unknown kind ${b.kind}`, 'director_projection_bad_ref')
    return [k, widIndex(b.startWordId, n, `boundary ${i} start`), widIndex(b.endWordId, n, `boundary ${i} end`)]
  })
  return { words, candidates, boundaries }
}

// ---------------------------------------------------------------------------
// Fixtures — two DISTINCT things (never conflated):
//
// (a) buildMaxUpstreamCompatFixture — the MAXIMUM UPSTREAM-COMPATIBLE fixture:
//     a deterministic synthetic Phase-5 component saturating the 1,000,000-byte
//     budget with an adversarial, envelope-maximizing composition (ref-heavy
//     candidates: the worst domination ratio 2/3), projected by the REAL
//     projection, with maximum-length identity/bundle strings, a full 64-KiB
//     script and full summaries. Its measured bytes freeze
//     EXPECTED_MAX_COMPAT_ENVELOPE_BYTES. It is NOT the simultaneous saturation
//     of every envelope sub-cap — those are jointly infeasible for a legal
//     component (which is the point of the derivation).
// (b) DIRECTOR_INPUT_MAX_BYTES — an INDEPENDENT global fail-closed guard,
//     proven unreachable by any legal component (analytic bound), and <= the
//     token ceiling so passing it implies < 80% context.
// ---------------------------------------------------------------------------
const HEX64 = 'f'.repeat(64)
const UUID0 = '00000000-0000-0000-0000-000000000000'

// Deterministic composition (counts frozen; legality asserted at build).
// This is the ENVELOPE-MAXIMIZING legal direction: because the component
// carries word text twice (text + transcript), long-text words approach the
// worst domination ratio 1/2, beating ref-heavy candidates (~0.28 after their
// 204-byte skeleton). 234 words x 2006 chars + 100 ref-heavy candidates +
// 100 boundaries saturates the budget at 999,537 of 1,000,000 bytes.
export const MAX_COMPAT_WORDS = 234
export const MAX_COMPAT_WORD_TEXT_CHARS = 2006
export const MAX_COMPAT_CANDIDATES = 100
export const MAX_COMPAT_REFS_PER_CANDIDATE = 16
export const MAX_COMPAT_BOUNDARIES = 100

export interface MaxLegalSpeechComponent {
  words: Array<{ id: string; text: string; startMs: number; endMs: number; confidence: number }>
  candidates: Array<SpeechCandidateLike & {
    startMs: number; endMs: number; confidence: string; safeToConsider: boolean
    evidenceCodes: string[]; evidence: Record<string, unknown>; ruleVersion: string
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
    return {
      id: `c${i}`, kind: 'filler', startMs: 0, endMs: 1,
      wordIds: refs, prevWordId: `w${base - 1}`,
      nextWordId: base + 16 < MAX_COMPAT_WORDS ? `w${base + 16}` : null,
      confidence: 'low', safeToConsider: true,
      evidenceCodes: ['filler_disfluency'], evidence: {} as Record<string, unknown>,
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
      version: max64, provider: max64, model: max64,
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

// Editor v2 — Phase 7 Director: the PURE canonical input-envelope contract.
//
// GATE 0 SCOPE ONLY: this file is the deterministic envelope serializer, the
// legal-input sub-cap validators, and the maximum-legal-envelope fixture. It
// contains NO provider call, NO database access, NO directing-stage logic —
// those land only after Gate 0 passes.
//
// The Director consumes an IMMUTABLE, COMPACT projection of the pinned Phase
// 1–6 evidence. Representation is deliberately compact — tuples with IMPLICIT
// positional integer IDs and no duplicated text — so the worst-case 30-minute
// envelope provably fits ONE inference under the provider context with margin.
//
// Determinism: the SAME canonical serializer used for every digest in the
// pipeline (sorted keys, no insignificant whitespace, JSON.stringify for
// scalars). Byte length is measured in UTF-8 via TextEncoder so the bound is
// identical in Node (worker) and the browser (web).

// ---------------------------------------------------------------------------
// Frozen versions + provider bundle identity
// ---------------------------------------------------------------------------
export const DIRECTOR_VERSION = 'director-1'
export const DIRECTOR_ENVELOPE_SCHEMA_VERSION = 1
export const DIRECTOR_DECISION_SCHEMA_VERSION = 1
export const PIPELINE_EPOCH_V2 = 2 // Phase 7 bumps the boot-manifest epoch 1 -> 2

// ---------------------------------------------------------------------------
// Frozen envelope sub-caps (each fails closed if exceeded — NEVER truncated).
// The worst-case envelope built at ALL of these caps is proven <= the byte cap
// with >=20% headroom, and (via tokens <= bytes) < 80% of the provider context.
// ---------------------------------------------------------------------------
export const MAX_WORDS = 10800 // 30 min * 6 words/s (beyond human sustained)
export const MAX_WORD_TEXT_SERIALIZED_BYTES = 28 // escaped serialized UTF-8 bytes (excludes the 2 quotes)
export const MAX_CANDIDATES = 1200
export const MAX_WORD_REFS_PER_CANDIDATE = 8
export const MAX_BOUNDARIES = 1800
export const MAX_SCRIPT_BYTES = 65536 // == SCRIPT_SNAPSHOT_MAX_BYTES (pinned snapshot, once)
export const MAX_SUMMARY_BYTES = 16384

// Time unit inside the envelope: CENTISECONDS (0..180000 for 30 min). Integer.
// Phase 8 deterministically derives every millisecond; the model never authors
// a time — it only references IDs.
export const ENVELOPE_TIME_UNIT = 'centiseconds' as const
export const MAX_TIME_CS = 180000 // 30 min

// Provider context ceiling used in the headroom proof (gemini-3.5-flash).
export const PROVIDER_CONTEXT_TOKENS = 1048576
export const PROVIDER_TOKEN_CEILING = Math.floor(PROVIDER_CONTEXT_TOKENS * 0.8) // 838860

// The enforced input byte cap. Frozen AFTER measuring the max fixture (see
// director.test.ts): it is >= 1.2 * EXPECTED_MAX_ENVELOPE_BYTES (>=20% headroom
// over the true max) AND <= PROVIDER_TOKEN_CEILING, so — because a token spans
// >= 1 UTF-8 byte — ANY envelope passing the byte cap has tokens < 80% context.
export const DIRECTOR_INPUT_MAX_BYTES = 819200 // 800 KiB

// The exact measured serialized size of buildMaxLegalEnvelope(), frozen by the
// Gate-0 test (the test recomputes it from the real serializer and asserts
// equality — never "approximately").
export const EXPECTED_MAX_ENVELOPE_BYTES = 662692

// Kind legends (index == kindCode in the compact tuples).
export const SPEECH_CANDIDATE_KINDS = ['silence', 'filler', 'false_start', 'repetition'] as const
export const BOUNDARY_KINDS = ['punctuation_sentence', 'asr_segment', 'pause_utterance'] as const
export type SpeechCandidateKindName = (typeof SPEECH_CANDIDATE_KINDS)[number]

// ---------------------------------------------------------------------------
// Compact envelope types (canonical, sorted-key serialization)
// ---------------------------------------------------------------------------
// word:      [text, startCs, confidence2dp]         index == word id
// candidate: [kindCode, [wordIndex, ...]]           index == candidate id
// boundary:  [kindCode, startWordIndex, endWordIndex]   index == boundary id
export type EnvWord = [string, number, number]
export type EnvCandidate = [number, number[]]
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
  version: string // DIRECTOR_VERSION
  provider: string // 'google'
  model: string // 'gemini-3.5-flash'
  promptSha256: string
  schemaSha256: string
  configSha256: string
}

export interface DirectorEnvelope {
  schemaVersion: number // DIRECTOR_ENVELOPE_SCHEMA_VERSION
  pipelineEpoch: number // PIPELINE_EPOCH_V2
  bundle: DirectorBundleIdentity
  identity: DirectorEnvelopeIdentity
  script: unknown // the pinned RecordingScriptSnapshot (canonical, once, <= MAX_SCRIPT_BYTES)
  summaries: unknown // bounded visual/audio/hook numeric summaries (<= MAX_SUMMARY_BYTES)
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

// The serialized envelope EXACTLY as transmitted to the provider.
export function serializeDirectorEnvelope(env: DirectorEnvelope): string {
  return canonicalJson(env)
}
export function envelopeByteLength(env: DirectorEnvelope): number {
  return utf8ByteLength(serializeDirectorEnvelope(env))
}

// The serialized contribution of a word-text token = escaped length minus the
// two surrounding quotes. This is the MATHEMATICALLY ENFORCEABLE bound: it
// accounts for worst-case JSON escaping / multi-byte UTF-8 directly, since it
// measures the exact bytes the token adds to the envelope.
export function wordTextSerializedBytes(text: string): number {
  return utf8ByteLength(JSON.stringify(text)) - 2
}

// Conservative, provider-agnostic token upper bound: every token spans >= 1
// UTF-8 byte, so tokenCount <= serialized UTF-8 byte length. (A reproducible
// real countTokens measurement is recorded separately as CI evidence.)
export function conservativeTokenBound(env: DirectorEnvelope): number {
  return envelopeByteLength(env)
}

// ---------------------------------------------------------------------------
// Legal-input validation (sub-caps). Fails CLOSED with a stable code; never
// truncates, samples, or chunks.
// ---------------------------------------------------------------------------
export class DirectorEnvelopeError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'DirectorEnvelopeError'
    this.code = code
  }
}

export function validateDirectorEnvelope(env: DirectorEnvelope): void {
  if (env.schemaVersion !== DIRECTOR_ENVELOPE_SCHEMA_VERSION) {
    throw new DirectorEnvelopeError('envelope schemaVersion mismatch', 'director_envelope_schema_mismatch')
  }
  if (env.pipelineEpoch !== PIPELINE_EPOCH_V2) {
    throw new DirectorEnvelopeError('envelope pipelineEpoch mismatch', 'director_envelope_epoch_mismatch')
  }
  if (env.words.length > MAX_WORDS) {
    throw new DirectorEnvelopeError(`words ${env.words.length} > ${MAX_WORDS}`, 'director_input_too_many_words')
  }
  if (env.candidates.length > MAX_CANDIDATES) {
    throw new DirectorEnvelopeError(`candidates ${env.candidates.length} > ${MAX_CANDIDATES}`, 'director_input_too_many_candidates')
  }
  if (env.boundaries.length > MAX_BOUNDARIES) {
    throw new DirectorEnvelopeError(`boundaries ${env.boundaries.length} > ${MAX_BOUNDARIES}`, 'director_input_too_many_boundaries')
  }
  const n = env.words.length
  for (let i = 0; i < n; i++) {
    const [t, s, c] = env.words[i]
    if (wordTextSerializedBytes(t) > MAX_WORD_TEXT_SERIALIZED_BYTES) {
      throw new DirectorEnvelopeError(`word ${i} text serialized bytes exceed ${MAX_WORD_TEXT_SERIALIZED_BYTES}`, 'director_word_text_too_long')
    }
    if (!Number.isInteger(s) || s < 0 || s > MAX_TIME_CS) {
      throw new DirectorEnvelopeError(`word ${i} startCs out of range`, 'director_envelope_invalid')
    }
    if (typeof c !== 'number' || c < 0 || c > 1) {
      throw new DirectorEnvelopeError(`word ${i} confidence out of range`, 'director_envelope_invalid')
    }
  }
  for (let i = 0; i < env.candidates.length; i++) {
    const [k, refs] = env.candidates[i]
    if (!Number.isInteger(k) || k < 0 || k >= SPEECH_CANDIDATE_KINDS.length) {
      throw new DirectorEnvelopeError(`candidate ${i} kindCode invalid`, 'director_envelope_invalid')
    }
    if (refs.length > MAX_WORD_REFS_PER_CANDIDATE) {
      throw new DirectorEnvelopeError(`candidate ${i} refs ${refs.length} > ${MAX_WORD_REFS_PER_CANDIDATE}`, 'director_input_too_many_refs')
    }
    for (const r of refs) {
      if (!Number.isInteger(r) || r < 0 || r >= n) {
        throw new DirectorEnvelopeError(`candidate ${i} references out-of-range word ${r}`, 'director_envelope_invalid')
      }
    }
  }
  for (let i = 0; i < env.boundaries.length; i++) {
    const [k, sw, ew] = env.boundaries[i]
    if (!Number.isInteger(k) || k < 0 || k >= BOUNDARY_KINDS.length) {
      throw new DirectorEnvelopeError(`boundary ${i} kindCode invalid`, 'director_envelope_invalid')
    }
    if (!Number.isInteger(sw) || sw < 0 || sw >= n || !Number.isInteger(ew) || ew < 0 || ew >= n) {
      throw new DirectorEnvelopeError(`boundary ${i} references out-of-range word`, 'director_envelope_invalid')
    }
  }
  const scriptBytes = utf8ByteLength(canonicalJson(env.script))
  if (scriptBytes > MAX_SCRIPT_BYTES) {
    throw new DirectorEnvelopeError(`script ${scriptBytes} > ${MAX_SCRIPT_BYTES}`, 'director_script_too_large')
  }
  const summaryBytes = utf8ByteLength(canonicalJson(env.summaries))
  if (summaryBytes > MAX_SUMMARY_BYTES) {
    throw new DirectorEnvelopeError(`summaries ${summaryBytes} > ${MAX_SUMMARY_BYTES}`, 'director_summaries_too_large')
  }
  const total = envelopeByteLength(env)
  if (total > DIRECTOR_INPUT_MAX_BYTES) {
    throw new DirectorEnvelopeError(`envelope ${total} > ${DIRECTOR_INPUT_MAX_BYTES}`, 'director_input_too_large')
  }
}

// ---------------------------------------------------------------------------
// buildMaxLegalEnvelope — the deterministic WORST-CASE envelope: every sub-cap
// saturated with maximum-length fields, exercising worst-case serialization.
// ---------------------------------------------------------------------------
const HEX64 = 'f'.repeat(64)

// A word-text token whose ESCAPED serialized contribution is EXACTLY
// MAX_WORD_TEXT_SERIALIZED_BYTES. Backslash escapes to two bytes (\\), so we
// pack the worst case with escape-expanding characters and pad to the exact
// bound — proving the escaped-byte limit, not a raw-length assumption.
function maxWordText(): string {
  // '\\' -> serialized '\\\\' (2 bytes each). 14 backslashes => 28 escaped bytes.
  const half = Math.floor(MAX_WORD_TEXT_SERIALIZED_BYTES / 2)
  let t = '\\'.repeat(half)
  // Pad with single-byte non-escaping chars if the cap is odd.
  while (wordTextSerializedBytes(t) < MAX_WORD_TEXT_SERIALIZED_BYTES) t += 'a'
  return t
}

export function buildMaxLegalEnvelope(): DirectorEnvelope {
  const t = maxWordText()
  const words: EnvWord[] = new Array(MAX_WORDS)
  for (let i = 0; i < MAX_WORDS; i++) words[i] = [t, MAX_TIME_CS, 0.99]

  const maxRefs: number[] = new Array(MAX_WORD_REFS_PER_CANDIDATE).fill(MAX_WORDS - 1)
  const candidates: EnvCandidate[] = new Array(MAX_CANDIDATES)
  for (let i = 0; i < MAX_CANDIDATES; i++) {
    candidates[i] = [SPEECH_CANDIDATE_KINDS.length - 1, maxRefs.slice()]
  }

  const boundaries: EnvBoundary[] = new Array(MAX_BOUNDARIES)
  for (let i = 0; i < MAX_BOUNDARIES; i++) {
    boundaries[i] = [BOUNDARY_KINDS.length - 1, MAX_WORDS - 1, MAX_WORDS - 1]
  }

  // Script padded to EXACTLY MAX_SCRIPT_BYTES canonical bytes.
  const scriptSkeleton = { generationId: HEX64, hook: '', scenes: [] as unknown[], schemaVersion: 1 }
  const base = utf8ByteLength(canonicalJson(scriptSkeleton))
  scriptSkeleton.hook = 'a'.repeat(MAX_SCRIPT_BYTES - base)
  if (utf8ByteLength(canonicalJson(scriptSkeleton)) !== MAX_SCRIPT_BYTES) {
    throw new Error('buildMaxLegalEnvelope: script padding miscomputed')
  }

  const summarySkeleton = { pad: '' }
  const sbase = utf8ByteLength(canonicalJson(summarySkeleton))
  summarySkeleton.pad = 'a'.repeat(MAX_SUMMARY_BYTES - sbase)
  if (utf8ByteLength(canonicalJson(summarySkeleton)) !== MAX_SUMMARY_BYTES) {
    throw new Error('buildMaxLegalEnvelope: summary padding miscomputed')
  }

  return {
    schemaVersion: DIRECTOR_ENVELOPE_SCHEMA_VERSION,
    pipelineEpoch: PIPELINE_EPOCH_V2,
    bundle: {
      version: DIRECTOR_VERSION,
      provider: 'google',
      model: 'gemini-3.5-flash',
      promptSha256: HEX64,
      schemaSha256: HEX64,
      configSha256: HEX64,
    },
    identity: {
      projectId: '00000000-0000-0000-0000-000000000000',
      generationId: '00000000-0000-0000-0000-000000000000',
      sourceAssetId: '00000000-0000-0000-0000-000000000000',
      sourceChecksum: HEX64,
      bootManifestSha: HEX64,
      scriptSnapshotSha: HEX64,
      componentVersions: { inspection: 'inspection-1', speech: 'speech-6' },
      componentDigests: { visual: HEX64, audio: HEX64, hook: HEX64 },
    },
    script: scriptSkeleton,
    summaries: summarySkeleton,
    words,
    candidates,
    boundaries,
  }
}

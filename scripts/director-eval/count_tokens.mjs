// Gate 0 token-headroom EVIDENCE — reproducible real Gemini countTokens on the
// EXACT maximum upstream-compatible Director envelope.
//
// PROOF LAYERS (kept distinct):
//   * RIGOROUS, universal: a provider token spans >= 1 UTF-8 byte, so
//     tokens <= serialized bytes <= DIRECTOR_INPUT_MAX_BYTES (819200)
//     <= 838860 (80% of the gemini-3.5-flash 1,048,576-token context).
//   * CONFIRMATORY: this script records the ACTUAL provider token count on the
//     max-compat fixture. It is evidence of real tokenizer behavior on THIS
//     fixture — never load-bearing for the universal guarantee.
//
// It embeds a faithful plain-JS port of the shared fixture + serializer and
// SELF-CHECKS its serialized byte length against the frozen constant (drift =>
// hard fail), so the port can never silently diverge from the TS authority
// (packages/shared/src/editor/director.ts).
//
//   node scripts/director-eval/count_tokens.mjs            # LIVE: requires GEMINI_API_KEY (fails closed without it)
//   node scripts/director-eval/count_tokens.mjs --selftest # offline: port parity + conservative bound only

// ---- frozen constants (must equal packages/shared/src/editor/director.ts) ----
const EXPECTED_MAX_COMPAT_ENVELOPE_BYTES = 563014
const DIRECTOR_INPUT_MAX_BYTES = 819200
const PROVIDER_TOKEN_CEILING = 838860 // floor(1048576 * 0.8)
const UPSTREAM_SPEECH_BUDGET_BYTES = 1_000_000
const MAX_COMPAT_WORDS = 234
const MAX_COMPAT_WORD_TEXT_CHARS = 2005
const MAX_COMPAT_CANDIDATES = 100
const MAX_COMPAT_REFS_PER_CANDIDATE = 16
const MAX_COMPAT_BOUNDARIES = 100
const MAX_SCRIPT_BYTES = 65536
const MAX_SUMMARY_BYTES = 16384
const DIRECTOR_VERSION = 'director-1'
const DIRECTOR_PROVIDER = 'google'
const DIRECTOR_MODEL = 'gemini-3.5-flash'
const MODEL = 'gemini-3.5-flash'
const HEX64 = 'f'.repeat(64)
const UUID0 = '00000000-0000-0000-0000-000000000000'
const ENC = new TextEncoder()
const b = (s) => ENC.encode(s).length

// STRICT canonical JSON (byte-identical to director.ts canonicalJson).
function isPlainObject(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null
}
function canonicalJson(v) {
  if (v === null) return 'null'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('non-finite')
    return JSON.stringify(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) {
    return `[${v.map((el) => { if (el === undefined) throw new Error('undef elem'); return canonicalJson(el) }).join(',')}]`
  }
  if (typeof v === 'object') {
    if (!isPlainObject(v)) throw new Error('non-plain')
    const parts = Object.keys(v).sort().map((k) => {
      if (v[k] === undefined) throw new Error('undef prop')
      return `${JSON.stringify(k)}:${canonicalJson(v[k])}`
    })
    return `{${parts.join(',')}}`
  }
  throw new Error('unsupported')
}

// Port of buildMaxLegalSpeechComponent (director.ts) — byte-identical recipe.
function buildMaxLegalSpeechComponent() {
  const words = Array.from({ length: MAX_COMPAT_WORDS }, (_, i) => ({
    id: `w${i}`, text: 'a'.repeat(MAX_COMPAT_WORD_TEXT_CHARS),
    startMs: Math.min(2 * i, 1_800_000), endMs: Math.min(2 * i + 1, 1_800_000),
    confidence: 0.99,
  }))
  const transcript = words.map((w) => w.text).join(' ')
  const candidates = Array.from({ length: MAX_COMPAT_CANDIDATES }, (_, i) => {
    const base = 1 + (i % 13) * 16
    const refs = Array.from({ length: MAX_COMPAT_REFS_PER_CANDIDATE }, (_, r) => `w${base + r}`)
    return {
      id: `c${i}`, kind: 'repetition', startMs: 0, endMs: 1,
      wordIds: refs, prevWordId: `w${base - 1}`,
      nextWordId: base + 16 < MAX_COMPAT_WORDS ? `w${base + 16}` : null,
      confidence: 'medium', safeToConsider: true,
      evidenceCodes: ['immediate_repeat'], evidence: {}, ruleVersion: 'speech-rules-3',
    }
  })
  const boundaries = Array.from({ length: MAX_COMPAT_BOUNDARIES }, (_, i) => ({
    id: `u${i}`, kind: 'asr_segment',
    startWordId: `w${i % (MAX_COMPAT_WORDS - 1)}`, endWordId: `w${i % (MAX_COMPAT_WORDS - 1) + 1}`,
    startMs: 0, endMs: 1, evidence: ['trailing'],
  }))
  const component = { words, candidates, boundaries, transcript }
  const serializedBytes = b(JSON.stringify(component))
  if (serializedBytes > UPSTREAM_SPEECH_BUDGET_BYTES) {
    throw new Error(`component ${serializedBytes} exceeds the upstream budget`)
  }
  return { ...component, serializedBytes }
}

// Port of projectSpeechToEnvelope (director.ts) — enriched candidate tuple.
const KINDS = ['silence', 'filler', 'false_start', 'repetition']
const BKINDS = ['punctuation_sentence', 'asr_segment', 'pause_utterance']
const CONF = ['low', 'medium', 'high']
const SILCLASS = ['none', 'uncertain', 'removable', 'dead_air']
const widx = (id, n) => {
  if (id === null || id === undefined) return -1
  const i = Number(id.slice(1))
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error(`bad wid ${id}`)
  return i
}
function project(comp) {
  const n = comp.words.length
  return {
    words: comp.words.map((w) => [w.text, Math.round(w.startMs / 10), Math.round(w.confidence * 100)]),
    candidates: comp.candidates.map((c) => {
      const k = KINDS.indexOf(c.kind)
      const startCs = Math.round(c.startMs / 10), endCs = Math.round(c.endMs / 10)
      const conf = CONF.indexOf(c.confidence)
      const sil = c.kind === 'silence' ? SILCLASS.indexOf(c.evidence.class) : 0
      const sel = c.kind === 'filler' ? 0 : 1
      return [k, startCs, endCs, conf, sil, sel, c.wordIds.map((id) => widx(id, n))]
    }),
    boundaries: comp.boundaries.map((x) => [BKINDS.indexOf(x.kind), widx(x.startWordId, n), widx(x.endWordId, n)]),
  }
}

// Port of buildMaxUpstreamCompatFixture (director.ts).
function buildFixture() {
  const comp = buildMaxLegalSpeechComponent()
  const proj = project(comp)
  const script = { generationId: UUID0, hook: '', scenes: [], schemaVersion: 1 }
  script.hook = 'a'.repeat(MAX_SCRIPT_BYTES - b(canonicalJson(script)))
  const summaries = { pad: '' }
  summaries.pad = 'a'.repeat(MAX_SUMMARY_BYTES - b(canonicalJson(summaries)))
  const max64 = 'v'.repeat(64)
  return {
    schemaVersion: 1, pipelineEpoch: 2,
    bundle: { version: DIRECTOR_VERSION, provider: DIRECTOR_PROVIDER, model: DIRECTOR_MODEL, promptSha256: HEX64, schemaSha256: HEX64, configSha256: HEX64 },
    identity: {
      projectId: UUID0, generationId: UUID0, sourceAssetId: UUID0,
      sourceChecksum: HEX64, bootManifestSha: HEX64, scriptSnapshotSha: HEX64,
      componentVersions: { inspection: max64, speech: max64 },
      componentDigests: { visual: HEX64, audio: HEX64, hook: HEX64 },
    },
    script, summaries,
    words: proj.words, candidates: proj.candidates, boundaries: proj.boundaries,
  }
}

const serialized = canonicalJson(buildFixture())
const bytes = b(serialized)
if (bytes !== EXPECTED_MAX_COMPAT_ENVELOPE_BYTES) {
  console.error(`::error::count_tokens port drift: ${bytes} !== ${EXPECTED_MAX_COMPAT_ENVELOPE_BYTES}`)
  process.exit(1)
}
console.log(`port parity OK: max upstream-compatible envelope = ${bytes} bytes (== frozen ${EXPECTED_MAX_COMPAT_ENVELOPE_BYTES})`)
console.log(`conservative bound (tokens <= bytes): ${bytes} <= cap ${DIRECTOR_INPUT_MAX_BYTES} <= ceiling ${PROVIDER_TOKEN_CEILING} (80% ctx): ${bytes <= DIRECTOR_INPUT_MAX_BYTES && DIRECTOR_INPUT_MAX_BYTES <= PROVIDER_TOKEN_CEILING}`)

if (process.argv.includes('--selftest')) process.exit(0)

const key = process.env.GEMINI_API_KEY
if (!key) {
  // MANDATORY real evidence: a live-run without credentials FAILS CLOSED.
  console.error('::error::GEMINI_API_KEY is required for the mandatory Gate-0 real countTokens evidence — failing closed.')
  process.exit(1)
}
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:countTokens`
const resp = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
  body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: serialized }] }] }),
})
if (!resp.ok) {
  console.error(`::error::countTokens HTTP ${resp.status}`)
  process.exit(1)
}
const data = await resp.json()
const total = data.totalTokens
console.log(`REAL countTokens(${MODEL}) totalTokens=${total}; byte cap=${DIRECTOR_INPUT_MAX_BYTES}; 80% ceiling=${PROVIDER_TOKEN_CEILING}`)
if (typeof total !== 'number' || total > PROVIDER_TOKEN_CEILING) {
  console.error('::error::real token count exceeds the 80% ceiling')
  process.exit(1)
}
console.log(`EVIDENCE: real max-compat-envelope tokens ${total} <= ${PROVIDER_TOKEN_CEILING} (80% of 1048576) — one inference confirmed for the max upstream-compatible input.`)

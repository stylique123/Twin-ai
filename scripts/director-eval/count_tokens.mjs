// Gate 0 token-headroom EVIDENCE — reproducible real Gemini countTokens on the
// EXACT maximum-legal Director envelope.
//
// The rigorous proof (Gate 0 unit tests) is: a token spans >= 1 UTF-8 byte, so
// tokens <= serialized bytes <= DIRECTOR_INPUT_MAX_BYTES (819200) <= 80% of the
// gemini-3.5-flash context (838860). This script records the ACTUAL provider
// token count as confirmatory evidence.
//
// It embeds a faithful plain-JS port of the shared serializer + fixture and
// SELF-CHECKS its serialized byte length against the frozen constant (drift =>
// hard fail), so the port can never silently diverge from the TS authority.
//
//   node scripts/director-eval/count_tokens.mjs            # needs GEMINI_API_KEY
//   node scripts/director-eval/count_tokens.mjs --selftest # offline: port parity only

// ---- frozen constants (must equal packages/shared/src/editor/director.ts) ----
const EXPECTED_MAX_ENVELOPE_BYTES = 662692
const DIRECTOR_INPUT_MAX_BYTES = 819200
const PROVIDER_TOKEN_CEILING = 838860 // floor(1048576 * 0.8)
const MAX_WORDS = 10800
const MAX_WORD_TEXT_SERIALIZED_BYTES = 28
const MAX_CANDIDATES = 1200
const MAX_WORD_REFS_PER_CANDIDATE = 8
const MAX_BOUNDARIES = 1800
const MAX_SCRIPT_BYTES = 65536
const MAX_SUMMARY_BYTES = 16384
const MAX_TIME_CS = 180000
const MODEL = 'gemini-3.5-flash'
const HEX64 = 'f'.repeat(64)
const ENC = new TextEncoder()
const b = (s) => ENC.encode(s).length

function canonicalJson(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`
  }
  throw new Error('unsupported')
}
const wordTextSerializedBytes = (t) => b(JSON.stringify(t)) - 2

function maxWordText() {
  let t = '\\'.repeat(Math.floor(MAX_WORD_TEXT_SERIALIZED_BYTES / 2))
  while (wordTextSerializedBytes(t) < MAX_WORD_TEXT_SERIALIZED_BYTES) t += 'a'
  return t
}
function buildMaxLegalEnvelope() {
  const t = maxWordText()
  const words = Array.from({ length: MAX_WORDS }, () => [t, MAX_TIME_CS, 0.99])
  const refs = new Array(MAX_WORD_REFS_PER_CANDIDATE).fill(MAX_WORDS - 1)
  const candidates = Array.from({ length: MAX_CANDIDATES }, () => [3, refs.slice()])
  const boundaries = Array.from({ length: MAX_BOUNDARIES }, () => [2, MAX_WORDS - 1, MAX_WORDS - 1])
  const script = { generationId: HEX64, hook: '', scenes: [], schemaVersion: 1 }
  script.hook = 'a'.repeat(MAX_SCRIPT_BYTES - b(canonicalJson(script)))
  const summaries = { pad: '' }
  summaries.pad = 'a'.repeat(MAX_SUMMARY_BYTES - b(canonicalJson(summaries)))
  return {
    schemaVersion: 1, pipelineEpoch: 2,
    bundle: { version: 'director-1', provider: 'google', model: MODEL, promptSha256: HEX64, schemaSha256: HEX64, configSha256: HEX64 },
    identity: {
      projectId: '00000000-0000-0000-0000-000000000000', generationId: '00000000-0000-0000-0000-000000000000',
      sourceAssetId: '00000000-0000-0000-0000-000000000000', sourceChecksum: HEX64,
      bootManifestSha: HEX64, scriptSnapshotSha: HEX64,
      componentVersions: { inspection: 'inspection-1', speech: 'speech-6' },
      componentDigests: { visual: HEX64, audio: HEX64, hook: HEX64 },
    },
    script, summaries, words, candidates, boundaries,
  }
}

const env = buildMaxLegalEnvelope()
const serialized = canonicalJson(env)
const bytes = b(serialized)
if (bytes !== EXPECTED_MAX_ENVELOPE_BYTES) {
  console.error(`::error::count_tokens port drift: ${bytes} !== ${EXPECTED_MAX_ENVELOPE_BYTES}`)
  process.exit(1)
}
console.log(`port parity OK: max envelope = ${bytes} bytes (== frozen ${EXPECTED_MAX_ENVELOPE_BYTES})`)
console.log(`conservative token bound (tokens <= bytes): ${bytes} <= ${PROVIDER_TOKEN_CEILING} (80% ctx) : ${bytes <= PROVIDER_TOKEN_CEILING}`)

if (process.argv.includes('--selftest')) process.exit(0)

const key = process.env.GEMINI_API_KEY
if (!key) {
  // MANDATORY real evidence: a live-run without credentials FAILS CLOSED. Gate 0
  // requires an actual provider countTokens result on the exact maximum fixture;
  // the conservative bound alone is not accepted as the live evidence. (Offline
  // port-parity is a separate `--selftest` step.)
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
console.log(`REAL countTokens(${MODEL}) totalTokens=${total} of ${DIRECTOR_INPUT_MAX_BYTES}-byte cap; 80% ceiling=${PROVIDER_TOKEN_CEILING}`)
if (typeof total !== 'number' || total > PROVIDER_TOKEN_CEILING) {
  console.error('::error::real token count exceeds the 80% ceiling')
  process.exit(1)
}
console.log(`EVIDENCE: real max-envelope tokens ${total} <= ${PROVIDER_TOKEN_CEILING} (80% of ${1048576}) — one inference confirmed.`)

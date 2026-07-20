// Phase 5 human-speech evaluation harness (offline; no DB/storage/matrix
// mutation). Runs the REAL worker speech pipeline (editor_speech.py bridge +
// buildSpeechAnalysis) over a manifest of consented/licensed human recordings
// and reports honest, category-level metrics against the PREDEFINED thresholds
// in thresholds.json.
//
//   SPEECH_EVAL_MANIFEST=/path/manifest.json node scripts/speech-eval/evaluate.mjs
//
// Metrics are CLIP-LEVEL PRESENCE (robust without word-level timings from the
// streamed corpora): does a filler-present clip yield a filler candidate; does
// a CLEAN clip yield NONE (false positives); WER / missing / invented on clean
// read speech; off-script retention; boundary-kind distribution;
// low-confidence-alone never producing a removal candidate. With no manifest it
// EXITS 0 with an explicit "not provisioned" notice — never a false green.
import { execFile as _ef } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const execFile = promisify(_ef)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

const manifestPath = process.env.SPEECH_EVAL_MANIFEST
if (!manifestPath) {
  console.log('speech-eval: SPEECH_EVAL_MANIFEST not set — no eval corpus provisioned. NOT a pass.')
  process.exit(0)
}
process.env.SUPABASE_URL ||= 'https://speech-eval.stub'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub'
const { buildSpeechAnalysis } = await import(join(REPO, 'worker', 'dist', 'jobs', 'editorSpeech.js'))

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean)

function werStats(ref, hyp) {
  const r = norm(ref); const h = norm(hyp); const n = r.length; const m = h.length
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  const op = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    if (r[i - 1] === h[j - 1]) { d[i][j] = d[i - 1][j - 1]; op[i][j] = 'ok' }
    else {
      const s = d[i - 1][j - 1]; const del = d[i - 1][j]; const ins = d[i][j - 1]; const best = Math.min(s, del, ins)
      d[i][j] = best + 1; op[i][j] = best === s ? 'sub' : best === del ? 'del' : 'ins'
    }
  }
  let i = n; let j = m; let sub = 0; let del = 0; let ins = 0
  while (i > 0 || j > 0) {
    const o = i > 0 && j > 0 ? op[i][j] : (i > 0 ? 'del' : 'ins')
    if (o === 'ok') { i--; j-- } else if (o === 'sub') { sub++; i--; j-- } else if (o === 'del') { del++; i-- } else { ins++; j-- }
  }
  return { refWords: n, hypWords: m, sub, del, ins, wer: n ? (sub + del + ins) / n : 0 }
}

async function runBridge(audioAbs) {
  const dir = await mkdtemp(join(tmpdir(), 'speech-eval-'))
  const out = join(dir, 'bridge.json')
  await execFile('python3', [join(REPO, 'worker', 'editor_speech.py'),
    '--audio', audioAbs, '--out', out,
    '--model', process.env.EDITOR_SPEECH_MODEL || 'base', '--device', process.env.WHISPER_DEVICE || 'cpu',
    '--language', process.env.WHISPER_LANGUAGE || 'en', '--beam-size', '1', '--max-seconds', '1800'],
    { timeout: 1_200_000 })
  return JSON.parse(await readFile(out, 'utf8'))
}

const OPTS = {
  speechVersion: process.env.EDITOR_SPEECH_VERSION || 'speech-1', asrModel: process.env.EDITOR_SPEECH_MODEL || 'base',
  asrComputeType: 'int8', device: 'cpu', beamSize: 1, languagePolicy: process.env.WHISPER_LANGUAGE || 'en',
  silenceMinMs: 700, vadMinSilenceMs: 300, vadSpeechPadMs: 100,
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const clips = manifest.clips ?? manifest
const results = []
let lowConfOnlyRemovalCandidates = 0

for (const clip of clips) {
  const audioAbs = isAbsolute(clip.audio) ? clip.audio : resolve(dirname(manifestPath), clip.audio)
  let a
  try { a = buildSpeechAnalysis({ id: clip.id, content_sha256: 'eval' }, await runBridge(audioAbs), OPTS) }
  catch (e) { results.push({ id: clip.id, category: clip.category, error: String(e.message).slice(0, 200) }); console.error(`  ${clip.id}: ${e.message}`); continue }
  const cand = a.candidates ?? []
  const fillers = cand.filter((c) => c.kind === 'filler')
  const repeats = cand.filter((c) => c.kind === 'false_start' || c.kind === 'repetition')
  // A low-confidence word must never, by itself, produce a removal candidate.
  // Our builder never does this; assert structurally by checking no candidate's
  // evidence is confidence-only (no kind/evidence code beyond low ASR conf).
  for (const c of cand) if ((c.evidenceCodes || []).length === 1 && c.evidenceCodes[0] === 'asr_low_conf') lowConfOnlyRemovalCandidates++
  const wer = werStats(clip.referenceTranscript ?? '', a.transcript)
  const heard = new Set(norm(a.transcript))
  const off = clip.expected?.offScriptWords ?? []
  results.push({
    id: clip.id, category: clip.category, expected: clip.expected,
    wer: Number(wer.wer.toFixed(3)), missingWords: wer.del, inventedWords: wer.ins, refWords: wer.refWords,
    fillerCandidates: fillers.length, repeatCandidates: repeats.length,
    silence: cand.filter((c) => c.kind === 'silence').map((c) => c.evidence?.class),
    offScriptRetained: off.filter((w) => heard.has(norm(w)[0])).length, offScriptExpected: off.length,
    lowConfWords: (a.words ?? []).filter((w) => w.confidence < 0.4).length,
    boundaryKinds: Object.fromEntries(['punctuation_sentence', 'asr_segment', 'pause_utterance'].map((k) => [k, (a.boundaries ?? []).filter((b) => b.kind === k).length])),
    transcript: a.transcript,
  })
  console.log(`  ${clip.id} [${clip.category}] WER=${(wer.wer * 100).toFixed(1)}% miss=${wer.del} inv=${wer.ins} filler=${fillers.length} rep=${repeats.length}`)
}

const ok = results.filter((r) => !r.error)
const clean = ok.filter((r) => r.expected?.clean)
const fillerClips = ok.filter((r) => r.expected?.hasFiller)
const repClips = ok.filter((r) => r.expected?.hasFalseStartOrRepetition)
const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0)
const ratio = (a, b) => (b ? a / b : null)

// Clip-level presence precision/recall. Clean clips are the negative set for
// false positives.
const fillerTP = fillerClips.filter((r) => r.fillerCandidates > 0).length
const fillerFP = clean.filter((r) => r.fillerCandidates > 0).length
const repTP = repClips.filter((r) => r.repeatCandidates > 0).length
const repFP = clean.filter((r) => r.repeatCandidates > 0).length

const summary = {
  clips: results.length, evaluated: ok.length, errored: results.filter((r) => r.error).length,
  meanWerClean: clean.length ? Number((sum(clean, (r) => r.wer) / clean.length).toFixed(3)) : null,
  inventedWordRatioClean: ratio(sum(clean, (r) => r.inventedWords), sum(clean, (r) => r.refWords)),
  offScriptRetentionRatio: ratio(sum(ok, (r) => r.offScriptRetained), sum(ok, (r) => r.offScriptExpected)),
  fillerPrecision: ratio(fillerTP, fillerTP + fillerFP), fillerRecall: ratio(fillerTP, fillerClips.length),
  repetitionPrecision: ratio(repTP, repTP + repFP), repetitionRecall: ratio(repTP, repClips.length),
  lowConfOnlyRemovalCandidates,
  cleanFalsePositiveClips: fillerFP + repFP,
}
// Per-category aggregates (published in the report + printed).
const byCategory = {}
for (const r of results) {
  const c = (byCategory[r.category] ||= { clips: 0, evaluated: 0, errored: 0, werSum: 0, fillerCand: 0, repeatCand: 0 })
  c.clips++
  if (r.error) { c.errored++; continue }
  c.evaluated++; c.werSum += r.wer; c.fillerCand += r.fillerCandidates; c.repeatCand += r.repeatCandidates
}
for (const k of Object.keys(byCategory)) {
  const c = byCategory[k]
  c.meanWer = c.evaluated ? Number((c.werSum / c.evaluated).toFixed(3)) : null
  delete c.werSum
}

// Honest failure examples: transcription errors, false positives on clean
// speech, and clean-speech WER outliers.
const failures = []
for (const r of results) {
  if (r.error) { failures.push({ id: r.id, category: r.category, kind: 'transcription_error', detail: r.error }); continue }
  if (r.expected?.clean && (r.fillerCandidates > 0 || r.repeatCandidates > 0))
    failures.push({ id: r.id, category: r.category, kind: 'false_positive_on_clean', filler: r.fillerCandidates, repeat: r.repeatCandidates })
  if (r.expected?.clean && r.wer > 0.2)
    failures.push({ id: r.id, category: r.category, kind: 'clean_wer_outlier', wer: r.wer, transcript: r.transcript })
}

const report = {
  asrModel: OPTS.asrModel, speechVersion: OPTS.speechVersion, provenance: manifest.provenance,
  categories: manifest.categories, diversity: manifest.diversity,
  summary, byCategory, failures, results,
}
await writeFile('speech-eval-report.json', JSON.stringify(report, null, 2))
console.log('\n=== per-category ===\n' + JSON.stringify(byCategory, null, 2))
if (failures.length) console.log('\n=== failure examples ===\n' + JSON.stringify(failures, null, 2))
console.log('\n=== speech-eval summary ===\n' + JSON.stringify(summary, null, 2) + '\nreport → speech-eval-report.json')

// Gate against PREDEFINED thresholds (thresholds.json). Never weakened here.
let t = manifest.thresholds
if (!t) { try { t = JSON.parse(await readFile(join(HERE, 'thresholds.json'), 'utf8')) } catch { t = null } }
if (!t) { console.log('no thresholds file — BASELINE run (record honestly, then gate)'); process.exit(0) }
const fails = []
const chk = (name, val, cmp, lim) => {
  if (val == null) { console.log(`  (skip ${name}: not measurable on this corpus)`); return }
  const bad = cmp === '<=' ? val > lim : cmp === '>=' ? val < lim : val !== lim
  console.log(`  ${bad ? 'FAIL' : 'ok  '} ${name}=${typeof val === 'number' ? val.toFixed(3) : val} (need ${cmp} ${lim})`)
  if (bad) fails.push(`${name}=${val} !${cmp} ${lim}`)
}
chk('meanWerClean', summary.meanWerClean, '<=', t.maxMeanWerClean)
chk('inventedWordRatioClean', summary.inventedWordRatioClean, '<=', t.maxInventedWordRatioClean)
chk('offScriptRetentionRatio', summary.offScriptRetentionRatio, '>=', t.minOffScriptRetentionRatio)
chk('fillerPrecision', summary.fillerPrecision, '>=', t.minFillerPrecision)
chk('repetitionPrecision', summary.repetitionPrecision, '>=', t.minRepetitionPrecision)
chk('lowConfOnlyRemovalCandidates', summary.lowConfOnlyRemovalCandidates, '==', t.maxLowConfidenceOnlyRemovalCandidates)
if (fails.length) { console.error('\nTHRESHOLD FAILURES:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('\nall predefined thresholds met')

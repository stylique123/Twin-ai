// Phase 5 human-speech evaluation harness.
//
// Runs the REAL worker speech pipeline (editor_speech.py bridge +
// buildSpeechAnalysis) over a manifest of LEGALLY-USABLE, consented human
// recordings and reports honest quality metrics. This is an OFFLINE evaluation
// — it does not touch the database, storage, or the staging matrices, so it
// never mutates production/staging state.
//
// Usage:
//   SPEECH_EVAL_MANIFEST=/path/to/manifest.json node scripts/speech-eval/evaluate.mjs
// The worker must be built first (worker/dist). If SPEECH_EVAL_MANIFEST is
// unset, the harness EXITS 0 with an explicit "no eval set provisioned" notice
// — it must never report a false green from an absent dataset.
//
// Manifest shape (see manifest.example.json): an array of clips, each with the
// audio path, a human reference transcript, its category, and expected
// disfluency annotations. Optional `thresholds` object sets acceptance gates;
// with no thresholds the run records a BASELINE only (never auto-passes).
import { execFile as __ef } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const execFile = promisify(__ef)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

const manifestPath = process.env.SPEECH_EVAL_MANIFEST
if (!manifestPath) {
  console.log('speech-eval: SPEECH_EVAL_MANIFEST not set — no human-speech eval set provisioned.')
  console.log('  This is NOT a pass. Provide a manifest of consented recordings to produce a baseline.')
  process.exit(0)
}

// The worker must be built so we can import the pure builder.
process.env.SUPABASE_URL ||= 'https://speech-eval.stub'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub'
const { buildSpeechAnalysis } = await import(join(REPO, 'worker', 'dist', 'jobs', 'editorSpeech.js'))

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean)

// Token-level Levenshtein → WER components (substitutions/deletions/insertions).
function werStats(ref, hyp) {
  const r = norm(ref); const h = norm(hyp)
  const n = r.length; const m = h.length
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  const op = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (r[i - 1] === h[j - 1]) { d[i][j] = d[i - 1][j - 1]; op[i][j] = 'ok' }
      else {
        const sub = d[i - 1][j - 1]; const del = d[i - 1][j]; const ins = d[i][j - 1]
        const best = Math.min(sub, del, ins)
        d[i][j] = best + 1
        op[i][j] = best === sub ? 'sub' : best === del ? 'del' : 'ins'
      }
    }
  }
  // Backtrack for missing (del) and invented (ins) counts.
  let i = n; let j = m; let sub = 0; let del = 0; let ins = 0
  while (i > 0 || j > 0) {
    const o = i > 0 && j > 0 ? op[i][j] : (i > 0 ? 'del' : 'ins')
    if (o === 'ok') { i--; j-- }
    else if (o === 'sub') { sub++; i--; j-- }
    else if (o === 'del') { del++; i-- }
    else { ins++; j-- }
  }
  return { refWords: n, hypWords: m, sub, del, ins, wer: n ? (sub + del + ins) / n : 0 }
}

async function runBridge(audioAbs) {
  const dir = await mkdtemp(join(tmpdir(), 'speech-eval-'))
  const out = join(dir, 'bridge.json')
  await execFile('python3', [
    join(REPO, 'worker', 'editor_speech.py'),
    '--audio', audioAbs, '--out', out,
    '--model', process.env.EDITOR_SPEECH_MODEL || 'base',
    '--device', process.env.WHISPER_DEVICE || 'cpu',
    '--language', process.env.WHISPER_LANGUAGE || 'en', '--beam-size', '1',
    '--max-seconds', '1800',
  ], { timeout: 1_200_000 })
  return JSON.parse(await readFile(out, 'utf8'))
}

const OPTS = {
  speechVersion: process.env.EDITOR_SPEECH_VERSION || 'speech-1',
  asrModel: process.env.EDITOR_SPEECH_MODEL || 'base', asrComputeType: 'int8', device: 'cpu',
  beamSize: 1, languagePolicy: process.env.WHISPER_LANGUAGE || 'en', silenceMinMs: 700,
  vadMinSilenceMs: 300, vadSpeechPadMs: 100,
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const clips = manifest.clips ?? manifest
const results = []

for (const clip of clips) {
  const audioAbs = isAbsolute(clip.audio) ? clip.audio : resolve(dirname(manifestPath), clip.audio)
  let bridge
  try { bridge = await runBridge(audioAbs) } catch (e) { console.error(`clip ${clip.id}: bridge failed: ${e.message}`); results.push({ id: clip.id, category: clip.category, error: String(e.message).slice(0, 200) }); continue }
  const a = buildSpeechAnalysis({ id: clip.id, content_sha256: 'eval' }, bridge, OPTS)

  const wer = werStats(clip.referenceTranscript ?? '', a.transcript)
  const heard = new Set(norm(a.transcript))
  const offScript = (clip.expected?.offScriptWords ?? [])
  const offScriptRetained = offScript.filter((w) => heard.has(norm(w)[0])).length
  const cand = a.candidates ?? []
  const byKind = (k) => cand.filter((c) => c.kind === k)
  // Candidate presence vs expected annotations (precision proxy: candidates of
  // a kind that overlap an expected instance / total candidates of that kind).
  const overlaps = (c, spans) => (spans ?? []).some((s) => c.startMs <= (s.endMs ?? s.approxMs + 300) && c.endMs >= (s.startMs ?? s.approxMs - 300))
  const kindPrecision = (k, spans) => {
    const cs = byKind(k); if (!cs.length) return { candidates: 0, matched: 0, precision: null }
    const matched = cs.filter((c) => overlaps(c, spans)).length
    return { candidates: cs.length, matched, precision: matched / cs.length }
  }
  const lowConf = (a.words ?? []).filter((w) => w.confidence < 0.4).length

  results.push({
    id: clip.id, category: clip.category,
    wer: Number(wer.wer.toFixed(3)), missingWords: wer.del, inventedWords: wer.ins, substitutions: wer.sub,
    refWords: wer.refWords, hypWords: wer.hypWords,
    offScriptExpected: offScript.length, offScriptRetained,
    filler: kindPrecision('filler', clip.expected?.fillers),
    falseStart: kindPrecision('false_start', clip.expected?.falseStarts),
    repetition: kindPrecision('repetition', clip.expected?.repetitions),
    silence: byKind('silence').map((c) => ({ ms: [c.startMs, c.endMs], class: c.evidence?.class })),
    silenceExpected: clip.expected?.silences ?? [],
    lowConfWords: lowConf,
    boundaryKinds: Object.fromEntries(['punctuation_sentence', 'asr_segment', 'pause_utterance']
      .map((k) => [k, (a.boundaries ?? []).filter((b) => b.kind === k).length])),
    transcript: a.transcript,
  })
  console.log(`  ${clip.id} [${clip.category}]  WER=${(wer.wer * 100).toFixed(1)}%  miss=${wer.del} inv=${wer.ins}  offscript=${offScriptRetained}/${offScript.length}`)
}

const scored = results.filter((r) => !r.error && r.refWords)
const meanWer = scored.length ? scored.reduce((s, r) => s + r.wer, 0) / scored.length : null
const totalInvented = scored.reduce((s, r) => s + (r.inventedWords || 0), 0)
const summary = {
  clips: results.length, evaluated: scored.length, errored: results.filter((r) => r.error).length,
  meanWer: meanWer == null ? null : Number(meanWer.toFixed(3)),
  totalMissingWords: scored.reduce((s, r) => s + (r.missingWords || 0), 0),
  totalInventedWords: totalInvented,
  offScriptRetained: scored.reduce((s, r) => s + (r.offScriptRetained || 0), 0),
  offScriptExpected: scored.reduce((s, r) => s + (r.offScriptExpected || 0), 0),
}
const report = { asrModel: OPTS.asrModel, speechVersion: OPTS.speechVersion, summary, results }
await writeFile('speech-eval-report.json', JSON.stringify(report, null, 2))
console.log('\n=== speech-eval summary ===')
console.log(JSON.stringify(summary, null, 2))
console.log('report → speech-eval-report.json')

// Thresholds are OPTIONAL. With none, this is a BASELINE run and exits 0 after
// recording numbers honestly. Do not invent generous thresholds to force green.
const t = manifest.thresholds
if (t) {
  const fails = []
  if (t.maxMeanWer != null && meanWer != null && meanWer > t.maxMeanWer) fails.push(`meanWer ${meanWer} > ${t.maxMeanWer}`)
  if (t.maxInventedWords != null && totalInvented > t.maxInventedWords) fails.push(`invented ${totalInvented} > ${t.maxInventedWords}`)
  if (t.minOffScriptRetentionRatio != null) {
    const ratio = summary.offScriptExpected ? summary.offScriptRetained / summary.offScriptExpected : 1
    if (ratio < t.minOffScriptRetentionRatio) fails.push(`offScriptRetention ${ratio.toFixed(2)} < ${t.minOffScriptRetentionRatio}`)
  }
  if (fails.length) { console.error('THRESHOLD FAILURES:\n  ' + fails.join('\n  ')); process.exit(1) }
  console.log('all configured thresholds met')
} else {
  console.log('no thresholds configured — BASELINE run (not a pass/fail gate)')
}

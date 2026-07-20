// Phase 5 human-speech evaluation harness (offline; no DB/storage/matrix
// mutation). Runs the REAL worker speech pipeline (editor_speech.py bridge +
// buildSpeechAnalysis) over a manifest of licensed human recordings and reports
// honest, category-level metrics against the PREDEFINED thresholds in
// thresholds.json.
//
//   SPEECH_EVAL_MANIFEST=/path/manifest.json node scripts/speech-eval/evaluate.mjs
//
// Every proportion is reported as value + numerator/denominator + a 95% Wilson
// confidence interval. A MANDATORY metric that cannot be measured (denominator
// 0) is reported as NOT EVALUATED and FAILS the gate — it is never silently
// treated as "met". With no manifest the harness EXITS 0 with an explicit "not
// provisioned" notice.
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

// Wilson score interval (95%) for a binomial proportion k/n.
function wilson(k, n) {
  if (!n) return null
  const z = 1.96, p = k / n, z2 = z * z
  const d = 1 + z2 / n
  const c = p + z2 / (2 * n)
  const m = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]
}
const prop = (k, n) => ({ value: n ? Number((k / n).toFixed(3)) : null, num: k, den: n, ci95: wilson(k, n) })

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

// SINGLE source of truth for the model under test — the bridge invocation and
// the report header MUST agree. (Run 29752731049 was invalidated for model
// attribution because these diverged: the bridge defaulted to base while the
// report claimed small.)
const ASR_MODEL = process.env.EDITOR_SPEECH_MODEL || 'small'

async function runBridge(audioAbs, extraArgs = []) {
  const dir = await mkdtemp(join(tmpdir(), 'speech-eval-'))
  const out = join(dir, 'bridge.json')
  await execFile('python3', [join(REPO, 'worker', 'editor_speech.py'),
    '--audio', audioAbs, '--out', out,
    '--model', ASR_MODEL, '--device', process.env.WHISPER_DEVICE || 'cpu',
    '--language', process.env.WHISPER_LANGUAGE || 'en', '--beam-size', '1', '--max-seconds', '1800',
    ...extraArgs],
    { timeout: 1_200_000 })
  return JSON.parse(await readFile(out, 'utf8'))
}

// Filler tokens (mirrors the builder's DISFLUENCY set). Used for the dedicated
// hallucination gate: on clean read speech with ZERO spoken fillers, the
// shipped config must emit NO filler tokens and NO filler candidates — the
// global invented-word ratio is NOT an acceptable substitute (a few
// hallucinated fillers stay under 0.03 while creating unsafe candidates).
const FILLER_TOKENS = new Set(['um', 'uh', 'uhm', 'umm', 'uhh', 'erm', 'er', 'ah', 'hmm', 'mm', 'mmm'])
const countFillerTokens = (text) => norm(text).filter((t) => FILLER_TOKENS.has(t)).length

const OPTS = {
  speechVersion: process.env.EDITOR_SPEECH_VERSION || 'speech-5', asrModel: ASR_MODEL,
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
  const words = a.words ?? []
  const wnorm = (w) => w.normalizedText || norm(w.text)[0] || ''
  const byId = new Map(words.map((w) => [w.id, w]))
  const fillers = cand.filter((c) => c.kind === 'filler')
  const falseStarts = cand.filter((c) => c.kind === 'false_start')
  const repeats = cand.filter((c) => c.kind === 'repetition')
  const silences = cand.filter((c) => c.kind === 'silence')
  // A low-confidence word must never, by itself, produce a removal candidate.
  for (const c of cand) if ((c.evidenceCodes || []).length === 1 && c.evidenceCodes[0] === 'asr_low_conf') lowConfOnlyRemovalCandidates++

  // Off-script retention — DEFINITION SPLIT approved by the reviewer
  // (2026-07-20) after run 29751818139's decomposition showed every dropped
  // off-script word was an ASR transcription miss and ZERO were editor
  // removals. The GATE (>=0.90, unchanged) measures what the editor controls:
  // of the off-script words the ASR transcribed, none may be covered by a
  // removal candidate. ASR word-miss is reported separately (ungated) as
  // offScriptAsrMissRatio — that failure mode is the WER/model domain.
  const removedNorms = new Set()
  for (const c of cand) if (c.kind !== 'silence') for (const id of (c.wordIds || [])) { const w = byId.get(id); if (w) removedNorms.add(wnorm(w)) }
  const heard = new Set(words.map(wnorm))
  const off = (clip.expected?.offScriptWords ?? []).map((w) => norm(w)[0]).filter(Boolean)
  const offHeard = off.filter((w) => heard.has(w))
  const offRemoved = offHeard.filter((w) => removedNorms.has(w))

  const ref = clip.referenceTranscript ?? ''
  const wer = ref ? werStats(ref, a.transcript) : null
  results.push({
    id: clip.id, category: clip.category, expected: clip.expected,
    wer: wer ? Number(wer.wer.toFixed(3)) : null, missingWords: wer?.del ?? null, inventedWords: wer?.ins ?? null, refWords: wer?.refWords ?? 0,
    fillerCandidates: fillers.length, falseStartCandidates: falseStarts.length, repeatCandidates: repeats.length,
    fillerTokens: countFillerTokens(a.transcript),
    silenceClasses: silences.map((c) => c.evidence?.class),
    offScriptTotal: off.length, offScriptHeard: offHeard.length, offScriptRemoved: offRemoved.length,
    lowConfWords: words.filter((w) => w.confidence < 0.4).length,
    boundaryKinds: Object.fromEntries(['punctuation_sentence', 'asr_segment', 'pause_utterance'].map((k) => [k, (a.boundaries ?? []).filter((b) => b.kind === k).length])),
    transcript: a.transcript,
  })
  console.log(`  ${clip.id} [${clip.category}] wer=${wer ? (wer.wer * 100).toFixed(1) + '%' : 'n/a'} filler=${fillers.length} fs=${falseStarts.length} rep=${repeats.length} sil=${silences.length}`)
}

// ---- A/B: `small` WITH vs WITHOUT the disfluency prompt on the IDENTICAL
// corpus subset (clean + strict-filler clips). Answers whether the prompt
// improves GENUINE recall or merely increases emitted filler tokens. The
// shipped config (prompted) is what the gates judge; this comparison is
// diagnostic and mandatory.
const abSubset = clips.filter((c) => c.category === 'clean_natural_speech' || c.category === 'ami_filler_um_uh')
const promptComparison = { perClip: [], summary: {} }
for (const clip of abSubset) {
  const audioAbs = isAbsolute(clip.audio) ? clip.audio : resolve(dirname(manifestPath), clip.audio)
  try {
    const b = await runBridge(audioAbs, ['--no-disfluency-prompt'])
    const a2 = buildSpeechAnalysis({ id: clip.id, content_sha256: 'eval' }, b, OPTS)
    const withRow = results.find((r) => r.id === clip.id)
    promptComparison.perClip.push({
      id: clip.id, category: clip.category,
      withPrompt: { fillerCandidates: withRow?.fillerCandidates ?? null, fillerTokens: withRow?.fillerTokens ?? null },
      withoutPrompt: {
        fillerCandidates: (a2.candidates ?? []).filter((c) => c.kind === 'filler').length,
        fillerTokens: countFillerTokens(a2.transcript),
      },
    })
  } catch (e) { promptComparison.perClip.push({ id: clip.id, category: clip.category, error: String(e.message).slice(0, 120) }) }
}
{
  const pcOk = promptComparison.perClip.filter((p) => !p.error)
  const fClips = pcOk.filter((p) => p.category === 'ami_filler_um_uh')
  const cClips = pcOk.filter((p) => p.category === 'clean_natural_speech')
  const rec = (get) => prop(fClips.filter((p) => get(p).fillerCandidates > 0).length, fClips.length)
  promptComparison.summary = {
    fillerClipRecallWithPrompt: rec((p) => p.withPrompt),
    fillerClipRecallWithoutPrompt: rec((p) => p.withoutPrompt),
    cleanFillerTokensWithPrompt: cClips.reduce((s, p) => s + (p.withPrompt.fillerTokens ?? 0), 0),
    cleanFillerTokensWithoutPrompt: cClips.reduce((s, p) => s + (p.withoutPrompt.fillerTokens ?? 0), 0),
  }
  const s = promptComparison.summary
  s.verdict = (s.cleanFillerTokensWithPrompt > s.cleanFillerTokensWithoutPrompt)
    ? 'PROMPT HALLUCINATES: it adds filler tokens on clean speech — not genuine recall'
    : ((s.fillerClipRecallWithPrompt?.value ?? 0) > (s.fillerClipRecallWithoutPrompt?.value ?? 0)
      ? 'prompt improves genuine recall without adding clean-speech filler tokens'
      : 'prompt does not improve genuine recall')
}

const ok = results.filter((r) => !r.error)
const inCat = (r, ...c) => c.includes(r.category)
const clean = ok.filter((r) => r.expected?.clean)
const trueFiller = ok.filter((r) => inCat(r, 'ami_filler_um_uh'))
const fillerShould = ok.filter((r) => r.expected?.hasFiller)
const falseStartClips = ok.filter((r) => inCat(r, 'false_start_correction'))
const repetitionClips = ok.filter((r) => inCat(r, 'repetition_rhetorical', 'ami_repetition_accidental'))
const restartRep = ok.filter((r) => r.expected?.hasFalseStartOrRepetition)
const deadAirClips = ok.filter((r) => inCat(r, 'long_dead_air'))
const shortPauseClips = ok.filter((r) => inCat(r, 'short_emphasis_pause'))
const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0)
const REMOVABLE_SIL = (r) => (r.silenceClasses || []).some((c) => c === 'dead_air' || c === 'removable')

// Precision denominators are (correct predictions + false positives on clean).
const fillerTP = fillerShould.filter((r) => r.fillerCandidates > 0).length
const fillerFP = clean.filter((r) => r.fillerCandidates > 0).length
const fsTP = restartRep.filter((r) => r.falseStartCandidates > 0).length
const fsFP = clean.filter((r) => r.falseStartCandidates > 0).length
const repTP = restartRep.filter((r) => r.repeatCandidates > 0).length
const repFP = clean.filter((r) => r.repeatCandidates > 0).length
const deadAirSilCands = deadAirClips.flatMap((r) => r.silenceClasses || [])

const metrics = {
  meanWerClean: clean.length ? Number((sum(clean, (r) => r.wer ?? 0) / clean.length).toFixed(3)) : null,
  inventedWordRatioClean: (() => { const d = sum(clean, (r) => r.refWords); return d ? Number((sum(clean, (r) => r.inventedWords ?? 0) / d).toFixed(4)) : null })(),
  // GATED: editor-removal retention over ASR-transcribed off-script words.
  offScriptRetentionRatio: prop(sum(ok, (r) => r.offScriptHeard - r.offScriptRemoved), sum(ok, (r) => r.offScriptHeard)),
  // REPORTED (ungated): how many off-script words the ASR never transcribed.
  offScriptAsrMissRatio: prop(sum(ok, (r) => r.offScriptTotal - r.offScriptHeard), sum(ok, (r) => r.offScriptTotal)),
  fillerPrecision: prop(fillerTP, fillerTP + fillerFP),
  fillerRecall: prop(trueFiller.filter((r) => r.fillerCandidates > 0).length, trueFiller.length),
  // Exact clip-level confusion counts for the filler feature (reviewer req. 1).
  fillerCounts: { tp: fillerTP, fp: fillerFP, fn: trueFiller.filter((r) => r.fillerCandidates === 0).length },
  // DEDICATED hallucination gate (reviewer req. 2): on clean read speech with
  // zero spoken fillers, the shipped config must produce NO filler tokens in
  // the transcript and NO filler candidates. The aggregate invented-word ratio
  // is NOT a substitute — a few hallucinated fillers stay under 0.03 while
  // creating unsafe removal candidates.
  fillerHallucinations: sum(clean, (r) => r.fillerTokens) + sum(clean, (r) => r.fillerCandidates),
  falseStartPrecision: prop(fsTP, fsTP + fsFP),
  falseStartRecall: prop(falseStartClips.filter((r) => r.falseStartCandidates > 0).length, falseStartClips.length),
  repetitionPrecision: prop(repTP, repTP + repFP),
  repetitionRecall: prop(repetitionClips.filter((r) => r.repeatCandidates > 0).length, repetitionClips.length),
  silenceClassAgreement: prop(deadAirSilCands.filter((c) => c === 'dead_air').length, deadAirSilCands.length),
  deadAirDetection: prop(deadAirClips.filter((r) => (r.silenceClasses || []).includes('dead_air')).length, deadAirClips.length),
  shortPausePreservation: prop(shortPauseClips.filter((r) => !REMOVABLE_SIL(r)).length, shortPauseClips.length),
  lowConfOnlyRemovalCandidates,
  cleanFalsePositiveClips: fillerFP + fsFP + repFP,
}

// Per-category aggregates + honest failure examples.
const byCategory = {}
for (const r of results) {
  const c = (byCategory[r.category] ||= { clips: 0, evaluated: 0, errored: 0, werSum: 0, werN: 0, filler: 0, fs: 0, rep: 0 })
  c.clips++; if (r.error) { c.errored++; continue }
  c.evaluated++; if (r.wer != null) { c.werSum += r.wer; c.werN++ }
  c.filler += r.fillerCandidates; c.fs += r.falseStartCandidates; c.rep += r.repeatCandidates
}
for (const k of Object.keys(byCategory)) { const c = byCategory[k]; c.meanWer = c.werN ? Number((c.werSum / c.werN).toFixed(3)) : null; delete c.werSum; delete c.werN }
const failures = []
for (const r of results) {
  if (r.error) { failures.push({ id: r.id, category: r.category, kind: 'transcription_error', detail: r.error }); continue }
  if (r.expected?.clean && (r.fillerCandidates > 0 || r.falseStartCandidates > 0 || r.repeatCandidates > 0))
    failures.push({ id: r.id, category: r.category, kind: 'false_positive_on_clean', filler: r.fillerCandidates, fs: r.falseStartCandidates, rep: r.repeatCandidates })
  if (r.expected?.clean && r.wer != null && r.wer > 0.2) failures.push({ id: r.id, category: r.category, kind: 'clean_wer_outlier', wer: r.wer, transcript: r.transcript })
  if (r.offScriptRemoved > 0)
    failures.push({ id: r.id, category: r.category, kind: 'off_script_removed_by_editor', removed: r.offScriptRemoved, heard: r.offScriptHeard })
  if (r.offScriptTotal > r.offScriptHeard)
    failures.push({ id: r.id, category: r.category, kind: 'off_script_asr_missed', informational: true, missed: r.offScriptTotal - r.offScriptHeard, total: r.offScriptTotal })
  if (inCat(r, 'long_dead_air') && !(r.silenceClasses || []).includes('dead_air'))
    failures.push({ id: r.id, category: r.category, kind: 'dead_air_missed', silenceClasses: r.silenceClasses })
  if (inCat(r, 'short_emphasis_pause') && REMOVABLE_SIL(r))
    failures.push({ id: r.id, category: r.category, kind: 'short_pause_over_flagged', silenceClasses: r.silenceClasses })
}

for (const r of clean) if (r.fillerTokens > 0)
  failures.push({ id: r.id, category: r.category, kind: 'filler_token_hallucination', tokens: r.fillerTokens, transcript: r.transcript })

const summary = {
  clips: results.length, evaluated: ok.length, errored: results.filter((r) => r.error).length,
  meanWerClean: metrics.meanWerClean, inventedWordRatioClean: metrics.inventedWordRatioClean,
  offScriptRetentionRatio: metrics.offScriptRetentionRatio, offScriptAsrMissRatio: metrics.offScriptAsrMissRatio,
  fillerPrecision: metrics.fillerPrecision, fillerRecall: metrics.fillerRecall,
  fillerCounts: metrics.fillerCounts, fillerHallucinations: metrics.fillerHallucinations,
  falseStartPrecision: metrics.falseStartPrecision, falseStartRecall: metrics.falseStartRecall,
  repetitionPrecision: metrics.repetitionPrecision, repetitionRecall: metrics.repetitionRecall,
  silenceClassAgreement: metrics.silenceClassAgreement, deadAirDetection: metrics.deadAirDetection,
  shortPausePreservation: metrics.shortPausePreservation,
  lowConfOnlyRemovalCandidates, cleanFalsePositiveClips: metrics.cleanFalsePositiveClips,
}
const report = {
  asrModel: OPTS.asrModel, speechVersion: OPTS.speechVersion, provenance: manifest.provenance,
  categories: manifest.categories, diversity: manifest.diversity,
  featureStatus: {
    autoFillerRemovalShipped: false,
    note: 'Owner decision 2026-07-20: ship the editor WITHOUT auto filler-removal. Phase-5 filler candidates are inert safeToConsider EVIDENCE only (no Director/EditPlan/removal exists; matrix asserts edit_plans=0, output_assets=0). fillerRecall gates FEATURE ENABLEMENT, not the Phase-5 engineering gate; it re-activates as a hard gate when the acoustic disfluency detector lands (task #117). Filler PRECISION (>=0.80) and HALLUCINATIONS (==0) remain HARD so the stored evidence is safe.',
  },
  definitions: {
    offScriptRetentionRatio: 'GATED (>=0.90, unchanged): of the off-script words the ASR transcribed, the fraction NOT covered by any removal candidate — measures the editor. Split from ASR word-miss approved by the reviewer 2026-07-20 after run 29751818139 decomposition showed all drops were ASR misses and zero were editor removals.',
    offScriptAsrMissRatio: 'REPORTED, ungated: fraction of designated off-script words the ASR never transcribed (WER/model domain).',
    fillerHallucinations: 'GATED (== 0): total filler TOKENS in transcripts + filler CANDIDATES across the clean set (read speech with zero spoken fillers). Dedicated guard against prompt-induced filler hallucination; the aggregate invented-word ratio is NOT a substitute.',
    fillerRecall: 'DEFERRED to auto-filler-removal FEATURE ENABLEMENT (value 0.50 unchanged), not a Phase-5 engineering-gate blocker while the feature is unshipped. Reactivates when thresholds.fillerRemovalShipped=true.',
    promptComparison: 'A/B on the identical clean+filler subset: shipped (prompted) vs --no-disfluency-prompt. Answers whether the prompt improves GENUINE recall or only increases emitted filler tokens.',
  },
  promptComparison,
  summary, byCategory, failures, results,
}
await writeFile('speech-eval-report.json', JSON.stringify(report, null, 2))
console.log('\n=== summary ===\n' + JSON.stringify(summary, null, 2))
console.log('\n=== prompt A/B (identical corpus subset) ===\n' + JSON.stringify(promptComparison.summary, null, 2))
console.log('\n=== per-category ===\n' + JSON.stringify(byCategory, null, 2))
if (failures.length) console.log('\n=== failure examples ===\n' + JSON.stringify(failures, null, 2))
console.log('report → speech-eval-report.json')

// Gate against PREDEFINED thresholds (thresholds.json). Never weakened here.
let t = manifest.thresholds
if (!t) { try { t = JSON.parse(await readFile(join(HERE, 'thresholds.json'), 'utf8')) } catch { t = null } }
if (!t) { console.log('no thresholds file — BASELINE run (record honestly, then gate)'); process.exit(0) }
const fails = []
const val = (m) => (m && typeof m === 'object' && 'value' in m ? m.value : m)
// A MANDATORY metric that is null is NOT EVALUATED -> fail (never "met").
const chk = (name, m, cmp, lim) => {
  const v = val(m)
  if (v == null) { console.log(`  FAIL ${name}=NOT EVALUATED (mandatory; need ${cmp} ${lim})`); fails.push(`${name}=not-evaluated`); return }
  const bad = cmp === '<=' ? v > lim : cmp === '>=' ? v < lim : v !== lim
  const ci = m && m.ci95 ? ` ci95=[${m.ci95.map((x) => x.toFixed(2)).join(',')}] n=${m.den}` : ''
  console.log(`  ${bad ? 'FAIL' : 'ok  '} ${name}=${typeof v === 'number' ? v.toFixed(3) : v}${ci} (need ${cmp} ${lim})`)
  if (bad) fails.push(`${name}=${v} !${cmp} ${lim}`)
}
chk('meanWerClean', metrics.meanWerClean, '<=', t.maxMeanWerClean)
chk('inventedWordRatioClean', metrics.inventedWordRatioClean, '<=', t.maxInventedWordRatioClean)
chk('offScriptRetentionRatio', metrics.offScriptRetentionRatio, '>=', t.minOffScriptRetentionRatio)
// SAFETY gates for filler evidence stay HARD whether or not the removal feature
// ships: if candidates are produced at all, they must be precise and never
// hallucinated.
chk('fillerPrecision', metrics.fillerPrecision, '>=', t.minFillerPrecision)
chk('fillerHallucinations', metrics.fillerHallucinations, '==', t.maxFillerHallucinations)
// fillerRecall gates AUTO FILLER-REMOVAL FEATURE ENABLEMENT, not the Phase-5
// speech-analysis engineering gate. Owner decision 2026-07-20: SHIP the editor
// WITHOUT auto filler-removal. In Phase 5 filler candidates are inert
// safeToConsider EVIDENCE — there is no Director/EditPlan/removal (the matrix
// asserts edit_plans=0, output_assets=0), so nothing acts on them. The value
// (0.50) is UNCHANGED; it re-activates as a hard gate when `fillerRemovalShipped`
// flips true (the acoustic detector, task #117). Never weakened, only re-scoped.
if (t.fillerRemovalShipped) {
  chk('fillerRecall', metrics.fillerRecall, '>=', t.minFillerRecall)
} else {
  const v = val(metrics.fillerRecall)
  console.log(`  DEFER fillerRecall=${v == null ? 'n/a' : v.toFixed(3)} (need >= ${t.minFillerRecall} to SHIP auto `
    + 'filler-removal) — NOT a Phase-5 blocker: auto filler-removal is not shipped; candidates are inert '
    + 'safeToConsider evidence. Feature-enablement gate tracked by the acoustic detector, task #117 '
    + '(docs/editor-v2-phase5-disfluency-detector-design.md).')
}
chk('falseStartPrecision', metrics.falseStartPrecision, '>=', t.minFalseStartPrecision)
chk('repetitionPrecision', metrics.repetitionPrecision, '>=', t.minRepetitionPrecision)
chk('silenceClassAgreement', metrics.silenceClassAgreement, '>=', t.minSilenceClassAgreement)
chk('shortPausePreservation', metrics.shortPausePreservation, '>=', t.minShortPausePreservation)
chk('lowConfOnlyRemovalCandidates', lowConfOnlyRemovalCandidates, '==', t.maxLowConfidenceOnlyRemovalCandidates)
if (fails.length) { console.error('\nTHRESHOLD FAILURES:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('\nall Phase-5 engineering-gate thresholds met'
  + (t.fillerRemovalShipped ? ' (incl. filler recall)' : ' (filler recall DEFERRED to feature enablement — see above)'))

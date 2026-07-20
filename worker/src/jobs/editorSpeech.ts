// The REAL `transcribing` stage (Phase 5) + the speech portion of `analyzing`.
//
// Governing rules:
//  * The transcript comes from the ACTUAL recording — Faster-Whisper over the
//    validated bytes; never a teleprompter script, and never filtered against
//    one (off-script words stay).
//  * INTEGRITY BEFORE WORK, independently of Phase 4: current etag + byte-size
//    reconciliation → bounded download → SHA-256 verification → only then is
//    audio extracted and processed. A Phase-4 cache hit (or any earlier green
//    check) does NOT authorize processing bytes that changed since.
//  * ANALYZE ONCE AND REUSE: one immutable `speech` component per
//    (source_asset_id, 'speech', speechVersion) — same per-asset cache
//    identity as inspection (no cross-tenant dedup, owner derived from the
//    asset by the fenced RPC). Version bump recomputes; concurrent misses and
//    crash-retries converge on the single row via ON CONFLICT DO NOTHING.
//  * CANDIDATES ONLY: silence / filler / false-start / repetition entries are
//    evidence-bearing suggestions; nothing here decides a cut, and low ASR
//    confidence alone never produces a candidate.
//
// Cancellation is cooperative and prompt: the shared watcher trips an
// AbortController; the download stream, the ffmpeg audio extraction and the
// faster-whisper bridge PROCESS GROUPS are torn down immediately.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { PermanentJobError } from '../errors.js'
import { downloadObject } from '../storage.js'
import { makeSlowPoint, watchCancellation, type CancelWatch } from './editorCancel.js'
import { fileSha256, loadEligibleSource, reconcileStorageIntegrity, type AssetRow } from './editorInspect.js'

export const SPEECH_ANALYSIS_SCHEMA_VERSION = 1

export class SpeechCancelledError extends Error {
  constructor(point: string) {
    super(`speech analysis cancelled at ${point}`)
    this.name = 'SpeechCancelledError'
  }
}

const slowPoint = (point: string, watch: CancelWatch) =>
  makeSlowPoint(env.speechSlowPoint, env.speechSlowMs, (p) => new SpeechCancelledError(p))(point, watch)

// ---- bridge output (worker/editor_speech.py) --------------------------------
export interface SpeechBridgeOutput {
  language: string
  language_probability: number
  duration_sec: number
  text: string
  words: Array<{ w: string; start: number; end: number; p: number }>
  segments: Array<{ start: number; end: number; text: string }>
  vad_segments: Array<{ start: number; end: number }>
  energy: { window_ms: number; rms: number[] }
}

// ---- pure contract construction (unit-tested) ------------------------------
export const SPEECH_RULE_VERSION = 'speech-rules-3'

// Clear disfluencies: near-always insertions, not lexical content.
const DISFLUENCY_FILLERS = new Set(['um', 'uh', 'uhm', 'umm', 'uhh', 'erm', 'er', 'ah', 'hmm', 'mm', 'mmm'])
// Discourse markers: frequently MEANINGFUL ("I feel like a winner", "so good").
// Only ever emitted as LOW-confidence candidates, and only when context
// (a bracketing pause / clause boundary) suggests hesitation use — never for
// every occurrence.
const DISCOURSE_MARKERS = new Set(['like', 'well', 'so', 'actually', 'basically', 'right'])
const SENTENCE_END_RE = /[.!?]["')\]]?$/

// Hard sanity backstop for the energy curve. The curve is ALWAYS downsampled
// to <= this length below (adaptive windowMs), so a 30-minute source can never
// blow the component past the DB payload limit; a bridge that somehow exceeds
// even the raw cap is a bug, not data.
const MAX_ENERGY_WINDOWS = 2000
const RAW_ENERGY_HARD_CAP = 200000

// Silence banding (evidence, NOT a cut). A gap under silenceMinMs is a NATURAL
// PAUSE and produces no candidate at all — the resolution threshold generates
// evidence, it does not mean "shorten every gap".
const DEAD_AIR_MS = 2000

// Inter-word gap that closes a pause-defined speech unit when neither
// punctuation nor an ASR segment edge is present.
const PAUSE_UNIT_MS = 600

function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
}

const toMs = (sec: number) => Math.round(sec * 1000)

interface BuiltWord {
  id: string; text: string; normalizedText: string
  startMs: number; endMs: number; confidence: number
  endsUnit: boolean; unitId: string
}

// Overlap of [s,e) with the union of VAD speech segments, in ms.
function speechOverlapMs(sMs: number, eMs: number, vad: Array<{ startMs: number; endMs: number }>): number {
  let covered = 0
  for (const v of vad) covered += Math.max(0, Math.min(eMs, v.endMs) - Math.max(sMs, v.startMs))
  return covered
}

// Downsample the raw RMS curve so its length is bounded regardless of source
// duration. Aggregation is by mean over N raw windows — a coarser but faithful
// curve, NOT a truncation (no tail is dropped).
function boundEnergy(raw: number[], rawWindowMs: number): { windowMs: number; rms: number[] } {
  if (raw.length <= MAX_ENERGY_WINDOWS) return { windowMs: rawWindowMs, rms: raw }
  const factor = Math.ceil(raw.length / MAX_ENERGY_WINDOWS)
  const out: number[] = []
  for (let i = 0; i < raw.length; i += factor) {
    const chunk = raw.slice(i, i + factor)
    out.push(Math.round((chunk.reduce((a, b) => a + b, 0) / chunk.length) * 10000) / 10000)
  }
  return { windowMs: rawWindowMs * factor, rms: out }
}

function avgEnergy(sMs: number, eMs: number, windowMs: number, rms: number[]): number {
  const a = Math.floor(sMs / windowMs); const b = Math.min(rms.length, Math.ceil(eMs / windowMs))
  if (b <= a) return 0
  let sum = 0; for (let i = a; i < b; i++) sum += rms[i] ?? 0
  return Math.round((sum / (b - a)) * 10000) / 10000
}

export function buildSpeechAnalysis(
  asset: { id: string; content_sha256: string },
  bridge: SpeechBridgeOutput,
  opts: { speechVersion: string; asrModel: string; asrComputeType: string; device: string
    beamSize: number; languagePolicy: string; silenceMinMs: number
    vadMinSilenceMs: number; vadSpeechPadMs: number },
): Record<string, unknown> {
  if (!Array.isArray(bridge.words)) throw new PermanentJobError('speech: bridge produced no word list', 'asr_failed')
  if (bridge.energy.window_ms < 100 || bridge.energy.rms.length > RAW_ENERGY_HARD_CAP) {
    throw new PermanentJobError('speech: energy curve out of bounds', 'speech_energy_overflow')
  }
  const durationMs = toMs(bridge.duration_sec)

  // Words: clamp end >= start and keep every word inside the source duration
  // (Whisper occasionally overruns the last word past the clip end). No word
  // is invented or dropped — off-script words are retained verbatim.
  const rawWords = bridge.words.map((w, i) => {
    const startMs = Math.max(0, Math.min(toMs(w.start), durationMs))
    const endMs = Math.max(startMs, Math.min(toMs(w.end), durationMs))
    return {
      id: `w${i}`, text: w.w, normalizedText: normalizeToken(w.w),
      startMs, endMs,
      confidence: Math.max(0, Math.min(1, Number(w.p) || 0)),
      endsUnit: false, unitId: '',
    }
  })
  // Enforce non-decreasing start order (ASR returns sorted; guard anyway).
  for (let i = 1; i < rawWords.length; i++) {
    if (rawWords[i].startMs < rawWords[i - 1].startMs) rawWords[i].startMs = rawWords[i - 1].startMs
    if (rawWords[i].endMs < rawWords[i].startMs) rawWords[i].endMs = rawWords[i].startMs
  }

  // Speech-unit boundaries — NOT blindly "sentences". A unit closes when the
  // word carries terminal punctuation (a real sentence), when it sits at a
  // Faster-Whisper segment edge (a decoding unit), or after a long pause (a
  // pause-defined utterance). The `kind` records WHICH, so the future Director
  // never mistakes arbitrary ASR segmentation for grammatical completeness.
  const segEnds = (bridge.segments ?? []).map((s) => toMs(s.end)).filter((e) => e > 0).sort((a, b) => a - b)
  const endsSegment = (i: number): boolean => {
    if (i >= rawWords.length - 1) return false
    const gapStart = rawWords[i].endMs; const gapEnd = rawWords[i + 1].startMs
    return segEnds.some((e) => e >= gapStart - 50 && e <= gapEnd + 50)
  }
  const boundaries: Array<Record<string, unknown>> = []
  let uStart = 0
  for (let i = 0; i < rawWords.length; i++) {
    const isLast = i === rawWords.length - 1
    const codes: string[] = []
    let kind: 'punctuation_sentence' | 'asr_segment' | 'pause_utterance' | null = null
    if (SENTENCE_END_RE.test(rawWords[i].text)) { codes.push('terminal_punctuation'); kind = 'punctuation_sentence' }
    if (!isLast && endsSegment(i)) { codes.push('asr_segment_end'); kind = kind ?? 'asr_segment' }
    if (!isLast && rawWords[i + 1].startMs - rawWords[i].endMs >= PAUSE_UNIT_MS) {
      codes.push('pause_gap'); kind = kind ?? 'pause_utterance'
    }
    if (isLast && !kind) {
      // Trailing unit: label by the honest available evidence, never asserted
      // as a sentence unless punctuation supported it.
      if (segEnds.length > 0) { kind = 'asr_segment'; codes.push('asr_segment_end') }
      else { kind = 'pause_utterance'; codes.push('trailing') }
    }
    if (kind || isLast) {
      const group = rawWords.slice(uStart, i + 1)
      const uid = `u${boundaries.length}`
      for (const w of group) w.unitId = uid
      group[group.length - 1].endsUnit = true
      boundaries.push({
        id: uid, kind: kind ?? 'pause_utterance',
        startWordId: group[0].id, endWordId: group[group.length - 1].id,
        startMs: group[0].startMs, endMs: group[group.length - 1].endMs,
        text: group.map((w) => w.text).join(' '),
        evidence: codes.length ? codes : ['trailing'],
      })
      uStart = i + 1
    }
  }
  const words: BuiltWord[] = rawWords

  const vadSegments = bridge.vad_segments.map((v) => ({ startMs: toMs(v.start), endMs: toMs(v.end) }))
  const energy = boundEnergy(bridge.energy.rms, bridge.energy.window_ms)

  // ---- candidates (evidence only — the analyzer proposes, never removes) ----
  interface Cand {
    kind: 'silence' | 'filler' | 'false_start' | 'repetition'
    startMs: number; endMs: number; wordIds: string[]
    prevWordId: string | null; nextWordId: string | null
    confidence: 'high' | 'medium' | 'low'
    evidenceCodes: string[]; evidence: Record<string, unknown>
  }
  const cands: Cand[] = []
  const wid = (i: number): string | null => (i >= 0 && i < words.length ? words[i].id : null)

  // Silence: candidate regions from BOTH evidence sources — ASR word-timestamp
  // gaps AND Silero VAD non-speech gaps — merged into maximal regions. Whisper
  // word timestamps often BRIDGE real mid-utterance silence (the `small` model
  // especially), so word gaps alone systematically miss genuine dead air; VAD
  // is the honest ground truth for non-speech. Regions under silenceMinMs stay
  // natural pauses (no candidate). Banding unchanged: removable / dead_air /
  // uncertain (a word-gap region VAD hears speech in stays `uncertain`).
  interface SilRegion { s: number; e: number; src: Set<string> }
  const silRegions: SilRegion[] = []
  if (words.length > 0) {
    const wordGap = (s: number, e: number) => {
      if (e - s >= opts.silenceMinMs) silRegions.push({ s, e, src: new Set(['word_gap']) })
    }
    wordGap(0, words[0].startMs)
    for (let i = 1; i < words.length; i++) wordGap(words[i - 1].endMs, words[i].startMs)
    wordGap(words[words.length - 1].endMs, durationMs)
    const sortedVad = [...vadSegments].sort((a, b) => a.startMs - b.startMs)
    let cursor = 0
    for (const v of sortedVad) {
      if (v.startMs - cursor >= opts.silenceMinMs) silRegions.push({ s: cursor, e: v.startMs, src: new Set(['vad_gap']) })
      cursor = Math.max(cursor, v.endMs)
    }
    if (durationMs - cursor >= opts.silenceMinMs) silRegions.push({ s: cursor, e: durationMs, src: new Set(['vad_gap']) })
  }
  silRegions.sort((a, b) => a.s - b.s || a.e - b.e)
  const mergedSil: SilRegion[] = []
  for (const r of silRegions) {
    const last = mergedSil[mergedSil.length - 1]
    if (last && r.s <= last.e) { last.e = Math.max(last.e, r.e); for (const x of r.src) last.src.add(x) }
    else mergedSil.push(r)
  }
  const sortedVadAll = [...vadSegments].sort((a, b) => a.startMs - b.startMs)
  for (const r of mergedSil) {
    const gapMsRaw = r.e - r.s
    const nonSpeechRatio = 1 - speechOverlapMs(r.s, r.e, vadSegments) / gapMsRaw
    const vadClear = nonSpeechRatio >= 0.6
    // For removable/dead_air, SHRINK to the largest VAD-clear core inside the
    // region so a proposed cut's boundaries can never sit inside VAD speech
    // (Silero's speech pads push boundaries AWAY from speech, never into it).
    // A region VAD hears speech in stays `uncertain` at its full extent (low,
    // never removable). A clear region whose core is shorter than silenceMinMs
    // is dropped — natural pause.
    let s = r.s; let e = r.e
    let cls: string; let confidence: 'high' | 'medium' | 'low'; const codes = ['silence_gap', ...r.src]
    if (!vadClear) { cls = 'uncertain'; confidence = 'low'; codes.push('vad_ambiguous') }
    else {
      let core: [number, number] | null = null
      let cursor = r.s
      for (const v of sortedVadAll) {
        if (v.endMs <= r.s || v.startMs >= r.e) continue
        const gEnd = Math.max(cursor, Math.min(v.startMs, r.e))
        if (gEnd - cursor > (core ? core[1] - core[0] : 0)) core = [cursor, gEnd]
        cursor = Math.max(cursor, Math.min(v.endMs, r.e))
      }
      if (r.e - cursor > (core ? core[1] - core[0] : 0)) core = [cursor, r.e]
      if (!core || core[1] - core[0] < opts.silenceMinMs) continue // no safe core — natural pause
      s = core[0]; e = core[1]
      codes.push('vad_core')
      if (e - s >= DEAD_AIR_MS) { cls = 'dead_air'; confidence = 'high'; codes.push('gap_dead_air', 'vad_nonspeech') }
      else { cls = 'removable'; confidence = 'medium'; codes.push('gap_removable', 'vad_nonspeech') }
    }
    const gapMs = e - s
    const energyHere = avgEnergy(s, e, energy.windowMs, energy.rms)
    // prev = last word starting before the region (may OVERLAP it when the ASR
    // bridged the silence); next = first word ending after it.
    let prevIdx = -1
    for (let i = 0; i < words.length; i++) if (words[i].startMs < s) prevIdx = i
    let nextIdx = words.length
    for (let i = words.length - 1; i >= 0; i--) if (words[i].endMs > e) nextIdx = i
    const position = prevIdx === -1 ? 'leading' : nextIdx === words.length ? 'trailing' : 'internal'
    cands.push({
      kind: 'silence', startMs: s, endMs: e, wordIds: [],
      prevWordId: wid(prevIdx), nextWordId: wid(nextIdx), confidence,
      evidenceCodes: codes,
      evidence: { gapMs, position, class: cls, vadNonSpeechRatio: Math.round(nonSpeechRatio * 100) / 100, avgEnergy: energyHere },
    })
  }

  const norm = words.map((w) => w.normalizedText)
  const gapBefore = (i: number) => (i > 0 ? words[i].startMs - words[i - 1].endMs : Infinity)
  const gapAfter = (i: number) => (i < words.length - 1 ? words[i + 1].startMs - words[i].endMs : Infinity)
  // Longest VAD non-speech stretch inside [sMs, eMs] — the pause evidence that
  // survives when ASR word timestamps bridge a real silence.
  const maxVadGapWithin = (sMs: number, eMs: number): number => {
    if (eMs <= sMs) return 0
    let best = 0; let cursor = sMs
    for (const v of [...vadSegments].sort((a, b) => a.startMs - b.startMs)) {
      if (v.endMs <= sMs || v.startMs >= eMs) continue
      best = Math.max(best, Math.min(v.startMs, eMs) - cursor)
      cursor = Math.max(cursor, Math.min(v.endMs, eMs))
    }
    return Math.max(best, eMs - cursor, 0)
  }

  // ACOUSTIC GUARD for every filler-kind candidate: an ASR token alone is not
  // sufficient evidence — the disfluency-context prompt (or the LM) could emit
  // a filler token that was never spoken. A candidate requires (a) independent
  // acoustic evidence at the claimed timestamp — >=50% Silero-VAD speech
  // overlap of the token interval (Silero is independent of Whisper) — and
  // (b) no overlap (> 30ms) with neighboring lexical word intervals, so acting
  // on it can never clip real speech.
  const fillerAcousticOk = (startIdx: number, endIdx: number): boolean => {
    const s = words[startIdx].startMs; const e = words[endIdx].endMs
    const dur = Math.max(1, e - s)
    if (speechOverlapMs(s, e, vadSegments) / dur < 0.5) return false
    const prevOverlap = startIdx > 0 ? words[startIdx - 1].endMs - s : 0
    const nextOverlap = endIdx < words.length - 1 ? e - words[endIdx + 1].startMs : 0
    return prevOverlap <= 30 && nextOverlap <= 30
  }

  // Disfluency fillers: runs of um/uh/… — high unless the ASR itself was
  // unsure (a low-confidence "um" may be a mis-heard real word).
  for (let i = 0; i < words.length;) {
    if (!DISFLUENCY_FILLERS.has(norm[i])) { i++; continue }
    let j = i
    while (j + 1 < words.length && DISFLUENCY_FILLERS.has(norm[j + 1])) j++
    if (!fillerAcousticOk(i, j)) { i = j + 1; continue }
    const run = words.slice(i, j + 1)
    const minConf = Math.min(...run.map((w) => w.confidence))
    cands.push({
      kind: 'filler', startMs: run[0].startMs, endMs: run[run.length - 1].endMs,
      wordIds: run.map((w) => w.id), prevWordId: wid(i - 1), nextWordId: wid(j + 1),
      confidence: minConf >= 0.5 ? 'high' : 'low',
      evidenceCodes: minConf >= 0.5 ? ['filler_disfluency', 'vad_speech_at_token'] : ['filler_disfluency', 'vad_speech_at_token', 'asr_low_conf'],
      evidence: { markerType: 'disfluency', words: run.map((w) => w.text), minAsrConfidence: minConf },
    })
    i = j + 1
  }

  // Discourse markers (like/well/so/…): ALWAYS low confidence, and only when
  // context (a bracketing pause ≥200ms or a clause boundary) suggests
  // hesitation — never for every occurrence, so meaningful uses are left alone.
  for (let i = 0; i < words.length; i++) {
    if (!DISCOURSE_MARKERS.has(norm[i])) continue
    const boundaryBefore = i === 0 || words[i - 1].endsUnit || /,$/.test(words[i - 1].text)
    const bracketed = gapBefore(i) >= 200 || gapAfter(i) >= 200
    if (!boundaryBefore && !bracketed) continue // fluent, meaningful use — skip
    if (!fillerAcousticOk(i, i)) continue
    cands.push({
      kind: 'filler', startMs: words[i].startMs, endMs: words[i].endMs,
      wordIds: [words[i].id], prevWordId: wid(i - 1), nextWordId: wid(i + 1),
      confidence: 'low',
      evidenceCodes: ['ambiguous_discourse_marker', 'vad_speech_at_token'],
      evidence: { markerType: 'discourse', token: words[i].text, boundaryBefore, bracketed },
    })
  }

  // "you know" as a discourse-marker bigram (same low-confidence rule).
  for (let i = 0; i + 1 < words.length; i++) {
    if (norm[i] !== 'you' || norm[i + 1] !== 'know') continue
    const bracketed = gapBefore(i) >= 200 || gapAfter(i + 1) >= 200 || /,$/.test(words[i + 1].text)
    if (!bracketed) continue
    if (!fillerAcousticOk(i, i + 1)) continue
    cands.push({
      kind: 'filler', startMs: words[i].startMs, endMs: words[i + 1].endMs,
      wordIds: [words[i].id, words[i + 1].id], prevWordId: wid(i - 1), nextWordId: wid(i + 2),
      confidence: 'low', evidenceCodes: ['ambiguous_discourse_marker', 'vad_speech_at_token'],
      evidence: { markerType: 'discourse', token: 'you know', bracketed },
    })
  }

  // False starts vs repetition. A repeated bigram (A B … A B) is a false start
  // when a pause/comma separates the runs, else a repetition. Immediate
  // identical words are stutters/repetition. Proper nouns and cross-sentence
  // repeats are kept as LOW candidates so intentional repetition is not
  // treated as removable.
  const claimed = new Set<number>()
  for (let i = 0; i + 3 < words.length; i++) {
    if (!norm[i] || !norm[i + 1]) continue
    if (words[i + 1].endsUnit) continue // separate sentences sharing words
    if (norm[i] === norm[i + 2] && norm[i + 1] === norm[i + 3]) {
      const pauseMs = words[i + 2].startMs - words[i + 1].endMs
      // ASR word timestamps can bridge the real pause between the abandoned
      // run and the restart — consult VAD across the junction span too.
      const vadPauseMs = maxVadGapWithin(words[i + 1].startMs, words[i + 2].endMs)
      const comma = /,$/.test(words[i + 1].text)
      const isFalseStart = pauseMs >= 150 || vadPauseMs >= 150 || comma
      const codes = ['repeat_bigram']
      if (isFalseStart) {
        if (pauseMs >= 150) codes.push('pause_between')
        if (vadPauseMs >= 150) codes.push('vad_pause_between')
        if (comma) codes.push('comma_boundary')
      }
      cands.push({
        kind: isFalseStart ? 'false_start' : 'repetition',
        startMs: words[i].startMs, endMs: words[i + 1].endMs,
        wordIds: [words[i].id, words[i + 1].id], prevWordId: wid(i - 1), nextWordId: wid(i + 2),
        confidence: 'medium', evidenceCodes: codes,
        // vadPauseMs only when non-zero: absence IS the evidence, and dense
        // sources emit thousands of repeat candidates (payload budget).
        evidence: { repeated: `${words[i].text} ${words[i + 1].text}`, pauseMs, ...(vadPauseMs > 0 ? { vadPauseMs } : {}), secondStartWordId: words[i + 2].id },
      })
      for (const k of [i, i + 1, i + 2, i + 3]) claimed.add(k)
      i += 3
    }
  }
  for (let i = 0; i + 1 < words.length; i++) {
    if (claimed.has(i) || claimed.has(i + 1)) continue
    if (words[i].endsUnit) continue // repeat across a sentence boundary
    if (!norm[i] || norm[i].length < 2 || norm[i] !== norm[i + 1]) continue
    if (DISFLUENCY_FILLERS.has(norm[i])) continue
    // A capitalized token repeated is likely a proper noun / intentional
    // emphasis — keep the candidate but LOW so it is never treated as safe.
    const properNoun = /^[A-Z]/.test(words[i].text) && /^[A-Z]/.test(words[i + 1].text)
    const stutter = norm[i].length <= 3
    cands.push({
      kind: 'repetition', startMs: words[i].startMs, endMs: words[i + 1].endMs,
      wordIds: [words[i].id, words[i + 1].id], prevWordId: wid(i - 1), nextWordId: wid(i + 2),
      confidence: properNoun ? 'low' : 'medium',
      evidenceCodes: properNoun ? ['immediate_repeat', 'proper_noun'] : stutter ? ['immediate_repeat', 'stutter'] : ['immediate_repeat'],
      evidence: { token: words[i].text, repeatWordId: words[i + 1].id, properNoun, stutter },
    })
  }

  cands.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  const candidates = cands.map((c, i) => ({
    id: `c${i}`, kind: c.kind, startMs: c.startMs, endMs: c.endMs,
    wordIds: c.wordIds, prevWordId: c.prevWordId, nextWordId: c.nextWordId,
    confidence: c.confidence, safeToConsider: true,
    evidenceCodes: c.evidenceCodes, evidence: c.evidence, ruleVersion: SPEECH_RULE_VERSION,
  }))

  const fullWords = words.map(({ id, text, normalizedText, startMs, endMs, confidence, endsUnit, unitId }) =>
    ({ id, text, normalizedText, startMs, endMs, confidence, endsUnit, unitId }))
  const provenance = {
    asrEngine: 'faster-whisper',
    asrModel: opts.asrModel,
    asrComputeType: opts.asrComputeType,
    device: opts.device,
    beamSize: opts.beamSize,
    languagePolicy: opts.languagePolicy,
    vad: 'silero',
    vadMinSilenceMs: opts.vadMinSilenceMs,
    vadSpeechPadMs: opts.vadSpeechPadMs,
    silenceMinMs: opts.silenceMinMs,
    ruleVersion: SPEECH_RULE_VERSION,
  }
  const base = {
    schemaVersion: SPEECH_ANALYSIS_SCHEMA_VERSION,
    speechVersion: opts.speechVersion,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    language: bridge.language,
    languageConfidence: Math.max(0, Math.min(1, Number(bridge.language_probability) || 0)),
    durationMs,
    transcript: bridge.text,
    boundaries, vadSegments, energy, candidates, provenance,
  }

  // DB payload safety. The component is bounded by construction (energy is
  // downsampled; words/candidates scale with speech, not duration). A very
  // long, very dense source can still approach the 1 MiB DB limit — when it
  // does, drop ONLY the two fully DERIVABLE per-word fields (normalizedText =
  // normalize(text); sentenceId = the sentence whose range contains the word)
  // and mark the component `compact`. This is a normalized representation, NOT
  // a truncation: every word, candidate and timing stays. If it STILL exceeds
  // the limit after that, fail LOUD rather than drop real evidence.
  const BUDGET = 1_000_000
  let result: Record<string, unknown> = { ...base, words: fullWords, compact: false }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > BUDGET) {
    // Compact: keep only NON-derivable per-word data. normalizedText, unitId
    // AND endsUnit are all reconstructable from `boundaries` (retained in
    // full). No word, candidate or timing is dropped.
    const leanWords = words.map(({ id, text, startMs, endMs, confidence }) =>
      ({ id, text, startMs, endMs, confidence }))
    // Boundary `text` is derivable from startWordId..endWordId over `words`;
    // drop it too under compaction (kind/evidence/ids/timings all kept).
    const leanBoundaries = boundaries.map(({ text, ...b }) => b)
    result = { ...base, words: leanWords, boundaries: leanBoundaries, compact: true }
  }
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
  if (bytes > BUDGET) {
    throw new PermanentJobError(`speech: component ${bytes} bytes exceeds payload budget`, 'speech_component_too_large')
  }
  return result
}

// ---- subprocesses with process-group termination ----------------------------
function runGroupProcess(
  cmd: string, args: string[], timeoutMs: number, watch: CancelWatch,
  cancelPoint: string, onExit: (code: number | null, stderr: string) => Error | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    let settled = false
    const killGroup = () => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* already gone */ } }
    const timer = setTimeout(() => {
      killGroup()
      finish(new Error(`stage_timeout: ${cmd} exceeded ${timeoutMs}ms`))
    }, timeoutMs)
    const onAbort = () => { killGroup(); finish(new SpeechCancelledError(cancelPoint)) }
    watch.signal.addEventListener('abort', onAbort, { once: true })
    function finish(e: Error | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      watch.signal.removeEventListener('abort', onAbort)
      if (e) reject(e); else resolve()
    }
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000) })
    child.on('error', (e) => finish(e))
    child.on('close', (code) => {
      if (watch.cancelled()) return finish(new SpeechCancelledError(cancelPoint))
      finish(onExit(code, err))
    })
  })
}

function extractAudio(srcPath: string, wavPath: string, watch: CancelWatch): Promise<void> {
  // Matrix-only: `-re` throttles input reading to real time so the extraction
  // subprocess stays alive long enough to prove a mid-extraction cancel tears
  // down the ffmpeg process group. Never set in production.
  const throttle = env.speechSlowPoint === 'during_extract' ? ['-re'] : []
  return runGroupProcess(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', ...throttle, '-i', srcPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', wavPath],
    env.speechExtractTimeoutMs, watch, 'during_extract',
    (code, stderr) => code === 0 ? null
      : new PermanentJobError(`speech: audio extraction failed (exit ${code}): ${stderr.slice(0, 200)}`, 'audio_extract_failed'),
  )
}

function runAsrBridge(wavPath: string, outPath: string, watch: CancelWatch): Promise<void> {
  return runGroupProcess(
    'python3',
    // dist/jobs/editorSpeech.js → ../../editor_speech.py (the worker root,
    // both in the Docker image and when CI runs the built worker in-tree).
    [join(import.meta.dirname, '..', '..', 'editor_speech.py'),
      '--audio', wavPath, '--out', outPath,
      '--model', env.speechModel, '--device', env.whisperDevice,
      '--language', env.whisperLanguage, '--beam-size', '1',
      '--max-seconds', String(Math.ceil(env.sourceMaxDurationMs / 1000)),
      ...(env.speechBridgeHoldAt ? ['--hold-at', env.speechBridgeHoldAt, '--hold-ms', String(env.speechBridgeHoldMs)] : [])],
    env.speechAsrTimeoutMs, watch, 'during_asr',
    (code, stderr) => {
      if (code === 0) return null
      if (code === 2) return new PermanentJobError('speech: media too long for transcription', 'speech_too_long')
      // Provider failures (model fetch, runtime) are RETRYABLE — the retry
      // budget dead-letters a persistent one. The stderr tail rides along for
      // the container log; everything durable passes the sanitizer first.
      return new Error(`asr_failed (exit ${code}): ${stderr.slice(0, 400)}`)
    },
  )
}

// ---- the transcribing stage -------------------------------------------------
export interface SpeechOutcome {
  cacheHit: boolean
  asrPerformed: boolean
  wordCount: number
  language: string | null
  candidateCounts: Record<string, number>
}

function countCandidates(analysis: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = { silence: 0, filler: 0, false_start: 0, repetition: 0 }
  for (const c of (analysis.candidates as Array<{ kind: string }> | undefined) ?? []) {
    out[c.kind] = (out[c.kind] ?? 0) + 1
  }
  return out
}

export async function runTranscribingStage(job: Job, projectId: string, dir: string): Promise<SpeechOutcome> {
  const { proj, asset, meta } = await loadEligibleSource(projectId, 'speech')

  const watch = watchCancellation(projectId)
  try {
    if (proj.cancel_requested_at) throw new SpeechCancelledError('before_speech')

    // Integrity FIRST, before the cache lookup — Phase 4's earlier checks (or
    // its cache hit moments ago) do not authorize the CURRENT bytes.
    await slowPoint('before_reconcile', watch)
    await reconcileStorageIntegrity(asset, meta, 'speech')

    const { data: cached } = await db
      .from('media_analyses').select('id, result, source_hash')
      .eq('source_asset_id', asset.id).eq('component', 'speech')
      .eq('analyzer_bundle_version', env.speechVersion)
      .maybeSingle()
    if (cached) {
      if (cached.source_hash !== asset.content_sha256) {
        throw new PermanentJobError('speech: cached component checksum mismatch', 'source_bytes_changed')
      }
      const r = cached.result as Record<string, unknown>
      return {
        cacheHit: true,
        asrPerformed: false,
        wordCount: ((r.words as unknown[]) ?? []).length,
        language: (r.language as string) ?? null,
        candidateCounts: countCandidates(r),
      }
    }

    // Bounded download + SHA-256 — only verified bytes are ever transcribed.
    await slowPoint('before_download', watch)
    const local = join(dir, 'speech-source')
    try {
      await downloadObject(asset.bucket, asset.storage_path, local, {
        signal: watch.signal,
        chunkPauseMs: env.speechSlowPoint === 'during_download' ? Math.min(env.speechSlowMs, 500) : 0,
      })
    } catch (e) {
      if (watch.cancelled()) throw new SpeechCancelledError('during_download')
      throw e
    }
    if (watch.cancelled()) throw new SpeechCancelledError('during_download')
    const sha = await fileSha256(local)
    if (sha !== asset.content_sha256) {
      throw new PermanentJobError('speech: downloaded bytes do not match validation checksum', 'source_bytes_changed')
    }

    await slowPoint('before_extract', watch)
    const wav = join(dir, 'speech-audio.wav')
    await extractAudio(local, wav, watch)

    await slowPoint('before_asr', watch)
    const outJson = join(dir, 'speech-bridge.json')
    await runAsrBridge(wav, outJson, watch)

    let bridge: SpeechBridgeOutput
    try {
      bridge = JSON.parse(await readFile(outJson, 'utf8')) as SpeechBridgeOutput
    } catch {
      throw new Error('asr_failed: bridge produced unparseable output')
    }

    const analysis = buildSpeechAnalysis(
      { id: asset.id, content_sha256: asset.content_sha256 },
      bridge,
      {
        speechVersion: env.speechVersion, asrModel: env.speechModel,
        asrComputeType: env.whisperDevice === 'cuda' ? 'float16' : 'int8',
        device: env.whisperDevice, beamSize: 1, languagePolicy: env.whisperLanguage,
        silenceMinMs: env.speechSilenceMinMs,
        vadMinSilenceMs: env.speechVadMinSilenceMs, vadSpeechPadMs: env.speechVadSpeechPadMs,
      },
    )

    await slowPoint('after_asr_before_persist', watch)
    if (watch.cancelled()) throw new SpeechCancelledError('before_persist')

    // FENCED persistence — same writer as inspection: re-proves the lease and
    // that the hash still matches the project's CURRENT source; concurrent
    // misses converge on the single cached row.
    const { error: recErr } = await db.rpc('editor_record_inspection', {
      p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
      p_component: 'speech', p_schema_version: SPEECH_ANALYSIS_SCHEMA_VERSION,
      p_bundle_version: env.speechVersion, p_source_hash: asset.content_sha256,
      p_result: analysis,
      p_backfill_etag: null, p_backfill_bytes: null,
    })
    if (recErr) throw recErr

    await slowPoint('after_persist', watch)

    return {
      cacheHit: false,
      asrPerformed: true,
      wordCount: (analysis.words as unknown[]).length,
      language: analysis.language as string,
      candidateCounts: countCandidates(analysis),
    }
  } finally {
    watch.stop()
  }
}

// ---- the speech portion of `analyzing` --------------------------------------
// The analyzing stage does not recompute anything: it re-verifies that the
// durable speech component EXISTS and still matches the project's CURRENT
// source bytes (fail closed on either), and surfaces its summary. The visual/
// audio portions of analyzing remain simulated until their phases.
export interface SpeechVerification {
  speechVersion: string
  wordCount: number
  candidatesTotal: number
}

export async function verifySpeechComponent(projectId: string): Promise<SpeechVerification> {
  const { asset } = await loadEligibleSource(projectId, 'speech-verify')
  const { data: rows, error } = await db
    .from('media_analyses').select('analyzer_bundle_version, source_hash, result')
    .eq('source_asset_id', asset.id).eq('component', 'speech')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`speech-verify: component read failed: ${error.message}`)
  // Prefer the current bundle version; accept an earlier one recorded by this
  // project's transcribing run (a mid-project version rollout must not strand
  // the project) — but ONLY if its hash matches the current bytes.
  const match = (rows ?? []).find((r) => r.analyzer_bundle_version === env.speechVersion && r.source_hash === asset.content_sha256)
    ?? (rows ?? []).find((r) => r.source_hash === asset.content_sha256)
  if (!match) {
    if ((rows ?? []).length > 0) {
      throw new PermanentJobError('speech-verify: recorded component does not match current source bytes', 'source_bytes_changed')
    }
    throw new PermanentJobError('speech-verify: no speech component recorded', 'speech_component_missing')
  }
  const r = match.result as Record<string, unknown>
  return {
    speechVersion: match.analyzer_bundle_version,
    wordCount: ((r.words as unknown[]) ?? []).length,
    candidatesTotal: ((r.candidates as unknown[]) ?? []).length,
  }
}

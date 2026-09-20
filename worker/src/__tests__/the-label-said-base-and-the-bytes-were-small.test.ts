// THE TRANSCRIPT WAS STAMPED WITH A MODEL THAT DID NOT PRODUCE IT.
//
// ⚠️⚠️ MEASURED ON THE LIVE VPS 2026-09-20. `EDITOR_SPEECH_MODEL` is unset and
// `WHISPER_MODEL=base`, so `env.speechModel` resolved to `base` — while the ASR
// bridge is invoked with `--model-path /opt/models/faster-whisper-small`,
// `--model-manifest` and `--require-pinned-model`, which load and DIGEST-VERIFY
// the `small` snapshot and fail closed on a mismatch.
//
// `editorSpeech.ts` passes that label straight into `buildSpeechAnalysis` as
// `asrModel`, so every editor transcript on that machine carries a provenance
// field naming a model that did not produce it.
//
// ⚖️ THE COUPLING WAS THE BUG, NOT THE VALUE. `env.ts` states the rule in its own
// comment — the speech label is "independent of the caption/reference knob so a
// caption tweak can never silently change component identity" — and then fell
// back to that exact knob.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { speechModelLabel } from '../speechModelLabel'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ENV_SRC = readFileSync(join(ROOT, 'worker', 'src', 'env.ts'), 'utf8')

const PINNED = '/opt/models/faster-whisper-small'

describe('the label is read off the bytes that actually load', () => {
  it('the production pin labels itself `small`', () => {
    expect(speechModelLabel(PINNED, {})).toBe('small')
  })

  it('and WHISPER_MODEL can no longer speak for it — the exact live case', () => {
    // The VPS environment, reproduced: caption knob set, speech knob unset.
    expect(speechModelLabel(PINNED, { WHISPER_MODEL: 'base' })).toBe('small')
  })

  it('every pinned size labels itself', () => {
    for (const size of ['tiny', 'base', 'small', 'medium']) {
      expect(speechModelLabel(`/opt/models/faster-whisper-${size}`, {})).toBe(size)
    }
  })

  it('a trailing slash does not change the answer', () => {
    expect(speechModelLabel('/opt/models/faster-whisper-small/', {})).toBe('small')
  })
})

describe('an explicit statement about THIS component still wins', () => {
  it('EDITOR_SPEECH_MODEL overrides the derived label', () => {
    // Setting the speech knob is a deliberate claim about the speech component.
    expect(speechModelLabel(PINNED, { EDITOR_SPEECH_MODEL: 'medium' })).toBe('medium')
  })

  it('but a blank one is not a statement', () => {
    expect(speechModelLabel(PINNED, { EDITOR_SPEECH_MODEL: '   ' })).toBe('small')
  })
})

describe('an unplanned path shape does not invent a label', () => {
  it('falls back to the documented default rather than guessing', () => {
    expect(speechModelLabel('/opt/models/some-other-asr', {})).toBe('small')
    expect(speechModelLabel('', {})).toBe('small')
  })
})

describe('the coupling is gone from the source, not just from the result', () => {
  it('`speechModel` no longer reads WHISPER_MODEL', () => {
    const line = ENV_SRC.slice(ENV_SRC.indexOf('speechModel: speechModelLabel'))
    expect(line.slice(0, 220)).not.toMatch(/WHISPER_MODEL/)
  })

  it('and the caption knob still has its own reader, untouched', () => {
    // `whisperModel` is the caption/reference pipeline's setting and keeps it.
    expect(ENV_SRC).toMatch(/whisperModel: process\.env\.WHISPER_MODEL \?\? 'base'/)
  })
})

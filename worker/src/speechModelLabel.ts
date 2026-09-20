/**
 * The ASR model LABEL, derived from the PINNED SNAPSHOT that actually loads.
 *
 * ⚠️⚠️ THE LABEL AND THE WEIGHTS DISAGREED IN PRODUCTION, AND THE LABEL WON THE
 * RECORD. `speechModel` read `EDITOR_SPEECH_MODEL ?? WHISPER_MODEL ?? 'small'`.
 * On the live VPS `EDITOR_SPEECH_MODEL` is unset and `WHISPER_MODEL=base`, so
 * the label resolved to `base` — while `--model-path` + `--model-manifest` +
 * `--require-pinned-model` loaded and DIGEST-VERIFIED the `faster-whisper-small`
 * snapshot. Every editor transcript was therefore stamped `asrModel: 'base'`
 * (`editorSpeech.ts` passes it into `buildSpeechAnalysis`) by a run that used
 * `small`. A wrong fact, recorded, about which model produced a transcript.
 *
 * ⚠️ AND THE COUPLING WAS THE BUG, NOT THE VALUE. `WHISPER_MODEL` is the
 * caption/reference knob; this file's own comment says the speech label is kept
 * "independent of the caption/reference knob so a caption tweak can never
 * silently change component identity". Falling back to it did exactly that.
 *
 * ⚖️ SO IT IS DERIVED FROM THE PATH, WHICH CANNOT LIE. The path is what the
 * bridge loads and verifies, so a label read off it agrees with the bytes by
 * construction. An explicit `EDITOR_SPEECH_MODEL` still wins — that is a
 * deliberate statement about this component — but an unrelated variable can no
 * longer speak for it.
 */
export function speechModelLabel(
  pinnedPath: string,
  source: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = (source.EDITOR_SPEECH_MODEL ?? '').trim()
  if (explicit !== '') return explicit
  // `/opt/models/faster-whisper-small` -> `small`. Anything unrecognised falls
  // back to the documented default rather than inventing a label from a path
  // shape nobody planned for.
  const tail = pinnedPath.trim().replace(/\/+$/, '').split('/').pop() ?? ''
  const m = /faster-whisper-(tiny|base|small|medium|large[\w.-]*)$/.exec(tail)
  return m ? m[1] : 'small'
}

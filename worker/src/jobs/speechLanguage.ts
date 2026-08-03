// Editor v2 — Phase 9: the language the editor is allowed to transcribe under.
//
// A PURE MODULE ON PURPOSE. It imports nothing but the error type, so a test can
// exercise it without SUPABASE_URL — the same reason captionColours.ts exists
// separately from the render stage. Putting this in editorSpeech.ts made every
// test importing it fail at module load, which is its own small lesson about
// where a guard should live.
import { PermanentJobError } from '../errors.js'

/**
 * The language policy the editor is allowed to transcribe under.
 *
 * THIS EXISTS BECAUSE AUTO-DETECTION WAS THE #1 CAPTION-QUALITY BUG, and
 * whisper_transcribe.py's own comment records what it looked like: faster-
 * whisper "mis-detects accented/noisy English takes as Arabic/Urdu/Welsh and
 * burns in unreadable captions". A creator with an accent, or one recording in
 * a room with any noise, got a video captioned in a script they cannot read.
 *
 * The fix — pinning the language — has been in both bridges for a long time and
 * was defended by nothing: `WHISPER_LANGUAGE=auto` in the environment would
 * have silently restored the defect with every test still green, because the
 * bridges accept "auto" by design and the default merely happened to be "en".
 *
 * So the EDITOR refuses it. A specific ISO code is welcome — that is how this
 * pipeline will support a creator working in Spanish or Urdu deliberately — but
 * "let the model guess" is not a policy the editor will run under, because the
 * guess is wrong exactly when the recording is hardest and the user is least
 * able to tell us why their captions are gibberish.
 */
const AUTO_DETECT_VALUES = new Set(['auto', 'detect', ''])
const ISO_LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

export function assertPinnedLanguage(policy: string): string {
  const v = (policy ?? '').trim().toLowerCase()
  if (AUTO_DETECT_VALUES.has(v)) {
    throw new PermanentJobError(
      'speech: the editor refuses to transcribe with language auto-detection — ' +
      'set WHISPER_LANGUAGE to a specific ISO code (e.g. "en"). Auto-detect ' +
      'mis-reads accented or noisy speech as another language entirely and burns ' +
      'unreadable captions into the video.',
      'speech_language_policy_invalid',
    )
  }
  if (!ISO_LANGUAGE_RE.test(v)) {
    throw new PermanentJobError(
      `speech: ${JSON.stringify(policy)} is not a plain ISO language code`,
      'speech_language_policy_invalid',
    )
  }
  return v
}

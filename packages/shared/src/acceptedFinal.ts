// THE SCRIPT THEY ACTUALLY TOOK TO CAMERA, WHICH NOTHING HAS EVER RECORDED.
//
// ⚠️ `script_edits` (0127) STORES EVERY EDIT WITH ITS BEFORE AND AFTER. What it
// cannot say is which version the creator stopped at. An edit trail without a
// terminus is a list of changes with no answer to "and then what did they
// shoot" — so the pair that actually carries signal (what we wrote → what they
// were willing to say out loud) cannot be assembled from it.
//
// ⚖️ THE ACCEPTANCE IS ENTERING THE TELEPROMPTER, NOT SAVING AN EDIT. A save is
// mid-thought; a creator who opens the recorder with a script has stopped
// arguing with it. `prepareCaptureMode('record', ...)` is the one seam where
// that happens (Constitution §5.1) and it already proves the script is durable
// before the teleprompter is usable, so the version stamped here is the version
// that exists in the database — never an in-memory draft.
//
// ⚠️ RE-ENTRY IS NOT A SECOND ACCEPTANCE. Creators open the recorder, back out,
// change a line and come back. Every entry stamps, and the stamp carries a hash
// of the spoken words, so a reader takes the LATEST DISTINCT hash rather than
// counting entries. Counting entries would report a creator who checked their
// script three times as three acceptances.
//
// ⚖️ HASHED OVER THE DIALOGUE ONLY, IN ORDER. `duration_sec` is re-estimated on
// every edit and `caption_text` is a hint nobody speaks; including either would
// make a stamp change when the words did not, which is exactly the false
// positive that would poison an edit-pair corpus.

/** What a creator took to camera, at the moment they took it. */
export interface AcceptedFinalStamp {
  generationId: string
  /** ⚠️ NOT CRYPTOGRAPHIC. FNV-1a over the spoken lines, for change detection
   *  between two versions of the same script. It answers "are these the same
   *  words", which is all a reader needs, and it is deliberately synchronous —
   *  `crypto.subtle` is async and this sits on the path to the recorder. */
  sha: string
  sceneCount: number
  wordCount: number
}

interface SceneLike { dialogue?: unknown }
interface ScriptLike { generation_id?: unknown; scenes?: unknown }

const line = (s: SceneLike): string =>
  (typeof s?.dialogue === 'string' ? s.dialogue : '').replace(/\s+/g, ' ').trim()

/** FNV-1a, 32-bit, hex. Stable across runtimes, which a hash relying on engine
 *  iteration order would not be. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Returns null when there is nothing to stamp.
 *
 * ⚠️ NULL, NOT A ZERO STAMP. A script with no generation id, no scenes, or no
 * spoken words at all is not "an acceptance of an empty script" — it is an
 * event that did not happen, and writing a row saying otherwise would put a
 * phantom into the very corpus this exists to keep clean.
 */
export function acceptedFinalStamp(script: ScriptLike | null | undefined): AcceptedFinalStamp | null {
  if (!script) return null
  const generationId = typeof script.generation_id === 'string' ? script.generation_id.trim() : ''
  if (generationId === '') return null

  const scenes = Array.isArray(script.scenes) ? (script.scenes as SceneLike[]) : []
  const lines = scenes.map(line)
  const spoken = lines.filter((l) => l !== '')
  if (spoken.length === 0) return null

  // ⚠️ JOINED WITH A SEPARATOR, NOT CONCATENATED. Bare concatenation would make
  // ["ab", "c"] and ["a", "bc"] hash identically — a silent collision between
  // two scripts a creator would never call the same.
  const sha = fnv1a(lines.join('␟'))
  const wordCount = spoken.reduce((n, l) => n + l.split(' ').filter(Boolean).length, 0)
  return { generationId, sha, sceneCount: scenes.length, wordCount }
}

/** What opening the recorder means for THIS generation, given what was stamped
 *  before. Four outcomes because there are four facts. */
export type AcceptanceKind =
  /** The first version they were willing to shoot. Completes an edit pair. */
  | 'first'
  /** They edited after a previous acceptance and came back. Also a pair, and a
   *  stronger one: the change is bounded by two versions we both hold. */
  | 'changed'
  /** They opened the same script again. Not a new decision. */
  | 'repeat'
  /** Nothing to stamp. */
  | 'none'

/**
 * ⚠️ THIS RETURNED A BOOLEAN AND THE BOOLEAN WAS A LIE BY OMISSION. The comment
 * said "absent is not unchanged — the two must not collapse", and then collapsed
 * them: `first` and `changed` both came back `true`, so the caller could not tell
 * a first acceptance from a re-acceptance after an edit. A mutation test proved
 * it — deleting the entire no-prior branch changed no result, because the
 * fallthrough `priorSha !== stamp.sha` already returned true for null, undefined
 * and ''. A guard that cannot change an answer is not a guard.
 *
 * ⚖️ AND THE DISTINCTION IS THE POINT. `first` pairs the generated script with
 * the accepted one. `changed` pairs two accepted versions and is the stronger
 * signal, because both sides were things the creator was willing to say.
 */
export function acceptanceKind(
  priorSha: string | null | undefined,
  stamp: AcceptedFinalStamp | null,
): AcceptanceKind {
  if (stamp === null) return 'none'
  if (priorSha === null || priorSha === undefined || priorSha === '') return 'first'
  return priorSha === stamp.sha ? 'repeat' : 'changed'
}

/** Convenience for the write path, which only needs "is this worth recording".
 *  Kept narrow on purpose: a caller wanting to know WHICH kind must ask. */
export function isNewAcceptance(
  priorSha: string | null | undefined,
  stamp: AcceptedFinalStamp | null,
): boolean {
  const k = acceptanceKind(priorSha, stamp)
  return k === 'first' || k === 'changed'
}

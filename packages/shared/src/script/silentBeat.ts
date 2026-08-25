/**
 * A SILENT BEAT IS NOT A BLANK TO FILL IN.
 *
 * ⚠️ MEASURED IN PRODUCTION. Six script beats hold nothing but a bracketed
 * marker, and they are TWO DIFFERENT THINGS that one check had been treating
 * as one:
 *
 *   [Insert Hook Option] · [Hook Option 1] · [Insert selected hook from above]
 *       → a PLACEHOLDER. The writer meant "put the chosen hook here."
 *         Substituting the hook is exactly right.
 *
 *   [No spoken audio]
 *       → a SILENT BEAT. The writer meant "nobody speaks here."
 *         Substituting the hook is exactly WRONG.
 *
 * `isWhollyPlaceholder` returns true for both, and the Plan screen filled every
 * true with the hook text. Generation 9072552b has FOUR beats and THREE of them
 * are `[No spoken audio]` — at indices 0, 2 and 3, the last being the Call to
 * Action. So that creator's script showed the SAME HOOK LINE THREE TIMES OUT OF
 * FOUR, once as their call to action. Voice-accurate and content-empty, in one
 * screen.
 *
 * ⚖️ THE MARKER IS INFORMATION, NOT DAMAGE. "Nobody speaks here" is a real
 * creative instruction — a reaction, a held look, a beat of quiet. It must
 * survive as silence rather than be overwritten, and it must never be counted
 * as a line the creator still owes.
 */

/** ⚠️ MATCHED ON MEANING, NOT ON THE BRACKETS. Every marker here says the same
 *  thing: there is nothing to say. The list is deliberately small and literal —
 *  a loose pattern would swallow `[SHOW: the settings page]`, which is a real
 *  direction with real words behind it. */
const SILENT_MARKERS = [
  'no spoken audio',
  'no dialogue',
  'no dialog',
  'no audio',
  'no voiceover',
  'no voice over',
  'no speech',
  'silent',
  'silence',
  'no words',
  'nothing spoken',
]

/**
 * Does this line say "nobody speaks here"?
 *
 * ⚠️ ONLY WHEN THE MARKER IS THE WHOLE LINE. "There is no dialogue that fixes a
 * bad offer" is a line a creator says out loud; it contains a marker phrase and
 * is not silence. The bracket must enclose the entire line.
 */
export function isSilentBeat(line: unknown): boolean {
  if (typeof line !== 'string') return false
  const t = line.trim()
  const m = /^\[([^\]]*)\]$/.exec(t)
  if (!m) return false
  const inner = m[1].trim().toLowerCase().replace(/[.!]+$/, '')
  return SILENT_MARKERS.includes(inner)
}

/**
 * The three states a beat's spoken line can be in. ⚖️ THREE, NOT TWO: this is
 * the same absent-is-not-zero discipline the rest of the codebase runs on.
 *
 *   spoken   — it has words, and they take time to say
 *   silent   — the writer said nobody speaks here; nothing is owed
 *   unwritten— it should have words and does not; the creator still owes them
 */
export type BeatVoice = 'spoken' | 'silent' | 'unwritten'

export function beatVoice(line: unknown): BeatVoice {
  if (isSilentBeat(line)) return 'silent'
  return typeof line === 'string' && line.trim().length > 0 ? 'spoken' : 'unwritten'
}

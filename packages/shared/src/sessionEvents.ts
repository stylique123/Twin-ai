// THE EVENTS A WATCHED SESSION NEEDS, DECLARED SO A TYPO CANNOT INVENT A CATEGORY.
//
// ⚠️ `logEvent` TAKES A FREE STRING, and that is how an event name typo produces
// a category nobody counts and an absence nobody questions. Every one of these
// is read by the D1 observer, which reports a missing event as a BLIND SPOT —
// so `recording_strated` would not merely lose a row, it would make the packet
// tell an observer that the creator never rolled.
//
// ⚖️ MEASURED, NOT GUESSED. Production analytics_events today carries page_view,
// signup, onboarding_completed, voice_built, blueprint_generated, gallery_remix,
// edit_rendered, thumbnail_generated and render_cost. The timeline a watched
// session needs — did they reach the camera, did they roll, did they stop, did
// something break — is not in that list, which is why none of it could be
// reconstructed before this file existed.
//
// ⚠️ script_edit IS DELIBERATELY ABSENT. Script edits are already durable in
// `script_edits` (0127), with the before and after text, which is strictly more
// than an analytics counter would carry. Emitting a second, thinner record of
// the same act would give two numbers that drift and no way to say which is
// right.

import { logEvent } from './api'

/** ⚠️ THE NAMES ARE THE CONTRACT. The observer packet declares the same list and
 *  a test holds the two together; changing one without the other turns a
 *  reported blind spot into a lie. */
export const SESSION_EVENTS = {
  camera_opened: 'they got as far as the camera',
  recording_started: 'they actually rolled',
  recording_aborted: 'they rolled and stopped without keeping it',
  client_error: 'something broke in front of them',
  session_abandoned: 'where they stopped',
} as const

export type SessionEvent = keyof typeof SESSION_EVENTS

/**
 * ⚖️ BEST EFFORT, LIKE EVERY OTHER MEASUREMENT ON A CREATOR'S PATH. This is
 * telemetry about a session, not the session. `logEvent` already swallows its
 * own failures; nothing here may add a way for an analytics insert to interrupt
 * somebody trying to record a video.
 */
export function logSessionEvent(event: SessionEvent, props: Record<string, unknown> = {}): void {
  void logEvent(event, props)
}

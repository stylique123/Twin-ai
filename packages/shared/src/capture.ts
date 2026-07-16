// Capture helpers shared by the record surfaces (V1 Record + V2 Capture).
// Extracted so the MediaRecorder MIME selection lives in ONE place instead of
// being copy-pasted per screen.

// Pick the best MediaRecorder container/codec the browser supports, preferring
// VP9→VP8→generic webm→mp4. Returns '' when none match (let MediaRecorder fall
// back to its own default).
export function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

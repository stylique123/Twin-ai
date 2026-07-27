// THE ONE DECLARATION of which FFmpeg the editor renders with.
//
// Render output is version-sensitive: filter defaults, encoder tuning and even
// zoompan's rounding move between majors. A golden frame proven under one major
// is not evidence for another, so the major is pinned in worker/Dockerfile and
// re-asserted here at runtime.
//
// This exists because local and production had DRIFTED: the container takes
// Debian bookworm's 5.1 series, while a developer machine on Ubuntu carries 6.1.
// Media tests written against 6.1 would have "passed" locally while proving
// nothing about what the worker actually renders.
export const EDITOR_FFMPEG_MAJOR = 5
export const EDITOR_FFMPEG_MINOR = 1

/** Parse `ffmpeg -version` output. Returns null when it is not recognisable. */
export function parseFfmpegVersion(banner: string): { major: number; minor: number } | null {
  const m = /^ffmpeg version (\d+)\.(\d+)/.exec(banner.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]) }
}

/**
 * True when this binary is the pinned render version. Callers that produce
 * GOLDEN evidence must refuse when it is false — comparing frames across majors
 * proves nothing, and quietly accepting them is how a "passing" suite stops
 * describing production.
 */
export function isPinnedFfmpeg(banner: string): boolean {
  const v = parseFfmpegVersion(banner)
  return v !== null && v.major === EDITOR_FFMPEG_MAJOR && v.minor === EDITOR_FFMPEG_MINOR
}

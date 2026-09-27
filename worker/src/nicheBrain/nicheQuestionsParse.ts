// Pure helper for the niche comment sweep (24-ideas #11).
export function youtubeVideoId(url: string | null | undefined): string | null {
  const m = String(url ?? '').match(/(?:v=|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  return m ? m[1] : null
}

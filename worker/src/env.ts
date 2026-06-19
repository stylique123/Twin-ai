// Worker configuration — all server-side. The worker holds the Supabase SERVICE
// ROLE key (never shipped to any client) and the provider keys.
// Trim values: a stray space/newline in an env file (e.g. a trailing space after
// a pasted URL) would otherwise corrupt URLs and tokens.
function need(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

export const env = {
  supabaseUrl: need('SUPABASE_URL'),
  serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  geminiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  // YouTube + Instagram ingestion: datacenter IPs get bot-blocked by yt-dlp
  // ("Sign in to confirm you're not a bot" on YouTube; "rate-limit reached or
  // login required" on Instagram). We route both through Apify transcript Actors
  // instead, which pull real captions/transcripts reliably. TikTok still uses
  // yt-dlp + whisper (that works from datacenter IPs).
  apifyToken: (process.env.APIFY_TOKEN ?? '').trim(),
  // Actor that returns YouTube captions as [{ start, dur, text }] in its KV output.
  apifyYoutubeActor: (process.env.APIFY_YOUTUBE_ACTOR ?? 'faVsWy9VTSNVIhWpR').trim(),
  // Actor that returns Instagram transcripts as dataset items with
  // { text, duration, segments: [{ start, end, text }] }. ID for
  // apple_yang/instagram-transcripts-scraper.
  apifyInstagramActor: (process.env.APIFY_INSTAGRAM_ACTOR ?? 'S9A11NvceWaGorwwh').trim(),
  // Optional: free Pexels API key enables keyword-matched b-roll cutaways.
  pexelsKey: (process.env.PEXELS_API_KEY ?? '').trim(),
  // Optional: URL of a royalty-free music bed (mp3) mixed + ducked under the VO.
  // The single biggest lever for making cut clips feel like one coherent video.
  musicBedUrl: (process.env.MUSIC_BED_URL ?? '').trim(),

  // Which job types this worker process handles.
  jobTypes: (process.env.WORKER_JOB_TYPES ?? 'ingest,transcribe,build_voice,autoedit').split(',').map((s) => s.trim()),
  // Poll cadence + claim concurrency.
  pollMs: Number(process.env.WORKER_POLL_MS ?? '3000'),
  visibilitySecs: Number(process.env.WORKER_VISIBILITY_SECS ?? '900'),

  // ASR. 'base' is the speed/quality sweet spot for short-form English (≈1.5-2x
  // faster than 'small'); the filler pre-pass only needs rough word boundaries so
  // it runs on the much faster 'tiny' model.
  whisperModel: process.env.WHISPER_MODEL ?? 'base', // tiny|base|small|medium
  whisperFillerModel: process.env.WHISPER_FILLER_MODEL ?? 'tiny',
  whisperDevice: process.env.WHISPER_DEVICE ?? 'cpu', // cpu|cuda
  // Pin the spoken language so faster-whisper never mis-detects an English take
  // as Arabic/Urdu/etc and burns in garbage captions. 'auto' restores detection.
  whisperLanguage: (process.env.WHISPER_LANGUAGE ?? 'en').trim(),
  maxMediaSecs: Number(process.env.WORKER_MAX_MEDIA_SECS ?? '900'), // skip > 15 min by default

  workerId: process.env.FLY_MACHINE_ID ?? process.env.HOSTNAME ?? `worker-${process.pid}`,
}

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
  // Optional cheaper/faster model for the MECHANICAL Gemini calls (reference-
  // structure extraction + the edit Director). Pointing this at your flash model
  // cuts COGS ~$0.06 per remix with no quality loss on these schema-constrained
  // tasks. Defaults to the main model (no behaviour change) until set.
  fastModel: (process.env.GEMINI_FAST_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview').trim(),
  apifyToken: (process.env.APIFY_TOKEN ?? '').trim(),
  // Actor that returns YouTube captions as [{ start, dur, text }] in its KV output.
  apifyYoutubeActor: (process.env.APIFY_YOUTUBE_ACTOR ?? 'faVsWy9VTSNVIhWpR').trim(),
  // Actor that returns Instagram transcripts as dataset items with
  // { text, duration, segments: [{ start, end, text }] }. ID for
  // apple_yang/instagram-transcripts-scraper.
  apifyInstagramActor: (process.env.APIFY_INSTAGRAM_ACTOR ?? 'S9A11NvceWaGorwwh').trim(),
  // Keyword->emoji caption auto-stamp (money->💰). Off by default: it cheapens an
  // otherwise pro edit (the "TikTok 2022" look). Director/refine-chosen emoji are
  // unaffected; this only gates the keyword-regex fallback. Set EDIT_EMOJI=true to
  // restore it.
  editEmoji: (process.env.EDIT_EMOJI ?? 'false').trim() === 'true',
  // Optional: free Pexels API key enables keyword-matched b-roll cutaways.
  pexelsKey: (process.env.PEXELS_API_KEY ?? '').trim(),
  // Optional: URL of a royalty-free music bed (mp3) mixed + ducked under the VO.
  // The single biggest lever for making cut clips feel like one coherent video.
  musicBedUrl: (process.env.MUSIC_BED_URL ?? '').trim(),
  // Revideo render service (premium captions pass). When set, every edit's ffmpeg
  // result is auto-upgraded to the Revideo render. Empty = ffmpeg-only.
  revideoUrl: (process.env.REVIDEO_URL ?? '').trim(),

  // Which job types this worker process handles.
  jobTypes: (process.env.WORKER_JOB_TYPES ?? 'ingest,transcribe,build_voice,autoedit,scrape_dna').split(',').map((s) => s.trim()),
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
